'use client'

import { CheckCircle2, Loader2, Pause, Play, Rocket, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { StatusPill, type StatusKey } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  BuildScene,
  ClarifyScene,
  DEMO_PROMPT,
  DEPLOY_LIVE,
  DEPLOY_PRESS,
  GraphScene,
  PreviewScene,
  PrdScene,
  PromptScene,
  type SceneProps,
} from './scenes'

type Scene = { label: string; description: string; duration: number; component: ComponentType<SceneProps> }

const SCENES: Scene[] = [
  { label: 'Describe', description: 'The user types a prompt asking for a customer support agent for a Shopify store.', duration: 5000, component: PromptScene },
  { label: 'Clarify', description: 'Architect asks three clarifying questions about order data, help articles and refund approvals, and each gets answered.', duration: 5000, component: ClarifyScene },
  { label: 'Plan', description: 'A PRD appears with goal, users, agents, integrations and guardrails, plus a cost estimate of about 1.8 credits per conversation. The plan is approved.', duration: 5500, component: PrdScene },
  { label: 'Agents', description: 'The agent graph draws itself: Triage routes to Knowledge, which hands off to Responder or to a human Escalation step.', duration: 5500, component: GraphScene },
  { label: 'Build', description: 'Files stream in as the app is built, a progress bar fills, the chat widget UI assembles and all tests pass.', duration: 6000, component: BuildScene },
  { label: 'Test & deploy', description: 'In the live preview a customer asks about a late order and gets an answer handled by the Responder agent. The app is then deployed to a live URL.', duration: 7500, component: PreviewScene },
]

const LAST = SCENES.length - 1
const TICK_MS = 50

type Clock = { scene: number; elapsed: number }

/** Chat transcript on the left pane; each message appears at (scene, ms). */
const TRANSCRIPT: { scene: number; at: number; text: string }[] = [
  { scene: 1, at: 200, text: 'Before I plan, three quick questions about your store.' },
  { scene: 1, at: 4400, text: 'Got it: Shopify orders, Zendesk Guide articles, refunds over $200 go to #support-leads.' },
  { scene: 2, at: 300, text: 'Here is the plan. Review it before anything is built.' },
  { scene: 3, at: 300, text: 'Four agents, three integrations. Triage is the entry point.' },
  { scene: 4, at: 200, text: 'Building with Lyzr ADK and running tests.' },
  { scene: 4, at: 4900, text: 'Build passed. The preview is ready to try.' },
  { scene: 5, at: 5300, text: 'Deployed. Your support agent is live.' },
]

function reached(clock: Clock, scene: number, at: number) {
  return clock.scene > scene || (clock.scene === scene && clock.elapsed >= at)
}

