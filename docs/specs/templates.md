# Spec — Templates and Agent Blueprints

PRD Flow 11 (§14.3) · FR-30 · Engineering doc §4.10 · Phase 2 (Phase 0: gallery + instantiate from seeded graphs)

## 1. Template record (`templates` table)

`graph` holds `agents.architect.json` content; `questions` holds customization questions `[{ id, label, type: 'text'|'select', options?, required, placeholder, maps_to: 'var.company_name' }]`; `repo_ref` points to `templates/<slug>` in the monorepo (Phase 1+ scaffold source).

## 2. Official templates (seeded)

| Slug | Name | Agents | Integrations | Category |
|---|---|---|---|---|
| `customer-support-agent` | Customer Support Agent | Triage, Knowledge, Responder, Escalation | zendesk, notion, slack | support |
| `sdr-outreach-agent` | SDR Outreach Agent | Researcher, Scorer, Writer | hubspot, gmail | sales |
| `research-assistant` | Research Assistant | Planner, Searcher, Synthesizer | google_drive | research |
| `invoice-processor` | Invoice Processor | Extractor, Validator, Approver (human approval) | gmail, google_drive | ops |
| `recruiting-screener` | Recruiting Screener | Parser, Screener, Scheduler | gmail | hr |
| `internal-knowledge-bot` | Internal Knowledge Bot | Retriever, Answerer | notion, slack | ops |
| `meeting-notes-to-jira` | Meeting Notes → Jira | Summarizer, Ticket Writer | jira, google_drive | ops |
| `voice-receptionist` | Voice Receptionist | Greeter, Scheduler, Handoff | — | voice |

## 3. API

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/templates` | public | `?category=&framework=` → `{ items: [{ slug, name, description, category, framework, agentsCount, integrations, previewMediaUrl }] }` |
| GET | `/api/templates/{slug}` | public | `{ template: { …, graph, questions } }` |
| POST | `/api/templates/{slug}/instantiate` | project:create | body `{ workspaceId, answers: Record<questionId, string> }` → 201 `{ projectId }`; 422 missing required answers; 402 plan limit |

Instantiate: create project (`source='template'`, `template_id`, name = template name or `answers.project_name`), copy graph agents/edges (positions preserved), substitute `{{var.*}}` in instructions with answers, create PRD v1 from template description + answers, then route to PRD review (Flow 2 step 3) with generation session stage `prd`.

## 4. UI

Templates page and dashboard tab: category chips, framework filter, cards (media, name, agents count, integration logos, framework badge) with "Preview" (dialog: description, canvas thumbnail, integrations list) and "Use template" (dialog with questions form → instantiate → navigate).

## 5. Acceptance criteria

- [ ] All 8 templates listed publicly; instantiate creates the full agent graph and PRD.
- [ ] Required questions validated; answers substituted into agent instructions.
- [ ] Nightly CI builds and deploys each template green (Phase 2).
