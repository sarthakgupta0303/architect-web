import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { deleteDomain, requestMeta } from '@/lib/core/services/deploy-service'

/** Remove a custom domain (domains:write) → 204. */
export const DELETE = createHandler({
  params: z.object({ id: z.string().uuid() }),
  handler: ({ req, supabase, user, params }) => deleteDomain(supabase, user.id, params.id, requestMeta(req)),
})
