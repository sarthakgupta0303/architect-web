import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { CreateCaseSchema } from '@/lib/core/services/eval-logic'
import { createCase, listCases } from '@/lib/core/services/eval-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => listCases(supabase, user.id, params.id),
})

export const POST = createHandler({
  params: Params,
  body: CreateCaseSchema,
  status: 201,
  handler: ({ supabase, user, params, body }) => createCase(supabase, user.id, params.id, body),
})
