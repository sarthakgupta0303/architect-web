'use client'

import { CheckCircle2, FileCode2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useGraph } from '@/features/canvas/hooks/use-graph'
import { cn } from '@/lib/utils'
import { useProject } from '../context'

export const BUILD_STEPS = [
  { key: 'schema', label: 'Create database schema' },
  { key: 'agents', label: 'Build agents' },
  { key: 'tools', label: 'Wire tools and integrations' },
  { key: 'ui', label: 'Build the UI' },
  { key: 'tests', label: 'Run tests' },
  { key: 'preview', label: 'Start preview' },
] as const

/**
 * Live "your app is being built" view shown in the Preview tab while a build runs:
 * files stream in on the left, and the app's UI assembles itself on the right.
 */
export function BuildingView({ step }: { step: number }) {
  const { project } = useProject()
  const graph = useGraph(project.id)
  const agents = useMemo(() => graph.data?.agents ?? [], [graph.data])

  const files = useMemo(() => {
    const byStep: string[][] = [
      ['db/schema.sql', 'db/migrations/001_init.sql'],
      [...agents.map((a) => `agents/${a.key}.py`), 'agents/router.py'],
      ['tools/registry.py', 'tools/integrations.py', 'architect.json'],
      ['web/app/page.tsx', 'web/components/Chat.tsx', 'web/components/AgentBadge.tsx', 'web/app/activity/page.tsx'],
      ['tests/test_agents.py', 'tests/test_handoffs.py'],
      ['Dockerfile', '.env.example'],
    ]
    return byStep.flatMap((list, s) => list.map((path) => ({ path, step: s })))
  }, [agents])

  // Reveal files one by one within the current step for a streaming feel.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 220)
    return () => clearInterval(id)
  }, [])
  const visible = files.filter((f, i) => f.step < step || (f.step === step && i - files.findIndex((x) => x.step === step) <= tick % 6))
  const current = visible[visible.length - 1]
  const pct = Math.round(((step + 0.5) / BUILD_STEPS.length) * 100)

  return (
    <div className="flex h-full flex-col bg-surface-2/40" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <Loader2 className="size-4 animate-spin text-info motion-reduce:animate-none" aria-hidden />
        <p className="text-sm font-medium">{BUILD_STEPS[Math.min(step, BUILD_STEPS.length - 1)].label}…</p>
        <div className="ml-auto flex w-40 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Build progress">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 text-right font-mono text-xs text-muted">{pct}%</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <div className="hidden min-h-0 flex-col rounded-xl border border-border bg-surface lg:flex">
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">Files</p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 font-mono text-xs">
            {visible.map((f) => (
              <li key={f.path} className="flex items-center gap-2 rounded-md px-2 py-1 animate-fade-in">
                {f === current ? <Loader2 className="size-3.5 shrink-0 animate-spin text-info motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />}
                <span className="truncate">{f.path}</span>
              </li>
            ))}
          </ul>
          {current && (
            <div className="border-t border-border p-3 font-mono text-[11px] leading-relaxed text-muted">
              <p className="flex items-center gap-1.5 text-fg"><FileCode2 className="size-3.5" aria-hidden />{current.path}</p>
              <p className="mt-1 truncate">{snippetFor(current.path)}</p>
            </div>
          )}
        </div>

        <AppAssembling step={step} projectName={project.name} agentNames={agents.map((a) => a.name)} />
      </div>
    </div>
  )
}

function snippetFor(path: string): string {
  if (path.endsWith('.sql')) return 'create table conversations (id uuid primary key, …);'
  if (path.startsWith('agents/')) return 'agent = Agent(name=…, instructions=…, tools=[…])'
  if (path.startsWith('tools/')) return 'registry.register("http.request", allow_hosts=[…])'
  if (path.endsWith('.tsx')) return 'export default function Page() { return <Chat /> }'
  if (path.startsWith('tests/')) return 'def test_routes_billing_to_billing_agent(): …'
  return 'FROM python:3.12-slim'
}

/** Wireframe of the generated app that fills in as build steps complete. */
function AppAssembling({ step, projectName, agentNames }: { step: number; projectName: string; agentNames: string[] }) {
  const uiReady = step >= 3
  const block = (on: boolean, cls: string) => (
    <div className={cn('rounded-lg transition-all duration-700', on ? 'bg-surface-2 opacity-100' : 'bg-surface-2/40 opacity-40', cls)} />
  )
  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-popover">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/60" /><span className="size-2.5 rounded-full bg-warning/60" /><span className="size-2.5 rounded-full bg-success/60" />
        <span className={cn('ml-3 text-sm font-semibold transition-opacity duration-700', uiReady ? 'opacity-100' : 'opacity-0')}>{projectName}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-40 flex-col gap-2 border-r border-border p-3 sm:flex">
          {block(uiReady, 'h-6')}{block(uiReady, 'h-6 w-3/4')}{block(uiReady, 'h-6 w-2/3')}
          <div className="mt-auto space-y-1.5">
            {agentNames.slice(0, 4).map((n) => (
              <p key={n} className={cn('truncate rounded-md px-2 py-1 text-[11px] transition-all duration-700', step >= 1 ? 'bg-primary/10 text-primary-text opacity-100' : 'opacity-0')}>{n}</p>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className={cn('max-w-[70%] self-end rounded-2xl rounded-br-md bg-primary/20 px-4 py-3 transition-all duration-700', uiReady ? 'opacity-100' : 'translate-y-2 opacity-0')}>
            <div className="h-2 w-40 rounded bg-primary/40" />
          </div>
          <div className={cn('max-w-[75%] rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3 transition-all delay-150 duration-700', uiReady ? 'opacity-100' : 'translate-y-2 opacity-0')}>
            <div className="h-2 w-56 rounded bg-fg/20" /><div className="mt-2 h-2 w-40 rounded bg-fg/20" />
            {agentNames[0] && <p className="mt-2 text-[10px] text-muted">handled by {agentNames[0]}</p>}
          </div>
          <div className={cn('max-w-[60%] self-end rounded-2xl rounded-br-md bg-primary/20 px-4 py-3 transition-all delay-300 duration-700', step >= 4 ? 'opacity-100' : 'translate-y-2 opacity-0')}>
            <div className="h-2 w-28 rounded bg-primary/40" />
          </div>
          <div className="mt-auto flex gap-2">{block(uiReady, 'h-10 flex-1 rounded-xl')}{block(uiReady, 'h-10 w-10 rounded-xl')}</div>
        </div>
      </div>
    </div>
  )
}
