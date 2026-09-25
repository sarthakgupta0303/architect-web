import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyProjectChatAccess } from '@/lib/security/chatSecurity'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { assertMessageLength, capHistory, LIMITS } from '@/lib/security/tokenLimiter'
import { classifyContext } from '@/lib/core/memory/classifier'
import { retrieveContext } from '@/lib/core/memory/context'
import { llmAnswer, llmClassify, llmConfigured } from '@/lib/core/memory/llm'
import { composeAnswer, extractSources } from '@/lib/core/memory/responder'
import { WINDOW, type ChatTurn, type Classification, type ContextType, type ProjectKnowledge, type Source } from '@/lib/core/memory/types'

export type ChatMessageDto = {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode: 'plan' | 'build'
  contextType: ContextType | null
  confidence: number | null
  sources: Source[]
  createdAt: string
  authorId: string | null
}

type Row = { id: string; role: 'user' | 'assistant'; content: string; mode: 'plan' | 'build'; context_type: ContextType | null; confidence: number | string | null; sources: Source[]; created_at: string; author_id: string | null }
const COLS = 'id, role, content, mode, context_type, confidence, sources, created_at, author_id'

const toDto = (r: Row): ChatMessageDto => ({
  id: r.id, role: r.role, content: r.content, mode: r.mode, contextType: r.context_type,
  confidence: r.confidence === null ? null : Number(r.confidence), sources: r.sources ?? [], createdAt: r.created_at, authorId: r.author_id,
})

function missingTable(err: { code?: string; message?: string }) {
  return err.code === '42P01' || err.code === 'PGRST205' || /chat_messages/.test(err.message ?? '')
}
const MIGRATION_HINT = 'Conversation memory needs migration 002 — run docs/specs/migrations/002_chat_messages.sql in the Supabase SQL Editor.'

/** Most recent `limit` turns, returned oldest → newest. */
async function loadHistory(supabase: SupabaseClient, projectId: string, limit: number): Promise<ChatTurn[]> {
  const { data, error } = await supabase.from('chat_messages').select(COLS).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit)
  if (error) {
    if (missingTable(error)) throw new AppError('PRECONDITION_FAILED', MIGRATION_HINT)
    throw fromPostgrest(error, 'Could not load the conversation')
  }
  return ((data ?? []) as Row[]).reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at, contextType: r.context_type }))
}

async function loadProjectKnowledge(supabase: SupabaseClient, projectId: string, name: string): Promise<ProjectKnowledge> {
  const [prd, agents, edges] = await Promise.all([
    supabase.from('prds').select('content').eq('project_id', projectId).order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('agents').select('key, name, role, type, model, instructions, is_entry, agent_tools(name)').eq('project_id', projectId).order('created_at'),
    supabase.from('agent_edges').select('from_agent_id, to_agent_id, condition, label').eq('project_id', projectId),
  ])
  if (agents.error) throw fromPostgrest(agents.error)
  type A = { key: string; name: string; role: string | null; type: string; model: string | null; instructions: string | null; is_entry: boolean; agent_tools: { name: string }[] }
  const agentRows = (agents.data ?? []) as unknown as A[]
  const { data: ids } = await supabase.from('agents').select('id, key').eq('project_id', projectId)
  const keyById = new Map((ids ?? []).map((a: { id: string; key: string }) => [a.id, a.key]))
  return {
    name,
    prd: (prd.data?.content as ProjectKnowledge['prd']) ?? null,
    agents: agentRows.map((a) => ({ key: a.key, name: a.name, role: a.role, type: a.type, model: a.model, instructions: a.instructions, tools: (a.agent_tools ?? []).map((t) => t.name), isEntry: a.is_entry })),
    edges: (edges.data ?? []).map((e) => ({ from: keyById.get(e.from_agent_id) ?? e.from_agent_id, to: keyById.get(e.to_agent_id) ?? e.to_agent_id, condition: e.condition, label: e.label })),
  }
}

