-- =============================================================================
-- Architect 2.0 — seed data (run after supabase-schema.sql)
-- 1) Official templates (public)
-- 2) seed_demo_project(workspace_id): creates the "Support Copilot" demo project
--    (PRD §7.3) with agents, edges, tools, deployments, guardrails, an eval set
--    and ~5,000 runs over 30 days. Callable by any editor of the workspace.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Templates
-- -----------------------------------------------------------------------------
insert into public.templates (slug, name, description, category, framework, agents_count, integrations, repo_ref, graph, questions, is_official, published) values
('customer-support-agent', 'Customer Support Agent',
 'Reads tickets, answers FAQs from your docs and escalates unhappy customers to a human.',
 'support', 'lyzr_adk', 4, array['zendesk','notion','slack'], 'templates/customer-support-agent',
 '{"agents":[
   {"key":"triage","name":"Triage","type":"autonomous","role":"Classifies intent and sentiment of each ticket","instructions":"Classify the ticket for {{var.company_name}} by intent and sentiment.","position":{"x":0,"y":120}},
   {"key":"knowledge","name":"Knowledge","type":"autonomous","role":"Finds answers in the knowledge base","instructions":"Search {{var.company_name}} docs and return cited answers.","position":{"x":320,"y":0}},
   {"key":"responder","name":"Responder","type":"autonomous","role":"Drafts a friendly reply","instructions":"Write a concise, friendly reply in the {{var.company_name}} voice.","position":{"x":640,"y":0}},
   {"key":"escalation","name":"Escalation","type":"workflow","role":"Hands angry customers to a human in Slack","instructions":"Post the ticket summary to the support Slack channel.","position":{"x":320,"y":260}}],
  "edges":[{"from":"triage","to":"knowledge","condition":"intent == faq"},{"from":"knowledge","to":"responder","condition":""},{"from":"triage","to":"escalation","condition":"sentiment < -0.5"}]}',
 '[{"id":"company_name","label":"Company name","type":"text","required":true,"placeholder":"Acme"}]', true, true),
('sdr-outreach-agent', 'SDR Outreach Agent',
 'Researches inbound leads, scores them and drafts personalised outreach.',
 'sales', 'lyzr_adk', 3, array['hubspot','gmail'], 'templates/sdr-outreach-agent',
 '{"agents":[
   {"key":"researcher","name":"Researcher","type":"autonomous","role":"Researches the lead and company","instructions":"Research the lead for {{var.company_name}}.","position":{"x":0,"y":80}},
   {"key":"scorer","name":"Scorer","type":"workflow","role":"Scores fit against the ICP","instructions":"Score the lead 0-100 against: {{var.icp}}.","position":{"x":320,"y":80}},
   {"key":"writer","name":"Writer","type":"autonomous","role":"Drafts the outreach email","instructions":"Draft a short personalised email as a Gmail draft.","position":{"x":640,"y":80}}],
  "edges":[{"from":"researcher","to":"scorer","condition":""},{"from":"scorer","to":"writer","condition":"score >= 60"}]}',
 '[{"id":"company_name","label":"Company name","type":"text","required":true,"placeholder":"Acme"},{"id":"icp","label":"Ideal customer profile","type":"text","required":true,"placeholder":"B2B SaaS, 50-500 employees"}]', true, true),
('research-assistant', 'Research Assistant',
 'Plans research, searches the web and writes cited reports to Google Drive.',
 'research', 'langgraph', 3, array['google_drive'], 'templates/research-assistant',
 '{"agents":[
   {"key":"planner","name":"Planner","type":"autonomous","role":"Breaks the question into sub-questions","instructions":"Plan 3-6 sub-questions.","position":{"x":0,"y":80}},
   {"key":"searcher","name":"Searcher","type":"autonomous","role":"Searches and reads sources","instructions":"Search the web and extract key facts with URLs.","position":{"x":320,"y":80}},
   {"key":"synthesizer","name":"Synthesizer","type":"autonomous","role":"Writes the cited report","instructions":"Write a report with citations and save it to Drive.","position":{"x":640,"y":80}}],
  "edges":[{"from":"planner","to":"searcher","condition":""},{"from":"searcher","to":"synthesizer","condition":""}]}',
 '[]', true, true),
