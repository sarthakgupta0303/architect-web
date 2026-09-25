import { describe, expect, it } from 'vitest'
import { EVAL_LIMITS, expectationFromJson, expectationToJson, type Expectation, type SimAgent, type SimEdge } from './eval-logic'
import { computeScore, parseEvalCsv, parseExpectation, scoreCase, simulateResponse, tokenizeCsv } from './eval-service'

const agents: SimAgent[] = [
  { id: 'a1', key: 'triage', name: 'Triage', role: 'Routes questions', type: 'autonomous', isEntry: true },
  { id: 'a2', key: 'faq_bot', name: 'FAQ Bot', role: 'Answers product questions', type: 'autonomous', isEntry: false },
  { id: 'a3', key: 'escalation', name: 'Human Escalation', role: 'Hands off to support', type: 'autonomous', isEntry: false },
]
const edges: SimEdge[] = [
  { from: 'a1', to: 'a2', condition: 'intent == faq', label: null },
  { from: 'a1', to: 'a3', condition: 'sentiment < -0.5', label: 'escalate' },
]

describe('simulateResponse (preview responder)', () => {
  it('routes friendly messages to the positive hand-off', () => {
    const r = simulateResponse('How do I reset my password?', agents, edges)
    expect(r.path.map((a) => a.key)).toEqual(['triage', 'faq_bot'])
    expect(r.escalated).toBe(false)
    expect(r.text).toContain('How do I reset my password?')
  })
  it('routes angry messages to the escalation hand-off', () => {
    const r = simulateResponse('I want a refund NOW!!', agents, edges)
    expect(r.path.map((a) => a.key)).toEqual(['triage', 'escalation'])
    expect(r.escalated).toBe(true)
  })
  it('is deterministic', () => {
    expect(simulateResponse('hello', agents, edges)).toEqual(simulateResponse('hello', agents, edges))
  })
  it('handles a project without agents', () => {
    const r = simulateResponse('hello', [], [])
    expect(r.path).toEqual([])
    expect(r.text).toMatch(/no agents/i)
  })
})

describe('scoreCase', () => {
  const friendly = simulateResponse('How do I reset my password?', agents, edges)
  const angry = simulateResponse('This is the worst, cancel it', agents, edges)
  const cases: [string, Expectation, typeof friendly, boolean][] = [
    ['contains pass (case-insensitive)', { type: 'contains', value: 'RESET' }, friendly, true],
    ['contains fail', { type: 'contains', value: 'invoice' }, friendly, false],
    ['not_contains pass', { type: 'not_contains', value: 'invoice' }, friendly, true],
    ['not_contains fail', { type: 'not_contains', value: 'password' }, friendly, false],
    ['escalates yes pass', { type: 'escalates', value: 'yes' }, angry, true],
    ['escalates yes fail', { type: 'escalates', value: 'yes' }, friendly, false],
    ['escalates no pass', { type: 'escalates', value: 'no' }, friendly, true],
    ['escalates no fail', { type: 'escalates', value: 'no' }, angry, false],
    ['agent by key pass', { type: 'agent', value: 'faq_bot' }, friendly, true],
    ['agent by name pass', { type: 'agent', value: 'faq bot' }, friendly, true],
    ['agent fail', { type: 'agent', value: 'faq_bot' }, angry, false],
  ]
  it.each(cases)('%s', (_name, expectation, response, passed) => {
    const r = scoreCase(expectation, response)
    expect(r.passed).toBe(passed)
    expect(r.reason.length).toBeGreaterThan(0)
  })
  it('fails unsupported expectations', () => {
    expect(scoreCase(null, friendly).passed).toBe(false)
  })
})

describe('computeScore', () => {
  it('rounds to 2 decimals', () => {
    expect(computeScore(2, 3)).toBe(66.67)
    expect(computeScore(5, 5)).toBe(100)
    expect(computeScore(0, 4)).toBe(0)
  })
  it('returns 0 for an empty run', () => {
    expect(computeScore(0, 0)).toBe(0)
  })
})

