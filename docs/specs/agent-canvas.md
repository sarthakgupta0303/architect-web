# Spec — Agent Canvas

PRD Flow 2 step 4, Flow 4 §9.3 · FR-06, FR-11, FR-15 · Engineering doc §4.3 (steps 4–5), §8.4 · **Phase 0: fully functional (persistence); code sync in Phase 1**

## 1. Scope

Visual editor for a project's agent graph: agents as nodes, hand-offs as edges, tools as chips; inspector to edit an agent; list view for keyboard/screen-reader users; persistence to `agents`, `agent_edges`, `agent_tools`; Realtime sync between collaborators; entry agent and locks.

## 2. Data model (see `supabase-schema.sql` §5–6)

```ts
// lib/contracts/agents.ts
export const AgentType = z.enum(['autonomous', 'workflow', 'human_approval', 'code'])
export const Framework = z.enum(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents'])
export const ModelId = z.enum([
  'anthropic/claude-sonnet', 'anthropic/claude-haiku', 'openai/gpt-5', 'openai/gpt-5-mini', 'google/gemini-pro', 'google/gemini-flash',
])
export const Memory = z.object({ mode: z.enum(['none', 'short', 'long']) })
export const Position = z.object({ x: z.number().finite(), y: z.number().finite() })

export const AgentDto = z.object({
  id: z.string().uuid(), key: z.string(), name: z.string(), role: z.string().nullable(),
  type: AgentType, framework: Framework.nullable(), model: ModelId.nullable(),
  instructions: z.string().nullable(), memory: Memory, position: Position,
  isEntry: z.boolean(), managed: z.boolean(), locked: z.boolean(), hasCustomCode: z.boolean(),
  tools: z.array(z.object({ id: z.string().uuid(), toolType: z.enum(['integration', 'mcp', 'builtin', 'code']), name: z.string() })),
})
export const EdgeDto = z.object({ id: z.string().uuid(), fromAgentId: z.string().uuid(), toAgentId: z.string().uuid(), condition: z.string(), label: z.string().nullable() })
export const AgentGraphDto = z.object({ agents: z.array(AgentDto), edges: z.array(EdgeDto) })

export const CreateAgentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: AgentType.default('autonomous'),
  role: z.string().trim().max(200).optional(),
  model: ModelId.optional(),
  instructions: z.string().max(20000).optional(),
  position: Position,
})
export const UpdateAgentSchema = z.object({
  name: z.string().trim().min(1).max(60), role: z.string().trim().max(200).nullable(),
  type: AgentType, framework: Framework.nullable(), model: ModelId.nullable(),
  instructions: z.string().max(20000).nullable(), memory: Memory, position: Position,
  isEntry: z.literal(true), locked: z.boolean(),
}).partial().refine(v => Object.keys(v).length > 0, 'No changes')
export const CreateEdgeSchema = z.object({
  fromAgentId: z.string().uuid(), toAgentId: z.string().uuid(),
  condition: z.string().trim().max(500).default(''), label: z.string().trim().max(80).optional(),
}).refine(v => v.fromAgentId !== v.toAgentId, { path: ['toAgentId'], message: 'An agent cannot hand off to itself' })
export const BuiltinTool = z.enum(['web_search', 'http_request', 'code_interpreter', 'knowledge_base'])
export const AddToolSchema = z.object({ toolType: z.literal('builtin'), name: BuiltinTool })
```

Agent `key` is derived server-side from `name`: lowercase, non-alphanumerics → `_`, must start with a letter (prefix `agent_`), max 40, de-duplicated with `_2`, `_3`.

## 3. API

