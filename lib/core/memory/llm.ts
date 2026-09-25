import 'server-only'
import type { ChatTurn, Classification, ContextType, RetrievedContext } from './types'
import { renderProject } from './context'
import { wrapUntrusted } from '@/lib/security/promptInjectionGuard'

/**
 * Optional model-backed classification and answering. Enabled when ANTHROPIC_API_KEY and
 * ARCHITECT_CHAT_MODEL are set (server only). Every call has a timeout; callers fall back
 * to the deterministic pipeline on any failure.
 */
const API = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 20_000

export function llmConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.ARCHITECT_CHAT_MODEL
}

async function call(system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: process.env.ARCHITECT_CHAT_MODEL, max_tokens: maxTokens, system, messages }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`LLM ${res.status}`)
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim()
  } finally {
    clearTimeout(timer)
  }
}

/** Alternating user/assistant turns; merges consecutive same-role turns (API requirement). */
function toMessages(history: ChatTurn[], newMessage: string, preface?: string) {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const t of history) {
    const last = out[out.length - 1]
    if (last && last.role === t.role) last.content += `\n\n${t.content}`
    else out.push({ role: t.role, content: t.content })
  }
  const content = preface ? `${preface}\n\n<user_question>\n${newMessage}\n</user_question>` : newMessage
  const last = out[out.length - 1]
  if (last && last.role === 'user') last.content += `\n\n${content}`
  else out.push({ role: 'user', content })
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(conversation start)' })
  return out
}

export async function llmClassify(message: string, history: ChatTurn[]): Promise<Classification | null> {
  const recent = history.slice(-6).map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 400)}`).join('\n')
  const system =
    'Classify the user’s new question for an app-building assistant. Reply with exactly one word:\n' +
    'PROJECT — about the app being built (its PRD, agents, hand-offs, tools, settings)\n' +
    'HISTORY — about the conversation itself (what was asked, said or decided earlier)\n' +
    'BOTH — references the earlier conversation AND the app.'
  const text = await call(system, [{ role: 'user', content: `Recent conversation:\n${recent || '(none)'}\n\nNew question: ${message}` }], 5)
  const word = text.toUpperCase().match(/PROJECT|HISTORY|BOTH/)?.[0]
  if (!word) return null
  const type = word.toLowerCase() as ContextType
  return { type: history.length === 0 && type !== 'project' ? 'project' : type, confidence: 0.9, reason: 'Classified by model.', signals: { history: [], project: [] } }
}

export async function llmAnswer(ctx: RetrievedContext, message: string): Promise<string> {
  const preface = ctx.project ? wrapUntrusted('project_context', renderProject(ctx.project)) : undefined
  return call(ctx.systemPrompt, toMessages(ctx.history, message, preface), 800)
}
