# Spec — Mock Mode (Prototype)

PRD §17.3 · Engineering doc §6.2 "Mock mode", §7.11

## 1. Purpose

Let every PRD flow be clicked end to end before build/deploy/GitHub/LLM infrastructure exists, using the **same API contracts** as production so the UI never changes when mocks are replaced.

## 2. Switching

- `MOCK_MODE=true` (server) and `NEXT_PUBLIC_MOCK_MODE=true` (client badge).
- `lib/core/container.ts` exports `getServices()` returning either real or mock implementations of: `GenerationService`, `BuildService`, `ImportService`, `GitService`, `DeployService`, `StudioService`, `IntegrationService`, `BillingService`.
- Always real regardless of flag: auth, profiles, workspaces, members, invitations, projects, agents, edges, agent tools, PRDs (stored), checkpoints list.

## 3. Mock behaviours

| Service | Mock behaviour | Persistence |
|---|---|---|
| Generation | `clarify` returns 3 questions chosen by keyword (support/sales/research/default) after 800 ms; `prd` returns a templated PRD using the prompt and answers; `agentGraph` returns 3–4 agents per template family; `estimate` returns `{credits:{p50:45,p90:60}, minutes:{p50:4}}` | PRD → `prds`; graph → `agents`/`agent_edges` (real rows) |
| Build | Creates `builds` row, then emits `build_events` every 1.2 s for steps: `schema`, `agents`, `tools`, `ui`, `tests`, `preview`; finishes `succeeded` with `preview_url = '/demo/preview/support-copilot'` (static in-app page) | real rows (service role) or client-side simulation when no service key |
| Import | Returns canned report for a LangGraph repo after 2 s | in-memory |
| Git | Connect returns `{ owner: 'demo-org', name: slug }`; status `synced`; PR returns `#12` | in-memory |
| Deploy | Preflight: all pass except "Slack token missing" (warn); deploy transitions queued→building→releasing→live over 6 s; URL `https://{slug}.architect.app` | `deployments` row when service key available, else in-memory |
| Studio | Deterministic series from seeded PRNG (seed = projectId) for 30 days; 50 runs list with traces | computed |
| Integrations | Catalog of 12 providers; "Connect" flips status after 1 s | in-memory per session |
| Billing | Plans table; checkout returns `/w/{ws}/usage?upgraded=demo` | none |

Mock timing constants live in `lib/core/mocks/timing.ts`; fixtures in `lib/core/mocks/fixtures/*`.

## 4. UI signals

`DemoBadge` ("Demo data", `Badge` tone info, tooltip "This panel shows sample data in the prototype") appears in panel headers of mocked features. No other UI difference.

## 5. Acceptance criteria

- [ ] With `MOCK_MODE=true`, every screen in PRD §6–14 is reachable and completes its happy path.
- [ ] Switching a service to the real implementation requires no change in `features/*` code.
- [ ] Mocked panels show the Demo badge; real panels never do.
