import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { CreateDeploymentBody, ListDeploymentsQuery, createDeployment, listDeployments } from '@/lib/core/services/deploy-service'

const Params = z.object({ id: z.string().uuid() })

/** Deploy history, newest first (project:read). */
export const GET = createHandler({
  params: Params, query: ListDeploymentsQuery.strict(),
  handler: ({ supabase, user, params, query }) => listDeployments(supabase, user.id, params.id, query),
})

/** Start a deployment (deploy:preview / deploy:production). 202 { deploymentId, realtimeChannel, deployment, events }. */
export const POST = createHandler({
  params: Params, body: CreateDeploymentBody, rate: 'processing', status: 202,
  handler: ({ supabase, user, params, body }) => createDeployment(supabase, user.id, params.id, body),
})
