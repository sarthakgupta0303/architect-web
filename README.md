# Architect 2.0 · AgentMint

> Describe an AI agent app in plain English. Architect plans it, builds it and puts it online.

**Live demo:** https://agentmint.netlify.app

---

## The problem

Building an AI agent app is still hard:

- **Non-technical people** have ideas, but can't turn them into working apps.
- **Developers** can build them, but spend days on setup, wiring and deployment.
- **Today's AI builders** jump straight to code. You can't see the plan, the agents or the cost until it's too late to change course.
- **After launch**, most tools leave you blind. You can't tell whether the agents are working, what they cost, or where they fail.

## The solution

Architect 2.0 is an AI agent app builder that works for both non-technical builders and developers.

1. **Describe it.** "A support assistant for my online store that hands refunds to a human."
2. **Answer a few questions.** Architect asks only what it needs.
3. **Review the plan first.** You see a written plan (PRD), the agents and how they hand work to each other, and a cost estimate *before* anything is built.
4. **Watch it build.** Every step shows up live in the side panel.
5. **Test it.** Chat with your app in a preview and run automated checks.
6. **Publish it.** A pre-launch checklist runs, then it goes live with one click. Rolling back is one click too.
7. **Watch how it performs.** See usage, success rate, speed and cost in one dashboard.

## Who it's for

| Person | What they get |
|---|---|
| **Builder** (founder, PM, ops lead) | A visual **Build mode**: chat, drag-and-drop agents, one-click publish. No code. |
| **Developer** | A **Code mode** on the same project: editor, terminal, GitHub sync, any agent framework. |
| **Team** | Shared workspaces with roles (viewer, editor, admin) and invites. |

---

## Key features

| Area | What you can do |
|---|---|
| **Sign up** | Email (any address) or GitHub. Straight into a short onboarding. |
| **Start** | From a sentence, a ready-made template, or by importing code. |
| **Plan** | Clarifying questions, an editable PRD, an agent graph and a cost estimate. |
| **Build** | A live step-by-step timeline of what the agent is doing, plus the UI assembling in the preview. |
| **Agents** | A visual board to add agents, connect hand-offs and edit instructions and tools. |
| **Chat memory** | The assistant remembers your project and the conversation, and shows where each answer came from. |
| **Test** | Preview on desktop, tablet and phone; evals (simple pass/fail checks); a data viewer. |
| **Deploy** | Pre-launch checklist, version history, rollback, encrypted secrets, custom domains. |
| **Monitor** | Studio dashboards: runs, success rate, speed, cost and top errors. |
| **Connect** | GitHub sync, and integrations like Slack, Gmail, Notion, HubSpot and Stripe. |
| **Team** | Invites, roles, a developer permission, usage and plan. |

---

## How it was built: spec-driven development

The project was built **spec-first**: every line of code traces back to a written document, and each stage's output became the next stage's input. This kept the build consistent, reviewable and easy to hand off.

```
Market research → PRD → Engineering doc → Frontend setup → Implementation specs
       → Security foundation → Build → Test → Deploy → Iterate
```

| # | Stage | What I did | Output |
|---|---|---|---|
| 1 | **Market research** | Studied Lovable, Bolt, Replit, v0, Cursor and the original Architect: features, why people use them, and their screen flows. Found the gaps: no plan-before-build, separate tools for coders and non-coders, no view after launch. | Competitive teardown |
| 2 | **Product requirements (PRD)** | Defined users, goals, every flow (sign-up → prompt → plan → build → preview → deploy → monitor), functional and non-functional requirements, and a phased roadmap. | PRD |
| 3 | **Engineering plan** | Turned the PRD into a technical design: architecture, stack, data model, APIs, integrations, security and deployment. | `docs/engineering/engineering-doc.md` |
| 4 | **Frontend setup** | Started the Next.js + TypeScript + Tailwind project and connected Supabase. | Project skeleton |
| 5 | **Implementation specs** | Wrote one spec per feature (auth, generation, canvas, deploy, evals, Studio, GitHub and more), the full database schema, and a design system. | `docs/specs/`, `docs/design-system.md` |
| 6 | **Security foundation** | Set the security rules *before* feature work: database access rules, rate limits, AI prompt-safety checks, upload checks, and a single, protected entry point for the server's admin key. | `docs/security/security-plan.md` |
| 7 | **Build** | Implemented every screen strictly from the specs: loading, empty and error states everywhere, and input validation on every action. | The app |
| 8 | **Test** | 102 unit tests, plus an automated browser run that visited 49 pages and clicked 364 buttons. Every broken page it found was fixed. | Test suite |
| 9 | **Deploy** | Pushed to GitHub, deployed on Netlify, and set up sign-in with email and GitHub. | Live site |
| 10 | **Iterate** | Acted on feedback: redesigned the homepage with an animated demo, added the live build timeline, fixed sign-up and layout issues, and removed third-party branding. | Current version |

