import { z } from 'zod'

/**
 * Pure evaluation logic shared by the eval service (server) and the Evals panel (client):
 * expectation schema, CSV parsing, the deterministic preview responder and scoring.
 * No I/O and no server-only imports.
 */

export const EVAL_LIMITS = {
  MAX_INPUT: 2000,
  MAX_VALUE: 200,
  MAX_IMPORT_ROWS: 200,
  MAX_CSV_BYTES: 200_000,
  MAX_CASES_PER_SET: 500,
  HISTORY: 10,
} as const

export const EXPECTATION_TYPES = ['contains', 'not_contains', 'escalates', 'agent'] as const
export type ExpectationType = (typeof EXPECTATION_TYPES)[number]

const textValue = z.string().trim().min(1, 'Enter a value').max(EVAL_LIMITS.MAX_VALUE, `Values can be at most ${EVAL_LIMITS.MAX_VALUE} characters`)

export const ExpectationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('contains'), value: textValue }),
  z.object({ type: z.literal('not_contains'), value: textValue }),
  z.object({ type: z.literal('agent'), value: z.string().trim().min(1, 'Enter an agent key or name').max(60, 'Agent keys can be at most 60 characters') }),
  z.object({ type: z.literal('escalates'), value: z.enum(['yes', 'no']) }),
])
export type Expectation = z.infer<typeof ExpectationSchema>

export const CaseInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter a test input')
  .max(EVAL_LIMITS.MAX_INPUT, `Inputs can be at most ${EVAL_LIMITS.MAX_INPUT} characters`)

export const CreateCaseSchema = z.object({ input: CaseInputSchema, expectation: ExpectationSchema })
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>

export function describeExpectation(e: Expectation | null): string {
  if (!e) return 'Unsupported expectation'
  switch (e.type) {
    case 'contains': return `Contains “${e.value}”`
    case 'not_contains': return `Does not contain “${e.value}”`
    case 'agent': return `Handled by ${e.value}`
    case 'escalates': return e.value === 'yes' ? 'Escalates to a human' : 'Does not escalate'
  }
}

// ---------------------------------------------------------------------------
// Storage mapping (eval_cases.expected JSON, docs/specs/evals.md §1)
// ---------------------------------------------------------------------------

export function expectationToJson(e: Expectation): Record<string, unknown> {
  switch (e.type) {
    case 'contains': return { contains: [e.value] }
    case 'not_contains': return { notContains: [e.value] }
    case 'agent': return { agent: e.value }
    case 'escalates': return { escalates: e.value === 'yes' }
  }
}

function single(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'string') return v[0]
  return null
}

/** Reads a stored `expected` JSON back into an expectation; null when the shape is not one this runner scores. */
export function expectationFromJson(json: unknown): Expectation | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  let candidate: unknown = null
  if ('contains' in o) candidate = { type: 'contains', value: single(o.contains) }
  else if ('notContains' in o) candidate = { type: 'not_contains', value: single(o.notContains) }
  else if ('agent' in o) candidate = { type: 'agent', value: o.agent }
  else if ('escalates' in o && typeof o.escalates === 'boolean') candidate = { type: 'escalates', value: o.escalates ? 'yes' : 'no' }
  const parsed = ExpectationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

// ---------------------------------------------------------------------------
// CSV import: `input,expected` rows
// ---------------------------------------------------------------------------

/** RFC 4180 tokenizer: quoted fields may contain commas, newlines and doubled quotes. Returns rows with their 1-based starting line. */
export function tokenizeCsv(text: string): { line: number; fields: string[] }[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: { line: number; fields: string[] }[] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let rowStart = 1
  let i = 0
  const endRow = () => {
    fields.push(field)
    rows.push({ line: rowStart, fields })
    fields = []
    field = ''
  }
  while (i < src.length) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      if (ch === '\n') line++
      field += ch
      i++
      continue
    }
    if (ch === '"' && field.length === 0) { inQuotes = true; i++; continue }
    if (ch === ',') { fields.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      endRow()
      if (ch === '\r' && src[i + 1] === '\n') i++
      i++
      line++
      rowStart = line
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || fields.length > 0 || inQuotes) endRow()
  return rows
}

/**
 * Parses the `expected` column. Accepted forms:
 *   `contains: text` · `not_contains: text` · `escalates` / `escalates: yes|no` · `agent: key`
 *   Anything without a prefix means “contains”.
 */
export function parseExpectation(raw: string): { ok: true; expectation: Expectation } | { ok: false; message: string } {
  const text = raw.trim()
  if (!text) return { ok: false, message: 'Expected value is empty' }
  const m = /^(contains|not_contains|escalates|agent)\s*(?::\s*([\s\S]*))?$/i.exec(text)
  let candidate: { type: string; value: string }
  if (m) {
    const type = m[1]!.toLowerCase()
    const value = (m[2] ?? '').trim()
    if (type === 'escalates') {
      const v = value.toLowerCase()
      if (v === '' || v === 'yes' || v === 'true') candidate = { type, value: 'yes' }
      else if (v === 'no' || v === 'false') candidate = { type, value: 'no' }
      else return { ok: false, message: 'Use “escalates”, “escalates: yes” or “escalates: no”' }
    } else {
      candidate = { type, value }
    }
  } else {
    candidate = { type: 'contains', value: text }
  }
  const parsed = ExpectationSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid expectation' }
  return { ok: true, expectation: parsed.data }
}

export type CsvRowError = { line: number; message: string }
export type CsvParseResult = { cases: CreateCaseInput[]; errors: CsvRowError[] }

