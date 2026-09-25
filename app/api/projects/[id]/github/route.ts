import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { linkRepository, unlinkRepository } from '@/lib/core/services/github-service'

const Params = z.object({ id: z.string().uuid() })
const GhName = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/, 'Letters, numbers, dots, dashes and underscores only')

export const POST = createHandler({
  params: Params,
  body: z.object({
    owner: GhName.max(39),
    name: GhName,
    branch: z.string().regex(/^[A-Za-z0-9._\/-]{1,100}$/).refine((b) => !b.includes('..') && !b.startsWith('/'), 'Invalid branch').default('main'),
    autoCommit: z.boolean().default(true),
  }),
  handler: ({ supabase, user, params, body }) => linkRepository(supabase, user.id, params.id, body),
})

export const DELETE = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => unlinkRepository(supabase, user.id, params.id),
})