describe('expectation storage mapping', () => {
  it.each<Expectation>([
    { type: 'contains', value: 'reset' },
    { type: 'not_contains', value: 'sorry' },
    { type: 'agent', value: 'faq_bot' },
    { type: 'escalates', value: 'yes' },
    { type: 'escalates', value: 'no' },
  ])('round-trips %o', (e) => {
    expect(expectationFromJson(expectationToJson(e))).toEqual(e)
  })
  it('rejects shapes it cannot score', () => {
    expect(expectationFromJson({ exact: 'x' })).toBeNull()
    expect(expectationFromJson({ contains: ['a', 'b'] })).toBeNull()
    expect(expectationFromJson(null)).toBeNull()
  })
})

describe('parseExpectation', () => {
  it('treats plain text as contains', () => {
    expect(parseExpectation('reset link')).toEqual({ ok: true, expectation: { type: 'contains', value: 'reset link' } })
  })
  it('understands prefixes', () => {
    expect(parseExpectation('not_contains: refund')).toEqual({ ok: true, expectation: { type: 'not_contains', value: 'refund' } })
    expect(parseExpectation('AGENT:faq_bot')).toEqual({ ok: true, expectation: { type: 'agent', value: 'faq_bot' } })
    expect(parseExpectation('escalates')).toEqual({ ok: true, expectation: { type: 'escalates', value: 'yes' } })
    expect(parseExpectation('escalates: no')).toEqual({ ok: true, expectation: { type: 'escalates', value: 'no' } })
  })
  it('rejects bad values', () => {
    expect(parseExpectation('').ok).toBe(false)
    expect(parseExpectation('contains:').ok).toBe(false)
    expect(parseExpectation('escalates: maybe').ok).toBe(false)
    expect(parseExpectation('x'.repeat(EVAL_LIMITS.MAX_VALUE + 1)).ok).toBe(false)
  })
})

describe('tokenizeCsv', () => {
  it('handles quotes, escaped quotes, commas, CRLF and embedded newlines', () => {
    const rows = tokenizeCsv('a,b\r\n"hello, world","say ""hi"""\n"multi\nline",x')
    expect(rows.map((r) => r.fields)).toEqual([['a', 'b'], ['hello, world', 'say "hi"'], ['multi\nline', 'x']])
    expect(rows.map((r) => r.line)).toEqual([1, 2, 3])
  })
  it('strips a UTF-8 BOM', () => {
    expect(tokenizeCsv('﻿input,expected')[0]!.fields).toEqual(['input', 'expected'])
  })
})

describe('parseEvalCsv', () => {
  it('parses rows with a header and skips blank lines', () => {
    const r = parseEvalCsv('input,expected\nHow do I reset?,reset\n\n"I want a refund, now",escalates\nWhat is SSO?,agent: faq_bot\n')
    expect(r.errors).toEqual([])
    expect(r.cases).toEqual([
      { input: 'How do I reset?', expectation: { type: 'contains', value: 'reset' } },
      { input: 'I want a refund, now', expectation: { type: 'escalates', value: 'yes' } },
      { input: 'What is SSO?', expectation: { type: 'agent', value: 'faq_bot' } },
    ])
  })
  it('works without a header', () => {
    expect(parseEvalCsv('hi,hello').cases).toHaveLength(1)
  })
  it('reports row errors with line numbers', () => {
    const r = parseEvalCsv('input,expected\nok,fine\nunquoted, comma,here\n,empty input\nno expectation,')
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5])
    expect(r.errors[0]!.message).toMatch(/2 columns/)
  })
  it('rejects inputs over the length limit', () => {
    const r = parseEvalCsv(`${'a'.repeat(EVAL_LIMITS.MAX_INPUT + 1)},x`)
    expect(r.errors).toHaveLength(1)
    expect(r.cases).toHaveLength(0)
  })
  it(`caps imports at ${EVAL_LIMITS.MAX_IMPORT_ROWS} rows`, () => {
    const ok = Array.from({ length: EVAL_LIMITS.MAX_IMPORT_ROWS }, (_, i) => `q${i},a`).join('\n')
    expect(parseEvalCsv(ok).cases).toHaveLength(EVAL_LIMITS.MAX_IMPORT_ROWS)
    const tooMany = `${ok}\nextra,a`
    const r = parseEvalCsv(tooMany)
    expect(r.cases).toHaveLength(0)
    expect(r.errors[0]!.message).toMatch(/limit is 200/)
  })
  it('reports an empty file', () => {
    expect(parseEvalCsv('').errors).toHaveLength(1)
    expect(parseEvalCsv('input,expected\n').errors[0]!.message).toMatch(/no cases/)
  })
})
