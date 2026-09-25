# Architect 2.0 — Security Plan

Status: implemented · Date: 2026-09-25 · Scope: `architect-web` (Next.js app + its Supabase project)

Inputs: `docs/engineering/engineering-doc.md`, `docs/specs/*` (esp. `security.md`, `api-conventions.md`, `conversation-memory.md`), a full code review, Supabase security/performance advisors run against the live project, and adversarial SQL tests against a local copy of the schema.

> The security-foundation checklist was written for a contract-analysis app. Each control below is mapped to Architect's equivalents (projects instead of contracts, project chat instead of chat sessions, prompt attachments and project imports instead of contract uploads). Deviations are called out explicitly.

---

## 1. Authentication and protected routes

| Control | Implementation |
|---|---|
| Supabase Auth (email + password, 6-digit OTP verification, password reset, Google/GitHub OAuth) | `features/auth/*`, `app/auth/callback/route.ts` |
| Server-side sign-in (cookies set by the server, HttpOnly) | `POST /api/auth/login` — Zod-validated, rate-limited per IP+email (10/min), generic error text (no account enumeration) |
| Server-side sign-out | `POST /api/auth/logout` (sidebar uses it); `/auth/signout` kept as a form-post fallback |
| Session verification on the server | `lib/security/authGuard.ts → requireAuth()` and `lib/api/handler.ts` use `auth.getUser()` (JWT verified with Supabase), never `getSession()` alone |
| Protected routes | `middleware.ts`: `/w/*` (dashboard, projects, settings, studio), `/onboarding`, `/preview/*` → `/login?next=…` when signed out; signed-in users on `/login`, `/signup`, `/verify` → `/app` (dashboard resolver) |
| Safe redirects | `safeNext()` only allows same-origin relative paths (blocks `//evil.com`, `/\\evil`) in middleware, callback and forms |

Route mapping vs. the checklist: `/dashboard` → `/w/{workspace}`, `/contracts` → `/w/{ws}/p/{project}`, `/chat` → project Build-mode chat, `/settings` + `/profile` → `/w/{ws}/settings`.

**Supabase dashboard — verify/enable (manual):**

- [ ] Authentication → Sign In / Providers → Email: *Confirm email* ON, OTP length 6.
- [ ] Authentication → Policies/Password: **Leaked password protection ON** (advisor warning `auth_leaked_password_protection`), minimum length 8.
- [ ] Authentication → Sessions: **Refresh token rotation ON**, reuse interval 10 s; consider inactivity timeout 7 days.
- [ ] Authentication → URL Configuration: Site URL and redirect allow-list contain only your app origins.
- [ ] Authentication → Rate limits: keep defaults or lower for email sends.

## 2. API request validation

Every route in `app/api/**` validates body, query and params with Zod before any business logic or database call:

- `lib/api/handler.ts → createHandler({ body, query, params })` rejects with **422 `VALIDATION_FAILED`** and `details.fieldErrors` (the spec's error envelope; equivalent to the checklist's `VALIDATION_ERROR`).
- Bodies > 1 MB → 413; invalid JSON → 422.
- Schemas live in `lib/contracts/*` and are re-exported from `lib/security/inputValidator.ts`.
- Non-GET requests with a foreign `Origin` are rejected (CSRF defence in addition to `SameSite=Lax` cookies).
- Exceptions (documented): `/api/auth/login` and `/api/auth/logout` run before a session exists (own Zod + origin + rate-limit checks); `/api/templates` is a public read of published templates.

## 3. Rate limiting

`lib/security/rateLimiter.ts` — sliding window over `rate_limit_events` using `createAdminClient()` (service role). The table has RLS enabled and **no** policies, and `anon`/`authenticated` privileges are revoked, so users cannot read or reset their counters (verified).

| Action | Endpoints | Limit |
|---|---|---|
| `auth` | `/api/auth/login`, `/api/onboarding`, `/api/invitations/*` | 10 / minute |
| `chat` | `POST /api/projects/{id}/chat` | 30 / minute |
| `generation` | clarify, PRD, agent graph | 30 / minute |
| `processing` | builds, deployments, demo project | 10 / hour |
| `upload` | `POST /api/uploads/sign` | 20 / day |
| `write` / `read` | all other routes | 120 / 600 per minute |

Exceeded → **429 `RATE_LIMITED`** with `Retry-After`. Anonymous subjects (login) use a SHA-256 of IP + email. Without `SUPABASE_SERVICE_ROLE_KEY` (local development) a per-process memory window is used and a warning is logged once — **set the key in production**.

