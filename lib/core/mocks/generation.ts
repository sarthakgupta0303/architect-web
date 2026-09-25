import 'server-only'
import type { AgentType } from '@/lib/contracts/agents'

/**
 * Deterministic generation used while MOCK_MODE is on (docs/specs/mock-mode.md §3).
 * Produces the same shapes the LLM-backed GenerationService returns.
 */
type Family = 'support' | 'sales' | 'research' | 'finance' | 'hr' | 'general'

export function detectFamily(prompt: string): Family {
  const p = prompt.toLowerCase()
  if (/(support|ticket|zendesk|helpdesk|customer|faq|escalat)/.test(p)) return 'support'
  if (/(sdr|lead|outreach|sales|crm|hubspot|prospect)/.test(p)) return 'sales'
  if (/(research|summari|citation|report|analy)/.test(p)) return 'research'
  if (/(invoice|billing|finance|expense|payment|accounting)/.test(p)) return 'finance'
  if (/(recruit|resume|candidate|hiring|interview)/.test(p)) return 'hr'
  return 'general'
}

export type ClarifyQuestion = { id: string; text: string; options: string[]; multi: boolean }

export function clarifyQuestions(prompt: string): ClarifyQuestion[] {
  const family = detectFamily(prompt)
  const common: ClarifyQuestion = { id: 'q3', text: 'Should a human approve anything before the agents act?', options: ['No, fully automatic', 'Only high-risk actions', 'Always ask first'], multi: false }
  const byFamily: Record<Family, ClarifyQuestion[]> = {
    support: [
      { id: 'q1', text: 'Where do customer messages come in?', options: ['Zendesk', 'Intercom', 'Email', 'Web chat', 'Slack'], multi: true },
      { id: 'q2', text: 'Where does your help content live?', options: ['Notion', 'Google Drive', 'Confluence', 'Website'], multi: true },
    ],
    sales: [
      { id: 'q1', text: 'Where do new leads come from?', options: ['HubSpot', 'Salesforce', 'Website form', 'CSV upload'], multi: true },
      { id: 'q2', text: 'How should outreach be sent?', options: ['Gmail drafts', 'Send automatically', 'Slack for review'], multi: false },
    ],
    research: [
      { id: 'q1', text: 'Which sources should the agents use?', options: ['Web search', 'Internal docs', 'Academic papers', 'News'], multi: true },
      { id: 'q2', text: 'Where should reports be saved?', options: ['Google Drive', 'Notion', 'Email', 'Download only'], multi: false },
    ],
    finance: [
      { id: 'q1', text: 'How do invoices arrive?', options: ['Email attachments', 'Upload in the app', 'Google Drive folder'], multi: true },
      { id: 'q2', text: 'Where should approved invoices go?', options: ['Google Sheets', 'QuickBooks', 'Xero', 'Email to finance'], multi: false },
    ],
    hr: [
      { id: 'q1', text: 'Where do applications come from?', options: ['Email', 'Careers page', 'LinkedIn', 'ATS export'], multi: true },
      { id: 'q2', text: 'What should happen to strong candidates?', options: ['Schedule interview', 'Notify recruiter', 'Add to shortlist'], multi: false },
    ],
    general: [
      { id: 'q1', text: 'Who will use this app?', options: ['My team', 'Customers', 'Just me'], multi: false },
      { id: 'q2', text: 'Which tools should it connect to?', options: ['Slack', 'Gmail', 'Notion', 'Google Drive', 'None yet'], multi: true },
    ],
  }
  return [...byFamily[family], common]
}

export type GraphAgent = { key: string; name: string; type: Exclude<AgentType, 'code'>; role: string; instructions: string; model: string; tools: string[] }
export type GraphSpec = { agents: GraphAgent[]; edges: { from: string; to: string; condition: string; label?: string }[]; integrations: string[] }

