import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { workspaceStudio } from '@/lib/core/services/studio-service'

export const GET = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  query: z.object({ range: z.enum(['24h', '7d', '30d']).default('7d') }),
  handler: ({ supabase, user, params, query }) => workspaceStudio(supabase, user.id, params.ws, query.range),
})
