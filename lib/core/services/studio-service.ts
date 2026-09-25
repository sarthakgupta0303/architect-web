import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromPostgrest } from '@/lib/api/errors'
import { getProjectAccess, getWorkspaceAccess } from '@/lib/core/access'

export type StudioRange = '24h' | '7d' | '30d'
const RANGE_MS: Record<StudioRange, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 }
const PAGE = 1000
const MAX_ROWS = 20_000

type Row = { created_at: string; status: string; cost: number | string; latency_ms: number; output_preview: string | null }

async function fetchRange(supabase: SupabaseClient, projectId: string, env: string, from: Date, to: Date): Promise<Row[]> {
  const { count, error } = await supabase
    .from('runs').select('id', { count: 'exact', head: true })
    .eq('project_id', projectId).eq('environment', env).gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
  if (error) throw fromPostgrest(error, 'Could not load runs')
  const total = Math.min(count ?? 0, MAX_ROWS)
  const pages = Math.ceil(total / PAGE)
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from('runs')
        .select('created_at, status, cost, latency_ms, output_preview')
        .eq('project_id', projectId).eq('environment', env)
        .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
        .order('created_at', { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1),
    ),
  )
  const rows: Row[] = []
  for (const r of results) {
    if (r.error) throw fromPostgrest(r.error, 'Could not load runs')
    rows.push(...((r.data ?? []) as Row[]))
  }
  return rows
}

function p95(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
}

function summarize(rows: Row[]) {
  const runs = rows.length
  const errors = rows.filter((r) => r.status === 'error').length
  const escalations = rows.filter((r) => r.status === 'escalated').length
  const cost = rows.reduce((s, r) => s + Number(r.cost), 0)
  return { runs, errors, escalations, cost, successRate: runs ? ((runs - errors) / runs) * 100 : 0, p95LatencyMs: p95(rows.map((r) => r.latency_ms)) }
}

export async function studioOverview(supabase: SupabaseClient, userId: string, projectId: string, range: StudioRange, env: string) {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const now = new Date()
  const from = new Date(now.getTime() - RANGE_MS[range])
  const prevFrom = new Date(from.getTime() - RANGE_MS[range])
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [rows, prevRows, monthRows] = await Promise.all([
    fetchRange(supabase, projectId, env, from, now),
    fetchRange(supabase, projectId, env, prevFrom, from),
    range === '30d' ? Promise.resolve<Row[] | null>(null) : fetchRange(supabase, projectId, env, startOfMonth, now),
  ])

  const cur = summarize(rows)
  const prev = summarize(prevRows)
  const month = monthRows ? summarize(monthRows) : summarize(rows.filter((r) => Date.parse(r.created_at) >= startOfMonth.getTime()))
  const today = summarize(rows.filter((r) => Date.parse(r.created_at) >= startOfDay.getTime()))

  const bucketMs = range === '24h' ? 3_600_000 : 86_400_000
  const bucketCount = Math.round(RANGE_MS[range] / bucketMs)
  const firstBucket = Math.floor(from.getTime() / bucketMs) * bucketMs
  const series = Array.from({ length: bucketCount + 1 }, (_, i) => ({ ts: new Date(firstBucket + i * bucketMs).toISOString(), runs: 0, errors: 0, cost: 0 }))
  for (const r of rows) {
    const idx = Math.floor((Date.parse(r.created_at) - firstBucket) / bucketMs)
    const b = series[idx]
    if (!b) continue
    b.runs += 1
    if (r.status === 'error') b.errors += 1
    b.cost += Number(r.cost)
  }
  series.forEach((b) => { b.cost = Math.round(b.cost * 10_000) / 10_000 })

  const errorCounts = new Map<string, number>()
  rows.filter((r) => r.status === 'error').forEach((r) => {
    const key = r.output_preview ?? 'Unknown error'
    errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1)
  })

  const delta = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100)
  return {
    kpis: {
      runs: cur.runs,
      successRate: Math.round(cur.successRate * 10) / 10,
      p95LatencyMs: cur.p95LatencyMs,
      costToday: Math.round(today.cost * 100) / 100,
      costMonth: Math.round(month.cost * 100) / 100,
      escalations: cur.escalations,
    },
    deltas: {
      runs: delta(cur.runs, prev.runs),
      successRate: prev.runs ? cur.successRate - prev.successRate : null,
      p95LatencyMs: delta(cur.p95LatencyMs, prev.p95LatencyMs),
      escalations: delta(cur.escalations, prev.escalations),
    },
    series,
    topErrors: [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count })),
  }
}

