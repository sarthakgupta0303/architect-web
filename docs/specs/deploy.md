# Spec — Deploy, Environments, Secrets, Domains

PRD Flow 7 (§12) · FR-23, FR-24, FR-32, FR-34 · Engineering doc §4.8, §6.1 · Phase 1

## 1. Environments

| Environment | Created | URL | Source |
|---|---|---|---|
| development | first build | sandbox preview `https://{sandboxId}-3000.{PREVIEW_BASE_DOMAIN}` | working branch |
| preview | per PR / manual | `https://{slug}-pr-{n}.{APPS_BASE_DOMAIN}` or `https://{slug}-preview.{APPS_BASE_DOMAIN}` | branch/commit |
| production | "Publish" | `https://{slug}.{APPS_BASE_DOMAIN}` + custom domains | default branch commit |

Slug = project name slugified, unique across platform (suffix 4 hex on collision), stored in `projects` via `live_url`.

## 2. Preflight

`POST /api/projects/{id}/deployments/preflight { environment }` → `{ checks: Check[], canDeploy }`, `Check = { key, status: 'pass'|'warn'|'fail', message, fixAction?: { type: 'open_secrets'|'open_evals'|'run_build'|'open_security', label } }`:

| Key | Fails when | Blocking |
|---|---|---|
| `build` | last build for the commit failed or none | yes |
| `secrets` | any `project_env_vars.required` missing for the environment | yes |
| `evals` | `eval_gate_threshold` set and last run score < threshold (production + `block_prod_on_eval_fail`) | yes (prod) / warn |
| `security_secrets_in_code` | secret scanner finds live credentials in repo | yes |
| `security_rls` | app DB tables without RLS | yes (prod) / warn |
| `integrations` | agent tool references a disconnected integration | warn |
| `plan` | Free plan and already 1 production app | yes (`PLAN_LIMIT`) |

## 3. Deploy job (`deploy.run`)

1. Resolve commit (`commitSha` or head of branch); create `deployments` row version = max+1 (`queued`).
2. **Build image** (`building`): Nixpacks inside a build sandbox using `architect.json`; image tagged `{FLY_REGISTRY}/{app}:{version}-{sha7}`; logs streamed to `deployment_events`.
3. **Release** (`releasing`): Fly Machines API — app `arch-{projectShortId}-{env}`; machines with env vars (decrypted secrets for the environment, `ARCHITECT_*` runtime vars), region from `project_settings.region`, min/max instances, `timeout_s`; services: web `:3000` (HTTP), agent runtime `:8000` internal.
4. **Health check**: `GET /health` on runtime and `GET /` on web, 3 consecutive 200s within 120 s.
5. **Promote**: previous `live` → `superseded`; this → `live`, `live_at=now()`; update `projects.live_url`, `status='live'`; route custom domains.
6. **Failure** at any step → `failed`; if a previous live exists it stays live (health-check failure after cutover → automatic rollback: re-point to previous image, mark this `rolled_back`, notify deployer).

Concurrency: one active deploy per (project, environment) — enforced by Inngest concurrency key and 409 `DEPLOY_RUNNING`.

## 4. API

