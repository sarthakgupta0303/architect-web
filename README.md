# Architect 2.0

Describe an AI agent app in plain English, and Architect plans it, builds it and puts it online.

Built with Next.js, TypeScript, Tailwind CSS and Supabase.

## Features

- **Prompt to app:** answer a few questions, review the plan, see the agents, then build.
- **Live progress:** watch each step the builder takes as it works.
- **Two modes:** a visual Build mode for everyone, and a Code mode for developers.
- **Preview, test and deploy:** try the app, run checks, publish it, and roll back if needed.
- **Team workspaces:** invite people and give them roles.
- **Templates and integrations:** start from a ready-made example or connect tools like Slack or GitHub.

## Getting started

**You need:** Node.js 18 or newer, and a free [Supabase](https://supabase.com) project.

1. **Install**
   ```bash
   git clone https://github.com/sarthakgupta0303/architect-web.git
   cd architect-web
   npm install
   ```

2. **Set up the database.** In Supabase, open **SQL Editor**, paste in the contents of `database.sql`, and click **Run**.

3. **Add your settings**
   ```bash
   cp .env.example .env.local
   ```
   Then fill in these values in `.env.local`:

   | Name | Where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (keep this private) |
   | `SECRETS_ENCRYPTION_KEY` | Run `openssl rand -base64 32` |
   | `MOCK_MODE` | Set to `true` |

4. **Run**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

> Never commit `.env.local`. It's already listed in `.gitignore`.

## Google and GitHub sign-in (optional)

In Supabase, go to **Authentication → Sign In / Providers**, turn on Google or GitHub, and add the client ID and secret from that provider. Email sign-up works without any extra setup.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Build for production |
| `npm test` | Run the tests |

## Project structure

```
app/          Pages and API routes
features/     Screens for each feature
components/   Shared UI pieces
lib/          Logic, security and database helpers
docs/         Product, engineering and security docs
database.sql  Database setup, in one file
```

## Good to know

This is a prototype. Accounts, projects, agents, chat and deploy history are all real and saved in the database. Things that would need paid services, like the servers your apps run on, are simulated and marked **Demo data**.

## Learn more

- [How this project was built](docs/BUILD_JOURNEY.md)
- [Security plan](docs/security/security-plan.md)
- [Design system](docs/design-system.md)
