import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { GraphRequest } from '@/lib/contracts/generation'
import { estimateBuild } from '@/lib/core/services/generation-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), body: GraphRequest,
  handler: ({ supabase, user, params, body }) => estimateBuild(supabase, user.id, params.id, body.prompt, body.answers),
})
