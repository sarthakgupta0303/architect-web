import { z } from 'zod'
import { Framework } from './common'

export const AgentType = z.enum(['autonomous', 'workflow', 'human_approval', 'code'])
export type AgentType = z.infer<typeof AgentType>

export const MODEL_IDS = [
  'anthropic/claude-sonnet', 'anthropic/claude-haiku', 'openai/gpt-5', 'openai/gpt-5-mini', 'google/gemini-pro', 'google/gemini-flash',
] as const
export const ModelId = z.enum(MODEL_IDS)
export const MODEL_LABELS: Record<(typeof MODEL_IDS)[number], string> = {
  'anthropic/claude-sonnet': 'Claude Sonnet',
  'anthropic/claude-haiku': 'Claude Haiku',
  'openai/gpt-5': 'GPT-5',
  'openai/gpt-5-mini': 'GPT-5 mini',
  'google/gemini-pro': 'Gemini Pro',
  'google/gemini-flash': 'Gemini Flash',
}

export const BUILTIN_TOOLS = ['web_search', 'http_request', 'code_interpreter', 'knowledge_base'] as const
export const BuiltinTool = z.enum(BUILTIN_TOOLS)
export const BUILTIN_TOOL_LABELS: Record<(typeof BUILTIN_TOOLS)[number], string> = {
  web_search: 'Web search',
  http_request: 'HTTP request',
  code_interpreter: 'Code interpreter',
  knowledge_base: 'Knowledge base',
}

export const Memory = z.object({ mode: z.enum(['none', 'short', 'long']) })
export const Position = z.object({ x: z.number().finite(), y: z.number().finite() })

export type AgentToolDto = { id: string; toolType: 'integration' | 'mcp' | 'builtin' | 'code'; name: string }
export type AgentDto = {
  id: string
  key: string
  name: string
  role: string | null
  type: AgentType
  framework: string | null
  model: string | null
  instructions: string | null
  memory: { mode: 'none' | 'short' | 'long' }
  position: { x: number; y: number }
  isEntry: boolean
  managed: boolean
  locked: boolean
  hasCustomCode: boolean
  updatedAt: string
  tools: AgentToolDto[]
}
export type EdgeDto = { id: string; fromAgentId: string; toAgentId: string; condition: string; label: string | null }
export type AgentGraphDto = { agents: AgentDto[]; edges: EdgeDto[] }

export const CreateAgentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: AgentType.exclude(['code']).default('autonomous'),
  role: z.string().trim().max(200).optional(),
  model: ModelId.optional(),
  instructions: z.string().max(20000).optional(),
  position: Position,
})
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>

export const UpdateAgentSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    role: z.string().trim().max(200).nullable(),
    type: AgentType.exclude(['code']),
    framework: Framework.nullable(),
    model: ModelId.nullable(),
    instructions: z.string().max(20000).nullable(),
    memory: Memory,
    position: Position,
    isEntry: z.literal(true),
    locked: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No changes')
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>

export const CreateEdgeSchema = z
  .object({
    fromAgentId: z.string().uuid(),
    toAgentId: z.string().uuid(),
    condition: z.string().trim().max(500).default(''),
    label: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.fromAgentId !== v.toAgentId, { path: ['toAgentId'], message: 'An agent cannot hand off to itself' })
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>

export const UpdateEdgeSchema = z
  .object({ condition: z.string().trim().max(500), label: z.string().trim().max(80).nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No changes')

export const AddToolSchema = z.object({ toolType: z.literal('builtin'), name: BuiltinTool })
