import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import type { PrdContent, PrdDto } from '@/lib/contracts/generation'
import { getProjectAccess } from '@/lib/core/access'
import { agentGraph, clarifyQuestions, estimate, prdContent, type GraphSpec } from '@/lib/core/mocks/generation'
import { slugify } from '@/lib/utils'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'

function guard(prompt: string, answers: AnswerMap = {}) {
  sanitizeForLLM(prompt)
  for (const v of Object.values(answers)) (Array.isArray(v) ? v : [v]).forEach((x) => sanitizeForLLM(String(x)))
}

type AnswerMap = Record<string, string | string[]>

export async function getLatestPrd(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ prd: PrdDto | null }> {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const { data, error } = await supabase.from('prds').select('id, version, content, created_at').eq('project_id', projectId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not load PRD')
  return { prd: data ? { id: data.id, version: data.version, content: data.content as PrdContent, createdAt: data.created_at } : null }
}

async function insertPrdVersion(supabase: SupabaseClient, userId: string, projectId: string, content: PrdContent): Promise<PrdDto> {
  const { data: latest } = await supabase.from('prds').select('version').eq('project_id', projectId).order('version', { ascending: false }).limit(1).maybeSingle()
  const version = (latest?.version ?? 0) + 1
  const { data, error } = await supabase.from('prds').insert({ project_id: projectId, version, content, created_by: userId }).select('id, version, content, created_at').single()
  if (error) throw fromPostgrest(error, 'Could not save PRD')
  return { id: data.id, version: data.version, content: data.content as PrdContent, createdAt: data.created_at }
}

export async function savePrd(supabase: SupabaseClient, userId: string, projectId: string, content: PrdContent) {
  await getProjectAccess(supabase, projectId, userId, 'prompt:write')
  return { prd: await insertPrdVersion(supabase, userId, projectId, content) }
}

export async function clarify(supabase: SupabaseClient, userId: string, projectId: string, prompt: string) {
  guard(prompt)
  await getProjectAccess(supabase, projectId, userId, 'prompt:write')
  return { questions: clarifyQuestions(prompt) }
}

export async function generatePrd(supabase: SupabaseClient, userId: string, projectId: string, prompt: string, answers: AnswerMap) {
  guard(prompt, answers)
  const { project } = await getProjectAccess(supabase, projectId, userId, 'prompt:write')
  const graph = agentGraph(prompt, answers)
  const prd = await insertPrdVersion(supabase, userId, projectId, prdContent(project.name, prompt, answers, graph))
  if (!project.initial_prompt) await supabase.from('projects').update({ initial_prompt: prompt }).eq('id', projectId)
  return { prd }
}

/** Replaces all unlocked agents with the generated graph; locked agents are kept (FR-11). */
export async function generateGraph(supabase: SupabaseClient, userId: string, projectId: string, prompt: string, answers: AnswerMap) {
  guard(prompt, answers)
  await getProjectAccess(supabase, projectId, userId, 'canvas:write')
  const graph: GraphSpec = agentGraph(prompt, answers)

  const { data: existing, error: exErr } = await supabase.from('agents').select('id, key, locked').eq('project_id', projectId)
  if (exErr) throw fromPostgrest(exErr)
  const locked = (existing ?? []).filter((a) => a.locked)
  const unlockedIds = (existing ?? []).filter((a) => !a.locked).map((a) => a.id)
  if (unlockedIds.length) {
    const { error } = await supabase.from('agents').delete().in('id', unlockedIds)
    if (error) throw fromPostgrest(error, 'Could not replace agents')
  }
  const lockedKeys = new Set(locked.map((a) => a.key))
  const toInsert = graph.agents.filter((a) => !lockedKeys.has(a.key))
  const hasEntry = locked.length > 0 && (await supabase.from('agents').select('id').eq('project_id', projectId).eq('is_entry', true).maybeSingle()).data

  const { data: inserted, error: insErr } = await supabase
    .from('agents')
    .insert(toInsert.map((a, i) => ({
      project_id: projectId,
      key: slugify(a.key, 40).replace(/-/g, '_'),
      name: a.name,
      role: a.role,
      type: a.type,
      model: a.model,
      instructions: a.instructions,
      memory: { mode: a.type === 'autonomous' ? 'short' : 'none' },
      position: { x: 80 + i * 320, y: i % 2 === 0 ? 80 : 260 },
      is_entry: !hasEntry && i === 0,
    })))
    .select('id, key')
  if (insErr) throw fromPostgrest(insErr, 'Could not create agents')

  const idByKey = new Map<string, string>([...locked.map((a) => [a.key, a.id] as const), ...(inserted ?? []).map((a) => [a.key, a.id] as const)])
  const tools = toInsert.flatMap((a) => a.tools.map((t) => ({ agent_id: idByKey.get(a.key), tool_type: 'builtin', name: t }))).filter((t) => t.agent_id)
  if (tools.length) {
    const { error } = await supabase.from('agent_tools').insert(tools)
    if (error) throw fromPostgrest(error, 'Could not add tools')
  }
  const edges = graph.edges
    .map((e) => ({ project_id: projectId, from_agent_id: idByKey.get(e.from), to_agent_id: idByKey.get(e.to), condition: e.condition, label: e.label ?? null }))
    .filter((e) => e.from_agent_id && e.to_agent_id)
  if (edges.length) {
    const { error } = await supabase.from('agent_edges').insert(edges)
    if (error && error.code !== '23505') throw fromPostgrest(error, 'Could not connect agents')
  }
  return { agents: graph.agents.length, integrations: graph.integrations }
}

export async function estimateBuild(supabase: SupabaseClient, userId: string, projectId: string, prompt: string, answers: AnswerMap) {
  await getProjectAccess(supabase, projectId, userId, 'prompt:write')
  const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  const graph = agentGraph(prompt, answers)
  const est = estimate(graph)
  const extra = Math.max(0, (count ?? 0) - graph.agents.length) * 4
  return { ...est, credits: { p50: est.credits.p50 + extra, p90: Math.round((est.credits.p50 + extra) * 1.35) } }
}

/** Marks a successful (simulated) build: the project gets a preview. */
export async function completeBuild(supabase: SupabaseClient, userId: string, projectId: string) {
  const { project, workspace } = await getProjectAccess(supabase, projectId, userId, 'prompt:write')
  const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  if (!count) throw new AppError('PRECONDITION_FAILED', 'Add at least one agent before building')
  const previewUrl = `/preview/${projectId}`
  const { error } = await supabase.from('projects').update({ status: project.status === 'live' ? 'live' : 'preview', preview_url: previewUrl }).eq('id', projectId)
  if (error) throw fromPostgrest(error, 'Could not finish build')
  return { previewUrl, workspaceSlug: workspace.slug }
}

export async function deployProject(supabase: SupabaseClient, userId: string, projectId: string, environment: 'preview' | 'production') {
  const { project } = await getProjectAccess(supabase, projectId, userId, environment === 'production' ? 'deploy:production' : 'deploy:preview')
  if (!project.preview_url) throw new AppError('PRECONDITION_FAILED', 'Build the app before deploying')
  const slug = slugify(project.name, 30) || 'app'
  const url = environment === 'production' ? `https://${slug}.architect.app` : `https://${slug}-preview.architect.app`
  if (environment === 'production') {
    const { error } = await supabase.from('projects').update({ status: 'live', live_url: url }).eq('id', projectId)
    if (error) throw fromPostgrest(error, 'Could not deploy')
  }
  return { url, environment }
}
