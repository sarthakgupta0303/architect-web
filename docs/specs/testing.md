# Spec — Testing

Engineering doc §13 · Applies to all phases

## 1. Tooling

| Layer | Tool | Location |
|---|---|---|
| Unit (TS) | Vitest + `@testing-library/react` + MSW | `**/*.test.ts(x)` next to source |
| DB/RLS | pgTAP via `supabase test db` | `supabase/tests/*.test.sql` |
| API integration | Vitest against local Supabase (`supabase start`) | `tests/integration/*.test.ts` |
| E2E | Playwright (chromium, webkit, firefox) | `tests/e2e/*.spec.ts` |
| Accessibility | `@axe-core/playwright` | inside e2e specs |
| Python runtime | pytest + hypothesis | `runtime/tests/` |
| Load | k6 | `tests/load/*.js` |
| AI golden | custom runner `scripts/run-golden.ts` | `lib/prompts/golden/` |

## 2. Coverage targets

`lib/core` 85% lines · `lib/authz.ts` 100% of matrix cells · `features/*` 70% · `runtime/` 85% · every table with RLS has pgTAP tests.

## 3. Required suites per spec

| Spec | Required tests |
|---|---|
| auth-and-onboarding | `auth.spec.ts` (email sign-up with OTP via Supabase Inbucket locally, login, reset, protected redirect), `onboarding.spec.ts` (wizard, pending prompt → project), unit: `OnboardingSchema`, `safeNext()` |
| workspaces-and-projects | `projects.spec.ts` (create/rename/delete/undo, filters/search), integration: RLS isolation with two users, plan limit 402 |
| agent-canvas | `canvas.spec.ts` (add/connect/edit/delete, list view keyboard-only, viewer read-only), unit: key derivation, `UpdateAgentSchema`, optimistic rollback |
| api-conventions | unit: error mapper (each Postgres code), `createHandler` pipeline order, rate limit headers |
| generation-pipeline | unit: stage machine, estimator; e2e (mock mode): prompt → clarify → PRD → graph → build → preview |
| deploy | unit: preflight rules; e2e (mock): deploy + rollback |
| billing-and-credits | integration: 20 parallel reservations race; settle/release |
| security | e2e: security headers; unit: SSRF guard, secret redaction |
| framework-adapters | contract suite + property tests |

## 4. Fixtures

`tests/fixtures/users.ts` (priya: owner/build, arjun: editor/developer, vera: viewer), `supabase/seed.sql` for demo data, factories in `tests/factories.ts` (`makeProject`, `makeAgent`, `makeEdge`). E2E uses a unique email per run (`priya+{timestamp}@example.test`) and reads OTP from local Inbucket API.

## 5. Definition of done (per feature)

- [ ] Acceptance criteria in the feature spec automated where listed above.
- [ ] Loading/empty/error states covered by component tests.
- [ ] axe: zero serious/critical violations on new screens.
- [ ] CI green.
