# Spec — Authentication and Onboarding

PRD Flow 1 · FR-01, FR-02 · Engineering doc §4.1, §6.2 · **Phase 0: fully functional**

## 1. Scope

Email + password sign-up with 6-digit OTP verification, Google OAuth, GitHub OAuth, sign-in, sign-out, forgot/reset password, session refresh middleware, route protection, 4-step onboarding wizard, pending-prompt handoff from the landing page, invitation acceptance.

## 2. Supabase configuration

| Setting | Value |
|---|---|
| Auth > Providers > Email | Enabled, "Confirm email" ON, OTP length 6, OTP expiry 3600 s |
| Email template "Confirm signup" | Contains `{{ .Token }}` (6-digit code) — not only the link |
| Auth > Providers > Google, GitHub | Enabled with client id/secret from `.env.example` |
| Auth > URL configuration | Site URL = `NEXT_PUBLIC_APP_URL`; redirect allow-list `${APP_URL}/auth/callback` |
| Password policy | Minimum 8 characters, at least one letter and one number (also validated client-side) |
| Database | `supabase-schema.sql` applied (creates `profiles` trigger + onboarding RPCs) |

## 3. Routes

| Route | Type | Access | Purpose |
|---|---|---|---|
| `/login` | page | signed-out (signed-in → redirect `next` or last workspace) | Email+password, OAuth buttons, link to signup/reset |
| `/signup` | page | signed-out | Name, email, password, OAuth buttons |
| `/verify?email=` | page | signed-out | 6-digit OTP input, resend (30 s cooldown) |
| `/reset` | page | signed-out | Request reset email |
| `/reset/update` | page | recovery session | Set new password |
| `/auth/callback` | route handler | public | Exchange `code` for session; redirect to safe `next` |
| `/auth/signout` | route handler (POST) | signed-in | Sign out, redirect `/` |
| `/onboarding` | page | signed-in and `profiles.onboarded_at is null` | Wizard |
| `/invite/[token]` | page | public | Show workspace name; accept after auth |

`next` param rules: must start with `/`, must not start with `//`, max 512 chars; otherwise ignored.

## 4. Middleware (`middleware.ts`)

1. Refresh Supabase session on every request (`@supabase/ssr` `updateSession`).
2. Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, image files, `/api/webhooks/*`.
3. Protected prefixes `/w`, `/onboarding`: unauthenticated → `302 /login?next=<path+search>`.
4. Auth pages (`/login`, `/signup`, `/verify`, `/reset`) when authenticated → `302 /`-resolver (`/app`).
5. `/app` route handler resolves home: not onboarded → `/onboarding`; else `/w/{last_workspace slug or first membership}`.
6. `/w/*` when not onboarded → `/onboarding` (checked in the `w/[ws]/layout.tsx` server component, not middleware, to avoid a DB call per request).

## 5. Flows

### 5.1 Sign up (email)

`SignupForm` (RHF + Zod: `fullName` 1–80, `email`, `password` policy) → `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: APP_URL + '/auth/callback' } })`.
- Success → `router.push('/verify?email=' + email)`; store `next` in `sessionStorage['auth_next']`.
- `User already registered` → field error on email with link "Log in instead".
- Trigger `handle_new_user` creates `profiles` row (email, full_name).

### 5.2 Verify OTP

`OtpInput` (6 boxes, paste support, auto-submit on 6th digit) → `supabase.auth.verifyOtp({ email, token, type: 'signup' })` → success → `/app` (or `auth_next`). Errors: invalid/expired → "That code didn't work. Check it or request a new one." Resend → `supabase.auth.resend({ type: 'signup', email })`, button disabled with countdown 30 s.

### 5.3 OAuth

`OAuthButtons` → `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: APP_URL + '/auth/callback?next=' + encoded } })`. Callback handler: `exchangeCodeForSession(code)`; on error redirect `/login?error=oauth`. GitHub scope: `read:user user:email` only (repo access comes from the GitHub App later).

### 5.4 Log in

`LoginForm` → `signInWithPassword`. Errors: `Invalid login credentials` → form-level error "Email or password is incorrect"; `Email not confirmed` → resend OTP + route to `/verify`. Success → `next` or `/app`. `profiles.last_seen_at` updated by `/app` resolver.

### 5.5 Reset password

`/reset` → `resetPasswordForEmail(email, { redirectTo: APP_URL + '/auth/callback?next=/reset/update' })` → always shows "If an account exists, we sent a link" (no enumeration). `/reset/update` → `updateUser({ password })` → toast + `/app`.

### 5.6 Sign out

POST `/auth/signout` → `supabase.auth.signOut()` → redirect `/`. Menu item in user menu.

### 5.7 Onboarding wizard (`/onboarding`)

Client component `OnboardingWizard` with Zustand store `onboardingStore` (persisted to `sessionStorage`). Progress indicator "Step n of 4". Back/Next; Next disabled until the step is valid.

