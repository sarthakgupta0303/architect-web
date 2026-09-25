import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from '@/lib/contracts/projects'
import { PROJECT_COLS, getProjectAccess, getWorkspaceAccess } from '@/lib/core/access'
import { toProjectCard, toProjectDto } from '@/lib/core/mappers'
import { PLANS } from '@/lib/core/plans'
import type { ProjectRow } from '@/lib/db/types'
import { projectNameFromPrompt } from '@/lib/utils'
import { instantiateTemplate } from './template-service'

const RESTORE_WINDOW_DAYS = 30

function encodeCursor(row: { updated_at: string; id: string }) {
  return Buffer.from(`${row.updated_at}|${row.id}`).toString('base64url')
}
function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  const [updatedAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  if (!updatedAt || !id || Number.isNaN(Date.parse(updatedAt)) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError('VALIDATION_FAILED', 'Invalid cursor')
  }
  return { updatedAt, id }
}

export async function listProjects(supabase: SupabaseClient, userId: string, workspaceIdOrSlug: string, q: ListProjectsQuery) {
  const { workspace } = await getWorkspaceAccess(supabase, workspaceIdOrSlug, userId, 'workspace:read')
  let query = supabase
    .from('projects')
    .select(PROJECT_COLS)
    .eq('workspace_id', workspace.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(q.limit + 1)

  if (q.filter === 'mine') query = query.eq('created_by', userId)
  if (q.filter === 'shared') query = query.neq('created_by', userId)
  if (q.filter === 'deployed') query = query.eq('status', 'live')
  if (q.q) query = query.ilike('name', `%${q.q.replace(/[%_]/g, (m) => `\\${m}`)}%`)
  if (q.cursor) {
    const c = decodeCursor(q.cursor)
    query = query.or(`updated_at.lt.${c.updatedAt},and(updated_at.eq.${c.updatedAt},id.lt.${c.id})`)
  }

  const { data, error } = await query
  if (error) throw fromPostgrest(error, 'Could not load projects')
  const rows = (data ?? []) as unknown as ProjectRow[]
  const page = rows.slice(0, q.limit)
  const last = page[page.length - 1]
  return { items: page.map(toProjectCard), nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null }
}

export async function getProject(supabase: SupabaseClient, userId: string, projectId: string) {
  const { project, membership, workspace } = await getProjectAccess(supabase, projectId, userId, 'project:read')
  return { project: toProjectDto(project), membership, workspace }
}

export async function createProject(supabase: SupabaseClient, userId: string, input: CreateProjectInput) {
  const { workspace } = await getWorkspaceAccess(supabase, input.workspaceId, userId, 'project:create')

  const limit = PLANS[workspace.plan].maxActiveProjects
  if (limit !== null) {
    const { count, error } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .is('deleted_at', null)
    if (error) throw fromPostgrest(error)
    if ((count ?? 0) >= limit) {
      throw new AppError('PLAN_LIMIT', `The ${PLANS[workspace.plan].label} plan includes ${limit} active projects. Upgrade to create more.`, { limit })
    }
  }

  if (input.source === 'template') {
    return instantiateTemplate(supabase, userId, workspace.id, input.templateSlug!, input.templateAnswers ?? {}, input.name)
  }

  const name = input.name ?? (input.initialPrompt ? projectNameFromPrompt(input.initialPrompt) : 'Untitled project')
  const { data, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspace.id,
      name,
      initial_prompt: input.initialPrompt ?? null,
      source: input.source,
      framework: input.framework ?? 'lyzr_adk',
      created_by: userId,
    })
    .select(PROJECT_COLS)
    .single()
  if (error) throw fromPostgrest(error, 'Could not create project')
  return { project: toProjectDto(data as unknown as ProjectRow) }
}

export async function updateProject(supabase: SupabaseClient, userId: string, projectId: string, input: UpdateProjectInput) {
  await getProjectAccess(supabase, projectId, userId, 'project:update')
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.framework !== undefined) patch.framework = input.framework
  if (input.language !== undefined) patch.language = input.language
  if (input.modeDefault !== undefined) patch.mode_default = input.modeDefault
  if (input.autoCommit !== undefined) patch.auto_commit = input.autoCommit
  const { data, error } = await supabase.from('projects').update(patch).eq('id', projectId).select(PROJECT_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not update project')
  return { project: toProjectDto(data as unknown as ProjectRow) }
}

export async function deleteProject(supabase: SupabaseClient, userId: string, projectId: string) {
  await getProjectAccess(supabase, projectId, userId, 'project:delete')
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', projectId)
  if (error) throw fromPostgrest(error, 'Could not delete project')
}

export async function restoreProject(supabase: SupabaseClient, userId: string, projectId: string) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'project:delete', { includeDeleted: true })
  if (!project.deleted_at) return { project: toProjectDto(project) }
  const ageDays = (Date.now() - Date.parse(project.deleted_at)) / 86_400_000
  if (ageDays > RESTORE_WINDOW_DAYS) throw new AppError('EXPIRED', 'Projects can be restored for 30 days after deletion')
  const { data, error } = await supabase.from('projects').update({ deleted_at: null }).eq('id', projectId).select(PROJECT_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not restore project')
  return { project: toProjectDto(data as unknown as ProjectRow) }
}
