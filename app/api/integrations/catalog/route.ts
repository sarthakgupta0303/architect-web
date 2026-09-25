import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { INTEGRATION_CATEGORIES } from '@/lib/core/integrations/catalog'
import { listCatalog } from '@/lib/core/services/integration-service'

export const GET = createHandler({
  query: z.object({ category: z.enum(INTEGRATION_CATEGORIES as [string, ...string[]]).optional(), q: z.string().max(100).optional() }),
  handler: async ({ query }) => listCatalog({ category: query.category as never, q: query.q }),
})
