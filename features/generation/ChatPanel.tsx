'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Bot, CheckCircle2, ClipboardList, Coins, Loader2, Network, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { useProject } from '@/features/project/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { ClarifyQuestionDto, EstimateDto, PrdDto } from '@/lib/contracts/generation'
import type { AgentDto, AgentGraphDto } from '@/lib/contracts/agents'
import { cn, sleep, scrollToEnd } from '@/lib/utils'
import { graphKey } from '@/features/canvas/hooks/use-graph'
import { WINDOW, type ContextType, type Source } from '@/lib/core/memory/types'
import { SourceAttribution } from './SourceAttribution'
import { Alert } from '@/components/ui/States'
import { StepBlock, useStepRunner, type StartOptions, type StepSpec } from './components/AgentSteps'

export type CenterTab = 'preview' | 'agents' | 'prd' | 'data' | 'evals' | 'deploy' | 'studio' | 'settings'
type Stage = 'idle' | 'clarify' | 'prd' | 'graph' | 'estimate' | 'building' | 'built'
type Message = { id: string; role: 'user' | 'assistant'; text: string; kind?: 'change' | 'error' | 'steps'; blockId?: string; at: number; contextType?: ContextType | null; sources?: Source[]; confidence?: number | null }
type ChatDto = { id: string; role: 'user' | 'assistant'; content: string; contextType: ContextType | null; confidence: number | null; sources: Source[]; createdAt: string }
const fromDto = (m: ChatDto): Message => ({ id: m.id, role: m.role, text: m.content, at: Date.parse(m.createdAt), contextType: m.contextType, sources: m.sources, confidence: m.confidence })
const BUILD_STEPS = [
  { key: 'schema', label: 'Create database schema' },
  { key: 'agents', label: 'Build agents' },
  { key: 'tools', label: 'Wire tools and integrations' },
  { key: 'ui', label: 'Build the UI' },
  { key: 'tests', label: 'Run tests' },
  { key: 'preview', label: 'Start preview' },
]