export async function studioRuns(
  supabase: SupabaseClient, userId: string, projectId: string,
  q: { status?: string; env: string; search?: string; page: number; pageSize: number },
) {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  let query = supabase
    .from('runs')
    .select('id, created_at, status, latency_ms, cost, input_preview, output_preview, end_user_ref, tokens_in, tokens_out, agents:entry_agent_id(name)', { count: 'exact' })
    .eq('project_id', projectId)
    .eq('environment', q.env)
    .order('created_at', { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1)
  if (q.status) query = query.eq('status', q.status)
  if (q.search) query = query.ilike('input_preview', `%${q.search.replace(/[%_]/g, (m) => `\\${m}`)}%`)
  const { data, error, count } = await query
  if (error) throw fromPostgrest(error, 'Could not load runs')
  type R = { id: string; created_at: string; status: string; latency_ms: number; cost: number | string; input_preview: string | null; output_preview: string | null; end_user_ref: string | null; tokens_in: number; tokens_out: number; agents: { name: string } | null }
  return {
    total: count ?? 0,
    items: ((data ?? []) as unknown as R[]).map((r) => ({
      id: r.id, createdAt: r.created_at, status: r.status, latencyMs: r.latency_ms, cost: Number(r.cost),
      inputPreview: r.input_preview, outputPreview: r.output_preview, endUserRef: r.end_user_ref,
      tokensIn: r.tokens_in, tokensOut: r.tokens_out, entryAgent: r.agents?.name ?? null,
    })),
  }
}

type WsRunRow = { project_id: string; created_at: string; status: string; cost: number | string; latency_ms: number }

/** Workspace-wide production overview: totals, daily series and a per-project breakdown. */
export async function workspaceStudio(supabase: SupabaseClient, userId: string, ws: string, range: StudioRange) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'workspace:read')
  const { data: projects, error: pErr } = await supabase
    .from('projects').select('id, name, status, live_url, framework, updated_at')
    .eq('workspace_id', workspace.id).is('deleted_at', null).order('updated_at', { ascending: false }).limit(200)
  if (pErr) throw fromPostgrest(pErr, 'Could not load projects')
  const list = (projects ?? []) as { id: string; name: string; status: string; live_url: string | null; framework: string; updated_at: string }[]

  const now = new Date()
  const from = new Date(now.getTime() - RANGE_MS[range])
  const rows: WsRunRow[] = []
  if (list.length) {
    const ids = list.map((p) => p.id)
    for (let page = 0; rows.length < MAX_ROWS; page++) {
      const { data, error } = await supabase
        .from('runs').select('project_id, created_at, status, cost, latency_ms')
        .in('project_id', ids).eq('environment', 'production')
        .gte('created_at', from.toISOString()).lt('created_at', now.toISOString())
        .order('created_at', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) throw fromPostgrest(error, 'Could not load runs')
      rows.push(...((data ?? []) as WsRunRow[]))
      if (!data || data.length < PAGE) break
    }
  }

  const bucketMs = range === '24h' ? 3_600_000 : 86_400_000
  const bucketCount = Math.round(RANGE_MS[range] / bucketMs)
  const firstBucket = Math.floor(from.getTime() / bucketMs) * bucketMs
  const series = Array.from({ length: bucketCount + 1 }, (_, i) => ({ ts: new Date(firstBucket + i * bucketMs).toISOString(), runs: 0, errors: 0 }))
  const per = new Map<string, WsRunRow[]>()
  for (const r of rows) {
    const b = series[Math.floor((Date.parse(r.created_at) - firstBucket) / bucketMs)]
    if (b) { b.runs += 1; if (r.status === 'error') b.errors += 1 }
    const arr = per.get(r.project_id) ?? []
    arr.push(r)
    per.set(r.project_id, arr)
  }

  const totals = summarize(rows as unknown as Row[])
  return {
    kpis: {
      runs: totals.runs,
      successRate: Math.round(totals.successRate * 10) / 10,
      p95LatencyMs: totals.p95LatencyMs,
      cost: Math.round(totals.cost * 100) / 100,
      escalations: totals.escalations,
      liveApps: list.filter((p) => p.status === 'live').length,
    },
    series,
    projects: list.map((p) => {
      const s = summarize((per.get(p.id) ?? []) as unknown as Row[])
      return {
        id: p.id, name: p.name, status: p.status, framework: p.framework, liveUrl: p.live_url,
        runs: s.runs, successRate: Math.round(s.successRate * 10) / 10, p95LatencyMs: s.p95LatencyMs,
        cost: Math.round(s.cost * 100) / 100, escalations: s.escalations,
      }
    }).sort((a, b) => b.runs - a.runs || (a.status === 'live' ? -1 : 1)),
  }
}
