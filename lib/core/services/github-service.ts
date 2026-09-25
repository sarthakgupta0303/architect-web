import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getProjectAccess, PROJECT_COLS } from '@/lib/core/access'
import { toProjectDto } from '@/lib/core/mappers'
import type { ProjectRow } from '@/lib/db/types'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Prototype GitHub link (docs/specs/mock-mode.md): records the repository on the project.
 * Repo columns are server-owned (not client-writable), so the write uses the service role
 * after an explicit `git:write` authorization check.
 */
export async function linkRepository(supabase: SupabaseClient, userId: string, projectId: string, input: { owner: string; name: string; branch: string; autoCommit: boolean }) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'git:write')
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', 'Connecting GitHub needs SUPABASE_SERVICE_ROLE_KEY on the server. Add it to .env.local and restart.')
  const { data, error } = await admin.from('projects')
    .update({ repo_provider: 'github', repo_owner: input.owner, repo_name: input.name, working_branch: input.branch, auto_commit: input.autoCommit })
    .eq('id', project.id).select(PROJECT_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not connect the repository')
  await admin.from('audit_logs').insert({ workspace_id: project.workspace_id, actor_id: userId, action: 'github.connect', target: { projectId, repo: `${input.owner}/${input.name}` } })
  return { project: toProjectDto(data as unknown as ProjectRow) }
}

export async function unlinkRepository(supabase: SupabaseClient, userId: string, projectId: string) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'git:write')
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', 'Disconnecting GitHub needs SUPABASE_SERVICE_ROLE_KEY on the server.')
  const { data, error } = await admin.from('projects')
    .update({ repo_provider: 'architect', repo_owner: null, repo_name: null })
    .eq('id', project.id).select(PROJECT_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not disconnect the repository')
  await admin.from('audit_logs').insert({ workspace_id: project.workspace_id, actor_id: userId, action: 'github.disconnect', target: { projectId } })
  return { project: toProjectDto(data as unknown as ProjectRow) }
}
