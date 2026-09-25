# Spec — Integrations and MCP Servers

PRD Flow 9 (§14.1) · FR-28 · Engineering doc §4.10 · Phase 2 (Phase 0: mocked catalog)

## 1. Catalog (`lib/core/integrations/catalog.ts`)

| Provider | Auth | Category | Tools exposed to agents |
|---|---|---|---|
| gmail | OAuth (Nango `google-mail`) | Communication | `gmail.search`, `gmail.read`, `gmail.send_draft` |
| slack | OAuth | Communication | `slack.post_message`, `slack.read_channel`, `slack.lookup_user` |
| notion | OAuth | Docs | `notion.search`, `notion.read_page`, `notion.create_page` |
| google_drive | OAuth | Docs | `drive.search`, `drive.read_file`, `drive.create_doc` |
| github | GitHub App (reuse installation) | Dev | `github.search_issues`, `github.create_issue`, `github.read_file` |
| jira | OAuth | Dev | `jira.search`, `jira.create_issue`, `jira.update_issue` |
| hubspot | OAuth | CRM | `hubspot.find_contact`, `hubspot.create_note`, `hubspot.update_deal` |
| salesforce | OAuth | CRM | `salesforce.query`, `salesforce.update_record` |
| zendesk | OAuth | Support | `zendesk.get_ticket`, `zendesk.search`, `zendesk.reply` |
| stripe | API key (restricted key) | Payments | `stripe.find_customer`, `stripe.list_invoices`, `stripe.create_refund` |
| postgres | Connection string | Data | `sql.query_readonly` |
| http | none/API key | Dev | `http.request` (allow-listed hosts) |

Each tool has a JSON schema (`input_schema`) used by adapters when binding tools.

## 2. API

| Method | Path | Action | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/integrations/catalog` | session | `?category=&q=` | `{ items: [{ provider, name, category, authType, tools: [{ name, description }] }] }` | — |
| GET | `/api/workspaces/{ws}/integrations` | workspace:read | `?projectId=` | `{ items: [{ id, provider, status, scope: 'workspace'|'project', connectedBy, createdAt }] }` | — |
| POST | `/api/integrations/{provider}/connect` | integrations:connect | `{ workspaceId, projectId?, apiKey?, connectionString? }` | OAuth: `{ connectSessionToken }` (frontend opens Nango Connect UI) · key: `{ integration }` after validation call | 422 invalid key |
| POST | `/api/integrations/nango-webhook` | Nango signature | auth events | 200 → upsert `integrations` status | 401 |
| DELETE | `/api/integrations/{id}` | integrations:revoke | — | 204 (revokes at provider when supported) | — |
| POST | `/api/projects/{id}/mcp-servers` | mcp:write | `{ name 1–60, transport: 'http'|'sse', url (https), headers?: Record<string,string> ≤ 10 }` | 201 `{ server, tools }` | 502 cannot connect (5 s timeout) |
| POST | `/api/mcp-servers/{id}/refresh` | mcp:write | — | `{ tools }` | 502 |
| PATCH | `/api/mcp-tools/{id}` | mcp:write | `{ enabled }` | `{ tool }` | — |
| DELETE | `/api/mcp-servers/{id}` | mcp:write | — | 204 | — |
| POST | `/api/projects/{id}/agents/{agentId}/tools` | canvas:write | `{ toolType: 'integration', integrationId, name }` or `{ toolType: 'mcp', mcpToolId }` | 201 | 409 `INTEGRATION_NOT_CONNECTED` |

MCP connection: MCP client initialize → `tools/list` → store `mcp_tools`; headers stored as a `secrets` row (`kind='mcp_header'`). `stdio` transport only via CLI/local (Phase 3).

## 3. UI

Integrations page (workspace) and tab (project): search, category chips, grid of connector cards (logo, name, description, status pill, Connect/Manage). Connect: OAuth popup via Nango frontend SDK or API-key dialog with "Test & save". Manage drawer: scopes, connected by, projects using it, Disconnect. MCP section: list of servers with status, tool count, "Add MCP server" dialog (URL, headers key/value rows, Test connection → shows discovered tools with toggles). In `ToolPicker` (canvas inspector) connected integrations' tools appear grouped by provider; disconnected ones show "Connect" inline.

## 4. Acceptance criteria

- [ ] Connecting Slack via OAuth makes `slack.*` tools attachable to agents; disconnecting marks dependent agents with a warning and preflight warns.
- [ ] API-key integrations are validated before saving and stored encrypted.
- [ ] Adding a public MCP server lists its tools; disabled tools are not bound at build.
