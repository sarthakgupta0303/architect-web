# Spec — Framework Adapters, Agent Protocol and Canvas↔Code Sync

PRD Flow 4 (§9) · FR-14, FR-15, FR-16 · US-04 · Engineering doc §8.4, §8.5 · Phase 1

## 1. Neutral graph file

Every project repo root contains `agents.architect.json` (JSON Schema `https://architect.new/schemas/agent-graph.v1.json`), mirrored in DB tables:

```json
{
  "version": 1,
  "framework": "langgraph",
  "language": "python",
  "entry": "triage",
  "agents": [
    { "key": "triage", "name": "Triage", "type": "autonomous", "model": "anthropic/claude-sonnet",
      "instructionsFile": "agents/prompts/triage.md", "tools": ["zendesk.get_ticket", "builtin.web_search"],
      "memory": { "mode": "short" }, "guardrails": ["pii_redaction"], "managed": true, "framework": null }
  ],
  "edges": [ { "from": "triage", "to": "escalation", "condition": "sentiment < -0.5", "label": "Angry" } ]
}
```

And `architect.json` (runtime manifest): `{ "runtime": "python3.11", "startCommand": "uvicorn app.main:app --port 8000", "web": { "dir": "web", "startCommand": "pnpm dev --port 3000" }, "env": ["ZENDESK_TOKEN", "SLACK_BOT_TOKEN"] }`.

## 2. Managed regions

Generated code is wrapped:

```python
# <architect:managed id="agent:triage" hash="9f2c1a">
triage = create_react_agent(model=models["anthropic/claude-sonnet"], tools=[zendesk_get_ticket], prompt=load_prompt("triage"))
# </architect:managed>
```

(TS uses `// <architect:managed …>`.) `hash` = first 6 hex of sha256 of region body. Rules:
- Canvas change → adapter re-renders only regions whose inputs changed; if the file's region hash ≠ stored hash (hand-edited) → do not overwrite; mark agent `has_custom_code=true`, surface "Custom code — edit in Code mode" on the node.
- Code change inside a region → parser (tree-sitter) extracts config (model, tools, prompt file, edges) → `AgentGraphPatch` → DB; unparseable → keep DB unchanged and mark `has_custom_code`.
- Code outside regions is never touched by adapters.
- Round-trip budget: < 3 s.

## 3. Adapter interface (`runtime/architect_runtime/adapters/base.py`)

```python
class FrameworkAdapter(Protocol):
    name: Literal["lyzr_adk", "langgraph", "crewai", "openai_agents"]
    languages: tuple[str, ...]
    def scaffold(self, graph: AgentGraph, out_dir: Path) -> list[Path]: ...
    def render_agent(self, agent: AgentSpec, graph: AgentGraph) -> dict[Path, ManagedRegion]: ...
    def render_edges(self, graph: AgentGraph) -> dict[Path, ManagedRegion]: ...
    def parse(self, files: list[Path]) -> AgentGraphPatch: ...
    def detect(self, repo: Path) -> DetectionResult | None: ...
    def build_app(self, graph: AgentGraph) -> AgentApp: ...   # returns object exposing invoke/stream/resume
```

| Adapter | Mapping |
|---|---|
| Lyzr ADK | agent → `Agent(...)`; edges → manager agent routing rules; workflow agents → `Workflow` steps |
| LangGraph | agent → graph node (`create_react_agent` or function node for workflow); edges → `add_conditional_edges` with condition compiled to a router function; human_approval → `interrupt()` |
| CrewAI | agents → `Agent`; edges → sequential/hierarchical `Task` ordering; conditions → `ConditionalTask` |
| OpenAI Agents SDK | agent → `Agent`; edges → `handoffs=[...]`; guardrails → input/output guardrails |

Conditions language (shared): `<field> <op> <literal>` joined by `and`/`or`; fields from agent output schema (`sentiment`, `intent`, `confidence`, `amount`); ops `== != < <= > >= contains`. Parsed by `runtime/architect_runtime/conditions.py`; invalid condition → 422 at edge save.

## 4. Architect Agent Protocol (served by every generated app at `:8000`)

| Endpoint | Request | Response |
|---|---|---|
| `GET /health` | — | `{ "status": "ok", "graphHash": "…" }` |
| `POST /invoke` | `{ "input": string, "sessionId"?: string, "metadata"?: object }` | `{ "runId", "output", "status": "success"|"escalated"|"awaiting_approval"|"blocked" }` |
| `POST /stream` | same | SSE `token`, `step {agentKey, kind}`, `done {runId,status}` |
| `POST /resume/{runId}` | `{ "decision": "approve"|"reject", "payload"?: object }` | as `/invoke` |
| `GET /graph` | — | current `agents.architect.json` |
| `PUT /config` | `{ "guardrails"?: [...], "models"?: {agentKey: model}, "paused"?: [agentKey] }` (service JWT) | `{ "applied": true }` |

Auth: `/invoke`, `/stream`, `/resume` accept the app's public key or end-user session per app settings; `/config` requires a service JWT signed with `INGEST_JWT_SECRET` (`aud: runtime`). Every step emits OTel spans `agent.step`, `tool.call`, `llm.call` with attributes `architect.project_id`, `architect.agent_key`, `architect.run_id`.

## 5. Contract test suite

`runtime/tests/test_adapter_contract.py` parametrized over adapters with fixture graphs (single agent, router with 3 agents, human approval, cycle): scaffold → install → `/health` → `/invoke` returns → traces emitted → `parse(render(graph)) == graph` (property test with hypothesis) → hand-edited region preserved.

## 6. Acceptance criteria

- [ ] All four adapters pass the contract suite.
- [ ] Canvas→code and code→canvas round-trips < 3 s on the fixture project.
- [ ] Hand-written code outside regions is byte-identical after 100 random canvas edits (property test).
- [ ] A custom HTTP agent implementing the protocol can be added as a "Code agent" and traced in Studio.
