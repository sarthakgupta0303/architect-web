import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { verifyDomain } from '@/lib/core/services/deploy-service'

/** Check DNS for a custom domain (domains:write) → { domain, message }. */
export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }),
  handler: ({ supabase, user, params }) => verifyDomain(supabase, user.id, params.id),
})
