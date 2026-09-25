import { z } from 'zod'
import { Framework, MemberRole, UiMode, UseCase } from './common'

export const InviteInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: MemberRole.exclude(['owner']),
})

export const OnboardingSchema = z.object({
  defaultMode: UiMode,
  isDeveloper: z.boolean(),
  useCase: UseCase,
  workspaceName: z.string().trim().min(1, 'Name your workspace').max(60, 'Keep it under 60 characters'),
  invites: z.array(InviteInput).max(10).default([])
    .refine((list) => new Set(list.map((i) => i.email)).size === list.length, 'Each email can be invited once'),
  preferredFramework: Framework.default('lyzr_adk'),
  preferredLanguage: z.enum(['python', 'typescript']).default('python'),
})
export type OnboardingInput = z.infer<typeof OnboardingSchema>

export const UpdateMeSchema = z.object({
  fullName: z.string().trim().min(1).max(80).optional(),
  defaultMode: UiMode.optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  modePref: z.object({ projectId: z.string().uuid(), mode: UiMode }).optional(),
}).refine((v) => Object.keys(v).length > 0, 'No changes')
