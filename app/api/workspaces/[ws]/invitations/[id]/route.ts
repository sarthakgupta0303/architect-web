import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { revokeInvitation } from '@/lib/core/services/member-service'

export const DELETE = createHandler({
  params: z.object({ ws: z.string().min(3).max(40), id: z.string().uuid() }),
  handler: async ({ supabase, user, params }) => {
    await revokeInvitation(supabase, user.id, params.ws, params.id)
    return null
  },
})
