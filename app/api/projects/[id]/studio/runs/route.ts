import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { studioRuns } from '@/lib/core/services/studio-service'

export const GET = createHandler({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    status: z.enum(['success', 'error', 'escalated', 'awaiting_approval', 'blocked']).optional(),
    environment: z.enum(['production', 'preview', 'development']).default('production'),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(0).max(10_000).default(0),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  }),
  handler: ({ supabase, user, params, query }) =>
    studioRuns(supabase, user.id, params.id, { status: query.status, env: query.environment, search: query.q, page: query.page, pageSize: query.pageSize }),
})
