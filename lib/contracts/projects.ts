import { z } from 'zod'
import { Framework, ProjectStatus, UiMode } from './common'

export const CreateProjectSchema = z
  .object({
    workspaceId: z.string().uuid(),
    source: z.enum(['prompt', 'blank', 'template']),
    name: z.string().trim().min(1).max(80).optional(),
    initialPrompt: z.string().trim().min(1).max(10000).optional(),
    templateSlug: z.string().regex(/^[a-z0-9-]{3,60}$/).optional(),
    templateAnswers: z.record(z.string().max(500)).optional(),
    framework: Framework.optional(),
  })
  .refine((v) => v.source !== 'prompt' || !!v.initialPrompt, { path: ['initialPrompt'], message: 'Describe what you want to build' })
  .refine((v) => v.source !== 'template' || !!v.templateSlug, { path: ['templateSlug'], message: 'Pick a template' })
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80).optional(),
    description: z.string().trim().max(500).optional(),
    framework: Framework.optional(),
    language: z.enum(['python', 'typescript']).optional(),
    modeDefault: UiMode.optional(),
    autoCommit: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes')
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>

export const ListProjectsQuery = z.object({
  filter: z.enum(['all', 'mine', 'shared', 'deployed']).default('all'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
})
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>

export type ProjectCardDto = {
  id: string
  name: string
  description: string | null
  thumbnailUrl: string | null
  framework: string
  status: z.infer<typeof ProjectStatus>
  liveUrl: string | null
  updatedAt: string
  createdBy: { id: string; name: string | null } | null
}

export type ProjectDto = ProjectCardDto & {
  workspaceId: string
  initialPrompt: string | null
  modeDefault: 'build' | 'code'
  language: 'python' | 'typescript'
  source: string
  repoProvider: 'architect' | 'github'
  repoOwner: string | null
  repoName: string | null
  workingBranch: string
  autoCommit: boolean
  previewUrl: string | null
  createdAt: string
}
