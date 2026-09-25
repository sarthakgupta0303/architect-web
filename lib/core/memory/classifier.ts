import type { ChatTurn, Classification, ProjectKnowledge } from './types'

/**
 * Rule-based context classifier. Deterministic, fast (< 1 ms) and testable; the LLM
 * classifier (llm.ts) is used instead when a model is configured, with this as fallback.
 *
 * HISTORY  — the question is about the conversation itself
 * PROJECT  — the question is about the app (PRD, agents, hand-offs, tools, settings)
 * BOTH     — the question references the conversation AND the app
 */
const HISTORY_PATTERNS: [RegExp, string][] = [
  [/\b(earlier|previously|before)\b/i, 'earlier/before'],
  [/\b(you|u) (said|suggested|mentioned|told|recommended|proposed|replied|answered)\b/i, 'you said'],
  [/\b(i|we) (asked|said|mentioned|discussed|talked about|agreed|decided)\b/i, 'I/we asked'],
  [/\b(our|this|the) (chat|conversation|discussion|thread)\b/i, 'this conversation'],
  [/\b(last|previous|first|second|earlier) (message|question|answer|reply|request|thing)\b/i, 'last message'],
  [/\b(summari[sz]e|recap|remind me)\b/i, 'summarize/recap'],
  [/\bwhat (did|have) (i|we|you)\b/i, 'what did I/we/you'],
  [/\b(so far|up to now|until now)\b/i, 'so far'],
  [/\bas (discussed|mentioned|agreed)\b/i, 'as discussed'],
]

const PROJECT_PATTERNS: [RegExp, string][] = [
  [/\b(prd|requirements?|spec)\b/i, 'PRD'],
  [/\bagents?\b/i, 'agent'],
  [/\b(hand-?offs?|edges?|routes?|routing|flow)\b/i, 'hand-off'],
  [/\b(tools?|integrations?|slack|gmail|notion|zendesk|hubspot|drive)\b/i, 'tools'],
  [/\b(models?|instructions?|prompts?|memory)\b/i, 'model/instructions'],
  [/\b(deploy|preview|build|canvas|framework|langgraph|crewai|lyzr)\b/i, 'build/deploy'],
  [/\b(section|goals?|features?|users?|ui|data model|schema)\b/i, 'PRD section'],
  [/\b(app|project|workflow|pipeline)\b/i, 'app/project'],
]

const ACTION_ON_PROJECT = /\b(add|change|update|rename|remove|delete|connect|make|set|use|apply|implement)\b/i
const ANAPHORA = /\b(that|those|it|them|the same)\b/i

function projectNameSignals(message: string, project: ProjectKnowledge | null): string[] {
  if (!project) return []
  const m = message.toLowerCase()
  const hits = new Set<string>()
  for (const a of project.agents) if (a.name.length > 2 && m.includes(a.name.toLowerCase())) hits.add(`agent “${a.name}”`)
  for (const s of project.prd?.sections ?? []) if (s.title.length > 3 && m.includes(s.title.toLowerCase())) hits.add(`section “${s.title}”`)
  return [...hits]
}

export function classifyContext(message: string, history: ChatTurn[], project: ProjectKnowledge | null): Classification {
  const historyHits = HISTORY_PATTERNS.filter(([re]) => re.test(message)).map(([, l]) => l)
  const projectHits = [...PROJECT_PATTERNS.filter(([re]) => re.test(message)).map(([, l]) => l), ...projectNameSignals(message, project)]

  // A conversation that hasn't happened yet cannot be the source.
  if (history.length === 0) {
    return { type: 'project', confidence: historyHits.length ? 0.6 : 0.9, reason: 'No prior conversation — answering from the project.', signals: { history: historyHits, project: projectHits } }
  }

  // "Do what you suggested earlier for the Triage agent" → references both.
  const referencesEarlier = historyHits.length > 0 || (ANAPHORA.test(message) && ACTION_ON_PROJECT.test(message) && message.split(/\s+/).length <= 14)
  const h = historyHits.length + (referencesEarlier && historyHits.length === 0 ? 0.5 : 0)
  const p = projectHits.length

  if (h > 0 && p > 0) {
    return { type: 'both', confidence: Math.min(0.95, 0.6 + 0.1 * Math.min(h, p)), reason: 'Mentions the earlier conversation and the app.', signals: { history: historyHits, project: projectHits } }
  }
  if (h > 0) {
    return { type: 'history', confidence: Math.min(0.95, 0.65 + 0.1 * h), reason: 'Asks about the conversation itself.', signals: { history: historyHits, project: projectHits } }
  }
  return { type: 'project', confidence: p > 0 ? Math.min(0.95, 0.65 + 0.08 * p) : 0.55, reason: p > 0 ? 'Asks about the app.' : 'No conversation cues — defaulting to the app.', signals: { history: historyHits, project: projectHits } }
}