('invoice-processor', 'Invoice Processor',
 'Extracts line items from emailed invoices, validates them and asks for approval.',
 'ops', 'lyzr_adk', 3, array['gmail','google_drive'], 'templates/invoice-processor',
 '{"agents":[
   {"key":"extractor","name":"Extractor","type":"autonomous","role":"Extracts invoice fields from PDFs","instructions":"Extract vendor, date, totals and line items.","position":{"x":0,"y":80}},
   {"key":"validator","name":"Validator","type":"workflow","role":"Checks totals and duplicates","instructions":"Validate sums and check for duplicate invoice numbers.","position":{"x":320,"y":80}},
   {"key":"approver","name":"Approver","type":"human_approval","role":"Human approval over the limit","instructions":"Request approval when amount > {{var.approval_limit}}.","position":{"x":640,"y":80}}],
  "edges":[{"from":"extractor","to":"validator","condition":""},{"from":"validator","to":"approver","condition":"amount > 1000"}]}',
 '[{"id":"approval_limit","label":"Approval limit (USD)","type":"text","required":true,"placeholder":"1000"}]', true, true),
('recruiting-screener', 'Recruiting Screener',
 'Parses resumes, screens against the role and schedules interviews.',
 'hr', 'crewai', 3, array['gmail'], 'templates/recruiting-screener',
 '{"agents":[
   {"key":"parser","name":"Parser","type":"autonomous","role":"Parses resumes","instructions":"Extract skills, experience and education.","position":{"x":0,"y":80}},
   {"key":"screener","name":"Screener","type":"autonomous","role":"Screens against the job description","instructions":"Score the candidate for {{var.role_title}}.","position":{"x":320,"y":80}},
   {"key":"scheduler","name":"Scheduler","type":"workflow","role":"Emails candidates to schedule","instructions":"Send a scheduling email to shortlisted candidates.","position":{"x":640,"y":80}}],
  "edges":[{"from":"parser","to":"screener","condition":""},{"from":"screener","to":"scheduler","condition":"score >= 70"}]}',
 '[{"id":"role_title","label":"Role title","type":"text","required":true,"placeholder":"Senior Backend Engineer"}]', true, true),
('internal-knowledge-bot', 'Internal Knowledge Bot',
 'Answers team questions in Slack from your Notion workspace.',
 'ops', 'openai_agents', 2, array['notion','slack'], 'templates/internal-knowledge-bot',
 '{"agents":[
   {"key":"retriever","name":"Retriever","type":"autonomous","role":"Finds relevant Notion pages","instructions":"Search Notion for pages relevant to the question.","position":{"x":0,"y":80}},
   {"key":"answerer","name":"Answerer","type":"autonomous","role":"Answers in Slack with links","instructions":"Answer briefly and link sources.","position":{"x":320,"y":80}}],
  "edges":[{"from":"retriever","to":"answerer","condition":""}]}',
 '[]', true, true),
('meeting-notes-to-jira', 'Meeting Notes → Jira',
 'Turns meeting notes into Jira tickets with owners and due dates.',
 'ops', 'langgraph', 2, array['jira','google_drive'], 'templates/meeting-notes-to-jira',
 '{"agents":[
   {"key":"summarizer","name":"Summarizer","type":"autonomous","role":"Extracts decisions and action items","instructions":"List decisions and action items with owners.","position":{"x":0,"y":80}},
   {"key":"ticket_writer","name":"Ticket Writer","type":"workflow","role":"Creates Jira issues","instructions":"Create one Jira issue per action item in {{var.jira_project}}.","position":{"x":320,"y":80}}],
  "edges":[{"from":"summarizer","to":"ticket_writer","condition":""}]}',
 '[{"id":"jira_project","label":"Jira project key","type":"text","required":true,"placeholder":"OPS"}]', true, true),
('voice-receptionist', 'Voice Receptionist',
 'Answers calls, books appointments and hands off to staff.',
 'voice', 'lyzr_adk', 3, array[]::text[], 'templates/voice-receptionist',
 '{"agents":[
   {"key":"greeter","name":"Greeter","type":"autonomous","role":"Greets callers and detects intent","instructions":"Greet callers for {{var.business_name}} and ask how to help.","position":{"x":0,"y":80}},
   {"key":"scheduler","name":"Scheduler","type":"workflow","role":"Books appointments","instructions":"Offer the next three open slots and confirm.","position":{"x":320,"y":0}},
   {"key":"handoff","name":"Handoff","type":"human_approval","role":"Transfers to staff","instructions":"Transfer the caller to a staff member.","position":{"x":320,"y":180}}],
  "edges":[{"from":"greeter","to":"scheduler","condition":"intent == booking"},{"from":"greeter","to":"handoff","condition":"intent == human"}]}',
 '[{"id":"business_name","label":"Business name","type":"text","required":true,"placeholder":"Bright Smiles Dental"}]', true, true)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, graph = excluded.graph,
  questions = excluded.questions, integrations = excluded.integrations, published = excluded.published;

