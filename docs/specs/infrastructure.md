# Spec — Infrastructure, Services and CI/CD

Engineering doc §6.1, §6.3–6.5, §11 · Phase 1 (Phase 0 needs only Vercel/Node + Supabase)

## 1. Phase 0 runtime

| Component | Where | Config |
|---|---|---|
| Web app (Next.js) | Vercel project `architect-web` (or `npm run build && npm start` on any Node 20 host) | env from `.env.example` (Supabase + `MOCK_MODE=true`) |
| Database/Auth/Storage/Realtime | Supabase project | run `docs/specs/supabase-schema.sql` then `docs/specs/seed.sql` |

## 2. Phase 1 services

| Service | Runtime | Scaling | Responsibilities |
|---|---|---|---|
| `apps/web` | Vercel | serverless | UI, API route handlers, webhooks |
| `services/orchestrator` | Fly.io app `arch-orchestrator`, Node 20 | 2–20 machines, autoscale on Inngest queue depth | generation, builds, edits, visual edits, PTY gateway (WebSocket) |
| `services/git-service` | Fly `arch-git` | 2–10 | GitHub ops, webhook jobs |
| `services/deploy-service` | Fly `arch-deploy` | 2–10 | image builds, releases, domains, health checks |
| `services/import-service` | Fly `arch-import` | 1–5 | clone/extract, detection |
| `services/eval-runner` | Fly `arch-evals` | 1–10 | eval runs |
| `services/alert-evaluator` | Fly `arch-alerts` | 1 | cron every minute |
| LiteLLM | Fly `arch-llm` | 2 | model gateway |
| Nango | Fly `arch-nango` | 2 | OAuth broker |
| OTel collector | Fly `arch-otel` | 2 | receive OTLP from app runtimes → ClickHouse |
| ClickHouse | ClickHouse Cloud | managed | spans + rollups |
| Redis | Upstash | managed | rate limits, idempotency, token caches |
| Jobs | Inngest Cloud | managed | durable workflows (functions served from each service at `/api/inngest`) |

## 3. Jobs (Inngest functions)

| Event | Function | Concurrency key | Retries |
|---|---|---|---|
| `build/requested` | `build.run` | `projectId` (1) + workspace plan limit | 2 per step |
| `edit/requested` | `edit.run` | `projectId` (1) | 1 |
| `import/requested` | `import.scan` | `workspaceId` (3) | 2 |
| `git/pull.requested` | `git.pull` | `projectId` (1) | 3 |
| `git/commit.requested` | `git.commitPush` | `projectId` (1) | 3 |
| `deploy/requested` | `deploy.run` | `projectId+environment` (1) | 1 (steps 2) |
| `domain/verify` | `domain.verify` (scheduled 5 min × 48 h) | `domainId` | — |
| `eval/requested` | `eval.run` | `projectId` (2) | 1 |
| cron `*/10 * * * *` | `credits.releaseExpired` | — | 3 |
| cron `0 3 * * *` | `usage.reconcile`, `runs.createNextPartition`, `sandboxes.gc` | — | 3 |

## 4. Sandboxes (E2B)

Template `infra/e2b/Dockerfile`: Ubuntu 24.04, Node 20 + pnpm, Python 3.11 + uv, git, gitleaks, tree-sitter CLI, Architect runtime package preinstalled. Lifecycle per engineering doc §6.4: idle 10 min → pause (snapshot); destroy after 14 days inactive. Ports exposed: 3000 (web), 8000 (agent runtime) via `https://{sandboxId}-{port}.{PREVIEW_BASE_DOMAIN}` (E2B host mapping behind our wildcard CNAME).

## 5. Deployed apps

Fly org `FLY_ORG_SLUG`; app naming `arch-{projectShortId}-{env}`; wildcard cert `*.{APPS_BASE_DOMAIN}`; custom domains via Fly certificates API. Images built with Nixpacks in a build sandbox and pushed to `FLY_REGISTRY`.

## 6. Environments and CI/CD

| Env | Web | Supabase | Providers |
|---|---|---|---|
| local | `npm run dev` | Supabase CLI (`supabase start`) | mocks |
| preview (per PR) | Vercel preview | Supabase branch per PR | mocks + test keys |
| staging | `staging.architect.new` | staging project | real, test Stripe, GitHub test org |
| production | `architect.new` | prod project | real |

GitHub Actions `.github/workflows/ci.yml`: install → lint → typecheck → unit → pgTAP (`supabase test db`) → build → Playwright smoke (4 journeys) on Vercel preview. `nightly.yml`: full e2e + template builds + ZAP baseline. Migrations applied by `supabase db push` on merge to `main` (staging) and on release tag (production). Sentry release + source maps on deploy.

## 7. Acceptance criteria

- [ ] Fresh environment can be stood up from `.env.example` + schema + seed with documented steps.
- [ ] CI blocks merges on lint/type/unit/pgTAP/build/smoke failures.
- [ ] Sandboxes sleep after 10 min idle and wake in < 5 s P95.
