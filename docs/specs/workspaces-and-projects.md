# Spec — Workspaces, Dashboard and Projects

PRD §5, §6.3 · FR-03 · Engineering doc §4.2 · **Phase 0: fully functional**

## 1. Scope

App shell (sidebar, workspace switcher, user menu, command palette), dashboard (prompt box with Build/Import/Template tabs, project grid, filters, search, credits card, getting-started checklist), project create/rename/delete (soft, with undo)/restore, workspace settings (general + members list), project workspace shell (top bar, mode toggle, tabs).

## 2. Routes

| Route | Component | Data |
|---|---|---|
| `/w/[ws]` | `DashboardPage` (RSC) | workspace by slug, first page of projects, profile |
| `/w/[ws]/settings` | `WorkspaceSettingsPage` | workspace, members, pending invitations |
| `/w/[ws]/p/[projectId]` | redirect → `/build` or `/code` using `profiles.mode_prefs[projectId] ?? project.mode_default` | — |
| `/w/[ws]/p/[projectId]/build` | `BuildWorkspace` | project, agents graph, latest PRD |
| `/w/[ws]/p/[projectId]/code` | `CodeWorkspace` | project (+ mock file tree in Phase 0) |

`w/[ws]/layout.tsx` (server): loads membership for slug; not a member → `notFound()`; not onboarded → redirect `/onboarding`; updates `profiles.last_workspace_id`. Provides `WorkspaceContext { workspace, role, isDeveloper }`.

## 3. App shell

- **Sidebar** (240 px, collapsible to 64 px, state in `localStorage` via try/catch): Workspace switcher (menu listing memberships + "Create workspace" → `create_workspace` RPC), nav items Home, Templates, Integrations, Studio, Usage, Settings, Docs (external). Active item `bg-surface-2 text-fg`. Bottom: credits meter (`balance / plan monthly grant`), user menu (name, email, theme toggle, Sign out).
- **Command palette** (`Cmd/Ctrl+K`, `cmdk`): Go to project (search), New project, Switch workspace, Toggle theme, Settings.
- **Mobile (< 1024 px)**: sidebar becomes a sheet opened from a top bar hamburger.

## 4. Dashboard

Layout: greeting `h1` ("Good morning, Priya"), `DashboardPrompt`, then two columns on ≥ lg: projects (2/3), side cards (1/3).

### 4.1 DashboardPrompt

Tabs **Build | Import | Template**.
- Build: prompt composer (same as landing) → `POST /api/projects { workspaceId, source: 'prompt', initialPrompt }` → navigate to project `/build?step=clarify`.
- Import: two cards (GitHub repo, Zip upload) → open `ImportWizard` (Phase 0: mock report flow per `mock-mode.md`).
- Template: horizontal list of 6 official templates → `POST /api/templates/{slug}/instantiate` (Phase 0: creates project + seeded agents from template graph).
- "Blank project" link → `POST /api/projects { source: 'blank' }`.

### 4.2 Project grid

- Filters (segmented): All · Mine · Shared · Deployed. Search input (debounced 250 ms, trigram `ilike`).
- `ProjectCard`: thumbnail (or gradient placeholder with initials), name, framework badge (mono caption), `StatusPill` (draft/preview/live), "Edited 3h ago by Priya", kebab menu: Open, Rename, Duplicate (Phase 2), Delete.
- Grid: 1 col (<640), 2 (≥640), 3 (≥1280). Infinite scroll with "Load more" button fallback.
- States: skeleton grid (6 cards); empty (no projects) → EmptyState "Describe your first agent app" focusing the prompt; empty (filter/search) → "No projects match" + Clear filters; error → ErrorState + retry.

### 4.3 Side cards

- Credits card: balance, plan, "Upgrade" (links to billing, Phase 2 mock).
- Getting started checklist (derived, not stored): Build your first agent (has project) · Connect GitHub (any project with `repo_provider='github'`) · Deploy (any project with `live_url`) · Invite a teammate (members > 1). Hidden when all done.

## 5. Project operations

