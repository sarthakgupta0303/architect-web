import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { fromPostgrest } from '@/lib/api/errors'
import { getWorkspaceAccess } from '@/lib/core/access'
import { isDeveloper } from '@/lib/authz'
import { deleteWorkspace } from '@/lib/core/services/member-service'

const Params = z.object({ ws: z.string().min(3).max(40) })

export const GET = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    const { workspace, membership } = await getWorkspaceAccess(supabase, params.ws, user.id, 'workspace:read')
    return {
      workspace: {
        id: workspace.id, slug: workspace.slug, name: workspace.name, plan: workspace.plan,
        creditsBalance: Number(workspace.credits_balance), codeModeRestricted: workspace.code_mode_restricted, prodDeployRole: workspace.prod_deploy_role,
      },
      role: membership.role,
      isDeveloper: isDeveloper(membership),
    }
  },
})

export const PATCH = createHandler({
  params: Params,
  body: z.object({
    name: z.string().trim().min(1).max(60).optional(),
    codeModeRestricted: z.boolean().optional(),
    prodDeployRole: z.enum(['editor', 'admin', 'owner']).optional(),
  }).refine((v) => Object.keys(v).length > 0, 'No changes'),
  handler: async ({ supabase, user, params, body }) => {
    const { workspace } = await getWorkspaceAccess(supabase, params.ws, user.id, 'workspace:update')
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.codeModeRestricted !== undefined) patch.code_mode_restricted = body.codeModeRestricted
    if (body.prodDeployRole !== undefined) patch.prod_deploy_role = body.prodDeployRole
    const { data, error } = await supabase.from('workspaces').update(patch).eq('id', workspace.id).select('id, slug, name').single()
    if (error) throw fromPostgrest(error, 'Could not update workspace')
    return { workspace: data }
  },
})

export const DELETE = createHandler({
  params: Params,
  body: z.object({ confirmName: z.string().min(1).max(60) }),
  handler: async ({ supabase, user, params, body }) => {
    await deleteWorkspace(supabase, user.id, params.ws, body.confirmName)
    return null
  },
})
