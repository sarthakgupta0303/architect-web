import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { ClarifyRequest } from '@/lib/contracts/generation'
import { clarify } from '@/lib/core/services/generation-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), body: ClarifyRequest, rate: 'generation',
  handler: ({ supabase, user, params, body }) => clarify(supabase, user.id, params.id, body.prompt),
})
