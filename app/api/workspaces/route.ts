import { z } from 'zod'
import { fromPostgrest } from '@/lib/api/errors'
import { createHandler } from '@/lib/api/handler'

export const POST = createHandler({
  body: z.object({ name: z.string().trim().min(1, 'Name your workspace').max(60) }),
  status: 201,
  handler: async ({ supabase, body }) => {
    const { data, error } = await supabase.rpc('create_workspace', { p_name: body.name })
    if (error) throw fromPostgrest(error, 'Could not create workspace')
    return { workspace: { id: data.id as string, slug: data.slug as string, name: data.name as string } }
  },
})
