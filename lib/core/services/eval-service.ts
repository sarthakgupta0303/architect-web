import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getProjectAccess } from '@/lib/core/access'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeScore,
  EVAL_LIMITS,
  expectationFromJson,
  expectationToJson,
  parseEvalCsv,
  scoreCase,
  simulateResponse,
  type CreateCaseInput,
  type Expectation,
  type SimAgent,
  type SimEdge,
} from './eval-logic'

export { computeScore, parseEvalCsv, parseExpectation, scoreCase, simulateResponse, tokenizeCsv } from './eval-logic'

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type EvalCaseDto = { id: string; input: string; expectation: Expectation | null; source: string; createdAt: string }
export type EvalResultDto = {
  caseId: string
  input: string
  expectation: Expectation | null
  passed: boolean
  reason: string
  output: string
  trace: string[]
  latencyMs: number | null
}
export type EvalRunSummaryDto = { id: string; status: string; score: number | null; passed: number; failed: number; createdAt: string; finishedAt: string | null }
export type EvalRunDetailDto = EvalRunSummaryDto & { results: EvalResultDto[] }
export type EvalGateDto = { threshold: number; blockProd: boolean; configured: boolean }

const DEFAULT_SET_NAME = 'Default'
const DEFAULT_THRESHOLD = 80
const ADMIN_MISSING = 'Saving eval results needs the server key — set SUPABASE_SERVICE_ROLE_KEY in the environment and restart.'

type CaseRow = { id: string; input: unknown; expected: unknown; source: string; created_at: string }
type RunRow = { id: string; status: string; score: number | string | null; passed: number; failed: number; created_at: string; finished_at: string | null }
type ResultRow = { eval_case_id: string; passed: boolean; output: unknown; latency_ms: number | null }
type StoredOutput = { text?: unknown; trace?: unknown; reason?: unknown; input?: unknown; expected?: unknown }

const CASE_COLS = 'id, input, expected, source, created_at'
const RUN_COLS = 'id, status, score, passed, failed, created_at, finished_at'

function inputText(input: unknown): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object' && typeof (input as { message?: unknown }).message === 'string') return (input as { message: string }).message
  return ''
}

const toCaseDto = (r: CaseRow): EvalCaseDto => ({
  id: r.id, input: inputText(r.input), expectation: expectationFromJson(r.expected), source: r.source, createdAt: r.created_at,
})

const toRunDto = (r: RunRow): EvalRunSummaryDto => ({
  id: r.id, status: r.status, score: r.score === null ? null : Number(r.score), passed: r.passed, failed: r.failed, createdAt: r.created_at, finishedAt: r.finished_at,
})

function toResultDto(r: ResultRow): EvalResultDto {
  const o = (r.output && typeof r.output === 'object' ? r.output : {}) as StoredOutput
  return {
    caseId: r.eval_case_id,
    input: typeof o.input === 'string' ? o.input : '',
    expectation: expectationFromJson(o.expected),
    passed: r.passed,
    reason: typeof o.reason === 'string' ? o.reason : '',
    output: typeof o.text === 'string' ? o.text : '',
    trace: Array.isArray(o.trace) ? o.trace.filter((t): t is string => typeof t === 'string') : [],
    latencyMs: r.latency_ms,
  }
}

// ---------------------------------------------------------------------------
// Eval set (one default set per project in this UI)
// ---------------------------------------------------------------------------

async function findDefaultSet(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await supabase.from('eval_sets').select('id').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not load eval cases')
  return (data as { id: string } | null)?.id ?? null
}

async function ensureDefaultSet(supabase: SupabaseClient, projectId: string, userId: string): Promise<string> {
  const existing = await findDefaultSet(supabase, projectId)
  if (existing) return existing
  const { data, error } = await supabase.from('eval_sets').insert({ project_id: projectId, name: DEFAULT_SET_NAME, created_by: userId }).select('id').single()
  if (error) throw fromPostgrest(error, 'Could not create the eval set')
  return (data as { id: string }).id
}

async function countCases(supabase: SupabaseClient, setId: string): Promise<number> {
  const { count, error } = await supabase.from('eval_cases').select('id', { count: 'exact', head: true }).eq('eval_set_id', setId)
  if (error) throw fromPostgrest(error, 'Could not count eval cases')
  return count ?? 0
}

