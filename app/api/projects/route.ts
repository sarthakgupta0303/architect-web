import { createHandler } from '@/lib/api/handler'
import { CreateProjectSchema } from '@/lib/contracts/projects'
import { createProject } from '@/lib/core/services/project-service'

export const POST = createHandler({
  body: CreateProjectSchema,
  status: 201,
  handler: ({ supabase, user, body }) => createProject(supabase, user.id, body),
})
