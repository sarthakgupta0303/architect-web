'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Activity, ArrowUpRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { PageContainer, PageHeader } from '@/components/shared/PageHeader'
import { StatusPill, type StatusKey } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { atLeast } from '@/lib/authz'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import { formatUsd } from '@/lib/utils'

type Range = '24h' | '7d' | '30d'
type Data = {
  kpis: { runs: number; successRate: number; p95LatencyMs: number; cost: number; escalations: number; liveApps: number }
  series: { ts: string; runs: number; errors: number }[]
  projects: { id: string; name: string; status: string; framework: string; liveUrl: string | null; runs: number; successRate: number; p95LatencyMs: number; cost: number; escalations: number }[]
}

export function WorkspaceStudio() {
  const { workspace, role } = useWorkspace()
  const router = useRouter()
  const [range, setRange] = useState<Range>('7d')
  const [demoLoading, setDemoLoading] = useState(false)
  const q = useQuery({
    queryKey: ['ws-studio', workspace.slug, range],
    queryFn: () => apiFetch<Data>(`/api/workspaces/${workspace.slug}/studio?range=${range}`),
  })

  async function demo() {
    setDemoLoading(true)
    try {
      const { projectId } = await apiFetch<{ projectId: string }>(`/api/workspaces/${workspace.slug}/demo`, { method: 'POST' })
      toast.success('Demo project ready with 30 days of runs')
      router.push(`/w/${workspace.slug}/p/${projectId}/build?tab=studio`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the demo project')
      setDemoLoading(false)
    }
  }

  const d = q.data
  const hasRuns = (d?.kpis.runs ?? 0) > 0

  return (
    <PageContainer>
      <PageHeader title="Studio" description="How every app in this workspace is doing in production."
        actions={<Segmented size="sm" label="Time range" value={range} onChange={setRange} options={[{ value: '24h', label: '24h' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />} />

      {q.isLoading ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : q.isError ? (
        <ErrorState message={q.error instanceof ApiError ? q.error.message : 'Could not load Studio'} onRetry={() => q.refetch()} />
      ) : !d || d.projects.length === 0 ? (
        <EmptyState icon={Activity} className="mt-10" title="No apps yet" body="Build and deploy an app, and its production traffic, quality and cost will show up here."
          action={<div className="flex gap-2"><Button asChild><Link href={`/w/${workspace.slug}?new=1`}>Build an app</Link></Button>
            {atLeast(role, 'editor') && <Button variant="secondary" onClick={demo} loading={demoLoading}><Sparkles className="size-4" aria-hidden /> Try the demo</Button>}</div>} />
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Live apps" value={String(d.kpis.liveApps)} />
            <Kpi label="Runs" value={d.kpis.runs.toLocaleString()} />
            <Kpi label="Success rate" value={hasRuns ? `${d.kpis.successRate}%` : '—'} />
            <Kpi label="P95 latency" value={hasRuns ? `${(d.kpis.p95LatencyMs / 1000).toFixed(1)}s` : '—'} />
            <Kpi label="Cost" value={formatUsd(d.kpis.cost)} />
            <Kpi label="Escalations" value={d.kpis.escalations.toLocaleString()} />
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Runs across all apps</h2>
              {!hasRuns && atLeast(role, 'editor') && <Button size="sm" variant="ghost" onClick={demo} loading={demoLoading}><Sparkles className="size-4" aria-hidden /> Load demo data</Button>}
            </div>
            {hasRuns ? (
              <div className="mt-4 h-64" role="img" aria-label="Runs and errors over time">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.series.map((s) => ({ ...s, label: format(new Date(s.ts), range === '24h' ? 'HH:mm' : 'MMM d') }))}>
                    <CartesianGrid stroke="rgb(var(--color-border))" vertical={false} />
                    <XAxis dataKey="label" stroke="rgb(var(--color-muted))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis stroke="rgb(var(--color-muted))" fontSize={11} tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip contentStyle={{ background: 'rgb(var(--color-surface-2))', border: '1px solid rgb(var(--color-border))', borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="runs" name="Runs" stroke="rgb(var(--color-primary-text))" fill="rgb(var(--color-primary) / 0.2)" strokeWidth={2} />
                    <Area type="monotone" dataKey="errors" name="Errors" stroke="rgb(var(--color-danger))" fill="rgb(var(--color-danger) / 0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No production runs in this period. Deploy an app to production to start collecting runs.</p>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold">Apps</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-y border-border bg-surface-2/50 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">App</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Runs</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Success</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">P95</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cost</th>
                    <th scope="col" className="px-5 py-2"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.projects.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2/40">
                      <td className="px-5 py-3">
                        <Link href={`/w/${workspace.slug}/p/${p.id}/build?tab=studio`} className="font-medium hover:text-primary-text">{p.name}</Link>
                        <p className="font-mono text-xs text-muted">{FRAMEWORK_LABELS[p.framework] ?? p.framework}</p>
                      </td>
                      <td className="px-3 py-3"><StatusPill status={(p.status as StatusKey) ?? 'draft'} /></td>
                      <td className="px-3 py-3 text-right tabular-nums">{p.runs.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{p.runs ? `${p.successRate}%` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{p.runs ? `${(p.p95LatencyMs / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatUsd(p.cost)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button asChild size="sm" variant="ghost"><Link href={`/w/${workspace.slug}/p/${p.id}/build?tab=studio`}>Open <ArrowUpRight className="size-3.5" aria-hidden /></Link></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  )
}