export function ProductDemo() {
  const [clock, setClock] = useState<Clock>({ scene: 0, elapsed: 0 })
  const [reduced, setReduced] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(true)
  const rootRef = useRef<HTMLElement>(null)

  // Reduced motion: show the final frame and never auto-advance.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = (initial: boolean) => {
      setReduced(mq.matches)
      if (mq.matches) setClock({ scene: LAST, elapsed: SCENES[LAST].duration })
      else if (!initial) setClock({ scene: 0, elapsed: 0 })
    }
    apply(true)
    const onChange = () => apply(false)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Pause while scrolled out of view.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = !reduced && !userPaused && !hovered && visible

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(now - last, 250)
      last = now
      setClock((c) => {
        const elapsed = c.elapsed + dt
        if (elapsed >= SCENES[c.scene].duration) return { scene: (c.scene + 1) % SCENES.length, elapsed: 0 }
        return { scene: c.scene, elapsed }
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  const jump = useCallback(
    (scene: number) => setClock({ scene, elapsed: reduced ? SCENES[scene].duration : 0 }),
    [reduced],
  )

  const { scene, elapsed } = clock
  const Current = SCENES[scene].component

  const deployState: 'idle' | 'pressed' | 'deploying' | 'live' =
    scene !== LAST ? 'idle' : elapsed >= DEPLOY_LIVE ? 'live' : elapsed >= DEPLOY_PRESS + 200 ? 'deploying' : elapsed >= DEPLOY_PRESS ? 'pressed' : 'idle'

  const status: { key: StatusKey; label?: string } =
    scene <= 1 ? { key: 'draft' } : scene <= 3 ? { key: 'draft', label: 'Planned' } : scene === 4 ? { key: 'building' } : deployState === 'live' ? { key: 'live' } : { key: 'preview' }

  const showPrompt = reached(clock, 0, 4000)
  const messages = TRANSCRIPT.filter((m) => reached(clock, m.scene, m.at))

  return (
    <figure
      ref={rootRef}
      aria-label="Animated product demo: building a customer support agent for an online store"
      className="w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <figcaption className="sr-only">
        A six-step walkthrough of Architect. {SCENES.map((s, i) => `Step ${i + 1}, ${s.label}: ${s.description}`).join(' ')}
      </figcaption>

      {/* Decorative mock of the product UI. Its content is described in the caption above. */}
      <div aria-hidden="true" className="select-none overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-glow">
        <div className="flex h-11 items-center gap-2 border-b border-border bg-surface-2/60 px-3 sm:gap-3">
          <div className="flex shrink-0 gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-xs font-medium sm:inline">Northwind Support</span>
            <StatusPill status={status.key} label={status.label} className="shrink-0 text-[10px]" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[11px] font-medium">
              <span className="rounded-md bg-surface px-2 py-0.5 text-fg shadow-sm">Build</span>
              <span className="px-2 py-0.5 text-muted">Code</span>
            </div>
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-all duration-150',
                deployState === 'live' ? 'bg-success/15 text-success' : 'bg-primary text-primary-fg',
                deployState === 'pressed' && 'scale-95 ring-4 ring-primary/30',
              )}
            >
              {deployState === 'deploying' ? <Loader2 className="size-3 animate-spin" /> : deployState === 'live' ? <CheckCircle2 className="size-3" /> : <Rocket className="size-3" />}
              {deployState === 'deploying' ? 'Deploying' : deployState === 'live' ? 'Live' : 'Deploy'}
            </span>
          </div>
        </div>

        <div className="flex h-[420px] sm:h-[440px]">
          <aside className="hidden w-[36%] max-w-[300px] flex-col border-r border-border bg-surface md:flex">
            <p className="border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted">Chat</p>
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-3">
              {!showPrompt && messages.length === 0 && (
                <p className="m-auto max-w-[24ch] text-center text-xs text-muted">Describe your app and Architect plans it with you here.</p>
              )}
              {showPrompt && (
                <p className="ml-auto max-w-[92%] animate-fade-in rounded-xl rounded-br-sm bg-primary/15 px-3 py-2 text-[11px] leading-4 text-fg">{DEMO_PROMPT}</p>
              )}
              {messages.map((m) => (
                <div key={m.text} className="flex max-w-[92%] animate-fade-in items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded-md bg-primary/15 p-1 text-primary-text"><Sparkles className="size-3" /></span>
                  <p className="text-[11px] leading-4 text-fg">{m.text}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-2.5">
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
                Ask for a change
                <Send className="size-3" />
              </div>
            </div>
          </aside>
          <div key={scene} className="min-w-0 flex-1 animate-fade-in bg-bg/40 p-3 sm:p-4">
            <Current e={elapsed} reduced={reduced} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <ol className="grid flex-1 grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-6" aria-label="Demo steps">
          {SCENES.map((s, i) => {
            const active = i === scene
            const fill = active ? Math.min(100, (elapsed / s.duration) * 100) : i < scene ? 100 : 0
            return (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Show step ${i + 1} of ${SCENES.length}: ${s.label}`}
                  className={cn(
                    'group flex min-h-10 w-full flex-col justify-center gap-1.5 rounded-lg px-1 py-1.5 text-left transition-colors duration-150',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  )}
                >
                  <span className="h-1 w-full overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
                  </span>
                  <span className={cn('truncate text-xs', active ? 'font-medium text-fg' : 'text-muted group-hover:text-fg')}>
                    <span className="font-mono tabular-nums">{String(i + 1).padStart(2, '0')}</span> {s.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {!reduced && (
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? 'Play demo' : 'Pause demo'}
            className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors duration-150 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {userPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      {reduced && <p className="mt-2 text-xs text-muted">Animation is off because your system prefers reduced motion. Pick a step to see it.</p>}
    </figure>
  )
}
