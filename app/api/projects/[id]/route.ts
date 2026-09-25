import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { UpdateProjectSchema } from '@/lib/contracts/projects'
import { deleteProject, getProject, updateProject } from '@/lib/core/services/project-service'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => ({ project: (await getProject(supabase, user.id, params.id)).project }),
})

export const PATCH = createHandler({
  params: Params,
  body: UpdateProjectSchema,
  handler: ({ supabase, user, params, body }) => updateProject(supabase, user.id, params.id, body),
})

export const DELETE = createHandler({
  params: Params,
  handler: async ({ supabase, user, params }) => {
    await deleteProject(supabase, user.id, params.id)
  },
})
