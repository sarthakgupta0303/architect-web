import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { listRuns, runEvals } from '@/lib/core/services/eval-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => listRuns(supabase, user.id, params.id),
})

export const POST = createHandler({
  params: Params,
  body: z.object({}).strict(),
  rate: 'generation',
  status: 201,
  handler: ({ supabase, user, params }) => runEvals(supabase, user.id, params.id),
})