async function insertCases(supabase: SupabaseClient, setId: string, cases: CreateCaseInput[], source: 'manual' | 'csv'): Promise<EvalCaseDto[]> {
  const existing = await countCases(supabase, setId)
  if (existing + cases.length > EVAL_LIMITS.MAX_CASES_PER_SET) {
    throw new AppError('VALIDATION_FAILED', `A project can have at most ${EVAL_LIMITS.MAX_CASES_PER_SET} eval cases — it has ${existing}`)
  }
  const rows = cases.map((c) => ({ eval_set_id: setId, input: { message: c.input }, expected: expectationToJson(c.expectation), source }))
  const { data, error } = await supabase.from('eval_cases').insert(rows).select(CASE_COLS)
  if (error) throw fromPostgrest(error, 'Could not save eval cases')
  return ((data ?? []) as CaseRow[]).map(toCaseDto)
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export async function listCases(supabase: SupabaseClient, userId: string, projectId: string) {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const setId = await findDefaultSet(supabase, projectId)
  if (!setId) return { items: [] as EvalCaseDto[] }
  const { data, error } = await supabase.from('eval_cases').select(CASE_COLS).eq('eval_set_id', setId).order('created_at', { ascending: true }).limit(EVAL_LIMITS.MAX_CASES_PER_SET)
  if (error) throw fromPostgrest(error, 'Could not load eval cases')
  return { items: ((data ?? []) as CaseRow[]).map(toCaseDto) }
}

export async function createCase(supabase: SupabaseClient, userId: string, projectId: string, input: CreateCaseInput) {
  await getProjectAccess(supabase, projectId, userId, 'evals:write')
  const setId = await ensureDefaultSet(supabase, projectId, userId)
  const [created] = await insertCases(supabase, setId, [input], 'manual')
  if (!created) throw new AppError('INTERNAL', 'Could not save the eval case')
  return { case: created }
}

export async function importCasesFromCsv(supabase: SupabaseClient, userId: string, projectId: string, csv: string) {
  await getProjectAccess(supabase, projectId, userId, 'evals:write')
  const { cases, errors } = parseEvalCsv(csv)
  if (errors.length) {
    const first = errors[0]!
    throw new AppError('VALIDATION_FAILED', `Line ${first.line}: ${first.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`, { rowErrors: errors.slice(0, 20) })
  }
  if (cases.length === 0) throw new AppError('VALIDATION_FAILED', 'The file has no cases')
  const setId = await ensureDefaultSet(supabase, projectId, userId)
  const items = await insertCases(supabase, setId, cases, 'csv')
  return { imported: items.length, items }
}

export async function deleteCase(supabase: SupabaseClient, userId: string, projectId: string, caseId: string) {
  await getProjectAccess(supabase, projectId, userId, 'evals:write')
  const { data, error } = await supabase
    .from('eval_cases')
    .select('id, eval_sets!inner(project_id)')
    .eq('id', caseId)
    .eq('eval_sets.project_id', projectId)
    .maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not load the eval case')
  if (!data) throw new AppError('NOT_FOUND', 'Eval case not found')
  const { data: deleted, error: delErr } = await supabase.from('eval_cases').delete().eq('id', caseId).select('id')
  if (delErr) throw fromPostgrest(delErr, 'Could not delete the eval case')
  if (!deleted?.length) throw new AppError('NOT_FOUND', 'Eval case not found')
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

async function loadGraph(supabase: SupabaseClient, projectId: string): Promise<{ agents: SimAgent[]; edges: SimEdge[] }> {
  const [agents, edges] = await Promise.all([
    supabase.from('agents').select('id, key, name, role, type, is_entry').eq('project_id', projectId).order('created_at'),
    supabase.from('agent_edges').select('from_agent_id, to_agent_id, condition, label').eq('project_id', projectId),
  ])
  if (agents.error) throw fromPostgrest(agents.error, 'Could not load agents')
  if (edges.error) throw fromPostgrest(edges.error, 'Could not load agent hand-offs')
  type A = { id: string; key: string; name: string; role: string | null; type: string; is_entry: boolean }
  type E = { from_agent_id: string; to_agent_id: string; condition: string | null; label: string | null }
  return {
    agents: ((agents.data ?? []) as A[]).map((a) => ({ id: a.id, key: a.key, name: a.name, role: a.role, type: a.type, isEntry: a.is_entry })),
    edges: ((edges.data ?? []) as E[]).map((e) => ({ from: e.from_agent_id, to: e.to_agent_id, condition: e.condition ?? '', label: e.label })),
  }
}

/**
 * Runs every case in the project's eval set through the preview responder, scores it and
 * persists the run. eval_runs is written with the caller's session (RLS: editor); eval_results
 * is server-owned, so it is written with the service role — only after the evals:write check.
 */
export async function runEvals(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ run: EvalRunDetailDto }> {
  await getProjectAccess(supabase, projectId, userId, 'evals:write')
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', ADMIN_MISSING)

  const setId = await findDefaultSet(supabase, projectId)
  const cases = setId
    ? await supabase.from('eval_cases').select(CASE_COLS).eq('eval_set_id', setId).order('created_at', { ascending: true }).limit(EVAL_LIMITS.MAX_CASES_PER_SET)
    : null
  if (cases?.error) throw fromPostgrest(cases.error, 'Could not load eval cases')
  const caseRows = (cases?.data ?? []) as CaseRow[]
  if (!setId || caseRows.length === 0) throw new AppError('VALIDATION_FAILED', 'Add at least one eval case before running')

  const graph = await loadGraph(supabase, projectId)

  const { data: runRow, error: runErr } = await supabase
    .from('eval_runs')
    .insert({ eval_set_id: setId, project_id: projectId, status: 'running', created_by: userId })
    .select(RUN_COLS)
    .single()
  if (runErr) throw fromPostgrest(runErr, 'Could not start the eval run')
  const runId = (runRow as RunRow).id

  const results = caseRows.map((row) => {
    const input = inputText(row.input)
    const expectation = expectationFromJson(row.expected)
    const started = performance.now()
    const response = simulateResponse(input, graph.agents, graph.edges)
    const score = scoreCase(expectation, response)
    const latencyMs = Math.max(0, Math.round(performance.now() - started))
    return {
      eval_run_id: runId,
      eval_case_id: row.id,
      passed: score.passed,
      scores: expectation ? { [expectation.type]: score.passed ? 1 : 0 } : {},
      output: { text: response.text, trace: response.path.map((a) => a.name), escalated: response.escalated, reason: score.reason, input, expected: row.expected },
      latency_ms: latencyMs,
      cost: 0,
    }
  })

  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  const { error: resErr } = await admin.from('eval_results').insert(results)
  if (resErr) {
    await supabase.from('eval_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId)
    throw fromPostgrest(resErr, 'Could not save eval results')
  }

  const { data: finished, error: finErr } = await supabase
    .from('eval_runs')
    .update({ status: 'succeeded', score: computeScore(passed, results.length), passed, failed, finished_at: new Date().toISOString() })
    .eq('id', runId)
    .select(RUN_COLS)
    .single()
  if (finErr) throw fromPostgrest(finErr, 'Could not finish the eval run')

  return {
    run: {
      ...toRunDto(finished as RunRow),
      results: results.map((r) => toResultDto({ eval_case_id: r.eval_case_id, passed: r.passed, output: r.output, latency_ms: r.latency_ms })),
    },
  }
}

/** Recent runs (newest first) plus the full results of the latest run. */
export async function listRuns(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ items: EvalRunSummaryDto[]; latest: EvalRunDetailDto | null }> {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const { data, error } = await supabase.from('eval_runs').select(RUN_COLS).eq('project_id', projectId).order('created_at', { ascending: false }).limit(EVAL_LIMITS.HISTORY)
  if (error) throw fromPostgrest(error, 'Could not load eval runs')
  const items = ((data ?? []) as RunRow[]).map(toRunDto)
  const latestDone = items.find((r) => r.status === 'succeeded')
  if (!latestDone) return { items, latest: null }
  const { data: res, error: resErr } = await supabase
    .from('eval_results')
    .select('eval_case_id, passed, output, latency_ms')
    .eq('eval_run_id', latestDone.id)
    .order('created_at', { ascending: true })
  if (resErr) throw fromPostgrest(resErr, 'Could not load eval results')
  return { items, latest: { ...latestDone, results: ((res ?? []) as ResultRow[]).map(toResultDto) } }
}

// ---------------------------------------------------------------------------
// Deploy gate (project_settings — server-owned for clients)
// ---------------------------------------------------------------------------

type SettingsRow = { eval_gate_threshold: number | string | null; block_prod_on_eval_fail: boolean }

export async function getGate(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ gate: EvalGateDto }> {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const { data, error } = await supabase.from('project_settings').select('eval_gate_threshold, block_prod_on_eval_fail').eq('project_id', projectId).maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not load the deploy gate')
  const row = data as SettingsRow | null
  return {
    gate: {
      threshold: row?.eval_gate_threshold === null || row?.eval_gate_threshold === undefined ? DEFAULT_THRESHOLD : Number(row.eval_gate_threshold),
      blockProd: row?.block_prod_on_eval_fail ?? false,
      configured: row?.eval_gate_threshold !== null && row?.eval_gate_threshold !== undefined,
    },
  }
}

export async function updateGate(supabase: SupabaseClient, userId: string, projectId: string, input: { threshold?: number; blockProd?: boolean }): Promise<{ gate: EvalGateDto }> {
  // Runtime settings are developer-only (docs/specs/evals.md §5, settings:runtime).
  await getProjectAccess(supabase, projectId, userId, 'settings:runtime')
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', 'Saving the deploy gate needs the server key — set SUPABASE_SERVICE_ROLE_KEY in the environment and restart.')
  const current = (await getGate(supabase, userId, projectId)).gate
  const threshold = input.threshold ?? current.threshold
  const blockProd = input.blockProd ?? current.blockProd
  const { data, error } = await admin
    .from('project_settings')
    .upsert({ project_id: projectId, eval_gate_threshold: threshold, block_prod_on_eval_fail: blockProd, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    .select('eval_gate_threshold, block_prod_on_eval_fail')
    .single()
  if (error) throw fromPostgrest(error, 'Could not save the deploy gate')
  const row = data as SettingsRow
  return { gate: { threshold: Number(row.eval_gate_threshold ?? threshold), blockProd: row.block_prod_on_eval_fail, configured: true } }
}
