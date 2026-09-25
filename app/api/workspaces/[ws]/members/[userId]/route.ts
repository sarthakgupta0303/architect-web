import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { removeMember, updateMember } from '@/lib/core/services/member-service'

const Params = z.object({ ws: z.string().min(3).max(40), userId: z.string().uuid() })

export const PATCH = createHandler({
  params: Params,
  body: z.object({ role: z.enum(['viewer', 'editor', 'admin']).optional(), isDeveloper: z.boolean().optional() })
    .refine((v) => v.role !== undefined || v.isDeveloper !== undefined, 'No changes'),
  handler: ({ supabase, user, params, body }) => updateMember(supabase, user.id, params.ws, params.userId, body),
})

export const DELETE = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    await removeMember(supabase, user.id, params.ws, params.userId)
    return null
  },
})
