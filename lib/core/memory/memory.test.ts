import { describe, expect, it } from 'vitest'
import { classifyContext } from './classifier'
import { retrieveContext, SYSTEM_PROMPTS } from './context'
import { composeAnswer } from './responder'
import type { ChatTurn, ProjectKnowledge } from './types'

const project: ProjectKnowledge = {
  name: 'Support Copilot',
  prd: { title: 'Support Copilot', summary: 'Answers FAQs and escalates unhappy customers.', sections: [
    { key: 'goals', title: 'Goals', bodyMd: 'Resolve 60% of FAQ tickets without a human.' },
    { key: 'integrations', title: 'Integrations', bodyMd: 'Zendesk for tickets, Notion for knowledge, Slack for escalations.' },
  ] },
  agents: [
    { key: 'triage', name: 'Triage', role: 'Classifies intent and sentiment', type: 'autonomous', model: 'anthropic/claude-haiku', instructions: 'Classify each ticket.', tools: ['http_request'], isEntry: true },
    { key: 'escalation', name: 'Escalation', role: 'Hands unhappy customers to a human', type: 'workflow', model: null, instructions: 'Post to Slack.', tools: [], isEntry: false },
  ],
  edges: [{ from: 'triage', to: 'escalation', condition: 'sentiment < -0.5', label: 'Unhappy' }],
}

const turns = (n: number): ChatTurn[] => Array.from({ length: n }, (_, i) => ({
  id: `t${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: i % 2 === 0 ? `Question ${i} about escalation thresholds` : `Answer ${i}: use -0.5`, createdAt: new Date(2026, 0, 1, 0, i).toISOString(), contextType: 'project',
}))

describe('classifyContext', () => {
  const history = turns(4)
  it.each([
    ['What does the Triage agent do?', 'project'],
    ['Which integrations are in the PRD?', 'project'],
    ['What did I ask you earlier?', 'history'],
    ['Summarize our conversation so far', 'history'],
    ['What was my first question?', 'history'],
    ['Apply what you suggested earlier to the Escalation agent', 'both'],
    ['Based on what we discussed, update the PRD goals', 'both'],
  ] as const)('%s → %s', (q, expected) => {
    expect(classifyContext(q, history, project).type).toBe(expected)
  })

  it('never classifies as history when there is no prior conversation', () => {
    expect(classifyContext('What did I ask you earlier?', [], project).type).toBe('project')
  })
})

describe('retrieveContext', () => {
  const history = turns(30)
  it('PROJECT sends project context + last 10 turns', () => {
    const ctx = retrieveContext('project', history, project)
    expect(ctx.project).not.toBeNull()
    expect(ctx.history).toHaveLength(10)
    expect(ctx.history.at(-1)?.id).toBe('t29')
    expect(ctx.systemPrompt).toBe(SYSTEM_PROMPTS.project)
  })
  it('HISTORY sends only the conversation, up to 20 turns', () => {
    const ctx = retrieveContext('history', history, project)
    expect(ctx.project).toBeNull()
    expect(ctx.history).toHaveLength(20)
    expect(ctx.systemPrompt).toContain('[From conversation]')
  })
  it('BOTH sends project context + last 10 turns', () => {
    const ctx = retrieveContext('both', history, project)
    expect(ctx.project).not.toBeNull()
    expect(ctx.history).toHaveLength(10)
  })
})

describe('composeAnswer (grounded fallback)', () => {
  const history: ChatTurn[] = [
    { id: 'u1', role: 'user', content: 'Should escalation happen below -0.5 sentiment?', createdAt: '2026-01-01T00:00:00Z', contextType: 'project' },
    { id: 'a1', role: 'assistant', content: 'Yes — escalate when sentiment is below -0.5.', createdAt: '2026-01-01T00:00:01Z', contextType: 'project' },
  ]
  it('HISTORY answers only from the conversation and ends with [From conversation]', () => {
    const r = composeAnswer(retrieveContext('history', history, project), 'What was my first question?')
    expect(r.content.trim().endsWith('[From conversation]')).toBe(true)
    expect(r.content).not.toMatch(/\[(PRD|Agent):/)
    expect(r.sources.every((s) => s.kind === 'conversation')).toBe(true)
  })
  it('PROJECT cites PRD and agents', () => {
    const r = composeAnswer(retrieveContext('project', history, project), 'What does the Triage agent do?')
    expect(r.content).toContain('[Agent: Triage]')
    expect(r.sources.some((s) => s.kind === 'agent' && s.ref === 'triage')).toBe(true)
  })
  it('BOTH attributes facts to each source', () => {
    const r = composeAnswer(retrieveContext('both', history, project), 'Based on what we discussed about escalation, which agent handles it?')
    expect(r.content).toContain('[From conversation]')
    expect(r.content).toMatch(/\[Agent: /)
  })
})
