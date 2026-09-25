import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { deleteCase } from '@/lib/core/services/eval-service'

const Params = z.object({ id: z.string().uuid(), caseId: z.string().uuid() })

export const DELETE = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    await deleteCase(supabase, user.id, params.id, params.caseId)
  },
})
