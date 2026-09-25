# Spec — Evaluations

PRD Flow 7 §12.3 · FR-25 · Engineering doc §8.9 · Phase 2

## 1. Model

`eval_sets` → `eval_cases` (input JSON `{ message: string, context?: object }`, expected JSON `{ contains?: string[], exact?: string, tool?: { name, args? }, schema?: JSONSchema, maxLatencyMs?, maxCost? }`, optional `rubric`) → `eval_runs` → `eval_results`.

## 2. Scorers

| Scorer | Pass rule |
|---|---|
| `exact_match` | normalized output (trim, lowercase, collapse spaces) equals `expected.exact` |
| `contains` | output includes every string in `expected.contains` (case-insensitive) |
| `json_schema_valid` | output parses as JSON and validates against `expected.schema` (Ajv) |
| `tool_call_match` | trace contains a `tool.call` span with `expected.tool.name` and args ⊇ `expected.tool.args` |
| `llm_judge` | `judge` task returns `{ score: 0–1, reason }` against `rubric`; pass ≥ 0.7 |
| `latency_under` | run latency ≤ `expected.maxLatencyMs` |
| `cost_under` | run cost ≤ `expected.maxCost` |

A case passes when all applicable scorers pass. Run score = passed / total × 100 (2 decimals).

## 3. API

| Method | Path | Action | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/projects/{id}/evals/sets` | project:read | — | `{ items: [{ id, name, casesCount, lastScore, lastRunAt }] }` | — |
| POST | `/api/projects/{id}/evals/sets` | evals:write | `{ name (1–80), csvPath?, generateFromPrd?: { count: 1–100 } }` | 201 `{ evalSet }` | 422 (CSV header must be `input,expected[,rubric]`, ≤ 1,000 rows) |
| GET | `/api/evals/sets/{setId}/cases` | project:read | `?cursor=` | `{ items, nextCursor }` | — |
| POST | `/api/evals/sets/{setId}/cases` | evals:write | `{ input, expected?, rubric?, sourceRunId? }` | 201 `{ case }` | 422 |
| DELETE | `/api/evals/cases/{caseId}` | evals:write | — | 204 | — |
| POST | `/api/projects/{id}/evals/runs` | evals:write | `{ evalSetId, environment: 'development'|'preview'|'production', commitSha? }` | 202 `{ evalRunId }` | 402 |
| GET | `/api/evals/runs/{runId}` | project:read | — | `{ run, results: [{ caseId, passed, scores, output, latencyMs, cost }], diffVsPrevious: { newlyFailing: caseId[], newlyPassing: caseId[] } }` | 404 |

Credits: generate cases 3; each case run = actual agent tokens + judge tokens.

## 4. Runner (`eval.run`)

Concurrency 5 cases per run; each case → `POST /invoke` on target environment (development = sandbox) with `metadata.eval=true` (excluded from Studio KPIs); collect trace; score; write result; Realtime progress on `project:{id}` event `eval_progress { runId, done, total }`.

## 5. UI

Evals tab: sets list (name, cases, last score with trend arrow, last run) · set detail: cases table (input preview, expectations summary, source) with Add case / Import CSV / Generate from PRD · Run button with environment select · run results: score header, pass/fail table with filters (All / Failing / Newly failing), row expands to output vs expected and scorer reasons · Gate setting card: threshold slider 0–100 and "Block production deploys below threshold" switch (settings:runtime).

## 6. Acceptance criteria

- [ ] Each scorer has unit tests with pass and fail fixtures.
- [ ] Runs show progress live and a diff vs the previous run.
- [ ] With the gate enabled, production deploy preflight fails when the latest score is below threshold.
- [ ] Studio "Add to eval set" creates a case with `source='from_run'`.
