import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { CreateEdgeSchema } from '@/lib/contracts/agents'
import { createEdge } from '@/lib/core/services/agent-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }),
  body: CreateEdgeSchema,
  status: 201,
  handler: ({ supabase, user, params, body }) => createEdge(supabase, user.id, params.id, body),
})
