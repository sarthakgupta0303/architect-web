import type { AssistantReply, ChatTurn, ProjectKnowledge, RetrievedContext, Source } from './types'

/**
 * Deterministic, grounded answer composer used when no model is configured (and as the
 * fallback when the model call fails). It only uses the retrieved context, so it obeys
 * the same source rules as the model prompt: no project facts for HISTORY, citations always.
 */
const STOP = new Set('a an the is are was were be been of to in on for and or but with what which who how why when where do does did can could should would i we you it this that these those my our your me us about from as at by any all there their them please tell show give list its it’s have has had just'.split(' '))

export function keywords(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))))
}

function overlap(a: string[], text: string): number {
  const t = text.toLowerCase()
  return a.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0)
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const firstSentence = (s: string) => clip(s.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] ?? s, 240)

function answerFromHistory(question: string, history: ChatTurn[]): { text: string; sources: Source[] } | null {
  if (!history.length) return null
  const q = question.toLowerCase()
  const users = history.filter((t) => t.role === 'user')
  const src = (t: ChatTurn, label: string): Source => ({ kind: 'conversation', ref: t.id, label })

  if (/\b(summari[sz]e|recap|so far)\b/.test(q)) {
    const lines = users.slice(-8).map((t, i) => `${i + 1}. You asked: “${clip(t.content, 120)}”`)
    return { text: `Here’s what we’ve covered so far:\n${lines.join('\n')}`, sources: users.slice(-8).map((t, i) => src(t, `Message ${i + 1}`)) }
  }
  if (/\bfirst (message|question|thing|request)\b/.test(q) && users[0]) {
    return { text: `Your first question was: “${clip(users[0].content)}”.`, sources: [src(users[0], 'First message')] }
  }
  if (/\b(last|previous) (message|question|request)\b/.test(q) && users.length) {
    const t = users[users.length - 1]
    return { text: `Your previous question was: “${clip(t.content)}”.`, sources: [src(t, 'Previous message')] }
  }
  if (/\b(you|u) (said|suggested|mentioned|told|recommended|proposed|replied|answered)\b|\b(last|previous) (answer|reply)\b/.test(q)) {
    const kw = keywords(question)
    const assistants = history.filter((t) => t.role === 'assistant')
    const best = [...assistants].sort((a, b) => overlap(kw, b.content) - overlap(kw, a.content) || b.createdAt.localeCompare(a.createdAt))[0]
    if (best) return { text: `Earlier I said: “${clip(best.content, 320)}”`, sources: [src(best, 'My earlier reply')] }
  }
  const kw = keywords(question)
  const scored = history.map((t) => ({ t, s: overlap(kw, t.content) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.t.createdAt.localeCompare(a.t.createdAt))
  if (!scored.length) return null
  const top = scored[0].t
  const idx = history.findIndex((t) => t.id === top.id)
  const pair = top.role === 'user' ? history[idx + 1] : history[idx - 1]
  const lines = top.role === 'user'
    ? [`You asked: “${clip(top.content)}”`, pair?.role === 'assistant' ? `I replied: “${clip(pair.content)}”` : null]
    : [pair?.role === 'user' ? `You asked: “${clip(pair.content)}”` : null, `I replied: “${clip(top.content)}”`]
  return { text: `Earlier in this conversation — ${lines.filter(Boolean).join(' ')}`, sources: [top, pair].filter((x): x is ChatTurn => !!x).map((t) => src(t, t.role === 'user' ? 'Your message' : 'My reply')) }
}

function answerFromProject(question: string, project: ProjectKnowledge): { text: string; sources: Source[] } | null {
  const q = question.toLowerCase()
  const nameByKey = new Map(project.agents.map((a) => [a.key, a.name]))
  const kw = keywords(question)

  if (/\b(which|what|list|how many)\b.*\bagents?\b/.test(q) && project.agents.length) {
    const lines = project.agents.map((a) => `- ${a.name}${a.isEntry ? ' (entry)' : ''} — ${a.role ?? a.type} [Agent: ${a.name}]`)
    return { text: `This app has ${project.agents.length} agent${project.agents.length === 1 ? '' : 's'}:\n${lines.join('\n')}`, sources: project.agents.map((a) => ({ kind: 'agent', ref: a.key, label: a.name })) }
  }
  if (/\b(hand-?offs?|route|routing|flow|connected|escalat)\b/.test(q) && project.edges.length) {
    const lines = project.edges.map((e) => `- ${nameByKey.get(e.from)} → ${nameByKey.get(e.to)}${e.condition ? ` when ${e.condition}` : ''} [Agent: ${nameByKey.get(e.from)}]`)
    return { text: `Messages flow like this:\n${lines.join('\n')}`, sources: Array.from(new Set(project.edges.map((e) => e.from))).map((k) => ({ kind: 'agent', ref: k, label: nameByKey.get(k) ?? k })) }
  }

  const facts: { text: string; score: number; source: Source }[] = []
  for (const a of project.agents) {
    const hay = `${a.name} ${a.role ?? ''} ${a.instructions ?? ''} ${a.tools.join(' ')} ${a.model ?? ''} ${a.type}`
    const named = q.includes(a.name.toLowerCase()) ? 3 : 0
    const s = overlap(kw, hay) + named
    if (s > 0) {
      const details = [a.role, a.model ? `uses ${a.model}` : null, a.tools.length ? `tools: ${a.tools.join(', ')}` : null, a.instructions ? `instructions: “${clip(a.instructions, 140)}”` : null].filter(Boolean).join('; ')
      facts.push({ text: `${a.name}${a.isEntry ? ' (entry agent)' : ''} — ${details} [Agent: ${a.name}]`, score: s, source: { kind: 'agent', ref: a.key, label: a.name } })
    }
  }
  for (const sec of project.prd?.sections ?? []) {
    const s = overlap(kw, `${sec.title} ${sec.bodyMd}`) + (q.includes(sec.title.toLowerCase()) ? 3 : 0)
    if (s > 0) facts.push({ text: `${firstSentence(sec.bodyMd.replace(/[*#`-]/g, ' '))} [PRD: ${sec.title}]`, score: s, source: { kind: 'prd', ref: sec.key, label: sec.title } })
  }
  if (!facts.length) return null
  const top = facts.sort((a, b) => b.score - a.score).slice(0, 3)
  return { text: top.map((f) => `- ${f.text}`).join('\n'), sources: top.map((f) => f.source) }
}

export function composeAnswer(ctx: RetrievedContext, question: string): AssistantReply {
  if (ctx.type === 'history') {
    const h = answerFromHistory(question, ctx.history)
    return h
      ? { content: `${h.text}\n\n[From conversation]`, sources: h.sources }
      : { content: 'I couldn’t find that in our conversation so far.\n\n[From conversation]', sources: [] }
  }
  const p = ctx.project ? answerFromProject(question, ctx.project) : null
  if (ctx.type === 'project') {
    return p
      ? { content: `From the project:\n${p.text}`, sources: p.sources }
      : { content: 'I couldn’t find that in the PRD or the agent graph. Add it to the PRD, or ask me to design it.', sources: [] }
  }
  const h = answerFromHistory(question, ctx.history)
  const parts: string[] = []
  if (h) parts.push(`${h.text} [From conversation]`)
  if (p) parts.push(`In the project:\n${p.text}`)
  if (!parts.length) return { content: 'I couldn’t find that in our conversation or in the project.', sources: [] }
  return { content: parts.join('\n\n'), sources: [...(h?.sources ?? []), ...(p?.sources ?? [])] }
}

/** Extracts citations from model output so the UI can attribute sources (spec §4). */
export function extractSources(text: string, ctx: RetrievedContext, history: ChatTurn[]): Source[] {
  const out: Source[] = []
  const seen = new Set<string>()
  for (const m of Array.from(text.matchAll(/\[(PRD|Agent):\s*([^\]]+)\]/g))) {
    const kind = m[1] === 'PRD' ? 'prd' : 'agent'
    const label = m[2].trim()
    const key = `${kind}:${label}`
    if (seen.has(key)) continue
    seen.add(key)
    const ref = kind === 'prd' ? ctx.project?.prd?.sections.find((s) => s.title === label)?.key ?? label : ctx.project?.agents.find((a) => a.name === label)?.key ?? label
    out.push({ kind, ref, label })
  }
  if (/\[From conversation\]/i.test(text) && history.length) {
    const last = [...history].reverse().find((t) => t.role === 'user')
    if (last) out.push({ kind: 'conversation', ref: last.id, label: 'Conversation' })
  }
  return out
}
