import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { fromPostgrest } from '@/lib/api/errors'
import { getWorkspaceAccess } from '@/lib/core/access'

/** Creates the seeded "Support Copilot" demo project (docs/specs/seed.sql). */
export const POST = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  rate: 'processing',
  status: 201,
  handler: async ({ supabase, user, params }) => {
    const { workspace } = await getWorkspaceAccess(supabase, params.ws, user.id, 'project:create')
    const { data, error } = await supabase.rpc('seed_demo_project', { p_workspace_id: workspace.id })
    if (error) throw fromPostgrest(error, 'Could not create the demo project')
    return { projectId: data as string }
  },
})
