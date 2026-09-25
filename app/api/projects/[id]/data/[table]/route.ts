import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { DATA_TABLES, getDataPage } from '@/lib/core/services/data-service'

const Params = z.object({ id: z.string().uuid(), table: z.enum(DATA_TABLES) })
const Query = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) }).strict()

export const GET = createHandler({
  params: Params,
  query: Query,
  handler: ({ supabase, user, params, query }) => getDataPage(supabase, user.id, params.id, params.table, query.page),
})