The full story is in [How this project was built](docs/BUILD_JOURNEY.md).

---

## Product decisions and trade-offs

- **Show the plan before building.** Users review the PRD, agents and cost first, so there are no surprise bills and less rework.
- **One project, two modes.** Builders and developers work on the *same* project, so there's no hand-off step.
- **Prototype with honest limits.** Anything that needs paid infrastructure is simulated and clearly labelled **Demo data**. Everything else is real.
- **Security from day one.** Security came before features, not after.
- **Low-friction sign-up.** Email or GitHub only, and no confirmation email is needed.

### What's real vs. simulated

| ✅ Real (saved in the database) | 🧪 Simulated (clearly labelled) |
|---|---|
| Accounts, workspaces, roles, invites | The servers your published apps run on |
| Projects, agents, plans (PRDs), templates | Pushing code to GitHub |
| Chat history and memory | Sign-in to third-party tools (Slack, Gmail…) |
| Deploy history, rollback, secrets, domains | Terminal in Code mode |
| Evals, data viewer, Studio metrics | Payments |

---

## Getting started

**You'll need:** Node.js 18 or newer, and a free [Supabase](https://supabase.com) project.

```bash
git clone https://github.com/sarthakgupta0303/architect-web.git
cd architect-web
npm install
cp .env.example .env.local
```

1. **Database:** in Supabase, open the **SQL Editor**, paste in the contents of `database.sql`, and click **Run**.
2. **Settings:** fill in `.env.local`:

   | Name | Where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (keep private) |
   | `SECRETS_ENCRYPTION_KEY` | Run `openssl rand -base64 32` |
   | `MOCK_MODE` | `true` |

3. **Run:** `npm run dev`, then open http://localhost:3000.

> 🔒 Never commit `.env.local`. It's already in `.gitignore`.

**Optional: GitHub sign-in.** Create a GitHub OAuth app, then in Supabase go to **Authentication → Sign In / Providers → GitHub** and paste in its Client ID and secret.

---

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 14, React, TypeScript |
| Design | Tailwind CSS, Radix UI, a custom design system (light and dark) |
| Data and auth | Supabase (Postgres, Auth, Realtime, Storage) |
| UI libraries | React Flow (agent board), Monaco (code editor), Recharts (dashboards) |
| Testing | Vitest, plus an automated browser crawl |
| Hosting | Netlify |

## Project structure

```
app/          Pages and API routes
features/     Screens for each feature (builder, deploy, templates, settings…)
components/   Shared UI building blocks
lib/          Business logic, security and database helpers
docs/         Research, PRD, engineering doc, specs, design system, security plan
database.sql  One-file database setup
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm run build` | Production build |
| `npm test` | Run the tests |

---

## Roadmap

- Connect real hosting for published apps
- Real GitHub push and pull requests
- Real sign-in to third-party tools (Slack, Gmail, HubSpot…)
- Billing and credit top-ups
- Live collaboration and comments

## Documentation

- [How this project was built](docs/BUILD_JOURNEY.md)
- [Engineering document](docs/engineering/engineering-doc.md)
- [Feature specs](docs/specs/)
- [Design system](docs/design-system.md)
- [Security plan](docs/security/security-plan.md)

---

**Author:** Sarthak Gupta · Built with Claude
