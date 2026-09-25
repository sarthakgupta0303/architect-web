import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { AddToolSchema } from '@/lib/contracts/agents'
import { addTool } from '@/lib/core/services/agent-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid(), agentId: z.string().uuid() }),
  body: AddToolSchema,
  status: 201,
  handler: ({ supabase, user, params, body }) => addTool(supabase, user.id, params.id, params.agentId, body),
})
