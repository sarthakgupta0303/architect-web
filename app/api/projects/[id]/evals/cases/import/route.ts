import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { EVAL_LIMITS } from '@/lib/core/services/eval-logic'
import { importCasesFromCsv } from '@/lib/core/services/eval-service'

const Params = z.object({ id: z.string().uuid() })

export const POST = createHandler({
  params: Params,
  body: z.object({
    csv: z.string().min(1, 'The file is empty').max(EVAL_LIMITS.MAX_CSV_BYTES, `CSV files can be at most ${EVAL_LIMITS.MAX_CSV_BYTES / 1000} KB`),
  }),
  status: 201,
  handler: ({ supabase, user, params, body }) => importCasesFromCsv(supabase, user.id, params.id, body.csv),
})
