# Spec — Security

Engineering doc §6.2, §8.12, NFR "Security"/"Privacy"/"Compliance" · Applies to all phases

## 1. Threat model (top risks → controls)

| Threat | Control | Where |
|---|---|---|
| Cross-tenant data access | RLS on every table (`supabase-schema.sql` §17) + `authorize()` matrix; 404 for invisible resources | DB + `lib/authz.ts` |
| Session theft | HttpOnly Secure SameSite=Lax cookies; 1 h access token; refresh rotation; sign out all devices | Supabase Auth |
| CSRF on route handlers | Same-site cookies + `Origin`/`Host` check on non-GET requests (`lib/api/csrf.ts`); JSON-only bodies | API |
| XSS | React escaping; no `dangerouslySetInnerHTML` except sanitized markdown (DOMPurify); CSP (§3) | Web |
| Preview iframe breakout | Previews on separate registrable domain (`PREVIEW_BASE_DOMAIN`), `sandbox` attribute, postMessage origin checks | Web + infra |
| Sandbox escape / abuse | Firecracker microVMs (E2B), 2 vCPU/4 GB caps, egress deny metadata IPs (169.254.169.254) and private ranges, per-user concurrency, idle sleep | Infra |
| Secret leakage | KMS envelope encryption; no plaintext in DB, logs, prompts, API responses; `list_secrets_masked()` function; secret scanning on import/deploy/LLM output | Secrets service |
| Prompt injection via repo/web content | User/repo content wrapped as data; tool allow-lists; destructive commands blocked; diff size caps | AI platform |
| Webhook spoofing | HMAC/Stripe signature on raw body; replay dedupe | API |
| Abuse / cost attacks | Rate limits (api-conventions §6), credit reservations, spend caps, CAPTCHA (Turnstile) on sign-up after 3 attempts/IP/hour | API |
| Supply chain | Lockfiles, Renovate, `pnpm audit`/`pip-audit` in CI, pinned base images | CI |
| Generated apps insecure | RLS generated for every app table; preflight security checks; default-deny CORS | Deploy |

## 2. Service role key usage

`SUPABASE_SERVICE_ROLE_KEY` is imported only from `lib/supabase/service.ts`, which is `import 'server-only'`. Allowed callers: webhooks, workers, invitation lookup, ingest, seeding. Never used in a code path that takes user input without a prior `authorize()` check. ESLint `no-restricted-imports` blocks importing it from `app/**/page.tsx` and client components.

## 3. HTTP headers (`next.config.mjs` `headers()`)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://avatars.githubusercontent.com https://lh3.googleusercontent.com; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.sentry.io; frame-src 'self' https://*.preview.architect.dev https://*.architect.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
X-Frame-Options: DENY
```

(`microphone=(self)` for voice agents test console.)

## 4. Input validation

Zod on every request (body, query, params, headers used); max body 1 MB except uploads (signed direct-to-storage); path params validated as UUID/slug; file paths normalized (code-mode spec §3); URLs restricted to https and not private IPs (SSRF guard `lib/security/url.ts` resolves DNS and rejects RFC1918/loopback/link-local) for MCP servers, webhooks, alert channels, http tool.

## 5. Audit logging

`audit_logs` (append-only) for: member/role changes, invitations, secret upsert/delete, deploy/rollback, guardrail/alert changes, GitHub connect/disconnect, API token create/revoke, billing changes, terminal commands (first 200 chars), ownership transfer. Retained 1 year (Enterprise export).

## 6. Privacy and compliance

Training opt-out default on; data retention settings per workspace (runs 30/90/365 days); deletion of workspace purges data within 30 days; SOC 2 Type II controls (access reviews, change management via PRs, encrypted backups); GDPR DSR endpoints `GET /api/me/export`, `DELETE /api/me` (Phase 2).

## 7. Acceptance criteria

- [ ] pgTAP: every table denies cross-workspace select/insert/update/delete.
- [ ] Automated test: no API response contains a value matching any stored secret.
- [ ] Security headers present on all routes (e2e check).
- [ ] SSRF guard rejects `http://169.254.169.254`, `http://localhost`, private IPs.
- [ ] ZAP baseline scan: zero high findings before GA.