Deviation: the checklist's "contract processing 5/hour" maps to `processing` at 10/hour because a single build → deploy cycle uses two calls.

## 4. Prompt-injection protection

`lib/security/promptInjectionGuard.ts`:

- `sanitizeForLLM(text)` runs on every user message **before** classification, persistence or any model call — chat (`chat-service.ts`) and generation prompts/answers (`generation-service.ts`). Blocked → **400 `PROMPT_INJECTION`**; the model is never called and nothing is saved.
- Detects: ignore/override instructions, reveal/print system prompt, expose env variables / API keys / credentials, database dumps, persona switches ("you are now an unrestricted AI", "pretend you are a different model"), jailbreak / DAN / developer mode, fake `<system>` / `[INST]` markers — including obfuscated forms (leetspeak, zero-width characters, spaced letters).
- Tuned for an agent builder: legitimate role descriptions ("act as a support agent", "show the instructions for the Responder agent") are **allowed** (unit-tested).
- `wrapUntrusted(tag, content)` wraps PRD text, agent instructions and project data sent to the model and neutralizes embedded closing tags, so instructions inside project content are treated as data.
- Internal prompts, environment variables and database contents are never included in model context; secrets are referenced by name only.

## 5. Token and usage limits

`lib/security/tokenLimiter.ts`:

| Limit | Value |
|---|---|
| Attachment size | 10 MB (bucket `project-attachments` set to 10 MB) |
| Import archive size | 200 MB (bucket `imports`; spec requirement for project imports) |
| PDF page count | 200 (`assertPdfPageCount`) |
| Chat message length | 5,000 characters (Zod + `assertMessageLength`) |
| Generation prompt length | 10,000 characters (PRD spec) |
| Chat history ever loaded for the model | `MAX_CHAT_HISTORY` env (default 100); memory windows are 10 / 20 turns |

## 6. Chat security

`lib/security/chatSecurity.ts`:

- `verifyProjectChatAccess(projectId, user, 'read'|'write')` — project must exist, not be deleted, and the caller must be a member; non-members get **404** (ids cannot be probed). Writing requires editor rights; archived projects are read-only.
- `verifyMessageOwnership()` for message edits/deletes.
- **Assistant messages are written only with the service role.** RLS lets users insert only rows with `role = 'user'` and `author_id = auth.uid()`, so nobody can forge assistant turns to poison conversation memory (verified). Without the service-role key, replies are returned but not persisted.
- History is loaded before the new message is saved (memory spec) and capped by `MAX_CHAT_HISTORY`.

## 7. File upload security

`lib/security/inputValidator.ts → validateFileUpload(meta, kind)` (shared by browser and server), order: **blocklist → allowlist → MIME → size**.

- Blocked everywhere (every extension segment is checked, so `report.pdf.exe` is blocked): `exe js mjs cjs php sh bat cmd py rb ps1 msi dll com scr jar vbs html htm svg`.
- Attachments allow: `pdf docx md txt csv png jpg jpeg webp`. Imports allow only `zip` (deviation: archives are required for project import; they are processed in an isolated sandbox with zip-slip and size checks per `docs/specs/import.md`).
- `sniffMatchesExtension()` verifies magic bytes server-side after upload.
- `POST /api/uploads/sign` validates, authorizes (editor of the project / workspace), generates the storage path server-side and returns a signed upload URL for a **private** bucket. Downloads use signed URLs with 1-hour expiry; public URLs are never returned for private data.
- The import wizard validates on selection and uploads through the signed URL.

## 8. Environment variables and secrets

- Browser-exposed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` only (scan of all client code confirmed).
- Server-only: `SUPABASE_SERVICE_ROLE_KEY` (read **only** in `lib/supabase/admin.ts → createAdminClient()`), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ARCHITECT_CHAT_MODEL`, all others in `.env.example` marked `SERVER ONLY`.
- `lib/supabase/service.ts` now re-exports `createAdminClient` (kept for compatibility).
- No secret values are logged; unknown errors are logged with a request id and returned as a generic 500.
- `.env*.local` is git-ignored.

## 9. Database hardening (`supabase/rls-policies.sql`, also appended to `database.sql`)

