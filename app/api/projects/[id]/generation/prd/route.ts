import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { PrdRequest } from '@/lib/contracts/generation'
import { generatePrd } from '@/lib/core/services/generation-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), body: PrdRequest, rate: 'generation',
  handler: ({ supabase, user, params, body }) => generatePrd(supabase, user.id, params.id, body.prompt, body.answers),
})
