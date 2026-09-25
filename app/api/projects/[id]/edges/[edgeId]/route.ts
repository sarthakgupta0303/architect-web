import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { UpdateEdgeSchema } from '@/lib/contracts/agents'
import { deleteEdge, updateEdge } from '@/lib/core/services/agent-service'

const Params = z.object({ id: z.string().uuid(), edgeId: z.string().uuid() })

export const PATCH = createHandler({
  params: Params,
  body: UpdateEdgeSchema,
  handler: ({ supabase, user, params, body }) => updateEdge(supabase, user.id, params.id, params.edgeId, body),
})

export const DELETE = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    await deleteEdge(supabase, user.id, params.id, params.edgeId)
  },
})