| # | Issue found | Fix | Verified |
|---|---|---|---|
| 1 | Workspace admins could `UPDATE workspaces SET plan/credits_balance/owner_id` (free credits, plan self-upgrade) | Column-level grants: only `name, code_mode_restricted, prod_deploy_role, training_opt_out` | ✅ denied |
| 2 | Users could change `profiles.email` and redeem an invitation meant for that address | `accept_invitation` now uses the **verified** email from `auth.users`; `profiles` email/onboarding columns not updatable | ✅ denied |
| 3 | Users could insert `role='assistant'` chat rows (memory poisoning) | Insert policy restricted to `role='user'`; assistant rows via service role | ✅ denied |
| 4 | Projects/agents/edges could be moved between projects/workspaces via `UPDATE` | Column grants exclude `workspace_id`, `project_id`, `created_by`, `source`, `key` | ✅ denied |
| 5 | Direct inserts into `workspace_members` / `workspaces` possible for some roles | Inserts revoked; only onboarding/workspace/invitation RPCs create them | ✅ denied |
| 6 | Trigger functions (`handle_new_user`, `touch_project`, …) callable via `/rest/v1/rpc` by anon and signed-in users (advisor 0028/0029) | `EXECUTE` revoked | ✅ denied |
| 7 | RLS helper functions executable by `anon`; `project_workspace_id()` revealed the workspace of any project id | Revoked from anon; helper now returns null for non-members | ✅ |
| 8 | Server-owned tables (usage, credits, deployments, runs, audit…) had client write grants (blocked by RLS but not least-privilege) | `INSERT/UPDATE/DELETE` revoked from `anon`/`authenticated` | ✅ |
| 9 | `rate_limit_events` missing | Created, RLS on, no policies, privileges revoked | ✅ |
| 10 | 8 policies re-evaluated `auth.uid()` per row (advisor 0003) | Rewritten with `(select auth.uid())` | ✅ |
| 11 | Overlapping permissive policies on `agent_tools`, `eval_cases` (advisor 0006) | Split into per-action policies | ✅ |
| 12 | 58 foreign keys without covering indexes (advisor 0001) | Indexes created automatically | ✅ |
| 13 | Attachment bucket allowed 20 MB | Set to 10 MB; buckets forced private | ✅ |

Regression check after hardening: profile/workspace rename, project rename, agent move/create, user chat messages and new-user onboarding all still succeed.

## 10. Application issues found and fixed

| Issue | Fix |
|---|---|
| Rate limiting was per-process memory only | Supabase sliding window (service role), per-action limits, `Retry-After` |
| Password sign-in happened in the browser | Server-side `/api/auth/login` with rate limiting and non-enumerating errors |
| Chat and generation prompts reached the model unchecked | `sanitizeForLLM` → 400 `PROMPT_INJECTION` before any processing |
| Chat messages up to 10,000 chars | 5,000-char limit (Zod + service) |
| Project data sent to the model without an untrusted-content boundary | `wrapUntrusted('project_context', …)` |
| Zip import accepted any file ≤ 200 MB by size only | Extension/MIME/size validation + signed private upload |
| `/preview/*` not protected by middleware (RLS still hid data) | Added to protected prefixes |
| Realtime channel reuse crashed the canvas in development | Unique channel topic per subscription |

Existing controls confirmed: CSP, `X-Frame-Options: DENY` (preview route `SAMEORIGIN` only), HSTS, `nosniff`, strict referrer policy, RLS on every table, 404 for invisible resources, error envelope without internals.

## 11. Tests

`npm test` — 59 passing:

- `lib/security/security.test.ts` (44): injection patterns blocked / legitimate prompts allowed, upload allow/block/MIME/size/magic bytes, message and PDF limits, authorization matrix.
- `lib/core/memory/memory.test.ts` (14) and `lib/core/services/chat-service.test.ts` (1): memory classification, windows, attribution, and history-before-save ordering.
- SQL attack suite (run against a local copy): 8 attacks denied, 6 normal operations succeed.

## 12. Outstanding items

1. **Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`/production** — enables the Supabase rate limiter and persistence of assistant chat messages.
2. Toggle the Supabase dashboard settings in §1 (leaked-password protection, refresh-token rotation).
3. `projects.status / preview_url / live_url` are still client-updatable (editors) because prototype builds/deploys run with the user session; move these writes to the service role when the real deploy service lands.
4. Schedule `select public.purge_rate_limit_events();` daily (pg_cron).
5. CSP includes `'unsafe-eval'`/`'unsafe-inline'` for the Monaco editor and Next.js dev runtime; move to nonces once Monaco is self-hosted.
6. Add CAPTCHA (Turnstile) on sign-up after repeated attempts per IP (spec `security.md`).
