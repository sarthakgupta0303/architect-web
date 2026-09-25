import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { getGate, updateGate } from '@/lib/core/services/eval-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => getGate(supabase, user.id, params.id),
})

export const PATCH = createHandler({
  params: Params,
  body: z
    .object({
      threshold: z.number().int('Use a whole number').min(0, 'Minimum is 0').max(100, 'Maximum is 100').optional(),
      blockProd: z.boolean().optional(),
    })
    .strict()
    .refine((b) => b.threshold !== undefined || b.blockProd !== undefined, 'Nothing to update'),
  handler: ({ supabase, user, params, body }) => updateGate(supabase, user.id, params.id, body),
})
