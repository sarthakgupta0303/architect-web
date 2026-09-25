import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { workspaceUsage } from '@/lib/core/services/member-service'

export const GET = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  handler: ({ supabase, user, params }) => workspaceUsage(supabase, user.id, params.ws),
})
