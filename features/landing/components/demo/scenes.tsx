'use client'

import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileCode2,
  Loader2,
  Play,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Timeline helpers                                                    */
/* ------------------------------------------------------------------ */

/** Progress (0–1) of the window [start, end] at elapsed time `e` (ms). */
export function span(e: number, start: number, end: number) {
  if (e <= start) return 0
  if (e >= end) return 1
  return (e - start) / (end - start)
}

/** Fade/slide-in classes for an element that appears at a point in the timeline. */
export function appear(shown: boolean) {
  return cn('transition-all duration-300 ease-standard', shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')
}

export type SceneProps = { e: number; reduced: boolean }

export const DEMO_PROMPT =
  'Build a customer support agent for our Shopify store. It answers order and return questions from our help center and sends refunds over $200 to a person in Slack.'

/* ------------------------------------------------------------------ */
/* Scene 1 — Describe (typewriter)                                     */
/* ------------------------------------------------------------------ */

export function PromptScene({ e }: SceneProps) {
  const typed = DEMO_PROMPT.slice(0, Math.floor(DEMO_PROMPT.length * span(e, 300, 3700)))
  const done = e >= 3700
  const pressed = e >= 4000 && e < 4300
  const planning = e >= 4300
  return (
    <div className="flex h-full flex-col items-center justify-center px-1">
      <p className="text-base font-semibold sm:text-lg">What do you want to build?</p>
      <div className="mt-4 w-full max-w-md rounded-2xl border border-primary/60 bg-surface p-3 shadow-glow">
        <p className="min-h-[88px] px-1 text-left text-[13px] leading-5 text-fg sm:text-sm">
          {typed}
          {!done && <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-primary-text" />}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">architect-adk</span>
          <span
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-fg transition-all duration-150',
              !done && 'opacity-50',
              pressed && 'scale-95 ring-4 ring-primary/30',
            )}
          >
            {planning ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {planning ? 'Planning' : 'Plan my app'}
            {!planning && <ArrowRight className="size-3.5" />}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {['Support agent', 'SDR agent', 'Research assistant'].map((c, i) => (
          <span
            key={c}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px]',
              i === 0 ? 'border-primary bg-primary/10 text-fg' : 'border-border text-muted',
            )}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 2 — Clarifying questions                                      */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
  { q: 'Where do order details live?', options: ['Shopify', 'WooCommerce', 'Custom API'], pick: 0, show: 200, answer: 1300 },
  { q: 'Where are your help articles?', options: ['Zendesk Guide', 'Notion', 'Website'], pick: 0, show: 900, answer: 2400 },
  { q: 'Who approves refunds over $200?', options: ['#support-leads in Slack', 'Email a manager'], pick: 0, show: 1600, answer: 3500 },
]

export function ClarifyScene({ e }: SceneProps) {
  const answered = QUESTIONS.filter((q) => e >= q.answer).length
  const pressed = e >= 4200
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-primary/15 p-1.5 text-primary-text"><Sparkles className="size-3.5" /></span>
        <p className="text-sm font-semibold">A few quick questions</p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">{answered}/3 answered</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {QUESTIONS.map((q) => (
          <div key={q.q} className={cn('rounded-xl border border-border bg-surface p-3', appear(e >= q.show))}>
            <p className="text-xs font-medium text-fg">{q.q}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {q.options.map((o, i) => {
                const selected = i === q.pick && e >= q.answer
                return (
                  <span
                    key={o}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200',
                      selected ? 'border-primary bg-primary/10 text-fg' : 'border-border text-muted',
                    )}
                  >
                    {selected && <Check className="size-3 text-primary-text" />}
                    {o}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex justify-end pt-3">
        <span
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-fg transition-all duration-150',
            answered < 3 && 'opacity-50',
            pressed && e < 4500 && 'scale-95 ring-4 ring-primary/30',
          )}
        >
          Continue <ArrowRight className="size-3.5" />
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 3 — PRD                                                       */
/* ------------------------------------------------------------------ */

const PRD_SECTIONS: { title: string; at: number; body?: string; chips?: string[] }[] = [
  { title: 'Goal', at: 300, body: 'Resolve order and return questions instantly. Hand refunds over $200 to a person.' },
  { title: 'Users', at: 900, body: 'Shoppers on northwind.shop and the support leads team in Slack.' },
  { title: 'Agents', at: 1500, chips: ['Triage', 'Knowledge', 'Responder', 'Escalation'] },
  { title: 'Integrations', at: 2100, chips: ['Shopify', 'Zendesk Guide', 'Slack'] },
  { title: 'Guardrails', at: 2700, chips: ['PII redaction', 'Refund cap $200', 'Human approval'] },
  { title: 'Success metric', at: 3200, body: '70% of tickets resolved without a human, first reply under 5 seconds.' },
]

export function PrdScene({ e }: SceneProps) {
  const credits = (1.8 * span(e, 3600, 4200)).toFixed(1)
  const pressed = e >= 4600 && e < 4900
  const approved = e >= 4900
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <FileCode2 className="size-4 text-primary-text" />
        <p className="truncate text-sm font-semibold">PRD · Northwind Support Agent</p>
        <Badge tone={approved ? 'success' : 'neutral'} className="ml-auto shrink-0 text-[10px]">
          {approved ? <><CheckCircle2 className="size-3" /> Approved</> : 'Draft v1'}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PRD_SECTIONS.map((s, i) => (
          <div
            key={s.title}
            className={cn('rounded-xl border border-border bg-surface px-3 py-2', i >= 4 && 'hidden sm:block', appear(e >= s.at))}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{s.title}</p>
            {s.body && <p className="mt-1 text-[11px] leading-4 text-fg">{s.body}</p>}
            {s.chips && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.chips.map((c) => (
                  <span key={c} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg">{c}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={cn('mt-auto flex items-center justify-between gap-3 border-t border-border pt-3', appear(e >= 3500))}>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Estimated cost</p>
          <p className="text-xs text-fg">
            <span className="font-mono font-semibold tabular-nums text-primary-text">≈ {credits}</span> credits per conversation
          </p>
        </div>
        <span
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-150',
            approved ? 'bg-success/15 text-success' : 'bg-primary text-primary-fg',
            pressed && 'scale-95 ring-4 ring-primary/30',
          )}
        >
          {approved ? <><Check className="size-3.5" /> Plan approved</> : 'Approve plan'}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 4 — Agent graph                                               */
/* ------------------------------------------------------------------ */

type GraphNode = { id: string; name: string; caption: string; icon: LucideIcon; cx: number; cy: number; at: number; tone: 'primary' | 'warning' }

const NODES: GraphNode[] = [
  { id: 'triage', name: 'Triage', caption: 'router', icon: Workflow, cx: 0.16, cy: 0.5, at: 200, tone: 'primary' },
  { id: 'knowledge', name: 'Knowledge', caption: 'rag · zendesk', icon: Search, cx: 0.5, cy: 0.5, at: 900, tone: 'primary' },
  { id: 'responder', name: 'Responder', caption: 'llm · shopify', icon: Sparkles, cx: 0.84, cy: 0.27, at: 1800, tone: 'primary' },
  { id: 'escalation', name: 'Escalation', caption: 'human · slack', icon: UserCheck, cx: 0.84, cy: 0.73, at: 2300, tone: 'warning' },
]

const EDGES = [
  { from: 'triage', to: 'knowledge', start: 1100, end: 1700 },
  { from: 'knowledge', to: 'responder', start: 1900, end: 2500 },
  { from: 'knowledge', to: 'escalation', start: 2400, end: 3000 },
]

export function GraphScene({ e, reduced }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const nodeW = Math.min(170, Math.max(84, w * 0.26))
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, GraphNode>
  const edgePath = (from: GraphNode, to: GraphNode) => {
    const x1 = from.cx * w + nodeW / 2
    const y1 = from.cy * h
    const x2 = to.cx * w - nodeW / 2
    const y2 = to.cy * h
    const mid = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
  }
  const flowPath = w > 0 ? `${edgePath(byId.triage, byId.knowledge)} ${edgePath(byId.knowledge, byId.responder)}` : ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <Workflow className="size-4 text-primary-text" />
        <p className="text-sm font-semibold">Agent graph</p>
        <div className={cn('ml-auto flex gap-1.5', appear(e >= 3000))}>
          <Badge tone="primary" className="text-[10px]">4 agents</Badge>
          <Badge tone="neutral" className="hidden text-[10px] sm:inline-flex">Architect ADK</Badge>
        </div>
      </div>
      <div
        ref={ref}
        className="relative mt-3 flex-1 overflow-hidden rounded-xl border border-border bg-surface-2/40"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--color-border)) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      >
        {w > 0 && (
          <>
            <svg className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              {EDGES.map((edge) => {
                const prog = span(e, edge.start, edge.end)
                const to = byId[edge.to]
                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <path
                      d={edgePath(byId[edge.from], to)}
                      fill="none"
                      stroke="rgb(var(--color-primary-text))"
                      strokeOpacity={0.7}
                      strokeWidth={1.5}
                      pathLength={1}
                      strokeDasharray="1"
                      strokeDashoffset={1 - prog}
                    />
                    {prog >= 1 && <circle cx={to.cx * w - nodeW / 2} cy={to.cy * h} r={3} fill="rgb(var(--color-primary-text))" />}
                  </g>
                )
              })}
              {!reduced && e >= 3000 && (
                <circle r={3.5} fill="rgb(var(--color-accent))">
                  <animateMotion dur="1.8s" repeatCount="indefinite" path={flowPath} />
                </circle>
              )}
            </svg>
            {NODES.map((n) => {
              const Icon = n.icon
              const shown = e >= n.at
              return (
                <div
                  key={n.id}
                  className={cn(
                    'absolute rounded-xl border bg-surface px-2 py-1.5 transition-all duration-300 ease-standard sm:px-2.5 sm:py-2',
                    n.id === 'triage' ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                    shown ? 'opacity-100' : 'opacity-0',
                  )}
                  style={{ width: nodeW, left: n.cx * w - nodeW / 2, top: n.cy * h, transform: `translateY(-50%) scale(${shown ? 1 : 0.9})` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn('rounded-md p-1', n.tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary-text')}>
                      <Icon className="size-3" />
                    </span>
                    <span className="truncate text-[11px] font-semibold sm:text-xs">{n.name}</span>
                  </div>
                  <p className="mt-1 hidden truncate font-mono text-[10px] text-muted sm:block">{n.caption}</p>
                  {n.id === 'triage' && (
                    <span className={cn('absolute -top-2.5 left-2 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-fg', appear(e >= 700))}>
                      <Play className="size-2" /> Entry
                    </span>
                  )}
                </div>
              )
            })}
            <div className={cn('absolute bottom-2 left-2 right-2 flex sm:right-auto', appear(e >= 3400))}>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[10px] text-muted sm:text-[11px]">
                <ShieldCheck className="size-3 text-success" />
                Guardrail: refunds over $200 need human approval
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 5 — Build                                                     */
/* ------------------------------------------------------------------ */

const FILES = [
  'architect.yaml',
  'agents/triage.py',
  'agents/knowledge.py',
  'agents/responder.py',
  'agents/escalation.py',
  'tools/shopify_orders.py',
  'tools/slack_approval.py',
  'app/support/page.tsx',
  'tests/test_refund_cap.py',
]
const FILE_START = 300
const FILE_STEP = 480
const BUILD_END = FILE_START + FILE_STEP * FILES.length + 300

export function BuildScene({ e }: SceneProps) {
  const pct = Math.round(span(e, 200, BUILD_END) * 100)
  const passed = e >= BUILD_END + 200
  const stage = (threshold: number) => pct >= threshold
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        {passed ? <CheckCircle2 className="size-4 text-success" /> : <Loader2 className="size-4 animate-spin text-info" />}
        <p className="truncate text-sm font-semibold">{passed ? 'Build passed' : 'Building your app'}</p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full', passed ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Files</p>
          <ul className="mt-1.5 space-y-1">
            {FILES.map((f, i) => {
              const t = FILE_START + i * FILE_STEP
              if (e < t) return null
              const done = e >= t + FILE_STEP - 60
              return (
                <li key={f} className="flex animate-fade-in items-center gap-1.5 font-mono text-[10px] sm:text-[11px]">
                  {done ? <Check className="size-3 shrink-0 text-success" /> : <Loader2 className="size-3 shrink-0 animate-spin text-info" />}
                  <span className={cn('truncate', done ? 'text-muted' : 'text-fg')}>{f}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-bg">
          <div className={cn('flex items-center gap-1.5 border-b border-border px-2.5 py-2 transition-opacity duration-300', stage(15) ? 'opacity-100' : 'opacity-0')}>
            <span className="size-2 rounded-full bg-success" />
            <span className="truncate text-[11px] font-semibold">Northwind help</span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
            {stage(35) ? (
              <span className="max-w-[85%] animate-fade-in rounded-lg rounded-bl-sm bg-surface-2 px-2 py-1 text-[10px] leading-4 text-fg">Hi, how can I help with your order?</span>
            ) : (
              <span className="h-5 w-3/4 animate-pulse rounded-lg bg-surface-2" />
            )}
            {stage(55) ? (
              <span className="ml-auto max-w-[85%] animate-fade-in rounded-lg rounded-br-sm bg-primary px-2 py-1 text-[10px] leading-4 text-primary-fg">Track order</span>
            ) : (
              <span className="ml-auto h-5 w-1/2 animate-pulse rounded-lg bg-surface-2" />
            )}
            {stage(75) ? (
              <div className="flex animate-fade-in flex-wrap gap-1">
                {['Returns', 'Refunds', 'Shipping'].map((c) => (
                  <span key={c} className="rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted">{c}</span>
                ))}
              </div>
            ) : (
              <span className="h-4 w-2/3 animate-pulse rounded-full bg-surface-2" />
            )}
          </div>
          <div className="border-t border-border p-2">
            {stage(90) ? (
              <div className="flex animate-fade-in items-center justify-between rounded-md border border-border px-2 py-1 text-[10px] text-muted">
                Ask a question <Send className="size-3" />
              </div>
            ) : (
              <span className="block h-6 animate-pulse rounded-md bg-surface-2" />
            )}
          </div>
        </div>
      </div>
      <div className={cn('mt-3 flex flex-wrap gap-1.5', appear(passed))}>
        <Badge tone="success" className="text-[10px]"><CheckCircle2 className="size-3" /> 12 of 12 tests passed</Badge>
        <Badge tone="neutral" className="text-[10px]">Preview ready</Badge>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene 6 — Preview, then deploy                                      */
/* ------------------------------------------------------------------ */

export const DEPLOY_PRESS = 3800
export const DEPLOY_LIVE = 5200

const TRACE = [
  { name: 'Triage', ms: '0.2s', at: 1100 },
  { name: 'Knowledge', ms: '0.6s', at: 1500 },
  { name: 'Responder', ms: '0.4s', at: 1900 },
]

export function PreviewScene({ e }: SceneProps) {
  const typing = e >= 900 && e < 2300
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2">
        <Play className="size-4 text-primary-text" />
        <p className="text-sm font-semibold">Live preview</p>
        <span className="ml-auto truncate rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">preview/northwind-support</span>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="size-2 rounded-full bg-success" />
          <span className="text-xs font-semibold">Northwind help</span>
          <span className="ml-auto text-[10px] text-muted">Typically replies instantly</span>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
          <p className={cn('ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-[11px] leading-4 text-primary-fg sm:text-xs', appear(e >= 300))}>
            Hi, where is order #4821? It was meant to arrive yesterday.
          </p>
          {typing && (
            <span className="inline-flex w-fit items-center gap-1 rounded-xl rounded-bl-sm bg-surface-2 px-3 py-2.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
          {e >= 2300 && (
            <div className="max-w-[90%] animate-fade-in">
              <p className="rounded-xl rounded-bl-sm bg-surface-2 px-3 py-2 text-[11px] leading-4 text-fg sm:text-xs">
                Sorry for the wait. Order #4821 shipped Monday with UPS and is out for delivery today. Want tracking updates by text?
              </p>
              <div className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', appear(e >= 2600))}>
                <Badge tone="primary" className="text-[10px]"><Sparkles className="size-3" /> Handled by Responder</Badge>
                <span className="font-mono text-[10px] text-muted">1.2s · 0.6 credits</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted">Trace</span>
          {TRACE.map((t, i) => {
            const lit = e >= t.at
            return (
              <span key={t.name} className="inline-flex items-center gap-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-200',
                    lit ? 'border-primary/50 bg-primary/10 text-fg' : 'border-border text-muted',
                  )}
                >
                  {t.name}
                  {lit && <span className="hidden text-muted sm:inline">{t.ms}</span>}
                </span>
                {i < TRACE.length - 1 && <ArrowRight className="size-3 text-muted" />}
              </span>
            )
          })}
        </div>
      </div>
      {e >= DEPLOY_LIVE + 100 && (
        <div className="absolute bottom-2 right-2 flex max-w-[92%] animate-slide-in-right items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 shadow-popover">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Your app is live</p>
            <p className="truncate font-mono text-[11px] text-primary-text">northwind-support.architect.app</p>
          </div>
        </div>
      )}
    </div>
  )
}
