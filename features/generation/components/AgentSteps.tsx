'use client'

import { CheckCircle2, ChevronDown, Circle, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Agent activity timeline: one collapsible block per pipeline run, showing what the agent
 * is doing step by step. `useStepRunner` owns the state; `<StepBlock>` renders one block.
 */

export type StepStatus = 'pending' | 'active' | 'done' | 'failed'
export type SubStep = { id: string; label: string; detail?: string; status: StepStatus }
export type Step = { id: string; label: string; detail?: string; status: StepStatus; children: SubStep[] }
export type StepSpec = { label: string; detail?: string; children?: { label: string; detail?: string }[] }
export type StepBlockStatus = 'running' | 'done' | 'failed'
export type StepBlockState = {
  id: string
  title: string
  status: StepBlockStatus
  steps: Step[]
  startedAt: number
  endedAt: number | null
  error: string | null
  retry: (() => void) | null
}

export type StartOptions = {
  /** Advance through the pre-steps on a timer; the last step stays active until `complete` or `fail`. */
  auto?: boolean
  /** Milliseconds per automatic step. */
  interval?: number
}

const AUTO_INTERVAL = 600
const REVEAL_INTERVAL = 160

function toSteps(specs: StepSpec[], blockId: string): Step[] {
  return specs.map((s, i) => ({
    id: `${blockId}-s${i}`,
    label: s.label,
    detail: s.detail,
    status: 'pending',
    children: (s.children ?? []).map((c, j) => ({ id: `${blockId}-s${i}-c${j}`, label: c.label, detail: c.detail, status: 'pending' })),
  }))
}

function activate(step: Step): Step {
  return { ...step, status: 'active', children: step.children.map((c, j) => (j === 0 ? { ...c, status: 'active' } : c)) }
}

function finish(step: Step): Step {
  return { ...step, status: 'done', children: step.children.map((c) => ({ ...c, status: 'done' })) }
}

/** Moves the cursor one tick forward: to the next sub-step, else to the next step. Never finishes the last step. */
function stepForward(steps: Step[]): Step[] {
  const i = steps.findIndex((s) => s.status === 'active')
  if (i === -1) return steps
  const cur = steps[i]
  const ci = cur.children.findIndex((c) => c.status === 'active')
  if (ci !== -1 && ci < cur.children.length - 1) {
    const children = cur.children.map((c, j) => (j === ci ? { ...c, status: 'done' as const } : j === ci + 1 ? { ...c, status: 'active' as const } : c))
    return steps.map((s, j) => (j === i ? { ...cur, children } : s))
  }
  if (i === steps.length - 1) return steps
  return steps.map((s, j) => (j === i ? finish(s) : j === i + 1 ? activate(s) : s))
}

function atEnd(steps: Step[]): boolean {
  const i = steps.findIndex((s) => s.status === 'active')
  if (i === -1) return true
  if (i < steps.length - 1) return false
  const children = steps[i].children
  return children.length === 0 || children[children.length - 1].status === 'active'
}

export type StepRunner = {
  blocks: Record<string, StepBlockState>
  start: (blockId: string, title: string, steps: StepSpec[], opts?: StartOptions) => void
  advance: (blockId: string) => void
  complete: (blockId: string, resolvedSteps?: StepSpec[]) => void
  fail: (blockId: string, message: string, retry?: () => void) => void
  retry: (blockId: string) => void
  isRunning: boolean
}

export function useStepRunner(): StepRunner {
  const [blocks, setBlocks] = useState<Record<string, StepBlockState>>({})
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>())
  const latest = useRef(blocks)
  latest.current = blocks

  const stop = useCallback((blockId: string) => {
    const t = timers.current.get(blockId)
    if (t !== undefined) { clearInterval(t); timers.current.delete(blockId) }
  }, [])

  useEffect(() => {
    const map = timers.current
    return () => { map.forEach((t) => clearInterval(t)); map.clear() }
  }, [])

  const update = useCallback((blockId: string, fn: (b: StepBlockState) => StepBlockState) => {
    setBlocks((all) => (all[blockId] ? { ...all, [blockId]: fn(all[blockId]) } : all))
  }, [])

  const start = useCallback((blockId: string, title: string, specs: StepSpec[], opts: StartOptions = {}) => {
    stop(blockId)
    const steps = toSteps(specs, blockId)
    if (steps.length) steps[0] = activate(steps[0])
    setBlocks((all) => ({ ...all, [blockId]: { id: blockId, title, status: 'running', steps, startedAt: Date.now(), endedAt: null, error: null, retry: null } }))
    if (opts.auto) {
      const t = setInterval(() => {
        setBlocks((all) => {
          const b = all[blockId]
          if (!b || b.status !== 'running' || atEnd(b.steps)) { stop(blockId); return all }
          return { ...all, [blockId]: { ...b, steps: stepForward(b.steps) } }
        })
      }, opts.interval ?? AUTO_INTERVAL)
      timers.current.set(blockId, t)
    }
  }, [stop])

  const advance = useCallback((blockId: string) => {
    update(blockId, (b) => (b.status === 'running' ? { ...b, steps: stepForward(b.steps) } : b))
  }, [update])

  const complete = useCallback((blockId: string, resolved?: StepSpec[]) => {
    stop(blockId)
    setBlocks((all) => {
      const b = all[blockId]
      if (!b) return all
      if (!resolved || resolved.length === 0) {
        return { ...all, [blockId]: { ...b, status: 'done', endedAt: Date.now(), steps: b.steps.map(finish) } }
      }
      const doneCount = b.steps.filter((s) => s.status === 'done').length
      const cursor = Math.min(doneCount, resolved.length - 1)
      const steps = toSteps(resolved, blockId).map((s, i) => (i < cursor ? finish(s) : i === cursor ? activate(s) : s))
      return { ...all, [blockId]: { ...b, steps } }
    })
    // Reveal the resolved steps quickly, then close the block.
    const t = setInterval(() => {
      setBlocks((all) => {
        const b = all[blockId]
        if (!b || b.status !== 'running') { stop(blockId); return all }
        if (atEnd(b.steps)) {
          stop(blockId)
          return { ...all, [blockId]: { ...b, status: 'done', endedAt: Date.now(), steps: b.steps.map(finish) } }
        }
        return { ...all, [blockId]: { ...b, steps: stepForward(b.steps) } }
      })
    }, REVEAL_INTERVAL)
    timers.current.set(blockId, t)
  }, [stop])

  const fail = useCallback((blockId: string, message: string, retry?: () => void) => {
    stop(blockId)
    update(blockId, (b) => {
      let i = b.steps.findIndex((s) => s.status === 'active')
      if (i === -1) i = b.steps.length - 1
      const steps = b.steps.map((s, j): Step => {
        if (j !== i) return s
        return { ...s, status: 'failed', detail: message, children: s.children.map((c) => (c.status === 'active' ? { ...c, status: 'failed' } : c)) }
      })
      return { ...b, status: 'failed', endedAt: Date.now(), error: message, retry: retry ?? null, steps }
    })
  }, [stop, update])

  const retry = useCallback((blockId: string) => {
    const fn = latest.current[blockId]?.retry
    if (!fn) return
    update(blockId, (b) => ({ ...b, retry: null }))
    fn()
  }, [update])

  const isRunning = useMemo(() => Object.values(blocks).some((b) => b.status === 'running'), [blocks])

  return { blocks, start, advance, complete, fail, retry, isRunning }
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function StatusIcon({ status, small = false }: { status: StepStatus; small?: boolean }) {
  const size = small ? 'size-3.5' : 'size-4'
  if (status === 'done') return <CheckCircle2 className={cn(size, 'shrink-0 text-success')} aria-hidden />
  if (status === 'active') return <Loader2 className={cn(size, 'shrink-0 animate-spin text-info motion-reduce:animate-none')} aria-hidden />
  if (status === 'failed') return <XCircle className={cn(size, 'shrink-0 text-danger')} aria-hidden />
  return <Circle className={cn(size, 'shrink-0 text-muted')} aria-hidden />
}

const STATUS_TEXT: Record<StepStatus, string> = { pending: 'Pending', active: 'In progress', done: 'Done', failed: 'Failed' }

export function StepBlock({ block, isLatest, retryDisabled = false, onRetry }: { block: StepBlockState; isLatest: boolean; retryDisabled?: boolean; onRetry?: () => void }) {
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? (block.status !== 'done' || isLatest)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (block.status !== 'running') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [block.status])

  const elapsed = formatElapsed((block.endedAt ?? now) - block.startedAt)
  const headerMeta = block.status === 'running' ? elapsed : block.status === 'failed' ? `Failed after ${elapsed}` : `Worked for ${elapsed}`
  const active = block.steps.find((s) => s.status === 'active')
  const doneCount = block.steps.filter((s) => s.status === 'done').length
  const listId = `${block.id}-steps`

  return (
    <section
      className={cn('rounded-xl border bg-surface-2/60 text-sm', block.status === 'failed' ? 'border-danger/30' : 'border-border')}
      aria-label={block.title}
      aria-busy={block.status === 'running'}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOverride(!open)}
      >
        {block.status === 'running' ? <StatusIcon status="active" /> : block.status === 'failed' ? <StatusIcon status="failed" /> : <StatusIcon status="done" />}
        <span className="min-w-0 flex-1">
          <span className="font-medium">{block.title}</span>
          {!open && active && <span className="ml-1.5 truncate text-muted">· {active.label}</span>}
          {!open && !active && block.status === 'done' && <span className="ml-1.5 text-muted">· {doneCount} steps</span>}
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted">{headerMeta}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div id={listId} className="border-t border-border px-3 pb-3 pt-2.5" aria-live={block.status === 'running' ? 'polite' : 'off'}>
          <ol className="space-y-2">
            {block.steps.map((s) => (
              <li key={s.id} className="motion-safe:animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5"><StatusIcon status={s.status} /></span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(s.status === 'pending' && 'text-muted', s.status === 'failed' && 'text-danger')}>
                      <span className="sr-only">{STATUS_TEXT[s.status]}: </span>{s.label}
                    </p>
                    {s.detail && <p className={cn('mt-0.5 break-words text-xs', s.status === 'failed' ? 'text-danger' : 'text-muted')}>{s.detail}</p>}
                  </div>
                </div>
                {s.children.length > 0 && s.status !== 'pending' && (
                  <ol className="ml-[7px] mt-1.5 space-y-1.5 border-l border-border pl-4">
                    {s.children.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 motion-safe:animate-fade-in">
                        <span className="mt-0.5"><StatusIcon status={c.status} small /></span>
                        <p className={cn('min-w-0 flex-1 text-xs', c.status === 'pending' ? 'text-muted' : c.status === 'failed' ? 'text-danger' : 'text-fg')}>
                          <span className="sr-only">{STATUS_TEXT[c.status]}: </span>
                          <span className="break-words">{c.label}</span>
                          {c.detail && <span className="text-muted"> — {c.detail}</span>}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
          {block.status === 'failed' && block.retry && onRetry && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry} disabled={retryDisabled}>
              <RotateCcw className="size-3.5" aria-hidden />Retry
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
