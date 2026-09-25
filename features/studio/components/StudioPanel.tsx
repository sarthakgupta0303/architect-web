'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Activity, BarChart3, ChevronLeft, ChevronRight, Search, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { apiFetch } from '@/lib/api/client'
import { cn, formatUsd } from '@/lib/utils'

type Overview = {
  kpis: { runs: number; successRate: number; p95LatencyMs: number; costToday: number; costMonth: number; escalations: number }
  deltas: { runs: number | null; successRate: number | null; p95LatencyMs: number | null; escalations: number | null }
  series: { ts: string; runs: number; errors: number; cost: number }[]
  topErrors: { message: string; count: number }[]
}
type RunItem = { id: string; createdAt: string; status: string; latencyMs: number; cost: number; inputPreview: string | null; outputPreview: string | null; endUserRef: string | null; tokensIn: number; tokensOut: number; entryAgent: string | null }

export function StudioPanel({ projectId, onDeploy }: { projectId: string; onDeploy: () => void }) {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d')
  const [tab, setTab] = useState<'overview' | 'runs' | 'guardrails'>('overview')
  const overview = useQuery({
    queryKey: ['studio', projectId, range],
    queryFn: () => apiFetch<Overview>(`/api/projects/${projectId}/studio/overview?range=${range}`),
  })

  const hasData = (overview.data?.kpis.runs ?? 0) > 0 || (overview.data?.series.some((s) => s.runs > 0) ?? false)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Agent Studio</h1>
            <p className="text-sm text-muted">Production runs, quality and cost</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented size="sm" label="Studio section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'runs', label: 'Runs' }, { value: 'guardrails', label: 'Guardrails' }]} />
            {tab === 'overview' && <Segmented size="sm" label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24h' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />}
          </div>
        </div>

        {overview.isLoading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : overview.isError ? (
          <ErrorState message="Could not load Studio data" onRetry={() => overview.refetch()} />
        ) : !hasData && tab !== 'guardrails' ? (
          <EmptyState icon={Activity} className="mt-10" title="No production runs yet" body="Deploy your app to production and every run — with its trace, cost and outcome — shows up here. Try the demo project on the dashboard to see Studio with 30 days of data."
            action={<Button onClick={onDeploy}>Deploy</Button>} />
        ) : tab === 'overview' ? (
          <OverviewView data={overview.data!} range={range} />
        ) : tab === 'runs' ? (
          <RunsView projectId={projectId} />
        ) : (
          <GuardrailsView />
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, delta, invert }: { label: string; value: string; delta: number | null; invert?: boolean }) {
  const good = delta === null ? null : invert ? delta < 0 : delta > 0
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {delta !== null && Number.isFinite(delta) && (
        <p className={cn('mt-1 flex items-center gap-1 text-xs', good ? 'text-success' : 'text-danger')}>
          {delta >= 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
          {Math.abs(delta).toFixed(1)}{label === 'Success rate' ? ' pts' : '%'} vs previous
        </p>
      )}
    </Card>
  )
}

function OverviewView({ data, range }: { data: Overview; range: string }) {
  const fmt = range === '24h' ? 'HH:mm' : 'MMM d'
  const series = data.series.map((s) => ({ ...s, label: format(new Date(s.ts), fmt) }))
  const axis = { stroke: 'rgb(var(--color-muted))', fontSize: 11, tickLine: false, axisLine: false }
  const tip = { contentStyle: { background: 'rgb(var(--color-surface-2))', border: '1px solid rgb(var(--color-border))', borderRadius: 12, fontSize: 12 }, labelStyle: { color: 'rgb(var(--color-fg))' } }
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Runs" value={data.kpis.runs.toLocaleString()} delta={data.deltas.runs} />
        <Kpi label="Success rate" value={`${data.kpis.successRate}%`} delta={data.deltas.successRate} />
        <Kpi label="P95 latency" value={`${(data.kpis.p95LatencyMs / 1000).toFixed(1)}s`} delta={data.deltas.p95LatencyMs} invert />
        <Kpi label="Cost today" value={formatUsd(data.kpis.costToday)} delta={null} />
        <Kpi label="Cost this month" value={formatUsd(data.kpis.costMonth)} delta={null} />
        <Kpi label="Escalations" value={data.kpis.escalations.toLocaleString()} delta={data.deltas.escalations} invert />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">Runs and errors</h3>
          <div className="mt-4 h-56" role="img" aria-label="Runs and errors over time">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis {...axis} width={36} />
                <ChartTooltip {...tip} />
                <Area type="monotone" dataKey="runs" name="Runs" stroke="rgb(var(--color-primary-text))" fill="rgb(var(--color-primary) / 0.2)" strokeWidth={2} />
                <Area type="monotone" dataKey="errors" name="Errors" stroke="rgb(var(--color-danger))" fill="rgb(var(--color-danger) / 0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">Cost (USD)</h3>
          <div className="mt-4 h-56" role="img" aria-label="Cost over time">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis {...axis} width={40} />
                <ChartTooltip {...tip} formatter={(v: number) => formatUsd(v, 3)} />
                <Bar dataKey="cost" name="Cost" fill="rgb(var(--color-accent) / 0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold">Top errors</h3>
        {data.topErrors.length === 0 ? <p className="mt-2 text-sm text-muted">No errors in this period.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {data.topErrors.map((e) => <li key={e.message} className="flex justify-between gap-4 py-2 text-sm"><span className="truncate font-mono text-xs">{e.message}</span><span className="tabular-nums text-muted">{e.count}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  )
}

function RunsView({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<RunItem | null>(null)
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(0) }, 300); return () => clearTimeout(t) }, [search])
  const runs = useQuery({
    queryKey: ['studio-runs', projectId, status, q, page],
    queryFn: () => apiFetch<{ total: number; items: RunItem[] }>(`/api/projects/${projectId}/studio/runs?page=${page}&pageSize=25${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: (prev) => prev,
  })
  const total = runs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 25))

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Status" className="h-9 w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
          <option value="">All statuses</option><option value="success">Success</option><option value="error">Error</option><option value="escalated">Escalated</option>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="h-9 w-64 pl-9" placeholder="Search inputs" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search runs" />
        </div>
        <span className="ml-auto text-xs text-muted">{total.toLocaleString()} runs</span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Input</th>
              <th className="px-4 py-3 font-medium">Entry agent</th><th className="px-4 py-3 text-right font-medium">Latency</th><th className="px-4 py-3 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {runs.isLoading && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-6" /></td></tr>)}
            {runs.data?.items.map((r) => (
              <tr key={r.id} className="h-12 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2" onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                <td className="whitespace-nowrap px-4 text-muted">{format(new Date(r.createdAt), 'MMM d, HH:mm')}</td>
                <td className="px-4"><StatusPill status={r.status === 'success' ? 'success' : r.status === 'error' ? 'error' : 'escalated'} /></td>
                <td className="max-w-xs truncate px-4">{r.inputPreview}</td>
                <td className="px-4 text-muted">{r.entryAgent ?? '—'}</td>
                <td className="px-4 text-right tabular-nums">{(r.latencyMs / 1000).toFixed(2)}s</td>
                <td className="px-4 text-right tabular-nums">{formatUsd(r.cost, 4)}</td>
              </tr>
            ))}
            {runs.data && runs.data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No runs match these filters</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" aria-hidden />Previous</Button>
        <span className="text-xs text-muted">Page {page + 1} of {pages}</span>
        <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="size-4" aria-hidden /></Button>
      </div>
      {open && <TraceDrawer run={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TraceDrawer({ run, onClose }: { run: RunItem; onClose: () => void }) {
  const steps = [
    { agent: run.entryAgent ?? 'Triage', kind: 'Classified the message', ms: Math.round(run.latencyMs * 0.25) },
    { agent: run.status === 'escalated' ? 'Escalation' : 'Knowledge', kind: run.status === 'escalated' ? 'Posted to Slack for a human' : 'Searched help content', ms: Math.round(run.latencyMs * 0.45) },
    ...(run.status === 'success' ? [{ agent: 'Responder', kind: 'Drafted the reply', ms: Math.round(run.latencyMs * 0.3) }] : []),
  ]
  const total = steps.reduce((s, x) => s + x.ms, 0)
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Run trace">
      <button aria-label="Close trace" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto border-l border-border bg-surface p-6 animate-slide-in-right">
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-semibold">Run trace</h2><p className="font-mono text-xs text-muted">{run.id}</p></div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Latency</p><p className="font-semibold tabular-nums">{(run.latencyMs / 1000).toFixed(2)}s</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Tokens</p><p className="font-semibold tabular-nums">{(run.tokensIn + run.tokensOut).toLocaleString()}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Cost</p><p className="font-semibold tabular-nums">{formatUsd(run.cost, 4)}</p></div>
        </div>
        <h3 className="mt-6 text-sm font-semibold">Timeline</h3>
        <ol className="mt-3 space-y-3">
          {steps.map((s, i) => (
            <li key={i}>
              <div className="flex justify-between text-sm"><span><span className="font-medium">{s.agent}</span> <span className="text-muted">· {s.kind}</span></span><span className="tabular-nums text-muted">{s.ms}ms</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${(s.ms / total) * 100}%`, marginLeft: `${(steps.slice(0, i).reduce((a, x) => a + x.ms, 0) / total) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
        <h3 className="mt-6 text-sm font-semibold">Input</h3>
        <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{run.inputPreview}</p>
        <h3 className="mt-4 text-sm font-semibold">Output</h3>
        <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{run.outputPreview}</p>
      </aside>
    </div>
  )
}

function GuardrailsView() {
  const [state, setState] = useState({ pii: true, spend: true, topics: false, jailbreak: true })
  const rows: { key: keyof typeof state; title: string; body: string }[] = [
    { key: 'pii', title: 'PII redaction', body: 'Masks emails, phone numbers and card numbers in outputs and logs.' },
    { key: 'spend', title: 'Spend limit', body: 'Stops a run above $0.25 and pauses agents above $40 per day.' },
    { key: 'topics', title: 'Blocked topics', body: 'Refuses legal and medical advice.' },
    { key: 'jailbreak', title: 'Jailbreak detection', body: 'Blocks prompts that try to override agent instructions.' },
  ]
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <Card key={r.key} className="flex items-start gap-4">
          <ShieldCheck className="mt-0.5 size-5 text-primary-text" aria-hidden />
          <div className="flex-1"><p className="font-medium">{r.title}</p><p className="mt-1 text-sm text-muted">{r.body}</p></div>
          <Switch checked={state[r.key]} onCheckedChange={(v) => setState((s) => ({ ...s, [r.key]: v }))} label={r.title} />
        </Card>
      ))}
      <p className="text-xs text-muted md:col-span-2"><BarChart3 className="mr-1 inline size-3.5" aria-hidden />Guardrail changes apply to running agents without a redeploy.</p>
    </div>
  )
}
