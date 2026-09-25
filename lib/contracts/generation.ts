import { z } from 'zod'

export const Answers = z.record(z.union([z.string().max(500), z.array(z.string().max(80)).max(8)]))

export const ClarifyRequest = z.object({ prompt: z.string().trim().min(1).max(10000) })
export const PrdRequest = z.object({ prompt: z.string().trim().min(1).max(10000), answers: Answers.default({}) })
export const GraphRequest = z.object({ prompt: z.string().trim().min(1).max(10000), answers: Answers.default({}) })

export const PrdSection = z.object({ key: z.string().regex(/^[a-z_]{2,30}$/), title: z.string().trim().min(1).max(120), bodyMd: z.string().max(8000) })
export const PrdContent = z.object({ title: z.string().trim().min(1).max(120), summary: z.string().max(600), sections: z.array(PrdSection).min(1).max(20) })
export type PrdContent = z.infer<typeof PrdContent>
export type PrdDto = { id: string; version: number; content: PrdContent; createdAt: string }

export type ClarifyQuestionDto = { id: string; text: string; options: string[]; multi: boolean }
export type EstimateDto = {
  credits: { p50: number; p90: number }
  minutes: { p50: number }
  breakdown: { item: string; credits: number }[]
  missingIntegrations: string[]
}

export const DeployRequest = z.object({ environment: z.enum(['preview', 'production']) })
