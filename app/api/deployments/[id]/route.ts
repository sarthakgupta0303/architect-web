import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { getDeployment } from '@/lib/core/services/deploy-service'

/** One deployment with its events (project:read; 404 when not visible). */
export const GET = createHandler({
  params: z.object({ id: z.string().uuid() }),
  handler: ({ supabase, user, params }) => getDeployment(supabase, user.id, params.id),
})
