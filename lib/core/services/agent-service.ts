import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import type { AddToolSchema, CreateAgentInput, CreateEdgeInput, UpdateAgentInput } from '@/lib/contracts/agents'
import { getProjectAccess } from '@/lib/core/access'
import { toAgentDto, toEdgeDto } from '@/lib/core/mappers'
import type { AgentRow, EdgeRow } from '@/lib/db/types'
import { agentKeyFromName } from '@/lib/utils'
import type { z } from 'zod'

const AGENT_COLS = 'id, project_id, key, name, role, type, framework, model, instructions, memory, position, is_entry, managed, locked, has_custom_code, updated_at, agent_tools(id, tool_type, name)'
const EDGE_COLS = 'id, project_id, from_agent_id, to_agent_id, condition, label'

export async function getGraph(supabase: SupabaseClient, userId: string, projectId: string) {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const [agents, edges] = await Promise.all([
    supabase.from('agents').select(AGENT_COLS).eq('project_id', projectId).order('created_at'),
    supabase.from('agent_edges').select(EDGE_COLS).eq('project_id', projectId).order('created_at'),
  ])
  if (agents.error) throw fromPostgrest(agents.error, 'Could not load agents')
  if (edges.error) throw fromPostgrest(edges.error, 'Could not load hand-offs')
  return {
    agents: (agents.data as unknown as AgentRow[]).map(toAgentDto),
    edges: (edges.data as EdgeRow[]).map(toEdgeDto),
  }
}

async function uniqueKey(supabase: SupabaseClient, projectId: string, name: string) {
  const base = agentKeyFromName(name)
  const { data } = await supabase.from('agents').select('key').eq('project_id', projectId).like('key', `${base}%`)
  const taken = new Set((data ?? []).map((r: { key: string }) => r.key))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const k = `${base.slice(0, 36)}_${i}`
    if (!taken.has(k)) return k
  }
  throw new AppError('CONFLICT', 'Too many agents with this name')
}

async function loadAgent(supabase: SupabaseClient, projectId: string, agentId: string): Promise<AgentRow> {
  const { data, error } = await supabase.from('agents').select(AGENT_COLS).eq('id', agentId).eq('project_id', projectId).maybeSingle()
  if (error) throw fromPostgrest(error)
  if (!data) throw new AppError('NOT_FOUND', 'Agent not found')
  return data as unknown as AgentRow
}

export async function createAgent(supabase: SupabaseClient, userId: string, projectId: string, input: CreateAgentInput) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const key = await uniqueKey(supabase, projectId, input.name)
  const { data, error } = await supabase
    .from('agents')
    .insert({
      project_id: projectId,
      key,
      name: input.name,
      type: input.type,
      role: input.role ?? null,
      model: input.model ?? null,
      instructions: input.instructions ?? null,
      position: input.position,
    })
    .select(AGENT_COLS)
    .single()
  if (error) throw fromPostgrest(error, 'Could not add agent')
  return { agent: toAgentDto(data as unknown as AgentRow) }
}

export async function updateAgent(supabase: SupabaseClient, userId: string, projectId: string, agentId: string, input: UpdateAgentInput) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const current = await loadAgent(supabase, projectId, agentId)
  const onlyUnlockOrMove = Object.keys(input).every((k) => k === 'position' || (k === 'locked' && input.locked === false))
  if (current.locked && !onlyUnlockOrMove) throw new AppError('LOCKED', 'This agent is locked — unlock it to edit')

  if (input.isEntry && !current.is_entry) {
    const { error: clearErr } = await supabase.from('agents').update({ is_entry: false }).eq('project_id', projectId).eq('is_entry', true)
    if (clearErr) throw fromPostgrest(clearErr)
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.role !== undefined) patch.role = input.role
  if (input.type !== undefined) patch.type = input.type
  if (input.framework !== undefined) patch.framework = input.framework
  if (input.model !== undefined) patch.model = input.model
  if (input.instructions !== undefined) patch.instructions = input.instructions
  if (input.memory !== undefined) patch.memory = input.memory
  if (input.position !== undefined) patch.position = { x: Math.round(input.position.x), y: Math.round(input.position.y) }
  if (input.isEntry) patch.is_entry = true
  if (input.locked !== undefined) patch.locked = input.locked

  const { data, error } = await supabase.from('agents').update(patch).eq('id', agentId).select(AGENT_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not update agent')
  return { agent: toAgentDto(data as unknown as AgentRow) }
}

export async function deleteAgent(supabase: SupabaseClient, userId: string, projectId: string, agentId: string) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const agent = await loadAgent(supabase, projectId, agentId)
  if (agent.locked) throw new AppError('LOCKED', 'This agent is locked — unlock it to delete')
  if (agent.is_entry) {
    const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    if ((count ?? 0) > 1) throw new AppError('CONFLICT', 'Choose another entry agent before deleting this one')
  }
  const { error } = await supabase.from('agents').delete().eq('id', agentId)
  if (error) throw fromPostgrest(error, 'Could not delete agent')
}

export async function createEdge(supabase: SupabaseClient, userId: string, projectId: string, input: CreateEdgeInput) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const { data, error } = await supabase
    .from('agent_edges')
    .insert({ project_id: projectId, from_agent_id: input.fromAgentId, to_agent_id: input.toAgentId, condition: input.condition, label: input.label ?? null })
    .select(EDGE_COLS)
    .single()
  if (error) {
    if (error.code === '23505') throw new AppError('CONFLICT', 'These agents are already connected')
    throw fromPostgrest(error, 'Could not connect agents')
  }
  return { edge: toEdgeDto(data as EdgeRow) }
}

export async function updateEdge(supabase: SupabaseClient, userId: string, projectId: string, edgeId: string, input: { condition?: string; label?: string | null }) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const { data, error } = await supabase.from('agent_edges').update(input).eq('id', edgeId).eq('project_id', projectId).select(EDGE_COLS).maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not update hand-off')
  if (!data) throw new AppError('NOT_FOUND', 'Hand-off not found')
  return { edge: toEdgeDto(data as EdgeRow) }
}

export async function deleteEdge(supabase: SupabaseClient, userId: string, projectId: string, edgeId: string) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const { error } = await supabase.from('agent_edges').delete().eq('id', edgeId).eq('project_id', projectId)
  if (error) throw fromPostgrest(error, 'Could not remove hand-off')
}

export async function addTool(supabase: SupabaseClient, userId: string, projectId: string, agentId: string, input: z.infer<typeof AddToolSchema>) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const agent = await loadAgent(supabase, projectId, agentId)
  if (agent.locked) throw new AppError('LOCKED', 'This agent is locked — unlock it to edit')
  if ((agent.agent_tools ?? []).some((t) => t.name === input.name)) throw new AppError('CONFLICT', 'This tool is already added')
  const { data, error } = await supabase.from('agent_tools').insert({ agent_id: agentId, tool_type: input.toolType, name: input.name }).select('id, tool_type, name').single()
  if (error) throw fromPostgrest(error, 'Could not add tool')
  return { tool: { id: data.id as string, toolType: data.tool_type as 'builtin', name: data.name as string } }
}

export async function removeTool(supabase: SupabaseClient, userId: string, projectId: string, agentId: string, toolId: string) {
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const agent = await loadAgent(supabase, projectId, agentId)
  if (agent.locked) throw new AppError('LOCKED', 'This agent is locked — unlock it to edit')
  const { error } = await supabase.from('agent_tools').delete().eq('id', toolId).eq('agent_id', agentId)
  if (error) throw fromPostgrest(error, 'Could not remove tool')
}
