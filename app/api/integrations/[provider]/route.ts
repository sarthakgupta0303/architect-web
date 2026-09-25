import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { disconnectIntegration } from '@/lib/core/services/integration-service'

/** DELETE /api/integrations/{id} — the segment is named `provider` because it shares a route slot with /{provider}/connect. */
export const DELETE = createHandler({
  params: z.object({ provider: z.string().uuid() }),
  handler: async ({ supabase, user, params }) => {
    await disconnectIntegration(supabase, user.id, params.provider)
    return null
  },
})
