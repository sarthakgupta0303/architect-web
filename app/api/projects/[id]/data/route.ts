import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { listDataTables } from '@/lib/core/services/data-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => listDataTables(supabase, user.id, params.id),
})
