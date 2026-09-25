import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { requestMeta, rollbackDeployment } from '@/lib/core/services/deploy-service'

/** Re-point the environment to this deployment's image (deploy:rollback) → 202 { deploymentId, … }. */
export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), rate: 'processing', status: 202,
  handler: ({ req, supabase, user, params }) => rollbackDeployment(supabase, user.id, params.id, requestMeta(req)),
})