| Step | UI | Field | Validation |
|---|---|---|---|
| 1 How do you build? | 3 large selectable cards: "I describe what I want" (build), "I write code" (code), "Both" (code + developer flag) | `defaultMode`, `isDeveloper` | required |
| 2 What are you building? | Chips: Customer support, Sales, Internal ops, Research, Content, Personal, Other | `useCase` | required, enum |
| 3 Workspace | Text input prefilled `"{firstName}'s workspace"`; optional invite emails (tag input, max 10) | `workspaceName`, `invites[]` | name 1–60; emails valid, unique |
| 4 Developer defaults (only if step 1 ≠ build; otherwise skipped) | Framework select (Lyzr ADK — recommended, LangGraph, CrewAI, OpenAI Agents SDK); language segmented (Python, TypeScript) | `preferredFramework`, `preferredLanguage` | enums |

Finish → `POST /api/onboarding`:

```ts
// lib/contracts/onboarding.ts
export const OnboardingSchema = z.object({
  defaultMode: z.enum(['build', 'code']),
  isDeveloper: z.boolean(),
  useCase: z.enum(['support', 'sales', 'ops', 'research', 'content', 'personal', 'other']),
  workspaceName: z.string().trim().min(1).max(60),
  invites: z.array(z.object({ email: z.string().email(), role: z.enum(['admin', 'editor', 'viewer']) })).max(10).default([]),
  preferredFramework: z.enum(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents']).default('lyzr_adk'),
  preferredLanguage: z.enum(['python', 'typescript']).default('python'),
})
```

Handler: calls RPC `complete_onboarding(p_default_mode, p_use_case, p_workspace_name, p_preferred_framework, p_preferred_language)` with the user's session client (RLS/definer). Then, if `isDeveloper` is false but mode is build, nothing else; invitations are inserted with the same session client (RLS policy `invitations_admin_all` allows the new owner) as rows with `token_hash = sha256(randomToken)`; email delivery arrives in Phase 2 (Resend) — in Phase 0 invitations are stored and listed as pending in workspace settings. Response `201 { workspaceId, workspaceSlug }`. Errors: `ALREADY_ONBOARDED` → 409 → client redirects to `/app`.

Post-finish routing: if `sessionStorage['pending_prompt']` (set by landing `HeroPrompt`) or `?prompt=` exists → `POST /api/projects { workspaceId, source: 'prompt', initialPrompt }` → `/w/{slug}/p/{id}/build`; clear the key. Else → `/w/{slug}`.

### 5.8 Invitations

`/invite/[token]`: server component looks up the invitation by `sha256(token)` via the service client when `SUPABASE_SERVICE_ROLE_KEY` is set (otherwise shows a generic "You've been invited to a workspace"), shows workspace name + inviter. Signed out → buttons to sign up/log in with `next=/invite/{token}`. Signed in → "Join workspace" → `POST /api/invitations/{token}/accept` → RPC `accept_invitation(token)` → redirect `/w/{slug}`. Errors: `EXPIRED` → "This invitation has expired — ask for a new one"; email mismatch → "This invite was sent to another email address".

## 6. API

| Method | Path | Auth | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/auth/callback` | none | query `code`, `next` | 302 | → `/login?error=oauth` |
| POST | `/auth/signout` | session | — | 302 `/` | — |
| GET | `/app` | session | — | 302 to onboarding or workspace | 302 `/login` |
| GET | `/api/me` | session | — | `{ user: { id, email }, profile: ProfileDto, workspaces: [{ id, slug, name, role, isDeveloper, plan }] }` | 401 |
| PATCH | `/api/me` | session | `{ fullName?, defaultMode?, theme? }` | `{ profile }` | 422 |
| POST | `/api/onboarding` | session | `OnboardingSchema` | 201 `{ workspaceId, workspaceSlug }` | 409, 422 |
| POST | `/api/invitations/{token}/accept` | session | — | `{ workspaceSlug }` | 404, 410, 403 |

## 7. UI states

- All forms: submit button `loading` state; inputs disabled while submitting; errors via `FieldError` and a form-level `Alert`.
- OAuth buttons show spinner on the clicked provider only.
- `/onboarding` server component: signed-in and already onboarded → redirect `/app`.
- Auth pages layout: centered card (`max-w-sm`), logo linking to `/`, footer link to terms.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| OAuth email equals an existing password account | Supabase links identities automatically when email is verified; otherwise login page shows "Sign in with your password, then connect Google in Settings" |
| User closes tab mid-onboarding | Wizard state restored from `sessionStorage`; server has no partial rows because onboarding is one RPC |
| Pending prompt > 10,000 chars | Truncated to 10,000 before storing |
| Invitee already a member | RPC `on conflict do nothing`; still redirects to workspace |
| Session expired while on a page | Next API call returns 401 → client redirects to `/login?next=current` |

## 9. Acceptance criteria

- [ ] New user can sign up with email, receive a 6-digit code, verify, onboard, and land on the dashboard with one workspace where they are owner.
- [ ] Google and GitHub buttons start OAuth and land in onboarding (first time) or dashboard (returning).
- [ ] Wrong password shows a single non-enumerating error; reset flow never reveals whether an email exists.
- [ ] `/w/*` and `/onboarding` redirect to `/login?next=…` when signed out; after login the user returns to `next`.
- [ ] Onboarding cannot be completed twice (409) and creates exactly one workspace, one owner membership, 30 credits.
- [ ] Landing-page prompt survives sign-up and creates the first project automatically.
- [ ] E2E `auth.spec.ts` and `onboarding.spec.ts` pass.