-- -----------------------------------------------------------------------------
-- 2. Demo project generator
-- -----------------------------------------------------------------------------
create or replace function public.seed_demo_project(p_workspace_id uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid     uuid := auth.uid();
  proj    uuid;
  a_tri   uuid; a_kno uuid; a_res uuid; a_esc uuid;
  dep_live uuid;
  eset    uuid;
  i       int;
  ts      timestamptz;
  st      text;
  agent_pick uuid;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if not public.is_workspace_member(p_workspace_id, 'editor') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.projects (workspace_id, name, description, initial_prompt, status, framework, source, created_by, preview_url, live_url)
  values (p_workspace_id, 'Support Copilot',
          'Reads Zendesk tickets, answers FAQs from Notion and escalates angry customers to Slack.',
          'Build a customer support agent that reads our Zendesk tickets, answers FAQs from our Notion docs and escalates angry customers to Slack.',
          'live', 'lyzr_adk', 'prompt', uid,
          '/demo/preview/support-copilot', 'https://support-copilot.architect.app')
  returning id into proj;

  insert into public.project_settings (project_id, eval_gate_threshold, block_prod_on_eval_fail) values (proj, 85, true);

  insert into public.prds (project_id, version, content, created_by) values (proj, 1, jsonb_build_object(
    'title', 'Support Copilot',
    'summary', 'An agentic support desk that resolves FAQs automatically and escalates unhappy customers to humans within minutes.',
    'sections', jsonb_build_array(
      jsonb_build_object('key','overview','title','Overview','bodyMd','Support Copilot reads new Zendesk tickets, answers common questions using Notion docs, and escalates angry customers to the #support-escalations Slack channel.'),
      jsonb_build_object('key','users','title','Users','bodyMd','- Support agents who review escalations\n- Support lead who monitors quality\n- Customers who receive replies'),
      jsonb_build_object('key','goals','title','Goals','bodyMd','- Resolve 60% of FAQ tickets without a human\n- Escalate negative-sentiment tickets in under 2 minutes\n- Keep CSAT at or above 4.5'),
      jsonb_build_object('key','features','title','Features','bodyMd','1. Ticket triage by intent and sentiment\n2. Cited answers from Notion\n3. Draft replies posted to Zendesk\n4. Slack escalation with summary'),
      jsonb_build_object('key','agents','title','Agents','bodyMd','Triage → Knowledge → Responder; Triage → Escalation when sentiment < -0.5.'),
      jsonb_build_object('key','integrations','title','Integrations','bodyMd','Zendesk (tickets), Notion (knowledge), Slack (escalations).'),
      jsonb_build_object('key','data','title','Data','bodyMd','tickets(id, subject, intent, sentiment, status), replies(ticket_id, body, sources), escalations(ticket_id, posted_at).'),
      jsonb_build_object('key','ui','title','UI','bodyMd','Inbox page with ticket list and agent replies; Analytics page with resolution rate and CSAT.')
    )), uid);

  insert into public.agents (project_id, key, name, role, type, model, instructions, memory, position)
  values (proj, 'triage', 'Triage', 'Classifies intent and sentiment of each ticket', 'autonomous', 'anthropic/claude-haiku',
          'Classify each incoming ticket by intent (faq, billing, bug, other) and sentiment from -1 to 1.', '{"mode":"short"}', '{"x":0,"y":140}')
  returning id into a_tri;
  insert into public.agents (project_id, key, name, role, type, model, instructions, memory, position)
  values (proj, 'knowledge', 'Knowledge', 'Finds answers in Notion docs', 'autonomous', 'anthropic/claude-sonnet',
          'Search the Notion help center and return the best answer with citations.', '{"mode":"long"}', '{"x":340,"y":0}')
  returning id into a_kno;
  insert into public.agents (project_id, key, name, role, type, model, instructions, memory, position)
  values (proj, 'responder', 'Responder', 'Drafts a friendly reply in Zendesk', 'autonomous', 'anthropic/claude-sonnet',
          'Write a concise, friendly reply using the cited answer. Never promise refunds.', '{"mode":"short"}', '{"x":680,"y":0}')
  returning id into a_res;
  insert into public.agents (project_id, key, name, role, type, model, instructions, memory, position)
  values (proj, 'escalation', 'Escalation', 'Posts angry customers to Slack for a human', 'workflow', null,
          'Post a summary of the ticket and customer history to #support-escalations.', '{"mode":"none"}', '{"x":340,"y":300}')
  returning id into a_esc;

  insert into public.agent_edges (project_id, from_agent_id, to_agent_id, condition, label) values
    (proj, a_tri, a_kno, 'intent == faq', 'FAQ'),
    (proj, a_kno, a_res, '', null),
    (proj, a_tri, a_esc, 'sentiment < -0.5', 'Angry');

  insert into public.agent_tools (agent_id, tool_type, name) values
    (a_tri, 'builtin', 'http_request'),
    (a_kno, 'builtin', 'knowledge_base'),
    (a_kno, 'builtin', 'web_search'),
    (a_res, 'builtin', 'http_request');

  insert into public.checkpoints (project_id, summary, commit_sha, created_by, created_at) values
    (proj, 'Initial build: 4 agents, inbox UI, analytics page', repeat('a', 40), uid, now() - interval '6 days'),
    (proj, 'Made replies shorter and added citations', repeat('b', 40), uid, now() - interval '3 days'),
    (proj, 'Escalate when sentiment is below -0.5', repeat('c', 40), uid, now() - interval '1 day');

  insert into public.deployments (project_id, environment, version, status, source, commit_sha, url, created_by, created_at, live_at, finished_at) values
    (proj, 'production', 1, 'superseded', 'manual', repeat('a', 40), 'https://support-copilot.architect.app', uid, now() - interval '6 days', now() - interval '6 days', now() - interval '6 days'),
    (proj, 'production', 2, 'superseded', 'manual', repeat('b', 40), 'https://support-copilot.architect.app', uid, now() - interval '3 days', now() - interval '3 days', now() - interval '3 days');
  insert into public.deployments (project_id, environment, version, status, source, commit_sha, url, created_by, created_at, live_at, finished_at)
  values (proj, 'production', 3, 'live', 'manual', repeat('c', 40), 'https://support-copilot.architect.app', uid, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day')
  returning id into dep_live;

  insert into public.guardrails (project_id, type, config, enabled, updated_by) values
    (proj, 'pii_redaction', '{"entities":["EMAIL","PHONE","CREDIT_CARD"]}', true, uid),
    (proj, 'spend_limit', '{"perRunUsd":0.25,"perDayUsd":40}', true, uid),
    (proj, 'blocked_topics', '{"topics":["legal advice","medical advice"]}', false, uid);

  insert into public.eval_sets (project_id, name, created_by) values (proj, 'FAQ regression', uid) returning id into eset;
  insert into public.eval_cases (eval_set_id, input, expected, source)
  select eset,
         jsonb_build_object('message', q),
         jsonb_build_object('contains', jsonb_build_array(k)),
         'generated'
  from (values
    ('How do I reset my password?', 'reset'), ('Can I change my billing email?', 'billing'),
    ('Where can I download invoices?', 'invoice'), ('Do you support SSO?', 'SSO'),
    ('How do I cancel my plan?', 'cancel'), ('What is your refund policy?', 'refund'),
    ('How do I add a teammate?', 'invite'), ('Is there an API?', 'API'),
    ('How do I export my data?', 'export'), ('Which regions do you host in?', 'region')
  ) as t(q, k);
  insert into public.eval_runs (eval_set_id, project_id, commit_sha, status, score, passed, failed, created_by, created_at, finished_at)
  values (eset, proj, repeat('c', 40), 'succeeded', 90, 9, 1, uid, now() - interval '1 day', now() - interval '1 day');

  -- ~5,000 runs over 30 days with a weekday pattern and ~4% errors
  for i in 1..5000 loop
    ts := now() - (random() * interval '30 days');
    st := case
            when random() < 0.04 then 'error'
            when random() < 0.08 then 'escalated'
            else 'success'
          end;
    agent_pick := case when random() < 0.85 then a_tri else a_kno end;
    insert into public.runs (project_id, deployment_id, environment, entry_agent_id, end_user_ref, status, latency_ms, tokens_in, tokens_out, cost, input_preview, output_preview, created_at)
    values (proj, dep_live, 'production', agent_pick,
            'user_' || lpad((floor(random() * 900) + 100)::int::text, 3, '0'),
            st,
            (800 + random() * 2600 + case when st = 'error' then 4000 else 0 end)::int,
            (600 + random() * 1800)::int,
            (120 + random() * 500)::int,
            round((0.002 + random() * 0.03)::numeric, 5),
            (array['How do I reset my password?','My invoice is wrong and I am furious','Can I add a teammate?','Where is my refund?!','Do you support SSO?'])[1 + floor(random() * 5)::int],
            case st when 'error' then 'Tool zendesk.get_ticket timed out'
                    when 'escalated' then 'Escalated to #support-escalations'
                    else 'Answered with 2 cited Notion articles' end,
            ts);
  end loop;

  insert into public.activity_events (workspace_id, project_id, actor_id, verb, object, summary)
  values (p_workspace_id, proj, uid, 'created', jsonb_build_object('project_id', proj), 'Created the Support Copilot demo project');

  return proj;
end;
$$;

revoke all on function public.seed_demo_project(uuid) from public, anon;
grant execute on function public.seed_demo_project(uuid) to authenticated;