export function agentGraph(prompt: string, answers: Record<string, string | string[]>): GraphSpec {
  const family = detectFamily(prompt)
  const approval = String(answers.q3 ?? '').toLowerCase()
  const wantsApproval = approval.includes('high-risk') || approval.includes('always')
  const graphs: Record<Family, GraphSpec> = {
    support: {
      agents: [
        { key: 'triage', name: 'Triage', type: 'autonomous', role: 'Classifies intent and sentiment of each message', instructions: 'Classify each message by intent (faq, billing, bug, other) and sentiment from -1 to 1.', model: 'anthropic/claude-haiku', tools: ['http_request'] },
        { key: 'knowledge', name: 'Knowledge', type: 'autonomous', role: 'Finds answers in your help content', instructions: 'Search the help content and return the best answer with citations.', model: 'anthropic/claude-sonnet', tools: ['knowledge_base'] },
        { key: 'responder', name: 'Responder', type: 'autonomous', role: 'Drafts a friendly, cited reply', instructions: 'Write a concise, friendly reply using the cited answer. Never promise refunds.', model: 'anthropic/claude-sonnet', tools: [] },
        { key: 'escalation', name: 'Escalation', type: 'workflow', role: 'Hands unhappy customers to a human', instructions: 'Post a summary of the conversation to the escalation channel.', model: 'anthropic/claude-haiku', tools: ['http_request'] },
      ],
      edges: [
        { from: 'triage', to: 'knowledge', condition: 'intent == faq', label: 'FAQ' },
        { from: 'knowledge', to: 'responder', condition: '' },
        { from: 'triage', to: 'escalation', condition: 'sentiment < -0.5', label: 'Unhappy' },
      ],
      integrations: ['zendesk', 'notion', 'slack'],
    },
    sales: {
      agents: [
        { key: 'researcher', name: 'Researcher', type: 'autonomous', role: 'Researches the lead and company', instructions: 'Research the lead, company size, funding and recent news.', model: 'anthropic/claude-sonnet', tools: ['web_search'] },
        { key: 'scorer', name: 'Scorer', type: 'workflow', role: 'Scores fit against your ideal customer profile', instructions: 'Score the lead 0-100 against the ideal customer profile.', model: 'anthropic/claude-haiku', tools: [] },
        { key: 'writer', name: 'Writer', type: 'autonomous', role: 'Drafts personalised outreach', instructions: 'Draft a short, personalised email referencing one specific insight.', model: 'anthropic/claude-sonnet', tools: [] },
      ],
      edges: [{ from: 'researcher', to: 'scorer', condition: '' }, { from: 'scorer', to: 'writer', condition: 'score >= 60', label: 'Qualified' }],
      integrations: ['hubspot', 'gmail'],
    },
    research: {
      agents: [
        { key: 'planner', name: 'Planner', type: 'autonomous', role: 'Breaks the question into sub-questions', instructions: 'Plan 3-6 focused sub-questions.', model: 'anthropic/claude-sonnet', tools: [] },
        { key: 'searcher', name: 'Searcher', type: 'autonomous', role: 'Searches and reads sources', instructions: 'Search and extract key facts with source URLs.', model: 'anthropic/claude-haiku', tools: ['web_search'] },
        { key: 'synthesizer', name: 'Synthesizer', type: 'autonomous', role: 'Writes the cited report', instructions: 'Write a structured report with inline citations.', model: 'anthropic/claude-sonnet', tools: [] },
      ],
      edges: [{ from: 'planner', to: 'searcher', condition: '' }, { from: 'searcher', to: 'synthesizer', condition: '' }],
      integrations: ['google_drive'],
    },
    finance: {
      agents: [
        { key: 'extractor', name: 'Extractor', type: 'autonomous', role: 'Extracts invoice fields', instructions: 'Extract vendor, date, totals and line items.', model: 'anthropic/claude-sonnet', tools: ['code_interpreter'] },
        { key: 'validator', name: 'Validator', type: 'workflow', role: 'Checks totals and duplicates', instructions: 'Validate sums and check for duplicate invoice numbers.', model: 'anthropic/claude-haiku', tools: [] },
        { key: 'approver', name: 'Approver', type: 'human_approval', role: 'Asks a manager to approve large invoices', instructions: 'Request approval for invoices above the limit.', model: 'anthropic/claude-haiku', tools: [] },
      ],
      edges: [{ from: 'extractor', to: 'validator', condition: '' }, { from: 'validator', to: 'approver', condition: 'amount > 1000', label: 'Over limit' }],
      integrations: ['gmail', 'google_drive'],
    },
    hr: {
      agents: [
        { key: 'parser', name: 'Parser', type: 'autonomous', role: 'Parses resumes', instructions: 'Extract skills, experience and education.', model: 'anthropic/claude-haiku', tools: [] },
        { key: 'screener', name: 'Screener', type: 'autonomous', role: 'Screens against the role', instructions: 'Score the candidate against the job description.', model: 'anthropic/claude-sonnet', tools: [] },
        { key: 'scheduler', name: 'Scheduler', type: 'workflow', role: 'Schedules interviews', instructions: 'Email shortlisted candidates with interview slots.', model: 'anthropic/claude-haiku', tools: [] },
      ],
      edges: [{ from: 'parser', to: 'screener', condition: '' }, { from: 'screener', to: 'scheduler', condition: 'score >= 70', label: 'Shortlist' }],
      integrations: ['gmail'],
    },
    general: {
      agents: [
        { key: 'coordinator', name: 'Coordinator', type: 'autonomous', role: 'Understands the request and plans the work', instructions: 'Understand the request and route it to the right specialist.', model: 'anthropic/claude-sonnet', tools: [] },
        { key: 'specialist', name: 'Specialist', type: 'autonomous', role: 'Does the main task', instructions: 'Complete the task using the available tools.', model: 'anthropic/claude-sonnet', tools: ['web_search', 'http_request'] },
        { key: 'reviewer', name: 'Reviewer', type: 'workflow', role: 'Checks quality before replying', instructions: 'Check the answer for accuracy and tone.', model: 'anthropic/claude-haiku', tools: [] },
      ],
      edges: [{ from: 'coordinator', to: 'specialist', condition: '' }, { from: 'specialist', to: 'reviewer', condition: '' }],
      integrations: [],
    },
  }
  const g = structuredClone(graphs[family])
  if (wantsApproval && !g.agents.some((a) => a.type === 'human_approval')) {
    const last = g.agents[g.agents.length - 1]
    g.agents.push({ key: 'approval', name: 'Approval', type: 'human_approval', role: 'A person approves before anything is sent', instructions: 'Pause and request approval from an assigned teammate.', model: 'anthropic/claude-haiku', tools: [] })
    g.edges.push({ from: last.key, to: 'approval', condition: '', label: 'Review' })
  }
  return g
}