export function parseEvalCsv(text: string): CsvParseResult {
  const rows = tokenizeCsv(text).filter((r) => r.fields.some((f) => f.trim() !== ''))
  const errors: CsvRowError[] = []
  const cases: CreateCaseInput[] = []
  if (rows.length === 0) return { cases, errors: [{ line: 1, message: 'The file has no rows' }] }

  const first = rows[0]!.fields.map((f) => f.trim().toLowerCase())
  const data = first[0] === 'input' && first[1] === 'expected' ? rows.slice(1) : rows
  if (data.length === 0) return { cases, errors: [{ line: rows[0]!.line, message: 'The file has a header but no cases' }] }
  if (data.length > EVAL_LIMITS.MAX_IMPORT_ROWS) {
    return { cases, errors: [{ line: data[EVAL_LIMITS.MAX_IMPORT_ROWS]!.line, message: `The file has ${data.length} cases; the limit is ${EVAL_LIMITS.MAX_IMPORT_ROWS} per import` }] }
  }

  for (const row of data) {
    if (row.fields.length !== 2) {
      errors.push({ line: row.line, message: `Expected 2 columns (input,expected) but found ${row.fields.length} — wrap text containing commas in double quotes` })
      continue
    }
    const input = CaseInputSchema.safeParse(row.fields[0])
    if (!input.success) { errors.push({ line: row.line, message: input.error.issues[0]?.message ?? 'Invalid input' }); continue }
    const exp = parseExpectation(row.fields[1]!)
    if (!exp.ok) { errors.push({ line: row.line, message: exp.message }); continue }
    cases.push({ input: input.data, expectation: exp.expectation })
  }
  return { cases, errors }
}

// ---------------------------------------------------------------------------
// Deterministic responder — the same routing and replies as the preview TestConsole
// (features/preview/TestConsole.tsx), so evals score exactly what the preview shows.
// ---------------------------------------------------------------------------

export type SimAgent = { id: string; key: string; name: string; role: string | null; type: string; isEntry: boolean }
export type SimEdge = { from: string; to: string; condition: string; label: string | null }
export type SimResponse = { text: string; path: SimAgent[]; escalated: boolean }

export function routeMessage(message: string, agents: SimAgent[], edges: SimEdge[]): SimAgent[] {
  const m = message.toLowerCase()
  const angry = /(angry|furious|terrible|worst|refund|now!|!!|cancel)/.test(m)
  const byId = new Map(agents.map((a) => [a.id, a]))
  const start = agents.find((a) => a.isEntry) ?? agents[0]
  if (!start) return []
  const path: SimAgent[] = [start]
  let current = start
  for (let hop = 0; hop < 5; hop++) {
    const out = edges.filter((e) => e.from === current.id)
    if (!out.length) break
    const negative = out.find((e) => /sentiment\s*<|human|escalat/i.test(`${e.condition} ${e.label ?? ''}`))
    const positive = out.find((e) => e !== negative)
    const next = angry && negative ? negative : positive ?? negative
    const agent = next && byId.get(next.to)
    if (!agent || path.includes(agent)) break
    path.push(agent)
    current = agent
  }
  return path
}

function isEscalationAgent(a: SimAgent): boolean {
  return a.type === 'human_approval' || /escalat|human|handoff/i.test(`${a.name} ${a.role ?? ''}`)
}

export function simulateResponse(message: string, agents: SimAgent[], edges: SimEdge[]): SimResponse {
  const path = routeMessage(message, agents, edges)
  const last = path[path.length - 1]
  if (!last) return { text: 'This app has no agents yet. Add one on the canvas and rebuild.', path, escalated: false }
  if (last.type === 'human_approval') return { text: 'I’ve prepared this and sent it to a teammate for approval. You’ll hear back shortly.', path, escalated: true }
  if (isEscalationAgent(last)) return { text: 'I’m sorry about this. I’ve passed your conversation to our team with a summary — someone will reply within a few minutes.', path, escalated: true }
  const text = `Thanks for your message. ${last.role ? `(${last.name}: ${last.role.toLowerCase()})` : ''} Here’s what I found for “${message.slice(0, 60)}”: this is a simulated answer in the prototype — connect a model and integrations to get real responses.`
  return { text, path, escalated: false }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type ScoreResult = { passed: boolean; reason: string }

export function scoreCase(expectation: Expectation | null, response: Pick<SimResponse, 'text' | 'path' | 'escalated'>): ScoreResult {
  if (!expectation) return { passed: false, reason: 'This case uses an expectation the runner does not support' }
  const output = response.text.toLowerCase()
  switch (expectation.type) {
    case 'contains': {
      const ok = output.includes(expectation.value.toLowerCase())
      return { passed: ok, reason: ok ? `Output contains “${expectation.value}”` : `Output does not contain “${expectation.value}”` }
    }
    case 'not_contains': {
      const ok = !output.includes(expectation.value.toLowerCase())
      return { passed: ok, reason: ok ? `Output does not contain “${expectation.value}”` : `Output contains “${expectation.value}”` }
    }
    case 'agent': {
      const want = expectation.value.toLowerCase()
      const hit = response.path.find((a) => a.key.toLowerCase() === want || a.name.toLowerCase() === want)
      const route = response.path.map((a) => a.name).join(' → ') || 'no agents'
      return { passed: !!hit, reason: hit ? `${hit.name} handled the message` : `${expectation.value} was not on the route (${route})` }
    }
    case 'escalates': {
      const want = expectation.value === 'yes'
      const ok = response.escalated === want
      return { passed: ok, reason: response.escalated ? 'The conversation was escalated' : 'The conversation was not escalated' }
    }
  }
}

/** passed / total × 100, rounded to 2 decimals (docs/specs/evals.md §2). */
export function computeScore(passed: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((passed / total) * 10000) / 100
}
