# Spec — Frontend Architecture

Engineering doc §5, §11, §12 · Design rules: `docs/design-system.md`

## 1. Repository shape

Phase 0 ships as a single Next.js 14 app (`architect-web/`). Folders mirror the engineering doc's monorepo packages so they can be extracted in Phase 1 without renames:

| Phase 0 path | Becomes (Phase 1) | Contents |
|---|---|---|
| `lib/contracts/` | `packages/contracts` | Zod schemas, DTO types, realtime payloads |
| `lib/core/` | `packages/core` | Domain services, DI container, mock services |
| `lib/db/` | `packages/db` | Generated Supabase types (`database.types.ts`) and mappers |
| `lib/api/` | stays in `apps/web/lib/api` | `createHandler`, errors, rate limit |
| `lib/supabase/` | stays | browser/server/middleware clients, service client |
| `features/*` | stays | Feature-sliced UI |
| `components/ui`, `components/layout`, `components/shared` | stays | Primitives, shell, shared |

## 2. Stack (pinned majors)

Next.js 14.2 (App Router, RSC), React 18.3, TypeScript 5 strict, Tailwind 3.4, `@supabase/ssr` 0.5 + `@supabase/supabase-js` 2, TanStack Query 5, Zustand 4, React Hook Form 7 + `@hookform/resolvers` + Zod 3, `@xyflow/react` 12 + `elkjs`, `lucide-react`, `cmdk`, `next-themes`, `sonner` (toasts), Radix primitives (`@radix-ui/react-dialog`, `-dropdown-menu`, `-tabs`, `-tooltip`, `-switch`, `-popover`), `@monaco-editor/react` (Code mode), `recharts` (Studio), `date-fns`.

## 3. Routing

```
app/
  (marketing)/page.tsx                  "/"
  (auth)/layout.tsx                     centered card layout
  (auth)/login|signup|verify|reset|reset/update/page.tsx
  auth/callback/route.ts, auth/signout/route.ts
  app/route.ts                          home resolver
  onboarding/page.tsx
  invite/[token]/page.tsx
  w/[ws]/layout.tsx                     app shell + WorkspaceProvider
  w/[ws]/page.tsx                       dashboard
  w/[ws]/(templates|integrations|studio|usage|settings)/page.tsx
  w/[ws]/p/[projectId]/layout.tsx       ProjectProvider + ProjectTopBar
  w/[ws]/p/[projectId]/page.tsx         mode redirect
  w/[ws]/p/[projectId]/build/page.tsx
  w/[ws]/p/[projectId]/code/page.tsx
  api/**/route.ts
  not-found.tsx, error.tsx, global-error.tsx
middleware.ts
```

Every segment with async data has `loading.tsx` (skeleton) and `error.tsx` (ErrorState with `reset()`).

## 4. Rendering and data

- Server Components fetch initial data with the server Supabase client (RLS applies) and pass DTOs to client components; TanStack Query hydrates via `initialData`.
- Client mutations go through `/api/*` route handlers (never direct table writes from the browser) so validation, authorization and auditing are centralized. Direct browser Supabase usage is limited to: auth calls, Realtime subscriptions, Storage signed uploads.
- Query keys: `['me']`, `['workspace', slug]`, `['projects', wsId, filter, q]`, `['project', id]`, `['graph', projectId]`, `['prd', projectId]`, `['builds', projectId]`, `['deployments', projectId]`, `['studio', projectId, range]`.
- `lib/api/client.ts` exports `apiFetch<T>(path, { method, body, schema })` which parses the error envelope into `ApiError { code, message, details, status }`.

## 5. State

| Store | Scope |
|---|---|
| `onboardingStore` | wizard answers (sessionStorage persisted) |
| `uiStore` | sidebar collapsed, command palette open, active panels (localStorage persisted, try/catch) |
| `canvasStore` | nodes/edges/selection/pending ops |
| `buildStore` | active build id, checklist steps, log lines (from Realtime) |
| `editorStore` | open files, active file, dirty buffers (Code mode) |

## 6. UX states (mandatory for every data view)

Loading skeleton matching layout; empty state with one primary action; error state with retry and plain message (technical detail only in Code mode); optimistic updates with rollback toast; offline/Realtime-disconnected banner; permission-limited (viewer) read-only rendering; `MOCK_MODE` badge "Demo data" on mocked panels.

## 7. Component inventory (Phase 0)

`components/ui`: Button, IconButton, Input, Textarea, Label, FieldError, Select, Switch, Tabs, SegmentedControl, Dialog, ConfirmDialog, DropdownMenu, Popover, Tooltip, Badge, StatusPill, Avatar, AvatarStack, Card, Skeleton, Spinner, EmptyState, ErrorState, Alert, Kbd, Toaster.
`components/layout`: Providers, AppSidebar, WorkspaceSwitcher, UserMenu, CommandPalette, MobileNav, SiteHeader, ProjectTopBar, ModeToggle, ResizablePanels.
`components/shared`: Logo, CreditsMeter, DemoBadge, RelativeTime.
`features/*`: per spec files.

## 8. Theming and fonts

`next-themes` with `attribute="class"`, default `dark`, system allowed. Fonts via `next/font/google` (`Inter`, `JetBrains_Mono`) set as CSS variables `--font-sans`, `--font-mono`; if Google Fonts is unreachable at build time the fallback stack is `system-ui` / `ui-monospace` (configure `adjustFontFallback`).

## 9. Acceptance criteria

- [ ] `npm run build` and `npm run typecheck` pass with zero errors; ESLint clean.
- [ ] No hex colors in components (`grep -R "#[0-9a-fA-F]\{6\}" components features app` returns only tokens/SVG gradients referencing variables).
- [ ] Every route segment with data has loading and error UI.
- [ ] Lighthouse accessibility ≥ 95 on `/`, `/login`, dashboard.
