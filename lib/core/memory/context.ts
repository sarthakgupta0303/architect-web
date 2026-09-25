import { WINDOW, type ChatTurn, type ContextType, type ProjectKnowledge, type RetrievedContext } from './types'

/** System prompts matched to the context source (spec §3). */
export const SYSTEM_PROMPTS: Record<ContextType, string> = {
  project:
    'You are Architect’s build assistant. Answer only from the project context (the PRD and the agent graph) below. ' +
    'Cite every fact as [PRD: <section title>] or [Agent: <agent name>]. If the answer is not in the project, say so plainly.',
  history:
    'You are Architect’s build assistant. Answer only from the conversation so far. Do not use project documents or outside knowledge. ' +
    'If the conversation does not contain the answer, say so. End your answer with [From conversation].',
  both:
    'You are Architect’s build assistant. Answer using both the conversation so far and the project context (PRD and agent graph). ' +
    'Attribute each fact to its source: [From conversation], [PRD: <section title>] or [Agent: <agent name>].',
}

/**
 * Retrieval (spec §2):
 *   PROJECT → project context + last 10 turns
 *   HISTORY → conversation only, up to 20 turns (no project context)
 *   BOTH    → project context + last 10 turns
 * `history` must be the conversation as it was BEFORE the new user message was saved.
 */
export function retrieveContext(type: ContextType, history: ChatTurn[], project: ProjectKnowledge | null): RetrievedContext {
  const window = type === 'history' ? WINDOW.historyOnly : WINDOW.withProject
  return {
    type,
    systemPrompt: SYSTEM_PROMPTS[type],
    history: history.slice(-window),
    project: type === 'history' ? null : project,
  }
}

/** Serializes project knowledge for the model, with stable citation labels. */
export function renderProject(project: ProjectKnowledge): string {
  const nameByKey = new Map(project.agents.map((a) => [a.key, a.name]))
  const prd = project.prd
    ? [`# PRD — ${project.prd.title}`, project.prd.summary, ...project.prd.sections.map((s) => `## [PRD: ${s.title}]\n${s.bodyMd}`)].join('\n\n')
    : '# PRD\n(none yet)'
  const agents = project.agents.length
    ? project.agents.map((a) => `## [Agent: ${a.name}]${a.isEntry ? ' (entry)' : ''}\ntype: ${a.type}; model: ${a.model ?? 'default'}; tools: ${a.tools.join(', ') || 'none'}\nrole: ${a.role ?? '—'}\ninstructions: ${a.instructions ?? '—'}`).join('\n\n')
    : '(no agents yet)'
  const edges = project.edges.length
    ? project.edges.map((e) => `- ${nameByKey.get(e.from) ?? e.from} → ${nameByKey.get(e.to) ?? e.to}${e.condition ? ` when ${e.condition}` : ''}`).join('\n')
    : '(no hand-offs)'
  return `${prd}\n\n# Agents\n${agents}\n\n# Hand-offs\n${edges}`
}
