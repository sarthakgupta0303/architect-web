import { z } from 'zod'

export const Uuid = z.string().uuid()
export const Slug = z.string().regex(/^[a-z0-9-]{3,40}$/)

export const MemberRole = z.enum(['viewer', 'editor', 'admin', 'owner'])
export type MemberRole = z.infer<typeof MemberRole>

export const UiMode = z.enum(['build', 'code'])
export type UiMode = z.infer<typeof UiMode>

export const Framework = z.enum(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents'])
export type Framework = z.infer<typeof Framework>

export const FRAMEWORK_LABELS: Record<string, string> = {
  lyzr_adk: 'Architect ADK',
  langgraph: 'LangGraph',
  crewai: 'CrewAI',
  openai_agents: 'OpenAI Agents SDK',
  google_adk: 'Google ADK',
  claude_agent_sdk: 'Claude Agent SDK',
  mastra: 'Mastra',
  autogen: 'AutoGen',
  custom: 'Custom',
}

export const ProjectStatus = z.enum(['draft', 'building', 'preview', 'live', 'archived'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

export const PlanTier = z.enum(['free', 'pro', 'team', 'enterprise'])
export type PlanTier = z.infer<typeof PlanTier>

export const UseCase = z.enum(['support', 'sales', 'ops', 'research', 'content', 'personal', 'other'])
export type UseCase = z.infer<typeof UseCase>

export const ErrorCode = z.enum([
  'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'EXPIRED', 'PRECONDITION_FAILED', 'LOCKED',
  'VALIDATION_FAILED', 'INSUFFICIENT_CREDITS', 'PLAN_LIMIT', 'TOO_LARGE', 'RATE_LIMITED', 'UPSTREAM_ERROR',
  'SANDBOX_UNAVAILABLE', 'PROMPT_INJECTION', 'INTERNAL',
])
export type ErrorCode = z.infer<typeof ErrorCode>

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown>; requestId?: string }
}

export type Paginated<T> = { items: T[]; nextCursor: string | null }
