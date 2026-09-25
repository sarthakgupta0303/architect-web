# Spec — Collaboration, Notifications, Activity

PRD Flow 10 (§14.2) · FR-29 · Engineering doc §4.10 · Phase 2 (Phase 0: members list, pending invitations, presence avatars)

## 1. Members and invitations

| Method | Path | Action | Body | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/workspaces/{ws}/invitations` | invitations:manage | `{ email, role: 'admin'|'editor'|'viewer', isDeveloper?: boolean }` | 201 `{ invitation: { id, email, role, expiresAt } }` | 402 seat limit (Team seats), 409 already member/pending |
| DELETE | `/api/invitations/{id}` | invitations:manage | — | 204 | — |
| POST | `/api/invitations/{id}/resend` | invitations:manage | — | 204 (new token, expiry reset) | — |
| PATCH | `/api/workspaces/{ws}/members/{userId}` | members:manage | `{ role?, isDeveloper? }` | `{ member }` | 409 owner change |
| DELETE | `/api/workspaces/{ws}/members/{userId}` | members:manage (or self) | — | 204 | 409 owner |
| POST | `/api/workspaces/{ws}/transfer-ownership` | owner | `{ userId }` | `{ workspace }` | 409 not admin |

Token: 32 random bytes base64url; DB stores `sha256` hex. Email (Resend) template "Priya invited you to Acme on Architect" with button `${APP_URL}/invite/{token}`; expires 7 days.

## 2. Presence

Supabase Realtime presence on `project:{projectId}`: track `{ userId, name, avatarUrl, mode, tab, file?, cursor? }` on join and on change (throttle 200 ms). Top bar `AvatarStack` (max 4 + "+n"); canvas shows remote selections as colored outlines; Code mode shows "Arjun is editing triage.py" in explorer.

## 3. Comments

Targets: `prd_section` (ref = section key), `agent` (ref = agent id), `element` (ref = archId + route), `file_line` (ref = `path:line`), `run` (ref = run id).

| Method | Path | Action | Body | Response |
|---|---|---|---|---|
| GET | `/api/projects/{id}/comments` | project:read | `?targetType=&targetRef=&resolved=false` | `{ items: CommentDto[] }` (threads with replies) |
| POST | `/api/projects/{id}/comments` | comment:write | `{ targetType, targetRef, anchor?, body 1–5000, parentId? }` | 201 `{ comment }` |
| PATCH | `/api/comments/{id}` | author (body) / editor (resolve) | `{ body?, resolved? }` | `{ comment }` |
| DELETE | `/api/comments/{id}` | author or admin | — | 204 |

Mentions: `@[Name](userId)` markup parsed server-side → `notifications(type='mention')` for members only. UI: comment pins on canvas nodes/PRD sections/preview elements; thread popover; Comments panel listing open threads.

## 4. Notifications

Types: `mention`, `comment_reply`, `build_finished`, `build_failed`, `deploy_live`, `deploy_failed`, `pr_opened`, `eval_failed`, `approval_requested`, `spend_alert`, `invite_accepted`. Bell dropdown (latest 20, unread dot, "Mark all read"); Realtime on `user:{userId}`. API: `GET /api/notifications?cursor=`, `POST /api/notifications/read { ids?: uuid[], all?: true }`. Email digests for `approval_requested`, `deploy_failed`, `spend_alert` immediately.

## 5. Activity feed

`activity_events` written by services with plain-language `summary` ("Arjun changed the Triage agent (code)"). Project Activity drawer and workspace Home "Recent activity". `GET /api/projects/{id}/activity?cursor=`.

## 6. Acceptance criteria

- [ ] Invite → email → accept → member appears with correct role; expired links show the expired state.
- [ ] Presence shows collaborators within 2 s; leaves within 30 s of tab close.
- [ ] @mentions notify only workspace members; notifications update live.
- [ ] Permission matrix enforced for every member action (unit + e2e).
