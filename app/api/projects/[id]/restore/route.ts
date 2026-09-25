import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { restoreProject } from '@/lib/core/services/project-service'

export const POST = createHandler({
  params: z.object({ id: z.string().uuid() }),
  handler: ({ supabase, user, params }) => restoreProject(supabase, user.id, params.id),
})
