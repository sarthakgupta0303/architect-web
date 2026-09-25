import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { CreateAgentSchema } from '@/lib/contracts/agents'
import { createAgent, getGraph } from '@/lib/core/services/agent-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => getGraph(supabase, user.id, params.id),
})

export const POST = createHandler({
  params: Params,
  body: CreateAgentSchema,
  status: 201,
  handler: ({ supabase, user, params, body }) => createAgent(supabase, user.id, params.id, body),
})
