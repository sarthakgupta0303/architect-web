# Spec — Conversation Memory Layer

Adapted from the ContractIQ memory design for Architect's Build-mode chat. The assistant can answer from the **project** (PRD + agent graph), from the **conversation**, or from **both**, and always says which.

## 1. Classification

| Type | Meaning | Examples |
|---|---|---|
| `project` | About the app being built: PRD, agents, hand-offs, tools, models, settings | "What does the Triage agent do?" · "Which integrations are in the PRD?" |
| `history` | About the conversation itself | "What did I ask earlier?" · "Summarize our chat" · "What was my first question?" |
| `both` | References the conversation **and** the app | "Apply what you suggested earlier to the Escalation agent" |

Classifier: `lib/core/memory/classifier.ts` (rule-based, deterministic, < 1 ms). When `ANTHROPIC_API_KEY` and `ARCHITECT_CHAT_MODEL` are set, `llmClassify` is used and the rules are the fallback. With no prior conversation, the result is always `project`.

## 2. Retrieval (`lib/core/memory/context.ts`)

| Type | Project context (PRD + agents + hand-offs) | Conversation window |
|---|---|---|
| `project` | yes | last 10 turns |
| `history` | **no** | up to 20 turns |
| `both` | yes | last 10 turns |

## 3. System prompts

| Type | Prompt rule |
|---|---|
| `project` | Answer only from the project. Cite `[PRD: <section>]` or `[Agent: <name>]`. |
| `history` | Answer only from the conversation. End with `[From conversation]`. |
| `both` | Answer from both. Attribute each fact to its source. |

Without a configured model, `composeAnswer` (`responder.ts`) builds a grounded answer from the same retrieved context and follows the same citation rules.

## 4. Attribution in the UI

Every assistant message stores `context_type`, `confidence` and `sources` (`[{ kind: 'prd'|'agent'|'conversation', ref, label }]`). `SourceAttribution` renders a badge (From project / From conversation / Project + conversation) with a tooltip explaining the window used, plus clickable citation chips that open the PRD or Agents tab.

## 5. Critical ordering (`lib/core/services/chat-service.ts → sendMessage`)

1. **Load history from the database first** (up to 20 turns).
2. Classify the new question against that history.
3. Save the user message (tagged with its classification).
4. Retrieve context and answer.
5. Save the assistant reply with sources.

Loading history after saving would put the new question inside "history" and bias the classifier toward `history`. `chat-service.test.ts` asserts the read happens before the insert.

## 6. Data

Table `chat_messages` — migration `docs/specs/migrations/002_chat_messages.sql` (also appended to `database.sql`). RLS: members read; editors insert rows authored by themselves; admins delete.

## 7. API

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/projects/{id}/chat` | — | `{ items: ChatMessageDto[], migrationRequired }` (latest 100, oldest first) |
| POST | `/api/projects/{id}/chat` | `{ content (1–10,000), mode: 'plan'|'build' }` | 201 `{ user, assistant, classification: { type, confidence, reason }, usedTurns }` |

## 8. Acceptance criteria

- [x] Classification examples in §1 pass (`memory.test.ts`).
- [x] Retrieval windows and project-context inclusion match §2.
- [x] HISTORY answers contain no project citations and end with `[From conversation]`.
- [x] History is read before the new message is written (`chat-service.test.ts`).
- [x] Every assistant message shows its source in the UI.
