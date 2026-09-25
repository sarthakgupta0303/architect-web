import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { UpdateAgentSchema } from '@/lib/contracts/agents'
import { deleteAgent, updateAgent } from '@/lib/core/services/agent-service'

const Params = z.object({ id: z.string().uuid(), agentId: z.string().uuid() })

export const PATCH = createHandler({
  params: Params,
  body: UpdateAgentSchema,
  handler: ({ supabase, user, params, body }) => updateAgent(supabase, user.id, params.id, params.agentId, body),
})

export const DELETE = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    await deleteAgent(supabase, user.id, params.id, params.agentId)
  },
})
