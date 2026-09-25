import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { ListProjectsQuery } from '@/lib/contracts/projects'
import { listProjects } from '@/lib/core/services/project-service'

export const GET = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  query: ListProjectsQuery,
  handler: ({ supabase, user, params, query }) => listProjects(supabase, user.id, params.ws, query),
})
