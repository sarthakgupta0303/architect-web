import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { PrdContent } from '@/lib/contracts/generation'
import { getLatestPrd, savePrd } from '@/lib/core/services/generation-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({ params: Params, handler: ({ supabase, user, params }) => getLatestPrd(supabase, user.id, params.id) })

export const PUT = createHandler({
  params: Params,
  body: z.object({ content: PrdContent }),
  handler: ({ supabase, user, params, body }) => savePrd(supabase, user.id, params.id, body.content),
})
