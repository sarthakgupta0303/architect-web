/**
 * Conversation memory layer (docs/specs/conversation-memory.md).
 * Classify → retrieve → respond → attribute.
 */
export type ContextType = 'project' | 'history' | 'both'

export type ChatTurn = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; contextType: ContextType | null }

export type ProjectKnowledge = {
  name: string
  prd: { title: string; summary: string; sections: { key: string; title: string; bodyMd: string }[] } | null
  agents: { key: string; name: string; role: string | null; type: string; model: string | null; instructions: string | null; tools: string[]; isEntry: boolean }[]
  edges: { from: string; to: string; condition: string; label: string | null }[]
}

export type Classification = { type: ContextType; confidence: number; reason: string; signals: { history: string[]; project: string[] } }

export type Source =
  | { kind: 'prd'; ref: string; label: string }
  | { kind: 'agent'; ref: string; label: string }
  | { kind: 'conversation'; ref: string; label: string }

export type RetrievedContext = {
  type: ContextType
  systemPrompt: string
  history: ChatTurn[]
  project: ProjectKnowledge | null
}

export type AssistantReply = { content: string; sources: Source[] }

/** Retrieval window sizes (spec §2). */
export const WINDOW = { withProject: 10, historyOnly: 20 } as const
