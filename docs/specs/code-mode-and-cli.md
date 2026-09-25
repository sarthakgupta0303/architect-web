# Spec — Code Mode and CLI

PRD Flow 5 (§10) · FR-17 → FR-20 · Engineering doc §4.6, §5.3 · Phase 1 (editor, terminal, diffs, coding agent) · Phase 2 (parallel tasks, CLI)

## 1. Access

Route `/w/[ws]/p/[projectId]/code`. Requires `project:code` (developer); others see the mode toggle disabled with tooltip "Code mode is limited to developers in this workspace". Requires viewport ≥ 1280 px.

## 2. Layout (`IdeLayout`)

| Region | Size | Contents |
|---|---|---|
| Activity bar | 48 px | Explorer, Search, Git, Agents, Settings icons (lucide `Files`, `Search`, `GitBranch`, `Bot`, `Settings`) |
| Side panel | 260 px (resizable 200–480) | Selected activity |
| Editor area | flex | Tabs (dirty dot, close, middle-click close), Monaco, optional split preview |
| Agent chat | 380 px right (collapsible) | `CodingAgentChat` |
| Bottom panel | 240 px (resizable, collapsible) | Terminal · Problems · Logs · Tests · Tasks |

Keyboard: `Cmd/Ctrl+P` quick open, `Cmd/Ctrl+S` save, `Cmd/Ctrl+Shift+F` search, `` Ctrl+` `` terminal, `Cmd/Ctrl+L` focus agent chat, `Cmd/Ctrl+J` bottom panel.

## 3. File API

| Method | Path | Body / query | Response | Errors |
|---|---|---|---|---|
| GET | `/api/projects/{id}/files/tree` | `?ref=` | `{ tree: [{ path, type: 'file'|'dir', size }], ref }` (ignores `.git`, `node_modules`, `.next`, `__pycache__`) | 503 |
| GET | `/api/projects/{id}/files` | `?path=&ref=` | `{ path, content, sha, language, managedRegions: [{ id, startLine, endLine }] }` | 404, 413 (> 2 MB → "Open in terminal") |
| PUT | `/api/projects/{id}/files` | `{ path, content, baseSha }` | `{ sha, canvasUpdated }` | 409 `STALE_FILE` (`details.currentSha`), 423 |
| POST | `/api/projects/{id}/files/rename` | `{ from, to }` | `{ ok: true }` | 409 exists |
| DELETE | `/api/projects/{id}/files` | `?path=` | 204 | 409 protected (`architect.json`, `agents.architect.json`) |
| GET | `/api/projects/{id}/search` | `?q=&regex=&glob=` | `{ matches: [{ path, line, preview }] }` max 500 | 422 |

Path validation: normalized POSIX, relative, no `..`, no leading `/`, ≤ 300 chars, not inside `.git`.

Saving: `PUT` writes to sandbox FS; sync service re-parses managed regions (framework-adapters §2); auto-commit is **off** in Code mode — changes appear in Git panel.

## 4. Editor

Monaco via `@monaco-editor/react`; theme generated from design tokens (`architect-dark`, `architect-light`); font JetBrains Mono 13 px; LSP for TS/Python via `monaco-languageclient` over WebSocket `/api/projects/{id}/lsp/{lang}` (Phase 2; Phase 1 uses Monaco built-in TS + Python syntax). Managed regions shown with a subtle left gutter band and hover "Managed by canvas — edits sync back". Stale save → modal "This file changed" with Compare / Overwrite / Reload.

## 5. Terminal

xterm.js + fit addon; WebSocket `wss://{host}/api/projects/{id}/terminal` upgraded by the PTY gateway service; auth via short-lived token from `POST /api/projects/{id}/terminal/token` (60 s, single use) passed in `Sec-WebSocket-Protocol`. Messages: client `{type:'input',data}`, `{type:'resize',cols,rows}`; server binary output. Session idle timeout 30 min; max 4 terminals per user per project. Commands are logged to `audit_logs` (first 200 chars).

## 6. Coding agent chat and diff review

- `CodingAgentChat`: messages, `@` mention picker (files from tree, agents from graph, `@docs`), Plan/Build toggle, model picker, context chips.
- Sends `POST /api/projects/{id}/edits` with `channel:'code_agent'` (see generation-pipeline §3). SSE `patch` events deliver `{ files: [{ path, diff (unified), hunks: [{ id, header }] }] }`.
- `DiffReview`: file list with +/− counts; Monaco diff editor per file; per-hunk Accept/Reject checkboxes; "Accept all", "Reject all"; apply → `POST /api/edits/{editId}/apply { hunks }` → checkpoint + commit (message from `small` task).

## 7. Git panel (Code mode)

Changes list (staged/unstaged with M/A/D badges), commit message box (empty → AI suggestion button), Commit, Push, Pull, branch dropdown with "New branch", "Create PR". APIs in `github.md`.

## 8. Parallel tasks (Phase 2)

`POST /api/projects/{id}/tasks { title, message }` → new branch `architect/<slug>` + separate sandbox → coding agent runs in build mode → result diff + PR draft. Tasks panel: title, branch, status pill, elapsed, "Review diff", "Open PR", "Discard". Limits: Pro 5, Team 10 concurrent.

## 9. CLI (`@lyzr/architect`, Phase 2)

| Command | Behaviour |
|---|---|
| `architect login` | Device flow: `POST /api/cli/device-code` → prints `userCode` + opens `APP_URL/cli/device` → polls `/api/cli/token` every `interval` s → stores token in OS keychain (fallback `~/.architect/credentials` 0600) |
| `architect link [project]` | Writes `.architect/project.json` `{ workspaceSlug, projectId }` |
| `architect pull` / `push` | Git over HTTPS against the project remote (GitHub or Architect-hosted) using token |
| `architect dev` | Fetches development env via `GET /api/projects/{id}/env?environment=development`, runs `architect.json` start commands locally with those env vars |
| `architect deploy [--prod]` | `POST /api/projects/{id}/deployments` and streams status |
| `architect logs [--env production] [--follow]` | Streams `/api/deployments/{id}/logs` |

Device approval page `/cli/device`: shows `userCode`, client name, "Approve" / "Deny"; creates `api_tokens` row (scopes `project:read project:write deploy env:read`, expires 90 days).

## 10. Acceptance criteria

- [ ] Open/edit/save files with stale-write protection; protected files cannot be deleted.
- [ ] Terminal runs commands in the project sandbox and isolates users/projects.
- [ ] Coding agent diffs can be accepted per hunk; accepted changes create a checkpoint and commit.
- [ ] Canvas reflects code edits in managed regions within 3 s.
- [ ] CLI login → pull → dev → deploy works on macOS and Linux.
