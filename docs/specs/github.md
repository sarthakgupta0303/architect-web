# Spec — GitHub Integration

PRD Flow 6 (§11) · FR-21, FR-22 · Engineering doc §4.7, §6.5 · Phase 1 (connect, commit, push/pull, PR) · Phase 2 (PR previews)

## 1. GitHub App

Manifest `infra/github-app-manifest.json`: permissions `contents: write`, `pull_requests: write`, `metadata: read`, `checks: write`, `statuses: write`; events `push`, `pull_request`, `installation`, `installation_repositories`; setup URL `${APP_URL}/api/github/callback`; webhook `${APP_URL}/api/webhooks/github`. Installation tokens minted per request (Octokit `createAppAuth`), cached in Redis 50 min.

## 2. API

| Method | Path | Action | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/github/install-url` | integrations:connect | `?workspaceId=&returnTo=` | `{ url }` (`https://github.com/apps/{slug}/installations/new?state=`) | — |
| GET | `/api/github/callback` | session | `installation_id, setup_action, state` | 302 `returnTo` | 400 bad state |
| GET | `/api/github/installations` | workspace:read | `?workspaceId=` | `{ items: [{ id, accountLogin, accountType }] }` | — |
| GET | `/api/github/installations/{id}/repos` | integrations:connect | `?q=&cursor=` | `{ items: [{ owner, name, private, defaultBranch }], nextCursor }` | 404 |
| POST | `/api/projects/{id}/github` | git:write | `{ mode: 'create'|'link', installationId, owner, name, private?: boolean (default true), branch?: string }` | `{ repo: { owner, name, url, defaultBranch } }` | 409 `REPO_EXISTS`, 403 |
| DELETE | `/api/projects/{id}/github` | project:delete | — | 204 | — |
| GET | `/api/projects/{id}/git/status` | project:read | — | `{ provider, branch, ahead, behind, state: 'synced'|'dirty'|'ahead'|'behind'|'conflict', lastSyncedAt }` | — |
| GET | `/api/projects/{id}/git/changes` | project:code | — | `{ files: [{ path, status: 'M'|'A'|'D'|'R', staged }] }` | — |
| POST | `/api/projects/{id}/git/commit` | git:write | `{ message?: string ≤ 500, files?: string[] }` | `{ sha, message }` | 409 nothing to commit |
| POST | `/api/projects/{id}/git/push` | git:write | `{ branch? }` | `{ pushed: true }` or `{ pullRequest }` when protected | 409 `CONFLICT` |
| POST | `/api/projects/{id}/git/pull` | git:write | `{ branch? }` | `{ commits: number }` | 409 `CONFLICT` (`details.files`) |
| GET/POST | `/api/projects/{id}/git/branches` | project:read / git:write | `{ name, from? }` (name valid ref, ≤ 100) | `{ items }` / `{ branch }` | 409 |
| POST | `/api/projects/{id}/pull-requests` | git:write | `{ head, base?, title?, body?, draft?: boolean }` | `{ pr: { number, url }, previewDeploymentId }` | 409 same branch |
| POST | `/api/webhooks/github` | signature | GitHub payload | 202 | 401 |

State parameter = base64url(`{ workspaceId, projectId?, returnTo, nonce, exp }`) + `.` + HMAC-SHA256 with `GITHUB_STATE_SECRET`; valid 10 min.

## 3. Behaviour

- **Create repo:** `POST /orgs/{owner}/repos` or `/user/repos` (via installation) → push full Architect-hosted history → set `projects.repo_provider='github'`, owner/name, `github_installation_id`.
- **Link repo:** verify access + that repo is empty or shares history (else require "Import instead").
- **Auto-commit (Build mode):** each checkpoint → commit on `working_branch` with generated message (`small` task, ≤ 72-char subject) → push. Author: the user's GitHub identity if linked, else `Architect <bot@architect.new>` with `Co-authored-by: <user>`.
- **Protected branch:** push rejected (`GH006`) → create branch `architect/<timestamp>` and PR automatically; UI toast with PR link.
- **Webhook `push`** (not from Architect's own pushes — detect by `head_commit.id` in `checkpoints`) → enqueue `git.pull` → sandbox pull (fast-forward) → sync canvas → rebuild preview → Realtime `git_synced` → banner "N new commits pulled from GitHub".
- **Conflicts:** pull not fast-forward and merge fails → `git_sync_events.status='conflict'`, project Git status red; Code mode shows 3-way resolver (Monaco diff with Ours/Theirs/Both per conflict); Build mode shows banner "A developer needs to resolve a conflict" + "Ask a developer" (comment mention).
- **PR previews (Phase 2):** on PR open/synchronize → preview deployment → PR comment "Preview: <url>" (updated in place) + commit status `architect/preview`.
- **Uninstall/suspend** events → mark installation suspended; projects show "GitHub disconnected — reconnect".

## 4. UI

`GitStatus` (top bar icon + dot per state, tooltip), `ConnectGithubModal` (3 steps: Install app → Create new / Link existing → Branch + auto-commit toggle → success with repo link), `VersionsDrawer` (Build mode: checkpoint list in plain language, "Restore"), `GitPanel` (Code mode, see code-mode spec), `ConflictResolver`.

## 5. Acceptance criteria

- [ ] Connect via create and link; history preserved; status turns green.
- [ ] External push reflected in preview within 60 s and canvas re-synced.
- [ ] Protected branch results in an auto PR, never a failed save.
- [ ] Webhooks with bad signatures are rejected; duplicates ignored.
