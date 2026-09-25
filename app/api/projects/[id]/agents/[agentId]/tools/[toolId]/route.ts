import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { removeTool } from '@/lib/core/services/agent-service'

export const DELETE = createHandler({
  params: z.object({ id: z.string().uuid(), agentId: z.string().uuid(), toolId: z.string().uuid() }),
  handler: async ({ supabase, user, params }) => {
    await removeTool(supabase, user.id, params.id, params.agentId, params.toolId)
  },
})
