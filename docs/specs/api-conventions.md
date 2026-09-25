# Spec — API Conventions

Applies to every route handler in `app/api/**` and every service in `packages/core` (in the single-app prototype: `lib/core`).

## 1. Transport

- REST over HTTPS, JSON bodies (`Content-Type: application/json`), UTF-8.
- Base path `/api`. Version header `Architect-Version: 2026-10-01` optional; absent = latest.
- Auth: Supabase session cookie (web) or `Authorization: Bearer arch_<token>` (CLI). Cookies are `HttpOnly; Secure; SameSite=Lax`.
- Streaming endpoints use Server-Sent Events: `Content-Type: text/event-stream`, events `event: <name>\ndata: <json>\n\n`, heartbeat comment every 15 s.
- IDs are UUID v4 strings. Timestamps ISO 8601 UTC. Money/credits are numbers with 2 decimals.
- JSON field names camelCase; DB snake_case. Mapping happens only in the service layer (`toProjectDto()` etc.).

## 2. Request pipeline

```
withRequestId → withAuth → withRateLimit → withValidation(schema) → withAuthorize(action, resolver) → handler → withErrorMapper
```

| Step | Behaviour |
|---|---|
| `withRequestId` | Reads `x-request-id` or generates UUID; echoed in response header and error body |
| `withAuth` | Resolves user from cookie or bearer token; 401 `UNAUTHENTICATED` if required and missing |
| `withRateLimit` | Upstash sliding window keyed by user id (fallback IP); limits in §6; 429 with `Retry-After` |
| `withValidation` | Parses body/query/params with Zod; 422 `VALIDATION_FAILED` with `details.fieldErrors` |
| `withAuthorize` | Loads membership for the target workspace/project, evaluates §4 matrix; 403 `FORBIDDEN` (404 `NOT_FOUND` when the resource is not visible at all, to avoid leaking existence) |
| `withErrorMapper` | Converts `AppError` and Postgres errors to envelope; unknown → 500 + Sentry |

Implementation: `lib/api/handler.ts` exports `createHandler({ auth, schema, action, resolve, handler })`.

## 3. Response and error envelope

Success: the resource or `{ items, nextCursor }`. Created → 201. Accepted async job → 202 `{ <id>, realtimeChannel }`. No content → 204.

Error:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Workspace name must be 1–60 characters", "details": { "fieldErrors": { "workspaceName": ["Too long"] } }, "requestId": "0b6c…" } }
```

| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No/invalid session |
| `FORBIDDEN` | 403 | Visible resource, insufficient role |
| `NOT_FOUND` | 404 | Missing or not visible |
| `CONFLICT` | 409 | State conflict (duplicate, wrong stage, running job) |
| `EXPIRED` | 410 | Expired token/invite/approval |
| `PRECONDITION_FAILED` | 412 | Deploy preflight blockers |
| `LOCKED` | 423 | Target locked |
| `VALIDATION_FAILED` | 422 | Schema/business validation |
| `INSUFFICIENT_CREDITS` | 402 | Reservation exceeds balance/cap |
| `PLAN_LIMIT` | 402 | Plan quota (projects, seats) |
| `TOO_LARGE` | 413 | Upload size |
| `RATE_LIMITED` | 429 | Rate limit |
| `UPSTREAM_ERROR` | 502 | LLM/GitHub/Fly/Stripe failure after retries |
| `SANDBOX_UNAVAILABLE` | 503 | Sandbox could not wake within 60 s |
| `INTERNAL` | 500 | Unexpected |

Postgres mapping: `23505` → CONFLICT, `23503`/`23514`/`22023` → VALIDATION_FAILED, `42501` → FORBIDDEN, `P0002` → NOT_FOUND, `28000` → UNAUTHENTICATED. RPC exceptions raised with a leading code word (`ALREADY_ONBOARDED`, `EXPIRED`, `VALIDATION_FAILED: …`) map by that word.

## 4. Authorization matrix

Roles rank `viewer < editor < admin < owner`. "developer" = owner/admin, or editor with `is_developer`, or any editor when the workspace is not `code_mode_restricted`.

| Action key | Minimum |
|---|---|
| `workspace:read` | viewer |
| `workspace:update`, `members:manage`, `invitations:manage`, `guardrails:write`, `alerts:write`, `domains:write`, `integrations:revoke`, `project:delete` | admin |
| `billing:manage`, `workspace:delete`, `spend:write` | owner |
| `project:read`, `comment:write` | viewer |
| `project:create`, `project:update`, `prompt:write`, `canvas:write`, `deploy:preview`, `evals:write`, `integrations:connect` | editor |
| `project:code`, `git:write`, `secrets:read`, `secrets:write`, `mcp:write`, `settings:runtime` | developer |
| `deploy:production`, `deploy:rollback` | role ≥ workspace `prod_deploy_role` (and developer if it is `editor` + restricted) |
| `approvals:decide` | admin, or user listed in `approvals.assigned_to` |

Enforced in `lib/authz.ts` (`can(membership, action, ctx)`), and independently by RLS in the database. Unit tests cover every cell.

## 5. Pagination, filtering, idempotency

- Cursor pagination: `?cursor=<opaque base64 of {createdAt,id}>&limit=20` (max 100) → `{ items, nextCursor|null }`, ordered newest first.
- Filters are query params validated by Zod enums; unknown params → 422.
- `Idempotency-Key` header (UUID) accepted on job-starting POSTs (builds, deployments, imports, evals, checkout, topup). Stored in Redis 24 h keyed `(userId, route, key)`; replay returns the original response.

## 6. Rate limits (per user)

| Route group | Limit |
|---|---|
| Auth-adjacent (`/onboarding`, `/invitations/*`, `/cli/*`) | 10 / min |
| Generation + edits + test runs | 30 / min; concurrent builds: Free 1, Pro 5, Team 10 |
| Writes (default) | 120 / min |
| Reads (default) | 600 / min |
| Webhooks | not limited; signature-verified |

## 7. Realtime channels (Supabase Realtime)

| Channel | Source | Events |
|---|---|---|
| `build:{buildId}` | broadcast from orchestrator + `build_events` postgres_changes | `step_started`, `step_done`, `log`, `file_written`, `test_result`, `autofix`, `error`, `done` |
| `deploy:{deploymentId}` | broadcast | `status`, `log`, `check` |
| `project:{projectId}` | presence + broadcast | presence `{userId,name,avatarUrl,mode,file?}`; `graph_updated`, `file_changed`, `checkpoint_created`, `git_synced`, `comment_created` |
| `user:{userId}` | postgres_changes on `notifications` | `notification` |

Broadcast payloads are Zod-typed in `lib/contracts/realtime.ts`.

## 8. Webhooks

`POST /api/webhooks/github` (HMAC SHA-256 `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`), `POST /api/webhooks/stripe` (Stripe signature with `STRIPE_WEBHOOK_SECRET`). Both: verify signature on the raw body, dedupe by delivery/event id in Redis (7 days), enqueue a job, respond 202/200 within 2 s.

## 9. Acceptance criteria

- [ ] Every handler is built with `createHandler`; lint rule forbids exporting raw `GET/POST` without it.
- [ ] Every error response matches the envelope and includes `requestId`.
- [ ] Authorization matrix has a unit test per cell; RLS has a pgTAP test per table.
- [ ] Rate-limited responses include `Retry-After`.