| Method | Path | Action | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/projects/{id}/agents` | project:read | — | `AgentGraphDto` | 404 |
| POST | `/api/projects/{id}/agents` | canvas:write | `CreateAgentSchema` | 201 `{ agent }` | 422 |
| PATCH | `/api/projects/{id}/agents/{agentId}` | canvas:write | `UpdateAgentSchema` | `{ agent }` | 404, 422, 423 (locked, unless the only change is `locked:false` or `position`) |
| DELETE | `/api/projects/{id}/agents/{agentId}` | canvas:write | — | 204 | 404, 409 (entry agent while other agents exist — set another entry first), 423 |
| POST | `/api/projects/{id}/edges` | canvas:write | `CreateEdgeSchema` | 201 `{ edge }` | 409 duplicate, 422 |
| PATCH | `/api/projects/{id}/edges/{edgeId}` | canvas:write | `{ condition?, label? }` | `{ edge }` | 404 |
| DELETE | `/api/projects/{id}/edges/{edgeId}` | canvas:write | — | 204 | 404 |
| POST | `/api/projects/{id}/agents/{agentId}/tools` | canvas:write | `AddToolSchema` (Phase 0 builtin tools; integration/mcp in Phase 2) | 201 `{ tool }` | 409 duplicate |
| DELETE | `/api/projects/{id}/agents/{agentId}/tools/{toolId}` | canvas:write | — | 204 | 404 |

Setting `isEntry: true` runs in one transaction: clear `is_entry` on the project's other agents, then set it (`set_entry_agent(p_agent_id)` executed by the service with two updates inside a Postgres function or sequential updates guarded by the partial unique index).

## 4. UI

### 4.1 Canvas (`features/canvas/components/AgentCanvas.tsx`)

- React Flow (`@xyflow/react`) with custom node `AgentNode` and edge `HandoffEdge`; background dots `color = rgb(var(--color-border))`; controls (zoom in/out/fit) bottom-left; minimap hidden < 1440 px.
- Toolbar (top-left, `rounded-xl bg-surface border`): **Add agent** (menu: Autonomous, Workflow, Human approval), **Auto-layout** (elkjs layered, direction RIGHT, spacing 80/120), **List view** toggle, zoom %.
- Interactions: drag node → position saved on drag stop (debounced 400 ms, batched per node); connect handle-to-handle → create edge; select node → inspector opens; `Delete`/`Backspace` on selection → confirm dialog if agent has edges or tools; double-click empty canvas → add autonomous agent at pointer.
- Edge label shows condition (truncated 30 chars); click edge → popover to edit condition/label or delete.
- Empty graph state: centered EmptyState "No agents yet" with "Add your first agent" and "Generate from PRD" (disabled in Phase 0 with tooltip "Available after a PRD exists").
- Loading: skeleton of 3 node placeholders; error: ErrorState with retry.

### 4.2 AgentNode (design system §4.9)

240 px card: type icon + name; role (1 line, muted); model badge (mono caption) or "Default model"; up to 3 tool chips then "+n"; badges: entry (`Play`), locked (`Lock`), custom code (`Code2`, Phase 1); handles left (target) and right (source). Selected: `border-primary ring-2 ring-primary/30`. Keyboard: nodes focusable, `Enter` opens inspector.

### 4.3 AgentInspector (right drawer, 320 px)

Form (React Hook Form + `UpdateAgentSchema`), autosave on blur/debounce 600 ms with "Saved"/"Saving…" indicator:
- Name, Role, Type (segmented), Model (select), Instructions (textarea, 12 rows, char counter /20,000), Memory (segmented none/short/long).
- Tools: chips with remove; "+ Tool" menu of built-ins (Web search, HTTP request, Code interpreter, Knowledge base) and a disabled group "Integrations — connect in Integrations".
- Toggles: Entry agent (switch; cannot be turned off, only moved), Lock (prevents AI edits in later phases; in Phase 0 blocks field edits except unlock).
- Danger zone: Delete agent.
- Developer-only section (visible to developers): Framework override (select), Agent key (read-only, mono, copy button).

### 4.4 List view (`AgentListView`)

Table: Name, Type, Model, Tools count, Hand-offs to, Entry. Row actions: Edit (opens inspector), Delete. Same data/store as canvas. This is the accessible alternative to drag-and-drop.

### 4.5 State management

`canvasStore` (Zustand): `nodes`, `edges`, `selectedId`, `pending` map of optimistic ops. Server state via TanStack Query key `['graph', projectId]`; mutations update the cache optimistically and roll back on error with a toast. Realtime: subscribe to `postgres_changes` on `agents` and `agent_edges` filtered by `project_id` → invalidate `['graph', projectId]` when the change was made by another user (compare `updated_at`/local pending set).

## 5. Rules and edge cases

| Case | Behaviour |
|---|---|
| First agent created | DB trigger marks it entry |
| Deleting entry agent with others present | 409 with message "Choose another entry agent first" |
| Edge to agent in another project | DB trigger rejects → 422 |
| Duplicate edge (same from, to, condition) | 409 "These agents are already connected" |
| Cycles | Allowed (agents can hand back); auto-layout handles cycles |
| Locked agent edited | 423 "This agent is locked — unlock it to edit" |
| Concurrent edit of same agent | Last write wins; other client refreshes via Realtime and shows toast "Updated by Arjun" |
| Viewer role | Canvas read-only: no toolbar actions, inspector fields disabled |
| > 50 agents | Minimap forced on; auto-layout recommended banner |

## 6. Acceptance criteria

- [ ] Add, move, connect, edit, delete agents; everything persists across reload.
- [ ] Only one entry agent per project at any time; first agent is entry automatically.
- [ ] Inspector autosaves and shows Saving/Saved; validation errors show inline.
- [ ] List view supports full edit/delete without a mouse.
- [ ] Viewer sees a read-only canvas; a second editor sees changes within 2 s via Realtime.
- [ ] E2E `canvas.spec.ts` passes.
