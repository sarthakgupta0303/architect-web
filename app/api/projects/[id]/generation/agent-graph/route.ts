import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { GraphRequest } from '@/lib/contracts/generation'
import { generateGraph } from '@/lib/core/services/generation-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), body: GraphRequest, rate: 'generation',
  handler: ({ supabase, user, params, body }) => generateGraph(supabase, user.id, params.id, body.prompt, body.answers),
})
