import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { completeBuild } from '@/lib/core/services/generation-service'

/** Prototype build: the client animates build steps, then this marks the project as having a preview. */
export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }), rate: 'processing',
  handler: ({ supabase, user, params }) => completeBuild(supabase, user.id, params.id),
})
