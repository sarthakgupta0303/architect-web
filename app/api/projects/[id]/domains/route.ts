import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { AddDomainBody, addDomain, listDomains, requestMeta } from '@/lib/core/services/deploy-service'

const Params = z.object({ id: z.string().uuid() })

/** Custom domains with their DNS records (project:read). */
export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => listDomains(supabase, user.id, params.id),
})

/** Add a custom domain (domains:write) → 201 { domain, dnsRecords }. */
export const POST = createHandler({
  params: Params, body: AddDomainBody, status: 201,
  handler: ({ req, supabase, user, params, body }) => addDomain(supabase, user.id, params.id, body, requestMeta(req)),
})
