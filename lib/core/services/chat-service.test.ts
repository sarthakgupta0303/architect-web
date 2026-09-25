import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/access', () => ({
  getProjectAccess: vi.fn(async () => ({ project: { id: 'p1', name: 'Demo' }, workspace: {}, membership: {} })),
}))
vi.mock('@/lib/core/memory/llm', () => ({ llmConfigured: () => false, llmAnswer: vi.fn(), llmClassify: vi.fn() }))

import { sendMessage } from './chat-service'

/** Minimal fake of the Supabase query builder that records the order of reads and writes on chat_messages. */
function fakeSupabase() {
  const log: string[] = []
  const stored: Record<string, unknown>[] = [
    { id: 'old1', role: 'user', content: 'What did the Triage agent do?', mode: 'build', context_type: 'project', confidence: 0.8, sources: [], created_at: '2026-01-01T00:00:00Z', author_id: 'u' },
  ]
  const builder = (table: string) => {
    let op = 'select'
    let payload: Record<string, unknown> | null = null
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: () => self(), eq: () => self(), order: () => self(), in: () => self(),
      limit: () => {
        if (table === 'chat_messages' && op === 'select') log.push(`read history (${stored.length} rows)`)
        return self()
      },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: (row: Record<string, unknown>) => { op = 'insert'; payload = row; return self() },
      single: () => {
        const row = { id: `new${stored.length}`, created_at: new Date().toISOString(), sources: [], ...payload }
        stored.push(row)
        log.push(`insert ${String(payload?.role)}`)
        return Promise.resolve({ data: row, error: null })
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: table === 'chat_messages' ? [...stored].reverse() : [], error: null }),
    })
    return chain
  }
  return { client: { from: builder } as never, log }
}

describe('sendMessage ordering', () => {
  it('loads history BEFORE saving the new user message', async () => {
    const { client, log } = fakeSupabase()
    const res = await sendMessage(client, 'u', 'p1', 'What did I ask you earlier?', 'build')
    expect(log[0]).toBe('read history (1 rows)')
    expect(log.indexOf('insert user')).toBeGreaterThan(0)
    // Without a service-role key the assistant reply is returned but not persisted (users cannot write assistant rows).
    expect(log).not.toContain('insert assistant')
    expect(res.persisted).toBe(false)
    expect(res.classification.type).toBe('history')
    expect(res.assistant.content).toContain('[From conversation]')
  })
})
