import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { listConnections } from '@/lib/core/services/integration-service'

export const GET = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  handler: ({ supabase, user, params }) => listConnections(supabase, user.id, params.ws),
})
