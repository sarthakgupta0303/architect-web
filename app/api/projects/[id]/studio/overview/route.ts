import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { studioOverview } from '@/lib/core/services/studio-service'

export const GET = createHandler({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ range: z.enum(['24h', '7d', '30d']).default('7d'), environment: z.enum(['production', 'preview', 'development']).default('production') }),
  handler: ({ supabase, user, params, query }) => studioOverview(supabase, user.id, params.id, query.range, query.environment),
})