| Method | Path | Action | Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/projects/{id}/deployments/preflight` | deploy:preview | `{ environment }` | checks | — |
| POST | `/api/projects/{id}/deployments` | deploy:preview / deploy:production | `{ environment: 'preview'|'production', commitSha?: string(40) }` | 202 `{ deploymentId, realtimeChannel }` | 409, 412, 402 |
| GET | `/api/projects/{id}/deployments` | project:read | `?environment=&cursor=` | `{ items: DeploymentDto[], nextCursor }` | — |
| GET | `/api/deployments/{id}` | project:read | — | `{ deployment, events }` | 404 |
| POST | `/api/deployments/{id}/rollback` | deploy:rollback | — | 202 `{ deploymentId }` | 409 (never live) |
| GET | `/api/deployments/{id}/logs` | project:code | `?since=&q=` SSE | log lines `{ ts, level, source: 'web'|'runtime', message }` | — |
| GET/POST | `/api/projects/{id}/domains` | project:read / domains:write | `{ hostname, environment }` | `{ domain, dnsRecords: [{ type: 'CNAME'|'TXT', name, value }] }` | 409, 422 |
| POST | `/api/domains/{id}/verify` | domains:write | — | `{ domain }` | — |
| DELETE | `/api/domains/{id}` | domains:write | — | 204 | — |
| GET | `/api/projects/{id}/secrets` | secrets:read | `?environment=` | `{ items: [{ name, environment, last4, updatedAt, updatedBy }] }` | — |
| PUT | `/api/projects/{id}/secrets` | secrets:write | `{ environment, name (^[A-Z][A-Z0-9_]{0,63}$), value (1–32768 chars) }` | `{ name, last4 }` | 422 |
| DELETE | `/api/projects/{id}/secrets/{name}` | secrets:write | `?environment=` | 204 | 404 |
| PATCH | `/api/projects/{id}/settings` | settings:runtime | `{ evalGateThreshold?, blockProdOnEvalFail?, region? ('iad'|'sjc'|'fra'|'bom'|'sin'), minInstances? 0–10, maxInstances? 1–20 (plan cap), timeoutS? 5–900, cronTriggers?: [{ cron, agentKey, input }] ≤ 10 }` | `{ settings }` | 402, 422 |

`DeploymentDto = { id, environment, version, status, source, commitSha, url, createdAt, liveAt, createdBy: { id, name } }`.

## 5. Secrets

Envelope encryption: `KMS.GenerateDataKey` per workspace (cached encrypted DEK in `workspaces` metadata table `workspace_keys` in Phase 1 migration), AES-256-GCM with random 12-byte IV; `ciphertext = iv || tag || data`; `last4` stored for display. Plaintext exists only in memory of the API/deploy worker. Every write → `audit_logs(action='secret.upsert'|'secret.delete', target={name, environment})`.

## 6. Domains

Add → TXT `_architect-verify.{hostname}` = `verification_token` and CNAME `{hostname}` → `{slug}.{APPS_BASE_DOMAIN}` (apex: A/AAAA to Fly anycast IPs). Verifier job every 5 min for 48 h; on verify → Fly certificate request → `active` when issued; `cert_expires_at` tracked; error states shown with DNS diagnostics.

## 7. Generated-app database (FR-32)

Default: one Supabase project per workspace ("apps" org) with one Postgres schema per app (`app_{projectShortId}`), created via Management API; app receives a scoped Postgres role and a Supabase anon key restricted by RLS policies generated with the schema (every table gets `enable row level security` + owner-based policies). End-user auth uses the same Supabase project's Auth with per-app JWT audience. (ADR-003 may switch to project-per-app for Enterprise.)

## 8. UI

- `DeployButton` (top bar) → `DeployModal`: Preflight checklist (pass/warn/fail rows with Fix buttons) → target (Preview / Production; production disabled if role insufficient) → "Publish" → progress (Building → Releasing → Checking health) with live log toggle (Code mode) → success: URL with copy, QR code, "Open", "View in Studio"; failure: reason + "View logs" + "Try again".
- Deploy tab: environment cards (status, URL, version, last deploy), history table (version, commit, author, time, status, duration, Rollback), Domains panel, Secrets panel (masked values, reveal is not possible — only replace), Runtime settings form.

## 9. Acceptance criteria

- [ ] Preflight blocks on missing required secrets and failed builds; Fix buttons navigate to the right place.
- [ ] Deploy reaches live URL < 3 min P50 for templates; failures keep the previous version live.
- [ ] Rollback restores the previous image in < 60 s.
- [ ] Custom domain gets SSL within 10 min of correct DNS.
- [ ] Secrets are never returned in plaintext by any API or log.