| Operation | UI | API | Rules |
|---|---|---|---|
| Create | Prompt/blank/template | `POST /api/projects` | name auto-derived from prompt: first 6 words, title-cased, ≤ 80 chars; Free plan max 3 active projects → 402 `PLAN_LIMIT` with upgrade dialog |
| Rename | Inline edit in card menu and project top bar (click name) | `PATCH /api/projects/{id} { name }` | optimistic; revert + toast on error |
| Delete | Confirm dialog ("Type the project name" only if project has a live deployment) | `DELETE /api/projects/{id}` → sets `deleted_at` | toast "Project deleted" with **Undo** (10 s) → `POST /api/projects/{id}/restore` |
| Restore | Undo toast; Settings > Trash (Phase 2) | `POST /api/projects/{id}/restore` | within 30 days |
| Open | Card click | — | route to preferred mode |

Contracts (`lib/contracts/projects.ts`):

```ts
export const CreateProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  source: z.enum(['prompt', 'blank', 'template']),
  name: z.string().trim().min(1).max(80).optional(),
  initialPrompt: z.string().trim().min(1).max(10000).optional(),
  templateSlug: z.string().regex(/^[a-z0-9-]{3,60}$/).optional(),
  framework: z.enum(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents']).optional(),
}).refine(v => v.source !== 'prompt' || !!v.initialPrompt, { path: ['initialPrompt'], message: 'Prompt is required' })

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  framework: z.enum(['lyzr_adk', 'langgraph', 'crewai', 'openai_agents']).optional(),
  language: z.enum(['python', 'typescript']).optional(),
  modeDefault: z.enum(['build', 'code']).optional(),
  autoCommit: z.boolean().optional(),
}).refine(v => Object.keys(v).length > 0, 'No changes')

export const ListProjectsQuery = z.object({
  filter: z.enum(['all', 'mine', 'shared', 'deployed']).default('all'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ProjectCardDto = {
  id: string; name: string; thumbnailUrl: string | null; framework: string;
  status: 'draft' | 'building' | 'preview' | 'live' | 'archived';
  updatedAt: string; createdBy: { id: string; name: string | null } | null;
}
```

## 6. API

| Method | Path | Action | Response | Errors |
|---|---|---|---|---|
| GET | `/api/workspaces/{ws}` | workspace:read | `{ workspace: { id, slug, name, plan, creditsBalance, codeModeRestricted, prodDeployRole }, role, isDeveloper }` | 404 |
| PATCH | `/api/workspaces/{ws}` | workspace:update | `{ workspace }` | 422 |
| GET | `/api/workspaces/{ws}/members` | workspace:read | `{ items: [{ userId, name, email, avatarUrl, role, isDeveloper }] , invitations: [{ id, email, role, expiresAt }] }` | — |
| GET | `/api/workspaces/{ws}/projects` | workspace:read | `{ items: ProjectCardDto[], nextCursor }` | 422 |
| POST | `/api/projects` | project:create | 201 `{ project: ProjectDto }` | 402, 422 |
| GET | `/api/projects/{id}` | project:read | `{ project: ProjectDto }` | 404 |
| PATCH | `/api/projects/{id}` | project:update | `{ project }` | 404, 422 |
| DELETE | `/api/projects/{id}` | project:delete | 204 | 404 |
| POST | `/api/projects/{id}/restore` | project:delete | `{ project }` | 404, 410 (> 30 days) |

`{ws}` accepts the workspace slug. Project creation also inserts `project_settings` (defaults) and `project_events(type='created')`, and for `source='template'` copies the template graph into `agents`/`agent_edges`.

## 7. Project workspace shell

`ProjectTopBar` (52 px): breadcrumb (workspace › project name — editable), `ModeToggle` (Build | Code; Code disabled with tooltip when user is not a developer), branch selector (Phase 0: shows `main`), presence avatars, GitHub status icon, Share, **Deploy** (primary), credits meter. Mode change writes `profiles.mode_prefs[projectId]` (`PATCH /api/me`).

Build workspace: resizable 3-pane layout per design system §3; center tabs Preview · Agents · PRD · Data · Evals · Deploy · Studio · Settings selected by `?tab=`; default `agents` when the project has no build yet, otherwise `preview`.

## 8. Acceptance criteria

- [ ] Dashboard lists only projects of workspaces the user belongs to (verified with two users).
- [ ] Filters and search combine; empty/error/loading states render per design system.
- [ ] Create from prompt, blank and template all land in the project workspace.
- [ ] Rename is optimistic and rolls back on failure; delete shows Undo which restores the project.
- [ ] Free plan blocks the 4th active project with an upgrade dialog.
- [ ] Workspace switcher lists memberships and creates a new workspace via RPC.
- [ ] Non-members get 404 for `/w/{slug}` and any project URL.
