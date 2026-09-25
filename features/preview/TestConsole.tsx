'use client'

import { ArrowUp, Bot, ChevronRight, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn, sleep } from '@/lib/utils'

type Agent = { id: string; name: string; role: string | null; type: string; isEntry: boolean }
type Edge = { from: string; to: string; condition: string; label: string | null }
type Msg = { id: number; role: 'user' | 'assistant'; text: string; trace?: string[]; feedback?: 1 | -1 }

/** Picks a hand-off whose condition best matches the message (simulated routing for the prototype preview). */
function route(message: string, agents: Agent[], edges: Edge[]): Agent[] {
  const m = message.toLowerCase()
  const angry = /(angry|furious|terrible|worst|refund|now!|!!|cancel)/.test(m)
  const byId = new Map(agents.map((a) => [a.id, a]))
  const start = agents.find((a) => a.isEntry) ?? agents[0]
  if (!start) return []
  const path: Agent[] = [start]
  let current = start
  for (let hop = 0; hop < 5; hop++) {
    const out = edges.filter((e) => e.from === current.id)
    if (!out.length) break
    const negative = out.find((e) => /sentiment\s*<|human|escalat/i.test(`${e.condition} ${e.label ?? ''}`))
    const positive = out.find((e) => e !== negative)
    const next = (angry && negative) ? negative : positive ?? negative
    const agent = next && byId.get(next.to)
    if (!agent || path.includes(agent)) break
    path.push(agent)
    current = agent
  }
  return path
}

function reply(message: string, path: Agent[]): string {
  const last = path[path.length - 1]
  if (!last) return 'This app has no agents yet. Add one on the canvas and rebuild.'
  if (last.type === 'human_approval') return 'I’ve prepared this and sent it to a teammate for approval. You’ll hear back shortly.'
  if (/escalat|human|handoff/i.test(`${last.name} ${last.role ?? ''}`)) return 'I’m sorry about this. I’ve passed your conversation to our team with a summary — someone will reply within a few minutes.'
  return `Thanks for your message. ${last.role ? `(${last.name}: ${last.role.toLowerCase()})` : ''} Here’s what I found for “${message.slice(0, 60)}”: this is a simulated answer in the prototype — connect a model and integrations to get real responses.`
}

export function TestConsole({ name, description, agents, edges }: { name: string; description: string | null; agents: Agent[]; edges: Edge[] }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [openTrace, setOpenTrace] = useState<number | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    const id = Date.now()
    setMessages((m) => [...m, { id, role: 'user', text }])
    setBusy(true)
    const path = route(text, agents, edges)
    await sleep(700 + path.length * 350)
    setMessages((m) => [...m, { id: id + 1, role: 'assistant', text: reply(text, path), trace: path.map((a) => a.name) }])
    setBusy(false)
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="border-b border-border bg-surface px-5 py-4">
        <h1 className="font-semibold">{name}</h1>
        <p className="text-xs text-muted">{description ?? `${agents.length} agents · preview`}</p>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
              <Bot className="mx-auto mb-2 size-6 text-primary-text" aria-hidden />
              Send a message to test your agents. Try something friendly, then something angry, to see different hand-offs.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-primary text-primary-fg' : 'bg-surface')}>
                {m.text}
                {m.trace && (
                  <div className="mt-2 border-t border-border pt-2">
                    <button className="flex flex-wrap items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => setOpenTrace(openTrace === m.id ? null : m.id)} aria-expanded={openTrace === m.id}>
                      {m.trace.map((t, i) => <span key={i} className="flex items-center gap-1"><span className="rounded-md bg-surface-2 px-1.5 py-0.5">{t}</span>{i < m.trace!.length - 1 && <ChevronRight className="size-3" aria-hidden />}</span>)}
                    </button>
                    {openTrace === m.id && <p className="mt-2 text-xs text-muted">{m.trace.length} agent steps · simulated in preview</p>}
                    <div className="mt-2 flex gap-1">
                      {([1, -1] as const).map((v) => (
                        <button key={v} aria-label={v === 1 ? 'Helpful' : 'Not helpful'} onClick={() => setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, feedback: v } : x)))}
                          className={cn('rounded-md p-1 text-muted hover:text-fg', m.feedback === v && 'text-primary-text')}>
                          {v === 1 ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="flex gap-1 px-2" aria-label="Agents are working"><span className="size-2 animate-bounce rounded-full bg-muted" /><span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:150ms]" /><span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:300ms]" /></div>}
          <div ref={end} />
        </div>
      </main>
      <form className="border-t border-border bg-surface p-4" onSubmit={(e) => { e.preventDefault(); send() }}>
        <div className="mx-auto flex max-w-2xl gap-2">
          <label htmlFor="console-input" className="sr-only">Message</label>
          <input id="console-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" maxLength={2000}
            className="h-11 flex-1 rounded-xl border border-border bg-bg px-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <button type="submit" aria-label="Send" disabled={!draft.trim() || busy} className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-fg disabled:opacity-50"><ArrowUp className="size-4" /></button>
        </div>
      </form>
    </div>
  )
}
