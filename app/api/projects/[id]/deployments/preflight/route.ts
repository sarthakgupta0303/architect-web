import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { PreflightBody, preflight } from '@/lib/core/services/deploy-service'

/** Preflight checks for a target environment → { checks, canDeploy }. */
export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), body: PreflightBody,
  handler: ({ supabase, user, params, body }) => preflight(supabase, user.id, params.id, body.environment),
})
