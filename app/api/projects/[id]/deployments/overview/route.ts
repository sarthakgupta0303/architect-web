import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { deployOverview } from '@/lib/core/services/deploy-service'

/** Environment cards: live + latest deployment per environment, and the workspace's prod-deploy role. */
export const GET = createHandler({
  params: z.object({ id: z.string().uuid() }),
  handler: ({ supabase, user, params }) => deployOverview(supabase, user.id, params.id),
})
