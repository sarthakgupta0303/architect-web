# Architect 2.0

**An agentic app builder by Lyzr.** You describe an AI agent app in plain English. Architect asks a few clarifying questions, writes a PRD, designs the agent graph and shows the cost before building. Then it builds the app, gives you a live preview, and deploys it.

The same project works in two modes, and you can switch between them:
- **Build mode** is visual: chat, canvas and preview, for non-technical builders.
- **Code mode** is an editor and terminal, for developers.

This README has two parts:
1. **How to run it**: setup, environment variables, database and scripts.
2. **How it was built**: the whole journey from market research to a pushed GitHub repo, step by step.

---

## Contents

- [What's in the app](#whats-in-the-app)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Sign-in options](#sign-in-options)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [What's real vs. simulated](#whats-real-vs-simulated)
- [Security](#security)
- [Testing](#testing)
- [The build journey](#the-build-journey)
- [Troubleshooting](#troubleshooting)

---

## What's in the app

| Area | What you can do |
|---|---|
| **Landing page** | Value proposition, an animated walkthrough of a real use case (prompt → questions → PRD → agents → build → live preview → deploy), how it works, builders vs. developers, templates |
| **Authentication** | Email sign-up and log-in (server-side, rate-limited), password reset, email verification, Google and GitHub sign-in (once enabled in Supabase), invite links |
| **Onboarding** | Choose your mode and use case, name your workspace, invite teammates |
| **Dashboard** | Start from a prompt, an import (GitHub or zip) or a template; open the demo project; project grid with filters, search, rename, delete and undo; credits; getting-started checklist |
| **Builder: chat** | Clarifying questions, then PRD, agent graph, cost estimate and build, with a **live step-by-step timeline** of what the agent is doing. Afterwards the chat keeps project memory and every answer cites its source |
| **Builder: preview** | While building, the UI **assembles live** as files stream in. When done: a device-size preview, reload and open in a new tab |
| **Agents canvas** | Drag-and-drop agent graph (React Flow): add agents, connect hand-offs, inspector for instructions, model and tools, list view, real-time sync |
| **PRD** | Versioned PRD sections generated from your answers, editable |
| **Data** | Browse the app's real tables (agents, runs, chat history) with pagination, search and CSV export |
| **Evals** | Test cases (contains / does-not-contain / escalates / handled-by-agent), CSV import, runs with pass/fail and history, deploy gate |
| **Deploy** | Preflight checklist with Fix buttons, preview and production deploys with stage-by-stage logs, history, rollback, encrypted secrets, custom domains with DNS records, runtime settings |
| **Studio** | Per-project and workspace-wide production dashboards: runs, success rate, P95 latency, cost, escalations, top errors, run explorer |
| **GitHub** | Install flow, create or link a repo, branch and auto-commit settings, recent commits, pull and disconnect |
| **Code mode** | Monaco editor, file tree, terminal, diff and checkpoints |
| **Templates** | Eight official agent blueprints with category and framework filters, a preview and setup questions |
| **Integrations** | Catalog of 12 connectors (Gmail, Slack, Notion, Drive, GitHub, Jira, HubSpot, Salesforce, Zendesk, Stripe, Postgres, HTTP) with connect, manage and disconnect |
| **Settings** | Workspace name and permissions, members (invite, change roles, developer flag, remove, leave), usage and plan, profile and theme, danger zone |

---

## Tech stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript (strict)
- **Styling:** Tailwind CSS with RGB design tokens, Radix UI primitives, lucide icons, self-hosted Inter and JetBrains Mono
- **Data:** Supabase (Postgres, Auth, Realtime, Storage) through `@supabase/ssr`, with row-level security on every table
- **Client state:** TanStack Query, React Hook Form + Zod
- **UI libraries:** `@xyflow/react` (agent canvas), `@monaco-editor/react` (code mode), `recharts` (Studio), `cmdk` (command palette), `sonner` (toasts), `next-themes`
- **Tests:** Vitest

---

## Run it locally

**Prerequisites:** Node.js 18.17 or newer, npm, and a Supabase project.

```bash
# 1. Get the code
git clone https://github.com/sarthakgupta0303/architect-web.git
cd architect-web

# 2. Install
npm install

# 3. Configure environment (see the next section)
cp .env.example .env.local
open -e .env.local        # macOS; use any editor

# 4. Create the database: paste database.sql into Supabase → SQL Editor → Run

# 5. Start
npm run dev
```

Open **http://localhost:3000**.

If you switch branches or pull big changes and pages look stale, run `rm -rf .next` and start again.

---

## Environment variables

`.env.example` lists everything the full product will use. To run this prototype you only need these:

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Same page: publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Same page: `service_role` / secret key. **Server-only; never expose it.** Needed for instant email sign-up, deploys, GitHub linking, integrations, eval results and saved assistant chat replies |
| `SECRETS_ENCRYPTION_KEY` | ✅ | Generate with `openssl rand -base64 32`. Encrypts project secrets with AES-256-GCM |
| `MOCK_MODE` | recommended | `true`: simulates build infrastructure, deploy, GitHub and the terminal |
| `NEXT_PUBLIC_APP_URL` | recommended | `http://localhost:3000` |
| `ANTHROPIC_API_KEY` + `ARCHITECT_CHAT_MODEL` | optional | Makes the builder chat answer with a real model. Without them, a grounded rule-based responder is used |
| `MAX_CHAT_HISTORY` | optional | Maximum conversation turns loaded (default 100) |
| `AUTH_EMAIL_CONFIRMATION` | optional | Set to `required` to force email confirmation codes at sign-up |

`.env.local` is ignored by git (`.env*.local` in `.gitignore`). Never commit it.

---

## Database

Everything lives in **`database.sql`**, a single file you paste into the Supabase SQL Editor. It contains:
1. **Schema:** workspaces, members, invitations, projects, agents, edges, PRDs, chat, builds, deployments, secrets, domains, integrations, MCP, evals, runs, usage, audit logs and more.
2. **Seed:** the eight official templates.
3. **Migration 002:** `chat_messages` for conversation memory.
4. **Security hardening:** everything from `supabase/rls-policies.sql`.

The same pieces are also available separately:
- `docs/specs/supabase-schema.sql` and `docs/specs/seed.sql`: base schema and seed
- `docs/specs/migrations/002_chat_messages.sql`: conversation memory table
- `supabase/rls-policies.sql`: security hardening, safe to re-run

**Key design points**
- **Row-level security everywhere.** Membership helpers such as `is_workspace_member` and `is_project_member` are `security definer` functions.
- **Column-level grants.** Users can't grant themselves credits, change their plan, move projects between workspaces, or forge assistant messages.
- **Server-owned tables.** Deployments, secrets, runs, audit logs, usage and similar tables are written only by the server's service role, after an authorization check.
- **RPCs** handle workflows that need elevated rights: `complete_onboarding`, `create_workspace`, `accept_invitation` (checks the *verified* email) and `seed_demo_project`.

---

## Sign-in options

- **Email and password:** works out of the box. With `SUPABASE_SERVICE_ROLE_KEY` set, accounts are created and signed in immediately. Supabase's built-in email sender only delivers to members of your Supabase team, a few emails per hour, so confirmation emails wouldn't reach other addresses.
- **Google or GitHub:** the buttons show **"Not set up"** until you enable the provider:
  1. In Supabase, open **Authentication → Sign In / Providers**, then **Google** or **GitHub**, and enable it.
  2. Create an OAuth client in **Google Cloud Console** (APIs & Services → Credentials) or a **GitHub OAuth App** (Settings → Developer settings).
  3. Use this callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  4. Paste the client ID and secret into Supabase and save.
  5. In **Authentication → URL Configuration**, add `http://localhost:3000/**` to the redirect URLs.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |

---

## Project structure

```
app/                      Next.js routes (pages + /api route handlers)
  (auth)/                 login, signup, verify, reset
  onboarding/             first-run wizard
  w/[ws]/                 workspace: dashboard, templates, integrations, studio, settings
  w/[ws]/p/[projectId]/   project: build (chat · preview · agents · PRD · data · evals · deploy · studio · settings), code
  preview/[projectId]/    the generated app's test console
  invite/[token]/         accept an invitation
  api/                    62 route handlers (auth, projects, agents, generation, chat, builds, deployments, secrets, domains, evals, data, integrations, members, GitHub, …)
components/ui/            design-system primitives (Button, Dialog, Input, Badge, Card, Segmented, Chips, States…)
components/shared/        Logo, credits meter, page header, demo badge
components/layout/        providers, site header/footer
features/                 feature modules (landing, auth, onboarding, dashboard, generation, canvas, prd, project, studio, templates, integrations, settings, code, import, preview)
lib/api/                  createHandler pipeline, error envelope, typed client fetch
lib/authz.ts              role/permission matrix
lib/contracts/            Zod request/response contracts
lib/core/services/        server services (projects, agents, generation, chat, deploy, evals, data, integrations, members, GitHub, studio, templates)
lib/core/memory/          conversation memory layer (classifier, retrieval, responder, LLM)
lib/security/             auth guard, rate limiter, prompt-injection guard, token limits, upload validation, chat access
lib/supabase/             browser/server clients, admin (service role) client, env
supabase/rls-policies.sql security hardening
database.sql              one-shot schema + seed + migrations + hardening
docs/                     engineering doc, implementation specs, design system, security plan
```

---

## What's real vs. simulated

The prototype keeps anything that has no external dependency **real** and **simulates** the pieces that need paid infrastructure. Panels showing simulated data carry a **"Demo data"** badge.

| Real (persisted in Supabase) | Simulated (same API shape, ready to plug in) |
|---|---|
| Auth, workspaces, members, invitations, roles | Code build sandbox (E2B) |
| Projects, agents, edges, PRDs, templates | Container deploy runtime (Fly.io): deploy rows, logs and statuses are real, the hosting is not |
| Chat history and memory layer with source attribution | GitHub App install and git push (repo link is saved) |
| Deploy history, rollback, preflight, runtime settings | OAuth to third-party connectors (connection records are saved; no credentials are stored) |
| Encrypted secrets (AES-256-GCM) and custom domains | Import code scan |
| Evals: cases, runs and results; the deploy gate | Terminal and coding agent in Code mode |
| Data browser, Studio metrics from the `runs` table, usage | Billing (plans are shown, not charged) |

---

## Security

The full plan is in **`docs/security/security-plan.md`**. The main controls:

- **API pipeline:** every route passes through `createHandler`, which runs, in order: request ID, `getUser()` authentication, CSRF origin check, rate limit, Zod validation, then the handler, returning a uniform error envelope.
- **Authorization:** checked on every resource with `lib/authz.ts`. Resources you can't see return 404.
- **Rate limits** are stored in Supabase (a sliding window in `rate_limit_events`):

  | Tier | Limit |
  |---|---|
  | auth | 10/min |
  | chat | 30/min |
  | generation | 30/min |
  | processing | 10/hour |
  | upload | 20/day |
  | write | 120/min |
  | read | 600/min |

- **Prompt-injection guard** on everything sent to an LLM. Project content is wrapped as untrusted data.
- **Uploads** are checked in this order: blocklist, then allowlist, then MIME type, then size and magic bytes. They go to private buckets through signed upload URLs.
- **The service-role key** is read only in `lib/supabase/admin.ts`, which is server-only, and used only after an authorization check.
- **Security headers** are set in `next.config.mjs`: CSP, HSTS, X-Frame-Options, nosniff and a referrer policy.

---

## Testing

```bash
npm test          # 102 unit tests: security (rate limits, injection, uploads), memory layer, chat service, evals, deploy crypto
npm run typecheck
npm run build
```

An end-to-end crawl was also run against a local Supabase-compatible stack (Postgres + PostgREST + an auth gateway):
- It signed up through the UI, onboarded, and created demo, template and prompt projects.
- It visited **49 pages** and clicked **364 buttons**.
- It exercised invites, integrations, GitHub linking, chat, build, preflight, deploy, secrets, evals, data, Studio and usage.

Every 404 and crash it found has been fixed.

---

## The build journey

This is the full process this project went through, in order. Each stage produced an artifact that the next stage built on.

### 1. Market research
Competitive teardown of vibe-coding and coding-agent platforms (Lovable, Bolt, Replit, v0, Cursor, Windsurf, Claude Code, Devin, Lyzr Architect v1 and others). For each: every feature, its differentiators, why people use it, and its UI/UX flows. The result was a feature map and the gaps Architect 2.0 should own: *see the plan before you build*, one project for builders and developers, any agent framework, and production observability.

### 2. Product requirements (PRD)
An end-to-end PRD for **Architect 2.0**: an agentic app builder for technical and non-technical users (prompt → agentic app, import, any framework, GitHub, deploy). It keeps v1's features and focuses on UI/UX and flows. It covers personas, detailed flows (sign-up, prompt → PRD → agents → build, import, preview, deploy, GitHub, Studio, templates, integrations, collaboration), functional and non-functional requirements, and a phased roadmap.

### 3. Engineering document
The PRD became a high-level design in `docs/engineering/engineering-doc.md`, covering:
- architecture and tech stack
- core components and data flow
- APIs and database design
- integrations and security
- deployment, and an implementation roadmap

### 4. Frontend foundation
A new Next.js 14 + TypeScript + Tailwind project, with the Supabase client connected to the project at `cfkfoiizrlxmuykjjkni.supabase.co`, environment files and the folder conventions.

### 5. Implementation specs
Detailed specs in `docs/specs/*.md` for every area (auth, workspaces, generation pipeline, canvas, deploy, evals, Studio, GitHub, integrations, templates, security, mock mode, testing), plus the full `supabase-schema.sql`, `seed.sql`, `.env.example` and `docs/design-system.md`.

The design system uses a Lyzr-style purple (primary `#7B3FE4` dark / `#6D28D9` light), Inter + JetBrains Mono, and RGB tokens for dark and light themes.

### 6. Implementation
The application was built following the engineering doc, specs and design system:
- TypeScript throughout
- no TODOs or placeholders
- loading, empty and error states on every screen
- Zod validation and authorization on every route

The work covered:
- auth pages and the onboarding wizard
- workspace shell, dashboard and project workspace
- agent canvas, PRD panel and Studio
- preview app, Code mode and templates

### 7. Database
The schema, seed and later migrations were consolidated into a single `database.sql`, which you can paste into Supabase in one go.

### 8. Running locally
The app was brought up on `localhost:3000`. Along the way:
- **Supabase email settings** were configured.
- **Unzipping and moving the project:** the project was moved into the `Lyzr Project Work` folder.
- **zsh / npm path errors** were fixed.

### 9. Missing screens and dead buttons
- **First 404s:** the dashboard and project pages returned 404 after creating a workspace. Both were built.
- **Dead buttons:** every remaining dead button was wired up, including the Deploy, GitHub and Share dialogs, the Preview, Data, Evals, Deploy and Settings panels, the templates dialog and Code mode.

### 10. Conversation memory layer
A memory layer adapted from a contract-review reference to Architect projects:
- **Classify** each message as **PROJECT / HISTORY / BOTH**.
- **Retrieve** accordingly:
  - project context plus the last 10 turns
  - history only (up to 20 turns)
  - or both, plus 10 turns
- **Source-matched system prompts** for each context type.
- **Attribution chips** in the UI (`[PRD: …]`, `[Agent: …]`, `[From conversation]`).

History is loaded from the database *before* the new message is saved. Assistant replies are written server-side only.

### 11. Security foundation
A full security scan and fix, documented in `docs/security/security-plan.md`:
- column-level grants and server-owned tables
- invitation checks against the verified email
- revoked anonymous function access
- Supabase-backed rate limiting
- prompt-injection guard and token/size limits
- validated signed uploads
- server-side login
- a single service-role entry point
- FK indexes and policy performance fixes

The hardening was tested with an attack suite and applied to the live Supabase project.

### 12. Realtime fix
Fixed the error *"cannot add postgres_changes callbacks after subscribe()"* by giving each canvas channel a unique topic, which survives React strict-mode double effects.

### 13. Remaining 404s and full feature coverage
Built every page that still returned 404:
- **Templates:** gallery, preview and use.
- **Integrations:** catalog, connect, manage and disconnect.
- **Studio:** workspace-wide dashboard.
- **Settings:** general, members and invites, usage and plan, profile, danger zone.
- **Invite acceptance page.**

Then the eight required areas were audited (auth, homepage, chat, preview, agents, UI being built, GitHub, deploy) and gaps filled:
- live **"UI being built"** view in the preview
- persisted **GitHub** linking with commits
- mobile chat access

### 14. Homepage redesign
Rebuilt the landing page with the design system intact, informed by how Replit, Lovable and Lyzr present themselves but designed from first principles. It has a clear value proposition, an **animated GIF-style product demo** of a support-agent use case, how it works, builders vs. developers, templates and a final CTA.

### 15. Making features functional
Parallel sub-agents turned the demo panels into real, Supabase-backed features:
- **Evals** and **Data**
- **Deploy**: preflight, versions, logs, rollback, AES-256-GCM secrets, domains and runtime settings
- the **live agent-steps timeline** in the builder chat, showing what the agent is doing at each stage

### 16. End-to-end verification
A local Supabase-compatible stack was stood up to crawl every page and click every button (49 pages, 364 clicks). The crawl caught four bugs, which were fixed:
- a broken demo preview link
- a hydration warning in the preview panel
- the Free plan blocking a second deploy
- the Free plan blocking a fourth project

### 17. Sign-up fixes
Sign-up with email, Google and GitHub was failing:
- **Email** now goes through a server-side route that creates confirmed accounts, because Supabase's default mailer only emails team members.
- **Google and GitHub** buttons now detect whether the provider is enabled and explain how to enable it, instead of dropping you on a raw error page.

### 18. Git and GitHub
- Confirmed `.env.local` is ignored (`.env*.local` in `.gitignore`), was never committed, and no keys appear in the code.
- Staged and made the first commit, then renamed `master` to `main`.
- Connected the remote `github.com/sarthakgupta0303/architect-web`.
- Authenticated with a Personal Access Token, because GitHub doesn't accept account passwords for git.
- Merged the repo's existing README (`--allow-unrelated-histories`) and pushed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Page shows 404 after pulling new code | Stop the server, `rm -rf .next`, `npm run dev` |
| Can't create an account with email | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and restart |
| "Provider is not enabled" / **Not set up** on Google or GitHub | Enable the provider in Supabase (see [Sign-in options](#sign-in-options)) |
| Deploy says "Needs SUPABASE_SERVICE_ROLE_KEY / SECRETS_ENCRYPTION_KEY" | Add both to `.env.local` and restart |
| Chat replies disappear after refresh | Add `SUPABASE_SERVICE_ROLE_KEY`; assistant replies are saved server-side |
| `git push` asks for a password and fails | Use a Personal Access Token (github.com/settings/tokens, `repo` scope) as the password |
| `git push` rejected: "fetch first" | `git pull origin main --allow-unrelated-histories --no-rebase --no-edit`, then push |
| `zsh: command not found: brew` | Homebrew isn't installed. It's not needed; use a token for git |

---

Built with Claude (Cowork) for Lyzr.
