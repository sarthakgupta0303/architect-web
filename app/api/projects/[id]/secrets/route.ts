import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { SecretListQuery, UpsertSecretBody, listSecrets, requestMeta, upsertSecret } from '@/lib/core/services/deploy-service'

const Params = z.object({ id: z.string().uuid() })

/** Masked secrets list (secrets:read). Never returns values. */
export const GET = createHandler({
  params: Params, query: SecretListQuery.strict(),
  handler: ({ supabase, user, params, query }) => listSecrets(supabase, user.id, params.id, query.environment),
})

/** Create or replace a secret (secrets:write) → { name, environment, last4 }. */
export const PUT = createHandler({
  params: Params, body: UpsertSecretBody,
  handler: ({ req, supabase, user, params, body }) => upsertSecret(supabase, user.id, params.id, body, requestMeta(req)),
})
