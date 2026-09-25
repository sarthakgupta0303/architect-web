import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/api/errors'
import { can, type Action, type MembershipContext } from '@/lib/authz'
import type { MemberRole } from '@/lib/contracts/common'
import type { ProjectRow, WorkspaceRow } from '@/lib/db/types'

export type WorkspaceAccess = { workspace: WorkspaceRow; membership: MembershipContext }
export type ProjectAccess = WorkspaceAccess & { project: ProjectRow }

const WORKSPACE_COLS = 'id, name, slug, owner_id, plan, credits_balance, code_mode_restricted, prod_deploy_role, created_at'

async function membershipFor(supabase: SupabaseClient, workspace: WorkspaceRow, userId: string): Promise<MembershipContext> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, is_developer')
    .eq('workspace_id', workspace.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', 'Could not load membership')
  if (!data) throw new AppError('NOT_FOUND', 'Workspace not found')
  return {
    role: data.role as MemberRole,
    isDeveloper: data.is_developer as boolean,
    codeModeRestricted: workspace.code_mode_restricted,
    prodDeployRole: workspace.prod_deploy_role,
  }
}

/** Resolve a workspace by id or slug the user belongs to (RLS hides others → 404). */
export async function getWorkspaceAccess(supabase: SupabaseClient, idOrSlug: string, userId: string, action?: Action): Promise<WorkspaceAccess> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug)
  const { data, error } = await supabase
    .from('workspaces')
    .select(WORKSPACE_COLS)
    .eq(isUuid ? 'id' : 'slug', idOrSlug)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', 'Could not load workspace')
  if (!data) throw new AppError('NOT_FOUND', 'Workspace not found')
  const workspace = data as WorkspaceRow
  const membership = await membershipFor(supabase, workspace, userId)
  if (action && !can(membership, action)) throw new AppError('FORBIDDEN', 'You do not have permission to do that')
  return { workspace, membership }
}

const PROJECT_COLS =
  'id, workspace_id, name, description, initial_prompt, status, mode_default, framework, language, source, template_id, repo_provider, repo_owner, repo_name, working_branch, auto_commit, thumbnail_url, preview_url, live_url, created_by, created_at, updated_at, deleted_at, creator:profiles!projects_created_by_fkey(id, full_name)'

export async function getProjectAccess(supabase: SupabaseClient, projectId: string, userId: string, action?: Action, opts: { includeDeleted?: boolean } = {}): Promise<ProjectAccess> {
  let q = supabase.from('projects').select(PROJECT_COLS).eq('id', projectId)
  if (!opts.includeDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q.maybeSingle()
  if (error) throw new AppError('INTERNAL', 'Could not load project')
  if (!data) throw new AppError('NOT_FOUND', 'Project not found')
  const project = data as unknown as ProjectRow
  const { workspace, membership } = await getWorkspaceAccess(supabase, project.workspace_id, userId)
  if (action && !can(membership, action)) throw new AppError('FORBIDDEN', 'You do not have permission to do that')
  return { workspace, membership, project }
}

export { PROJECT_COLS, WORKSPACE_COLS }
