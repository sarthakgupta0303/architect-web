import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { acceptInvitation } from '@/lib/core/services/onboarding-service'

export const POST = createHandler({
  params: z.object({ token: z.string().min(20).max(200) }),
  rate: 'auth',
  handler: ({ supabase, params }) => acceptInvitation(supabase, params.token),
})