export async function listMessages(supabase: SupabaseClient, userId: string, projectId: string) {
  await verifyProjectChatAccess(supabase, projectId, userId, 'read')
  const { data, error } = await supabase.from('chat_messages').select(COLS).eq('project_id', projectId).order('created_at', { ascending: false }).limit(LIMITS.MAX_CHAT_HISTORY)
  if (error) {
    if (missingTable(error)) return { items: [] as ChatMessageDto[], migrationRequired: true }
    throw fromPostgrest(error, 'Could not load the conversation')
  }
  return { items: ((data ?? []) as Row[]).reverse().map(toDto), migrationRequired: false }
}

/**
 * Memory pipeline (docs/specs/conversation-memory.md):
 *  1. Load history from the database — BEFORE saving the new message, so the classifier
 *     never sees the new question as part of the history.
 *  2. Classify the question → PROJECT | HISTORY | BOTH.
 *  3. Persist the user message (tagged with its classification).
 *  4. Retrieve context for that type and answer with the matching system prompt.
 *  5. Persist the assistant reply with its sources for attribution in the UI.
 */
export async function sendMessage(supabase: SupabaseClient, userId: string, projectId: string, rawContent: string, mode: 'plan' | 'build') {
  const { project } = await verifyProjectChatAccess(supabase, projectId, userId, 'write')
  // Security gates run before any read, write or model call.
  const content = sanitizeForLLM(assertMessageLength(rawContent))

  // (1) History first — the new message is not in the database yet.
  const history = capHistory(await loadHistory(supabase, projectId, WINDOW.historyOnly), WINDOW.historyOnly)
  const knowledge = await loadProjectKnowledge(supabase, projectId, project.name)

  // (2) Classify against prior turns only.
  let classification: Classification = classifyContext(content, history, knowledge)
  if (llmConfigured()) {
    try {
      classification = (await llmClassify(content, history)) ?? classification
    } catch (e) {
      console.warn('[chat] model classification failed, using rules', (e as Error).message)
    }
  }

  // (3) Save the user message.
  const { data: userRow, error: userErr } = await supabase
    .from('chat_messages')
    .insert({ project_id: projectId, author_id: userId, role: 'user', mode, content, context_type: classification.type, confidence: classification.confidence })
    .select(COLS)
    .single()
  if (userErr) throw fromPostgrest(userErr, 'Could not save your message')

  // (4) Retrieve + respond.
  const ctx = retrieveContext(classification.type, history, knowledge)
  let reply = composeAnswer(ctx, content)
  if (llmConfigured()) {
    try {
      const text = await llmAnswer(ctx, content)
      if (text) reply = { content: text, sources: extractSources(text, ctx, ctx.history) }
    } catch (e) {
      console.warn('[chat] model answer failed, using grounded composer', (e as Error).message)
    }
  }

  // (5) Save the assistant reply with attribution. Assistant rows are written with the
  // service role only — RLS lets users insert their own 'user' messages and nothing else,
  // so nobody can forge assistant turns to poison the memory.
  const assistantRow = { project_id: projectId, author_id: userId, role: 'assistant', mode, content: reply.content.slice(0, 10000), context_type: classification.type, confidence: classification.confidence, sources: reply.sources, reply_to: (userRow as Row).id }
  const admin = createAdminClient()
  let botRow: Row
  let persisted = false
  if (admin) {
    const { data, error: botErr } = await admin.from('chat_messages').insert(assistantRow).select(COLS).single()
    if (botErr) throw fromPostgrest(botErr, 'Could not save the reply')
    botRow = data as Row
    persisted = true
  } else {
    botRow = { id: `ephemeral-${(userRow as Row).id}`, role: 'assistant', content: assistantRow.content, mode, context_type: classification.type, confidence: classification.confidence, sources: reply.sources, created_at: new Date().toISOString(), author_id: userId }
  }

  return {
    persisted,
    user: toDto(userRow as Row),
    assistant: toDto(botRow),
    classification: { type: classification.type, confidence: classification.confidence, reason: classification.reason },
    usedTurns: ctx.history.length,
  }
}
