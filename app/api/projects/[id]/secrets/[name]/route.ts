import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { DeleteSecretQuery, SecretName, deleteSecret, requestMeta } from '@/lib/core/services/deploy-service'

/** Delete a secret for one environment (secrets:write) → 204. */
export const DELETE = createHandler({
  params: z.object({ id: z.string().uuid(), name: SecretName }), query: DeleteSecretQuery.strict(),
  handler: ({ req, supabase, user, params, query }) => deleteSecret(supabase, user.id, params.id, params.name, query.environment, requestMeta(req)),
})