export function prdContent(projectName: string, prompt: string, answers: Record<string, string | string[]>, graph: GraphSpec) {
  const answerLines = Object.entries(answers)
    .map(([, v]) => (Array.isArray(v) ? v.join(', ') : v))
    .filter(Boolean)
    .map((v) => `- ${v}`)
    .join('\n')
  return {
    title: projectName,
    summary: prompt.length > 280 ? `${prompt.slice(0, 277)}…` : prompt,
    sections: [
      { key: 'overview', title: 'Overview', bodyMd: prompt },
      { key: 'users', title: 'Users', bodyMd: '- The team that operates the agents day to day\n- End users who receive the agents’ output\n- An owner who reviews quality in Agent Studio' },
      { key: 'goals', title: 'Goals', bodyMd: `- Automate the repetitive parts of this workflow\n- Keep a human in control of risky actions\n- Measure quality and cost per run in Agent Studio${answerLines ? `\n\n**Your answers**\n${answerLines}` : ''}` },
      { key: 'features', title: 'Features', bodyMd: graph.agents.map((a, i) => `${i + 1}. ${a.role}`).join('\n') },
      { key: 'agents', title: 'Agents', bodyMd: graph.agents.map((a) => `- **${a.name}** (${a.type.replace('_', ' ')}) — ${a.role}`).join('\n') },
      { key: 'integrations', title: 'Integrations', bodyMd: graph.integrations.length ? graph.integrations.map((i) => `- ${i.replace('_', ' ')}`).join('\n') : 'None required yet — add tools on the canvas.' },
      { key: 'data', title: 'Data', bodyMd: '- conversations(id, user_ref, status, created_at)\n- messages(conversation_id, role, content, agent_key)\n- feedback(message_id, value)' },
      { key: 'ui', title: 'UI', bodyMd: '- Chat console for the entry agent\n- Inbox listing recent conversations with status\n- Analytics page with volume, success rate and cost' },
    ],
  }
}

export function estimate(graph: GraphSpec) {
  const agentCost = graph.agents.reduce((s, a) => s + (a.type === 'autonomous' ? 4 : a.type === 'workflow' ? 3 : 2), 0)
  const integrationCost = graph.integrations.length * 3
  const base = 15
  const ui = 3 * 4
  const p50 = base + agentCost + integrationCost + ui
  return {
    credits: { p50, p90: Math.round(p50 * 1.35) },
    minutes: { p50: Math.max(2, Math.round(p50 / 12)) },
    breakdown: [
      { item: 'Project scaffold', credits: base },
      { item: `${graph.agents.length} agents`, credits: agentCost },
      { item: `${graph.integrations.length} integrations`, credits: integrationCost },
      { item: 'UI pages', credits: ui },
    ],
    missingIntegrations: graph.integrations,
  }
}