let seq = 0
const msg = (role: Message['role'], text: string, kind?: Message['kind']): Message => ({ id: `m${Date.now()}-${seq++}`, role, text, kind, at: Date.now() })
const newBlockId = (kind: string) => `blk-${kind}-${Date.now()}-${seq++}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const clip = (t: string, max = 90) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)
const agentLabel = (name: string) => (/\bagent$/i.test(name) ? name : `${name} agent`)
const integrationLabel = (i: string) => i.replace(/_/g, ' ')

function buildPlan(agents: AgentDto[], edges: number, integrations: string[]): StepSpec[] {
  const children: Record<string, { label: string; detail?: string }[]> = {
    schema: [{ label: 'db/schema.sql' }],
    agents: agents.map((a) => ({ label: `agents/${a.key}.py`, detail: a.name })),
    tools: integrations.length
      ? integrations.map((i) => ({ label: `tools/${i}.py`, detail: `${integrationLabel(i)} — safe stub until connected` }))
      : [{ label: 'tools/registry.py', detail: 'built-in tools' }],
    ui: [{ label: 'web/app/page.tsx' }, { label: 'web/components/Chat.tsx' }],
    tests: [
      { label: 'Agent smoke tests', detail: plural(agents.length, 'agent') },
      { label: 'Hand-off routing', detail: plural(edges, 'route') },
      { label: 'UI render check' },
    ],
    preview: [],
  }
  return BUILD_STEPS.map((s) => ({ label: s.label, children: children[s.key] }))
}

function chatTrace(reply: ChatDto, priorTurns: number): StepSpec[] {
  const type = reply.contextType
  const sources = reply.sources ?? []
  const count = (kind: Source['kind']) => sources.filter((s) => s.kind === kind).length
  const classified = type === 'project' ? 'Classified as a project question' : type === 'history' ? 'Classified as a conversation question' : type === 'both' ? 'Classified as project + conversation' : 'Classified your question'
  const context: string[] = []
  if (type === 'project' || type === 'both') {
    const prd = count('prd')
    const agents = count('agent')
    context.push(prd ? `PRD (${plural(prd, 'section')})` : 'PRD')
    if (agents) context.push(plural(agents, 'agent'))
  }
  if (type === 'history' || type === 'both') {
    const turns = Math.min(priorTurns, type === 'both' ? WINDOW.withProject : WINDOW.historyOnly)
    context.push(`last ${plural(turns, 'turn')}`)
  }
  return [
    { label: classified, detail: reply.confidence != null ? `${Math.round(reply.confidence * 100)}% confident` : undefined },
    { label: 'Retrieving context', detail: context.length ? context.join(', ') : undefined, children: sources.slice(0, 6).map((s) => ({ label: s.label, detail: s.kind === 'prd' ? 'PRD' : s.kind === 'agent' ? 'agent' : 'conversation' })) },
    { label: 'Composing answer', detail: sources.length ? `Cited ${plural(sources.length, 'source')}` : 'No sources cited' },
  ]
}

export function ChatPanel({ onTab, autoStart, hasAgents, startSignal = 0, onBuildStep }: { onTab: (t: CenterTab) => void; autoStart: boolean; hasAgents: boolean; startSignal?: number; onBuildStep?: (step: number | null) => void }) {
  const { project, canEdit, refresh } = useProject()
  const qc = useQueryClient()
  const [stage, setStage] = useState<Stage>(project.previewUrl ? 'built' : 'idle')
  const [prompt, setPrompt] = useState(project.initialPrompt ?? '')
  const [questions, setQuestions] = useState<ClarifyQuestionDto[]>([])
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [estimate, setEstimate] = useState<EstimateDto | null>(null)
  const [buildStep, setBuildStep] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [chatMode, setChatMode] = useState<'plan' | 'build'>('build')
  const started = useRef(false)
  const steps = useStepRunner()
  const chat = useQuery({
    queryKey: ['chat', project.id],
    queryFn: () => apiFetch<{ items: ChatDto[]; migrationRequired: boolean }>(`/api/projects/${project.id}/chat`),
  })
  const seeded = useRef(false)
  useEffect(() => {
    if (!chat.data || seeded.current) return
    seeded.current = true
    setMessages((m) => [...chat.data.items.map(fromDto), ...m].sort((a, b) => a.at - b.at))
  }, [chat.data])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollToEnd(endRef.current) }, [messages, stage, buildStep, steps.blocks])

  useEffect(() => {
    if (autoStart && !started.current && project.initialPrompt && !hasAgents && canEdit) {
      started.current = true
      startClarify(project.initialPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, hasAgents])

  useEffect(() => {
    if (startSignal === 0) return
    if (project.initialPrompt) startClarify(project.initialPrompt)
    else document.getElementById('chat-input')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal])

  const answerPayload = () => Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.length === 1 ? v[0] : v]))

  async function run<T>(fn: () => Promise<T>, errorText: string, trace?: { blockId: string; retry: () => void }): Promise<T | null> {
    setBusy(true)
    try { return await fn() } catch (e) {
      const text = e instanceof ApiError ? e.message : errorText
      setMessages((m) => [...m, msg('assistant', text, 'error')])
      if (trace) steps.fail(trace.blockId, text, trace.retry)
      return null
    } finally { setBusy(false) }
  }

  /** Starts an activity block and places it in the message timeline so it interleaves with chat. */
  function trace(kind: string, title: string, specs: StepSpec[], opts: StartOptions = { auto: true }): string {
    const blockId = newBlockId(kind)
    steps.start(blockId, title, specs, opts)
    setMessages((m) => [...m, { id: `m-${blockId}`, role: 'assistant', text: '', kind: 'steps', blockId, at: Date.now() }])
    return blockId
  }

  async function loadGraph(): Promise<AgentGraphDto | null> {
    try {
      return await qc.fetchQuery({ queryKey: graphKey(project.id), queryFn: () => apiFetch<AgentGraphDto>(`/api/projects/${project.id}/agents`), staleTime: 10_000 })
    } catch { return null }
  }

  async function startClarify(p: string, echo = true) {
    setPrompt(p)
    if (echo) setMessages((m) => [...m, msg('user', p)])
    const pre: StepSpec[] = [
      { label: 'Reading your prompt', detail: clip(p) },
      { label: 'Identifying users, goals and integrations' },
    ]
    const blockId = trace('clarify', 'Planning your app', [...pre, { label: 'Preparing clarifying questions' }])
    const res = await run(() => apiFetch<{ questions: ClarifyQuestionDto[] }>(`/api/projects/${project.id}/generation/clarify`, { body: { prompt: p } }), 'Could not start planning',
      { blockId, retry: () => actions.current?.startClarify(p, false) })
    if (!res) return
    const n = res.questions.length
    steps.complete(blockId, [...pre, {
      label: n ? `Preparing ${plural(n, 'clarifying question')}` : 'No clarifying questions needed',
      children: res.questions.map((q) => ({ label: clip(q.text, 80) })),
    }])
    setQuestions(res.questions)
    setAnswers({})
    setStage('clarify')
    setMessages((m) => [...m, msg('assistant', 'A few quick questions so the plan fits. Pick what applies, or skip and I’ll use sensible defaults.')])
  }

  async function makePrd(skip = false) {
    const answered = Object.values(answers).filter((v) => v.length > 0).length
    const summary: StepSpec = { label: 'Summarizing your answers', detail: skip || answered === 0 ? 'Using sensible defaults' : `${answered} of ${plural(questions.length, 'question')} answered` }
    const blockId = trace('prd', 'Writing the PRD', [summary, { label: 'Drafting PRD sections' }])
    const res = await run(() => apiFetch<{ prd: PrdDto }>(`/api/projects/${project.id}/generation/prd`, { body: { prompt, answers: skip ? {} : answerPayload() } }), 'Could not write the PRD',
      { blockId, retry: () => actions.current?.makePrd(skip) })
    if (!res) return
    const prd = res.prd
    steps.complete(blockId, [
      summary,
      { label: 'Drafting PRD sections', detail: prd ? clip(prd.content.title) : undefined, children: (prd?.content.sections ?? []).map((s) => ({ label: s.title })) },
      { label: prd ? `PRD v${prd.version} saved` : 'PRD saved', detail: 'Review or edit any section in the PRD tab' },
    ])
    qc.invalidateQueries({ queryKey: ['prd', project.id] })
    setStage('prd')
    onTab('prd')
    setMessages((m) => [...m, msg('assistant', 'I drafted the PRD. Review and edit any section in the PRD tab — then I’ll design the agents.')])
  }

  async function makeGraph() {
    const blockId = trace('graph', 'Designing agents', [{ label: 'Choosing an architecture' }, { label: 'Designing agents' }])
    const res = await run(() => apiFetch<{ agents: number; integrations: string[] }>(`/api/projects/${project.id}/generation/agent-graph`, { body: { prompt, answers: answerPayload() } }), 'Could not design the agents',
      { blockId, retry: () => actions.current?.makeGraph() })
    if (!res) return
    await qc.invalidateQueries({ queryKey: graphKey(project.id) })
    const graph = await loadGraph()
    const agents = graph?.agents ?? []
    const edges = graph?.edges ?? []
    const nameById = new Map(agents.map((a) => [a.id, a.name]))
    const entry = agents.find((a) => a.isEntry)
    steps.complete(blockId, [
      { label: 'Choosing an architecture', detail: `${plural(graph ? agents.length : res.agents, 'agent')}${entry ? ` · entry: ${entry.name}` : ''}` },
      { label: 'Designing agents', children: agents.map((a) => ({ label: `Designing ${agentLabel(a.name)}`, detail: a.role ?? undefined })) },
      {
        label: `Wiring ${plural(edges.length, 'hand-off')}`,
        children: edges.map((e) => ({ label: `${nameById.get(e.fromAgentId) ?? 'Agent'} → ${nameById.get(e.toAgentId) ?? 'Agent'}`, detail: e.label ?? (e.condition || undefined) })),
      },
      { label: 'Checking tools & integrations', detail: res.integrations.length ? `Connect later: ${res.integrations.map(integrationLabel).join(', ')} — safe stubs until then` : 'No external integrations needed' },
      { label: 'Graph saved to canvas' },
    ])
    setStage('graph')
    onTab('agents')
    setMessages((m) => [...m, msg('assistant', `I designed ${res.agents} agents and their hand-offs. Drag, rename or add agents on the canvas, then review the cost.`)])
  }

  async function makeEstimate() {
    const read: StepSpec = { label: 'Reading the agent graph' }
    const blockId = trace('estimate', 'Estimating the build', [read, { label: 'Estimating credits and build time' }])
    const res = await run(() => apiFetch<EstimateDto>(`/api/projects/${project.id}/generation/estimate`, { body: { prompt: prompt || project.name, answers: answerPayload() } }), 'Could not estimate the build',
      { blockId, retry: () => actions.current?.makeEstimate() })
    if (!res) return
    steps.complete(blockId, [
      read,
      { label: 'Estimating credits and build time', children: res.breakdown.map((b) => ({ label: b.item, detail: plural(b.credits, 'credit') })) },
      { label: `Estimate ready: ~${plural(res.credits.p50, 'credit')} · ~${res.minutes.p50} min`, detail: `Up to ${plural(res.credits.p90, 'credit')} in the worst case` },
    ])
    setEstimate(res)
    setStage('estimate')
  }

  async function build() {
    setStage('building')
    setBuildStep(0)
    onTab('preview')
    const graph = await loadGraph()
    const plan = buildPlan(graph?.agents ?? [], graph?.edges.length ?? 0, estimate?.missingIntegrations ?? [])
    const blockId = trace('build', 'Building', plan, { auto: false })
    for (let i = 0; i < BUILD_STEPS.length; i++) {
      setBuildStep(i); onBuildStep?.(i)
      if (i > 0) steps.advance(blockId)
      const ticks = Math.max(1, plan[i].children?.length ?? 0)
      for (let t = 1; t < ticks; t++) { await sleep(1400 / ticks); steps.advance(blockId) }
      await sleep(1400 / ticks)
    }
    const res = await run(() => apiFetch<{ previewUrl: string }>(`/api/projects/${project.id}/builds`, { method: 'POST' }), 'The build failed',
      { blockId, retry: () => actions.current?.build() })
    onBuildStep?.(null)
    if (!res) { setStage('estimate'); setBuildStep(-1); return }
    const checks = plan.find((_, i) => BUILD_STEPS[i].key === 'tests')?.children?.length ?? 0
    steps.complete(blockId, plan.map((s, i) => {
      const key = BUILD_STEPS[i].key
      if (key === 'tests') return { ...s, detail: `${plural(checks, 'check')} passed` }
      if (key === 'preview') return { ...s, detail: `Preview ready at ${res.previewUrl}` }
      return s
    }))
    setBuildStep(BUILD_STEPS.length)
    setStage('built')
    refresh()
    onTab('preview')
    setMessages((m) => [...m, msg('assistant', 'Your app is built. Try it in the Preview tab — each reply shows which agent handled it.', 'change')])
  }

  async function sendChat() {
    const text = draft.trim()
    if (!text || busy) return
    if (!hasAgents && stage === 'idle' && messages.length === 0) { setDraft(''); startClarify(text); return }
    setDraft('')
    await ask(text)
  }

  /** Free chat. `existingUserId` re-sends a message already in the timeline (Retry). */
  async function ask(text: string, existingUserId?: string) {
    const optimistic = existingUserId ? null : msg('user', text)
    const userId = existingUserId ?? optimistic?.id
    const priorTurns = messages.filter((m) => m.kind !== 'steps' && m.kind !== 'error').length
    if (optimistic) setMessages((m) => [...m, optimistic])
    const blockId = trace('chat', 'Thinking', [
      { label: 'Classifying question', detail: 'project / history / both' },
      { label: 'Retrieving context' },
      { label: 'Composing answer' },
    ], { auto: true, interval: 550 })
    setBusy(true)
    try {
      const res = await apiFetch<{ user: ChatDto; assistant: ChatDto }>(`/api/projects/${project.id}/chat`, { body: { content: text, mode: chatMode } })
      setMessages((m) => [...m.map((x) => (x.id === userId ? fromDto(res.user) : x)), fromDto(res.assistant)])
      steps.complete(blockId, chatTrace(res.assistant, priorTurns))
      qc.invalidateQueries({ queryKey: ['chat', project.id] })
    } catch (e) {
      const errorText = e instanceof ApiError ? e.message : 'Could not send your message'
      setMessages((m) => [...m, msg('assistant', errorText, 'error')])
      steps.fail(blockId, errorText, () => actions.current?.ask(text, userId))
    } finally {
      setBusy(false)
    }
  }

  const actions = useRef<{ startClarify: typeof startClarify; makePrd: typeof makePrd; makeGraph: typeof makeGraph; makeEstimate: typeof makeEstimate; build: typeof build; ask: typeof ask } | null>(null)
  actions.current = { startClarify, makePrd, makeGraph, makeEstimate, build, ask }
  const latestBlockId = [...messages].reverse().find((m) => m.kind === 'steps')?.blockId

  const toggle = (qid: string, opt: string, multi: boolean) => setAnswers((a) => {
    const cur = a[qid] ?? []
    return { ...a, [qid]: multi ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : [opt] }
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {chat.data?.migrationRequired && (
          <Alert tone="warning">Conversation memory is off: run <span className="font-mono">docs/specs/migrations/002_chat_messages.sql</span> in Supabase to save chat history.</Alert>
        )}
        {messages.length === 0 && stage === 'idle' && (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            <Sparkles className="mb-2 size-5 text-primary-text" aria-hidden />
            {hasAgents ? 'Ask anything about your app — its PRD, agents and hand-offs — or about this conversation. Every answer shows where it came from.' : 'Describe what this app should do. I’ll ask a few questions, write a PRD, design the agents and show the cost before building.'}
            {!hasAgents && project.initialPrompt && canEdit && <Button size="sm" className="mt-3" onClick={() => startClarify(project.initialPrompt!)} loading={busy}>Plan from your prompt</Button>}
          </div>
        )}

        {messages.map((m) => {
          if (m.kind === 'steps') {
            const block = m.blockId ? steps.blocks[m.blockId] : undefined
            if (!block) return null
            return (
              <div key={m.id} className="flex gap-2">
                <span className="mt-2 rounded-lg bg-primary/15 p-1.5 text-primary-text"><Bot className="size-3.5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <StepBlock block={block} isLatest={block.id === latestBlockId} retryDisabled={busy || stage === 'building'} onRetry={() => steps.retry(block.id)} />
                </div>
              </div>
            )
          }
          return (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' && 'justify-end')}>
            {m.role === 'assistant' && <span className="mt-0.5 rounded-lg bg-primary/15 p-1.5 text-primary-text"><Bot className="size-3.5" aria-hidden /></span>}
            <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm', m.role === 'user' ? 'bg-primary text-primary-fg' : m.kind === 'error' ? 'border border-danger/30 bg-danger/10 text-danger' : 'bg-surface-2')}>
              {m.kind === 'change' && <p className="mb-1 flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" aria-hidden />Checkpoint saved</p>}
              <span className="whitespace-pre-wrap">{m.text}</span>
              {m.role === 'assistant' && m.contextType && (
                <SourceAttribution contextType={m.contextType} sources={m.sources ?? []} confidence={m.confidence}
                  onOpen={(src) => onTab(src.kind === 'prd' ? 'prd' : 'agents')} />
              )}
              {m.kind === 'change' && <button className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => toast.success('Restored this checkpoint')}><RotateCcw className="size-3" aria-hidden />Restore</button>}
            </div>
          </div>
          )
        })}

        {stage === 'clarify' && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            {questions.map((q) => (
              <fieldset key={q.id}>
                <legend className="mb-2 text-sm font-medium">{q.text}{q.multi && <span className="font-normal text-muted"> · pick any</span>}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button key={o} type="button" className="chip !px-3 !py-1 !text-xs" aria-pressed={(answers[q.id] ?? []).includes(o)} onClick={() => toggle(q.id, o, q.multi)}>{o}</button>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => makePrd(true)} disabled={busy}>Skip — use best guesses</Button>
              <Button size="sm" onClick={() => makePrd(false)} loading={busy}><ClipboardList className="size-4" aria-hidden />Write the PRD</Button>
            </div>
          </div>
        )}

        {stage === 'prd' && (
          <div className="flex justify-end"><Button size="sm" onClick={makeGraph} loading={busy}><Network className="size-4" aria-hidden />Next: design agents</Button></div>
        )}
        {(stage === 'graph' || (stage === 'idle' && hasAgents && !project.previewUrl)) && canEdit && (
          <div className="flex justify-end"><Button size="sm" onClick={makeEstimate} loading={busy}><Coins className="size-4" aria-hidden />Review cost and build</Button></div>
        )}

        {stage === 'estimate' && estimate && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Ready to build</p>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">~{estimate.credits.p50}</span><span className="text-sm text-muted">credits · about {estimate.minutes.p50} min</span></div>
            <ul className="space-y-1 text-sm">
              {estimate.breakdown.map((b) => <li key={b.item} className="flex justify-between text-muted"><span>{b.item}</span><span className="tabular-nums">{b.credits}</span></li>)}
            </ul>
            {estimate.missingIntegrations.length > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Connect later: {estimate.missingIntegrations.map((i) => i.replace('_', ' ')).join(', ')}. The build uses safe stubs until then.</p>
            )}
            <p className="text-xs text-muted">Auto-fix retries are free. Visual edits never use credits.</p>
            <Button className="w-full" onClick={build}><Sparkles className="size-4" aria-hidden />Build it</Button>
          </div>
        )}

        {busy && stage !== 'building' && !steps.isRunning && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />Thinking…</p>}
        <div ref={endRef} />
      </div>

      {canEdit ? (
        <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); sendChat() }}>
          <div className="rounded-xl border border-border bg-surface p-2 focus-within:border-primary">
            <label className="sr-only" htmlFor="chat-input">Message</label>
            <textarea id="chat-input" rows={2} value={draft} maxLength={10000} disabled={stage === 'building'}
              placeholder={hasAgents ? 'Ask about your app or this conversation…' : 'Describe what to build…'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
              className="w-full resize-none bg-transparent px-1.5 py-1 text-sm focus:outline-none" />
            <div className="flex items-center justify-between">
              <Segmented size="sm" label="Chat mode" value={chatMode} onChange={setChatMode} options={[{ value: 'plan', label: 'Plan' }, { value: 'build', label: 'Build' }]} />
              <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim() || stage === 'building'} className="h-8 w-8"><ArrowUp className="size-4" /></Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="border-t border-border p-3 text-center text-xs text-muted"><XCircle className="mr-1 inline size-3.5" aria-hidden />You have view-only access to this project.</p>
      )}
    </div>
  )
}
