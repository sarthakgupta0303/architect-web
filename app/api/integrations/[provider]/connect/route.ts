import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { connectIntegration } from '@/lib/core/services/integration-service'

export const POST = createHandler({
  params: z.object({ provider: z.string().regex(/^[a-z0-9_]{2,40}$/) }),
  body: z.object({
    workspaceId: z.string().uuid(),
    apiKey: z.string().trim().max(256).optional(),
    connectionString: z.string().trim().max(1000).optional(),
  }),
  status: 201,
  handler: ({ supabase, user, params, body }) => connectIntegration(supabase, user.id, params.provider, body),
})
