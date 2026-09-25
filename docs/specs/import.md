# Spec — Import an Existing Project

PRD Flow 3 (§8) · FR-12, FR-13 · Engineering doc §4.4, §8.8 · Phase 1 (GitHub, zip) · Phase 2 (v1, builder exports, Lyzr Studio)

## 1. Sources

| Source | Input | Limits |
|---|---|---|
| `github` | installationId, owner, repo, branch, optional subdir | repo ≤ 200 MB checked-out size |
| `zip` | storage path in `imports/{workspaceId}/{uuid}.zip` | ≤ 200 MB, ≤ 20,000 files, zip-slip rejected |
| `v1` (P2) | Architect v1 project id | via Lyzr v1 export API |
| `builder` (P2) | GitHub repo exported from Lovable/Bolt/Replit/v0 | same as github |
| `studio` (P2) | Lyzr Agent Studio agent ids (≤ 20) | via Lyzr API |

## 2. Contracts

```ts
export const StartImportSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('github'), workspaceId: z.string().uuid(), installationId: z.number().int(), owner: z.string().min(1).max(100), repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), branch: z.string().min(1).max(255), subdir: z.string().max(300).optional() }),
  z.object({ source: z.literal('zip'), workspaceId: z.string().uuid(), zipPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.zip$/) }),
  z.object({ source: z.literal('v1'), workspaceId: z.string().uuid(), v1ProjectId: z.string().min(1) }),
  z.object({ source: z.literal('studio'), workspaceId: z.string().uuid(), studioAgentIds: z.array(z.string()).min(1).max(20) }),
])
export const ImportReportDto = z.object({
  detectedStack: z.object({ languages: z.array(z.string()), frameworks: z.array(z.object({ name: z.string(), version: z.string().nullable() })), frontend: z.string().nullable(), database: z.string().nullable(), packageManager: z.string().nullable() }),
  agents: z.array(z.object({ key: z.string(), name: z.string(), framework: z.string(), file: z.string(), mappable: z.boolean(), tools: z.array(z.string()) })),
  missingEnv: z.array(z.string()),
  unsupportedDeps: z.array(z.object({ name: z.string(), reason: z.string() })),
  secretsFound: z.array(z.object({ file: z.string(), line: z.number(), kind: z.string() })),
  startCommand: z.string().nullable(),
  warnings: z.array(z.string()),
})
```

## 3. API

| Method | Path | Action | Response | Errors |
|---|---|---|---|---|
| POST | `/api/imports` | project:create | 202 `{ importId }` | 404 repo, 413, 422 |
| GET | `/api/imports/{id}` | project:create | `{ import: { id, status, source, error }, report: ImportReportDto | null }` | 404 |
| PATCH | `/api/imports/{id}` | project:create | body `{ env?: Record<Name,string>, startCommand?: string }` → `{ report }` | 422 (unknown env names) |
| POST | `/api/imports/{id}/finalize` | project:create | body `{ openIn: 'build'|'code', keepHistory: boolean, twoWaySync: boolean }` → 201 `{ projectId }` | 409 (blocking issues remain) |

## 4. Scan job (`import.scan`)

1. Fetch: GitHub → clone with installation token (`--depth 50` when keepHistory false); zip → download + safe extract (reject absolute paths, `..`, symlinks outside root).
2. Size/file-count guard.
3. Detection (deterministic first): manifests (`package.json`, `pyproject.toml`, `requirements*.txt`, `Pipfile`, `Dockerfile`, `Procfile`), import scanning (`from langgraph`, `from crewai`, `from agents import`, `import lyzr`, `@mastra/`), adapters' `detect()`, `.env.example`/code `os.environ[...]`/`process.env.X` usage → env names.
4. Secret scan with gitleaks rules → `secretsFound` (values never stored).
5. LLM assist (`small`) only when start command or agent names are ambiguous.
6. Write `import_reports`; status `ready` if no blockers else `needs_attention`. Blockers: no start command, unsupported runtime (not Python 3.9–3.12 / Node 18–22).

## 5. Finalize

Create `projects` (`source='import_github'|'import_zip'|…`, framework = detected primary or `custom`), `project_settings`, `project_env_vars` from `missingEnv` + provided values (stored as secrets for `development`), write `architect.json` + `agents.architect.json` on branch `architect/import` (commit "Add Architect manifest"), insert agents (`managed=false`, `type='code'` for unmappable), connect GitHub remote when source is github and `twoWaySync`, trigger first preview build (`kind='rebuild'`, no LLM generation).

## 6. UI

`ImportWizard` (dialog, 3 steps): Source (cards GitHub / Zip / Architect v1 / Other builder) → Pick (repo picker with search + branch + subdir, or dropzone with progress) → Scanning (animated checklist: Fetching · Detecting stack · Finding agents · Checking secrets). Then route `/w/[ws]/p/import/[importId]` → `ImportReport` page: stack card, agents list (draft mini-canvas), Needs attention list (env inputs, start command select, secret warnings with "Move to secrets"), options (keep history, two-way sync), CTA "Open in Build mode" / "Open in Code mode".

## 7. Acceptance criteria

- [ ] Fixture repos (LangGraph, CrewAI, OpenAI Agents SDK, Lyzr ADK, Lovable export, Bolt export) are detected correctly ≥ 90%.
- [ ] No imported file is modified; only manifests are added on `architect/import`.
- [ ] Secrets found in code are reported with file/line and never persisted.
- [ ] Zip-slip and oversized archives are rejected with clear errors.
