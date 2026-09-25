-- =============================================================================
-- Architect 2.0 — Supabase schema
-- Source: docs/engineering/engineering-doc.md §7 (Database Design and Schema)
-- Paste into Supabase SQL Editor on a fresh project and run once.
-- Conventions: uuid PKs, timestamptz, snake_case plural tables, RLS on every table.
-- The service_role key (workers, webhooks) bypasses RLS; the browser uses anon/auth.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists vector   with schema extensions;

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.member_role    as enum ('viewer','editor','admin','owner');
create type public.ui_mode        as enum ('build','code');
create type public.project_status as enum ('draft','building','preview','live','archived');
create type public.agent_type     as enum ('autonomous','workflow','human_approval','code');
create type public.framework      as enum ('lyzr_adk','langgraph','crewai','openai_agents','google_adk','claude_agent_sdk','mastra','autogen','custom');
create type public.job_status     as enum ('queued','running','succeeded','failed','cancelled');
create type public.env_name       as enum ('development','preview','production');
create type public.deploy_status  as enum ('queued','building','releasing','live','failed','rolled_back','superseded');
create type public.plan_tier      as enum ('free','pro','team','enterprise');

-- -----------------------------------------------------------------------------
-- 2. Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.member_role_rank(r public.member_role)
returns int language sql immutable set search_path = public as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Identity and workspaces
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                citext,
  full_name            text check (char_length(full_name) <= 80),
  avatar_url           text,
  default_mode         public.ui_mode not null default 'build',
  use_case             text check (use_case in ('support','sales','ops','research','content','personal','other')),
  preferred_framework  public.framework not null default 'lyzr_adk',
  preferred_language   text not null default 'python' check (preferred_language in ('python','typescript')),
  theme                text not null default 'dark' check (theme in ('light','dark','system')),
  mode_prefs           jsonb not null default '{}'::jsonb,
  onboarded_at         timestamptz,
  last_workspace_id    uuid,
  last_seen_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.workspaces (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 1 and 60),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  owner_id              uuid not null references public.profiles(id) on delete restrict,
  plan                  public.plan_tier not null default 'free',
  credits_balance       numeric(12,2) not null default 30 check (credits_balance >= 0),
  code_mode_restricted  boolean not null default false,
  prod_deploy_role      public.member_role not null default 'editor',
  training_opt_out      boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index workspaces_owner_id_idx on public.workspaces(owner_id);

alter table public.profiles
  add constraint profiles_last_workspace_id_fkey
  foreign key (last_workspace_id) references public.workspaces(id) on delete set null;

create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          public.member_role not null,
  is_developer  boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create unique index workspace_members_one_owner_key on public.workspace_members(workspace_id) where role = 'owner';

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         citext not null,
  role          public.member_role not null check (role <> 'owner'),
  is_developer  boolean not null default false,
  token_hash    text not null unique,
  invited_by    uuid references public.profiles(id) on delete set null,
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index invitations_workspace_id_idx on public.invitations(workspace_id);
create index invitations_email_idx on public.invitations(email);

create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  token_hash    text not null unique,
  prefix        char(8) not null,
  scopes        text[] not null default '{}',
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index api_tokens_user_id_idx on public.api_tokens(user_id);

create table public.cli_device_codes (
  device_code   text primary key,
  user_code     text not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  client_name   text not null,
  user_id       uuid references public.profiles(id) on delete cascade,
  api_token_id  uuid references public.api_tokens(id) on delete set null,
  approved_at   timestamptz,
  expires_at    timestamptz not null default now() + interval '10 minutes',
  created_at    timestamptz not null default now()
);

-- Membership helpers (security definer so policies can call them without recursion)
create or replace function public.is_workspace_member(ws uuid, min_role public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and public.member_role_rank(m.role) >= public.member_role_rank(min_role)
  );
$$;

create or replace function public.is_workspace_developer(ws uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = ws and m.user_id = auth.uid()
      and (m.role in ('owner','admin')
           or (m.role = 'editor' and (m.is_developer or not w.code_mode_restricted)))
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. GitHub installations and templates (referenced by projects)
-- -----------------------------------------------------------------------------
create table public.github_installations (
  id                    bigint primary key,
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  account_login         text not null,
  account_type          text not null check (account_type in ('User','Organization')),
  repository_selection  text not null check (repository_selection in ('all','selected')),
  suspended_at          timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index github_installations_workspace_id_idx on public.github_installations(workspace_id);

create table public.templates (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name               text not null,
  description        text not null,
  category           text not null check (category in ('support','sales','ops','research','content','hr','voice','other')),
  framework          public.framework not null default 'lyzr_adk',
  agents_count       int not null default 1 check (agents_count > 0),
  integrations       text[] not null default '{}',
  repo_ref           text not null,
  graph              jsonb not null,
  questions          jsonb not null default '[]'::jsonb,
  preview_media_url  text,
  is_official        boolean not null default false,
  published          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. Projects, PRDs, agents
-- -----------------------------------------------------------------------------
create table public.projects (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces(id) on delete cascade,
  name                    text not null check (char_length(name) between 1 and 80),
  description             text check (char_length(description) <= 500),
  initial_prompt          text check (char_length(initial_prompt) <= 10000),
  status                  public.project_status not null default 'draft',
  mode_default            public.ui_mode not null default 'build',
  framework               public.framework not null default 'lyzr_adk',
  language                text not null default 'python' check (language in ('python','typescript')),
  source                  text not null default 'prompt' check (source in ('prompt','blank','template','import_github','import_zip','import_v1','import_builder','import_studio')),
  template_id             uuid references public.templates(id) on delete set null,
  repo_provider           text not null default 'architect' check (repo_provider in ('architect','github')),
  repo_owner              text,
  repo_name               text,
  default_branch          text not null default 'main',
  working_branch          text not null default 'main',
  github_installation_id  bigint references public.github_installations(id) on delete set null,
  auto_commit             boolean not null default true,
  thumbnail_url           text,
  preview_url             text,
  live_url                text,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);
create index projects_workspace_id_updated_at_idx on public.projects(workspace_id, updated_at desc) where deleted_at is null;
create index projects_name_trgm_idx on public.projects using gin (name gin_trgm_ops);

create or replace function public.project_workspace_id(p uuid)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select workspace_id from public.projects where id = p;
$$;

create or replace function public.is_project_member(p uuid, min_role public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_workspace_member(public.project_workspace_id(p), min_role);
$$;

create or replace function public.is_project_developer(p uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_workspace_developer(public.project_workspace_id(p));
$$;

create table public.prds (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     int not null check (version > 0),
  content     jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

create table public.agents (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  key              text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  name             text not null check (char_length(name) between 1 and 60),
  role             text check (char_length(role) <= 200),
  type             public.agent_type not null default 'autonomous',
  framework        public.framework,
  model            text,
  instructions     text check (char_length(instructions) <= 20000),
  memory           jsonb not null default '{"mode":"none"}'::jsonb,
  guardrail_ids    uuid[] not null default '{}',
  position         jsonb not null default '{"x":0,"y":0}'::jsonb,
  is_entry         boolean not null default false,
  managed          boolean not null default true,
  locked           boolean not null default false,
  has_custom_code  boolean not null default false,
  runtime_status   text not null default 'active' check (runtime_status in ('active','paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, key)
);
create index agents_project_id_idx on public.agents(project_id);
create unique index agents_one_entry_per_project_key on public.agents(project_id) where is_entry;

create table public.agent_edges (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  from_agent_id  uuid not null references public.agents(id) on delete cascade,
  to_agent_id    uuid not null references public.agents(id) on delete cascade,
  condition      text not null default '' check (char_length(condition) <= 500),
  label          text check (char_length(label) <= 80),
  created_at     timestamptz not null default now(),
  check (from_agent_id <> to_agent_id),
  unique (from_agent_id, to_agent_id, condition)
);
create index agent_edges_project_id_idx on public.agent_edges(project_id);

-- -----------------------------------------------------------------------------
-- 6. Secrets, env contract, integrations, MCP, agent tools, locks
-- -----------------------------------------------------------------------------
create table public.secrets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  environment   public.env_name,
  kind          text not null check (kind in ('env','model_key','integration_token','mcp_header')),
  name          text not null check (char_length(name) between 1 and 64),
  ciphertext    bytea not null,
  key_id        text not null,
  last4         char(4) not null,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind <> 'env' or name ~ '^[A-Z][A-Z0-9_]{0,63}$')
);
create unique index secrets_scope_name_key on public.secrets(workspace_id, project_id, environment, kind, name) nulls not distinct;

create table public.project_env_vars (
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null check (name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  required     boolean not null default true,
  description  text,
  primary key (project_id, name)
);

create table public.integrations (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  project_id           uuid references public.projects(id) on delete cascade,
  provider             text not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  status               text not null default 'connected' check (status in ('connected','error','revoked')),
  scopes               text[] not null default '{}',
  nango_connection_id  text,
  secret_id            uuid references public.secrets(id) on delete set null,
  connected_by         uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index integrations_scope_provider_key on public.integrations(workspace_id, project_id, provider) nulls not distinct;

create table public.mcp_servers (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 60),
  transport         text not null check (transport in ('http','sse','stdio')),
  url               text check (url ~ '^https://'),
  header_secret_id  uuid references public.secrets(id) on delete set null,
  status            text not null default 'unknown' check (status in ('unknown','ok','error')),
  last_checked_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.mcp_tools (
  id             uuid primary key default gen_random_uuid(),
  mcp_server_id  uuid not null references public.mcp_servers(id) on delete cascade,
  name           text not null,
  description    text,
  input_schema   jsonb not null default '{}'::jsonb,
  enabled        boolean not null default true,
  unique (mcp_server_id, name)
);

create table public.agent_tools (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  tool_type       text not null check (tool_type in ('integration','mcp','builtin','code')),
  integration_id  uuid references public.integrations(id) on delete cascade,
  mcp_tool_id     uuid references public.mcp_tools(id) on delete cascade,
  name            text not null,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  check (tool_type <> 'integration' or integration_id is not null),
  check (tool_type <> 'mcp' or mcp_tool_id is not null)
);
create index agent_tools_agent_id_idx on public.agent_tools(agent_id);

create table public.locks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  target_type  text not null check (target_type in ('agent','page','file')),
  target_ref   text not null,
  locked_by    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (project_id, target_type, target_ref)
);

-- -----------------------------------------------------------------------------
-- 7. Generation, builds, edits, checkpoints, sandboxes
-- -----------------------------------------------------------------------------
create table public.generation_sessions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  stage        text not null default 'clarify' check (stage in ('clarify','prd','graph','estimate','confirmed')),
  prompt       text not null check (char_length(prompt) between 1 and 10000),
  attachments  jsonb not null default '[]'::jsonb,
  questions    jsonb not null default '[]'::jsonb,
  answers      jsonb not null default '{}'::jsonb,
  estimate     jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index generation_sessions_project_id_idx on public.generation_sessions(project_id, created_at desc);

create table public.builds (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  session_id        uuid references public.generation_sessions(id) on delete set null,
  status            public.job_status not null default 'queued',
  kind              text not null default 'initial' check (kind in ('initial','rebuild','scaffold_only')),
  sandbox_id        text,
  preview_url       text,
  credits_reserved  numeric(10,2) not null default 0,
  credits_used      numeric(10,2) not null default 0,
  autofix_attempts  smallint not null default 0 check (autofix_attempts between 0 and 3),
  error             jsonb,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index builds_project_id_created_at_idx on public.builds(project_id, created_at desc);
create unique index builds_one_active_per_project_key on public.builds(project_id) where status in ('queued','running');

create table public.build_events (
  id          bigint generated always as identity primary key,
  build_id    uuid not null references public.builds(id) on delete cascade,
  seq         int not null,
  type        text not null check (type in ('step_started','step_done','log','file_written','test_result','autofix','error','done')),
  step_key    text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (build_id, seq)
);

create table public.edits (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  mode         text not null check (mode in ('plan','build','visual')),
  channel      text not null check (channel in ('chat','canvas','visual','code_agent')),
  message      text check (char_length(message) <= 10000),
  context      jsonb not null default '[]'::jsonb,
  patch        jsonb,
  summary      text,
  status       text not null default 'proposed' check (status in ('proposed','applied','rejected','partially_applied')),
  credits_used numeric(10,2) not null default 0,
  created_at   timestamptz not null default now()
);
create index edits_project_id_created_at_idx on public.edits(project_id, created_at desc);

create table public.checkpoints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  edit_id     uuid references public.edits(id) on delete set null,
  build_id    uuid references public.builds(id) on delete set null,
  summary     text not null check (char_length(summary) between 1 and 500),
  commit_sha  char(40),
  branch      text not null default 'main',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index checkpoints_project_id_created_at_idx on public.checkpoints(project_id, created_at desc);

create table public.sandboxes (
  id              text primary key,
  project_id      uuid not null references public.projects(id) on delete cascade,
  branch          text not null,
  status          text not null default 'provisioning' check (status in ('provisioning','ready','running','idle','sleeping','destroyed')),
  resources       jsonb not null default '{"vcpu":2,"memory_mb":4096,"disk_gb":10}'::jsonb,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index sandboxes_project_id_idx on public.sandboxes(project_id);

-- -----------------------------------------------------------------------------
-- 8. Deployments, domains, settings, GitHub PRs, tasks, sync events
-- -----------------------------------------------------------------------------
create table public.deployments (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  environment       public.env_name not null,
  version           int not null check (version > 0),
  status            public.deploy_status not null default 'queued',
  source            text not null default 'manual' check (source in ('manual','pr','rollback','auto')),
  commit_sha        char(40),
  image_ref         text,
  url               text,
  preflight         jsonb not null default '[]'::jsonb,
  rolled_back_from  uuid references public.deployments(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  live_at           timestamptz,
  finished_at       timestamptz,
  unique (project_id, environment, version)
);
create unique index deployments_one_live_per_env_key on public.deployments(project_id, environment) where status = 'live';
create index deployments_project_id_created_at_idx on public.deployments(project_id, created_at desc);

create table public.deployment_events (
  id             bigint generated always as identity primary key,
  deployment_id  uuid not null references public.deployments(id) on delete cascade,
  seq            int not null,
  type           text not null check (type in ('status','log','check')),
  message        text not null,
  created_at     timestamptz not null default now(),
  unique (deployment_id, seq)
);

create table public.domains (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  hostname            citext not null unique check (hostname ~* '^([a-z0-9-]+\.)+[a-z]{2,}$' and hostname !~* '\.architect\.app$'),
  environment         public.env_name not null default 'production',
  status              text not null default 'pending' check (status in ('pending','verified','active','error')),
  verification_token  text not null default encode(gen_random_bytes(16), 'hex'),
  cert_expires_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.project_settings (
  project_id                uuid primary key references public.projects(id) on delete cascade,
  eval_gate_threshold       numeric(5,2) check (eval_gate_threshold between 0 and 100),
  block_prod_on_eval_fail   boolean not null default false,
  region                    text not null default 'iad',
  min_instances             int not null default 0 check (min_instances >= 0),
  max_instances             int not null default 3 check (max_instances >= 1),
  timeout_s                 int not null default 60 check (timeout_s between 5 and 900),
  cron_triggers             jsonb not null default '[]'::jsonb,
  updated_at                timestamptz not null default now(),
  check (max_instances >= min_instances)
);

create table public.pull_requests (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects(id) on delete cascade,
  number                 int not null check (number > 0),
  branch                 text not null,
  base                   text not null default 'main',
  title                  text not null,
  url                    text not null,
  state                  text not null default 'open' check (state in ('open','merged','closed')),
  preview_deployment_id  uuid references public.deployments(id) on delete set null,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (project_id, number)
);

create table public.agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  message     text not null check (char_length(message) <= 10000),
  branch      text not null,
  sandbox_id  text references public.sandboxes(id) on delete set null,
  status      public.job_status not null default 'queued',
  edit_id     uuid references public.edits(id) on delete set null,
  pr_id       uuid references public.pull_requests(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index agent_tasks_project_id_idx on public.agent_tasks(project_id, created_at desc);

create table public.git_sync_events (
  id           bigint generated always as identity primary key,
  project_id   uuid not null references public.projects(id) on delete cascade,
  direction    text not null check (direction in ('push','pull')),
  commit_from  char(40),
  commit_to    char(40),
  status       text not null check (status in ('ok','conflict','failed')),
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index git_sync_events_project_id_idx on public.git_sync_events(project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 9. Import
-- -----------------------------------------------------------------------------
create table public.imports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  source        text not null check (source in ('github','zip','v1','builder','studio','git_url')),
  source_ref    jsonb not null,
  status        text not null default 'scanning' check (status in ('scanning','needs_attention','ready','finalized','failed')),
  project_id    uuid references public.projects(id) on delete set null,
  error         jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index imports_workspace_id_idx on public.imports(workspace_id, created_at desc);

create table public.import_reports (
  import_id         uuid primary key references public.imports(id) on delete cascade,
  detected_stack    jsonb not null default '{}'::jsonb,
  agents            jsonb not null default '[]'::jsonb,
  missing_env       text[] not null default '{}',
  unsupported_deps  jsonb not null default '[]'::jsonb,
  secrets_found     jsonb not null default '[]'::jsonb,
  start_command     text,
  warnings          jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 10. Runs (telemetry summaries, monthly partitions), evals, guardrails, approvals, alerts
-- -----------------------------------------------------------------------------
create table public.runs (
  id              uuid not null default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  deployment_id   uuid references public.deployments(id) on delete set null,
  environment     public.env_name not null,
  entry_agent_id  uuid references public.agents(id) on delete set null,
  end_user_ref    text,
  status          text not null check (status in ('success','error','escalated','awaiting_approval','blocked')),
  latency_ms      int not null default 0 check (latency_ms >= 0),
  tokens_in       int not null default 0,
  tokens_out      int not null default 0,
  cost            numeric(10,5) not null default 0,
  input_preview   text check (char_length(input_preview) <= 500),
  output_preview  text check (char_length(output_preview) <= 500),
  trace           jsonb,
  feedback        smallint check (feedback in (-1,0,1)),
  created_at      timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create table public.runs_default partition of public.runs default;
create index runs_project_id_created_at_idx on public.runs(project_id, created_at desc);
create index runs_deployment_id_status_idx on public.runs(deployment_id, status);

-- Creates the monthly partition that contains `month`; call from a daily cron (pg_cron) job.
create or replace function public.create_runs_partition(month date)
returns void language plpgsql set search_path = public as $$
declare
  start_d date := date_trunc('month', month)::date;
  end_d   date := (date_trunc('month', month) + interval '1 month')::date;
  part    text := format('runs_%s', to_char(start_d, 'YYYY_MM'));
begin
  execute format('create table if not exists public.%I partition of public.runs for values from (%L) to (%L)', part, start_d, end_d);
  execute format('alter table public.%I enable row level security', part);
end;
$$;

create table public.eval_sets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index eval_sets_project_id_idx on public.eval_sets(project_id);

create table public.eval_cases (
  id             uuid primary key default gen_random_uuid(),
  eval_set_id    uuid not null references public.eval_sets(id) on delete cascade,
  input          jsonb not null,
  expected       jsonb,
  rubric         text,
  source         text not null default 'manual' check (source in ('manual','csv','generated','from_run')),
  source_run_id  uuid,
  created_at     timestamptz not null default now()
);
create index eval_cases_eval_set_id_idx on public.eval_cases(eval_set_id);

create table public.eval_runs (
  id           uuid primary key default gen_random_uuid(),
  eval_set_id  uuid not null references public.eval_sets(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  commit_sha   char(40),
  status       public.job_status not null default 'queued',
  score        numeric(5,2) check (score between 0 and 100),
  passed       int not null default 0,
  failed       int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index eval_runs_project_id_idx on public.eval_runs(project_id, created_at desc);

create table public.eval_results (
  id            uuid primary key default gen_random_uuid(),
  eval_run_id   uuid not null references public.eval_runs(id) on delete cascade,
  eval_case_id  uuid not null references public.eval_cases(id) on delete cascade,
  passed        boolean not null,
  scores        jsonb not null default '{}'::jsonb,
  output        jsonb,
  latency_ms    int,
  cost          numeric(10,5),
  created_at    timestamptz not null default now()
);
create index eval_results_eval_run_id_idx on public.eval_results(eval_run_id);

create table public.guardrails (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  agent_id    uuid references public.agents(id) on delete cascade,
  type        text not null check (type in ('pii_redaction','blocked_topics','spend_limit','output_schema','jailbreak_detection','allowed_tools')),
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index guardrails_project_id_idx on public.guardrails(project_id);

create table public.guardrail_violations (
  id            bigint generated always as identity primary key,
  project_id    uuid not null references public.projects(id) on delete cascade,
  run_id        uuid,
  guardrail_id  uuid not null references public.guardrails(id) on delete cascade,
  action        text not null check (action in ('blocked','redacted','flagged')),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index guardrail_violations_project_id_idx on public.guardrail_violations(project_id, created_at desc);

create table public.approvals (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null,
  project_id   uuid not null references public.projects(id) on delete cascade,
  agent_id     uuid references public.agents(id) on delete set null,
  payload      jsonb not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  assigned_to  uuid[] not null default '{}',
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  note         text,
  expires_at   timestamptz not null default now() + interval '72 hours',
  created_at   timestamptz not null default now()
);
create index approvals_project_id_status_idx on public.approvals(project_id, status);

create table public.alert_rules (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  metric      text not null check (metric in ('error_rate','cost_day','latency_p95','escalations')),
  operator    text not null check (operator in ('>','>=','<','<=')),
  threshold   numeric not null,
  window_min  int not null default 5 check (window_min between 1 and 1440),
  channels    jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.alert_events (
  id           bigint generated always as identity primary key,
  rule_id      uuid not null references public.alert_rules(id) on delete cascade,
  value        numeric not null,
  fired_at     timestamptz not null default now(),
  resolved_at  timestamptz
);
create index alert_events_rule_id_idx on public.alert_events(rule_id, fired_at desc);

-- -----------------------------------------------------------------------------
-- 11. Collaboration
-- -----------------------------------------------------------------------------
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  target_type  text not null check (target_type in ('prd_section','agent','element','file_line','run')),
  target_ref   text not null,
  anchor       jsonb,
  parent_id    uuid references public.comments(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 5000),
  author_id    uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index comments_target_idx on public.comments(project_id, target_type, target_ref);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications(user_id, read_at nulls first, created_at desc);

create table public.activity_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  verb          text not null,
  object        jsonb not null default '{}'::jsonb,
  summary       text not null,
  created_at    timestamptz not null default now()
);
create index activity_events_project_id_idx on public.activity_events(project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 12. Billing and usage
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  workspace_id            uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  plan                    public.plan_tier not null default 'free',
  seats                   int not null default 1 check (seats >= 1),
  status                  text not null default 'active' check (status in ('trialing','active','past_due','canceled','incomplete')),
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

create table public.credit_reservations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  reason        text not null,
  ref_type      text not null,
  ref_id        uuid,
  status        text not null default 'held' check (status in ('held','settled','released')),
  expires_at    timestamptz not null default now() + interval '2 hours',
  created_at    timestamptz not null default now()
);
create index credit_reservations_workspace_id_idx on public.credit_reservations(workspace_id) where status = 'held';

create table public.usage_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  user_id       uuid references public.profiles(id) on delete set null,
  action        text not null check (action in ('clarify','prd','graph','build','edit','eval','agent_run','deploy_minutes','topup','grant')),
  credits       numeric(10,2) not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index usage_events_workspace_id_created_at_idx on public.usage_events(workspace_id, created_at);

create table public.spend_controls (
  workspace_id      uuid primary key references public.workspaces(id) on delete cascade,
  monthly_cap       numeric(10,2) check (monthly_cap > 0),
  alert_thresholds  int[] not null default '{50,80,100}',
  auto_topup        boolean not null default false,
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 13. Audit, lifecycle, code search
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  target        jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index audit_logs_workspace_id_idx on public.audit_logs(workspace_id, created_at desc);

create table public.project_events (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index project_events_project_id_idx on public.project_events(project_id, created_at desc);

create table public.code_chunks (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  commit_sha  char(40) not null,
  path        text not null,
  start_line  int not null,
  end_line    int not null,
  content     text not null,
  embedding   vector(1536) not null
);
create index code_chunks_project_id_idx on public.code_chunks(project_id);
create index code_chunks_embedding_idx on public.code_chunks using hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- 14. Views
-- -----------------------------------------------------------------------------
-- Clients never read secrets.ciphertext; they call this masked listing instead.
create or replace function public.list_secrets_masked(p_project_id uuid)
returns table (id uuid, environment public.env_name, kind text, name text, last4 char(4), updated_at timestamptz, updated_by uuid)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, s.environment, s.kind, s.name, s.last4, s.updated_at, s.updated_by
  from public.secrets s
  where s.project_id = p_project_id
    and public.is_project_developer(p_project_id)
  order by s.name, s.environment;
$$;

-- -----------------------------------------------------------------------------
-- 15. updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','templates','projects','agents','secrets','integrations','mcp_servers',
    'generation_sessions','domains','project_settings','pull_requests','agent_tasks','imports',
    'guardrails','alert_rules','comments','subscriptions','spend_controls'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 16. Auth + onboarding functions
-- -----------------------------------------------------------------------------
-- New auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 80),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generates a unique workspace slug from a name
create or replace function public.unique_workspace_slug(base text)
returns text language plpgsql set search_path = public, extensions as $$
declare
  s text := trim(both '-' from regexp_replace(lower(coalesce(base, '')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
begin
  if char_length(s) < 3 then s := 'workspace'; end if;
  s := left(s, 32);
  candidate := s;
  while exists (select 1 from public.workspaces where slug = candidate) loop
    candidate := s || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6);
  end loop;
  return candidate;
end;
$$;

-- Atomically completes onboarding: profile prefs + workspace + owner membership.
create or replace function public.complete_onboarding(
  p_default_mode        public.ui_mode,
  p_use_case            text,
  p_workspace_name      text,
  p_preferred_framework public.framework default 'lyzr_adk',
  p_preferred_language  text default 'python'
) returns public.workspaces
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  ws  public.workspaces;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = uid and onboarded_at is not null) then
    raise exception 'ALREADY_ONBOARDED' using errcode = '23505';
  end if;
  if char_length(trim(p_workspace_name)) not between 1 and 60 then
    raise exception 'VALIDATION_FAILED: workspace name must be 1-60 characters' using errcode = '22023';
  end if;

  insert into public.workspaces (name, slug, owner_id)
  values (trim(p_workspace_name), public.unique_workspace_slug(p_workspace_name), uid)
  returning * into ws;

  insert into public.workspace_members (workspace_id, user_id, role, is_developer)
  values (ws.id, uid, 'owner', p_default_mode = 'code');

  insert into public.spend_controls (workspace_id) values (ws.id);
  insert into public.subscriptions (workspace_id) values (ws.id);
  insert into public.usage_events (workspace_id, user_id, action, credits, meta)
  values (ws.id, uid, 'grant', 30, '{"reason":"free_plan_monthly"}');

  update public.profiles
     set default_mode = p_default_mode,
         use_case = p_use_case,
         preferred_framework = p_preferred_framework,
         preferred_language = p_preferred_language,
         onboarded_at = now(),
         last_workspace_id = ws.id
   where id = uid;

  return ws;
end;
$$;

-- Creates an additional workspace for an onboarded user.
create or replace function public.create_workspace(p_name text)
returns public.workspaces
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  ws  public.workspaces;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'VALIDATION_FAILED: workspace name must be 1-60 characters' using errcode = '22023';
  end if;
  insert into public.workspaces (name, slug, owner_id)
  values (trim(p_name), public.unique_workspace_slug(p_name), uid) returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws.id, uid, 'owner');
  insert into public.spend_controls (workspace_id) values (ws.id);
  insert into public.subscriptions (workspace_id) values (ws.id);
  return ws;
end;
$$;

-- Accepts an invitation by raw token (hashed with sha256 hex, matching invitations.token_hash).
create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  ws  public.workspaces;
  user_email citext;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into inv from public.invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'EXPIRED' using errcode = '22023';
  end if;
  select email into user_email from public.profiles where id = uid;
  if user_email is distinct from inv.email then
    raise exception 'FORBIDDEN: invitation is for a different email' using errcode = '42501';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, is_developer)
  values (inv.workspace_id, uid, inv.role, inv.is_developer)
  on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now()), last_workspace_id = inv.workspace_id
   where id = uid;
  select * into ws from public.workspaces where id = inv.workspace_id;
  return ws;
end;
$$;

-- Canvas: creating the first agent of a project makes it the entry agent.
create or replace function public.agents_set_first_entry()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.agents where project_id = new.project_id and is_entry) then
    new.is_entry := true;
  end if;
  return new;
end;
$$;
create trigger agents_set_first_entry before insert on public.agents
  for each row execute function public.agents_set_first_entry();

-- Canvas: an edge may only connect agents of its own project.
create or replace function public.agent_edges_same_project()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.agents
      where id in (new.from_agent_id, new.to_agent_id) and project_id = new.project_id) <> 2 then
    raise exception 'VALIDATION_FAILED: edge agents must belong to the edge project' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger agent_edges_same_project before insert or update on public.agent_edges
  for each row execute function public.agent_edges_same_project();

-- Projects: bump updated_at of the parent project when its graph changes (dashboard ordering).
create or replace function public.touch_project()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.projects set updated_at = now() where id = coalesce(new.project_id, old.project_id);
  return null;
end;
$$;
create trigger agents_touch_project after insert or update or delete on public.agents
  for each row execute function public.touch_project();
create trigger agent_edges_touch_project after insert or update or delete on public.agent_edges
  for each row execute function public.touch_project();

-- Grants for RPCs
revoke all on function public.complete_onboarding(public.ui_mode, text, text, public.framework, text) from public, anon;
revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.complete_onboarding(public.ui_mode, text, text, public.framework, text) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 17. Row Level Security
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','workspace_members','invitations','api_tokens','cli_device_codes',
    'github_installations','templates','projects','prds','agents','agent_edges','secrets',
    'project_env_vars','integrations','mcp_servers','mcp_tools','agent_tools','locks',
    'generation_sessions','builds','build_events','edits','checkpoints','sandboxes','deployments',
    'deployment_events','domains','project_settings','pull_requests','agent_tasks','git_sync_events',
    'imports','import_reports','runs','runs_default','eval_sets','eval_cases','eval_runs','eval_results',
    'guardrails','guardrail_violations','approvals','alert_rules','alert_events','comments',
    'notifications','activity_events','subscriptions','credit_reservations','usage_events',
    'spend_controls','audit_logs','project_events','code_chunks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: own row; teammates can read basic profile of co-members
create policy profiles_select_self_or_teammate on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces (inserts go through complete_onboarding / create_workspace RPCs)
create policy workspaces_select_member on public.workspaces for select to authenticated
  using (deleted_at is null and public.is_workspace_member(id));
create policy workspaces_update_admin on public.workspaces for update to authenticated
  using (public.is_workspace_member(id, 'admin')) with check (public.is_workspace_member(id, 'admin'));
create policy workspaces_delete_owner on public.workspaces for delete to authenticated
  using (owner_id = auth.uid());

-- workspace_members
create policy workspace_members_select_member on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_members_update_admin on public.workspace_members for update to authenticated
  using (public.is_workspace_member(workspace_id, 'admin') and role <> 'owner')
  with check (public.is_workspace_member(workspace_id, 'admin') and role <> 'owner');
create policy workspace_members_delete_admin_or_self on public.workspace_members for delete to authenticated
  using (role <> 'owner' and (public.is_workspace_member(workspace_id, 'admin') or user_id = auth.uid()));

-- invitations
create policy invitations_admin_all on public.invitations for all to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'))
  with check (public.is_workspace_member(workspace_id, 'admin'));

-- api_tokens: own tokens only
create policy api_tokens_own on public.api_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- cli_device_codes: service role only (no policies)

-- github_installations
create policy github_installations_select_member on public.github_installations for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- templates: published templates are public
create policy templates_select_published on public.templates for select to anon, authenticated
  using (published);

-- projects
create policy projects_select_member on public.projects for select to authenticated
  using (deleted_at is null and public.is_workspace_member(workspace_id));
create policy projects_select_deleted_admin on public.projects for select to authenticated
  using (deleted_at is not null and public.is_workspace_member(workspace_id, 'admin'));
create policy projects_insert_editor on public.projects for insert to authenticated
  with check (public.is_workspace_member(workspace_id, 'editor') and created_by = auth.uid());
create policy projects_update_editor on public.projects for update to authenticated
  using (public.is_workspace_member(workspace_id, 'editor'))
  with check (public.is_workspace_member(workspace_id, 'editor'));
create policy projects_delete_admin on public.projects for delete to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));

-- Project-scoped tables: read = member, write = editor
do $$
declare t text;
begin
  foreach t in array array[
    'prds','agents','agent_edges','locks','generation_sessions','edits','checkpoints',
    'eval_sets','eval_runs','comments','agent_tasks'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))', t || '_select_member', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_project_member(project_id, ''editor''))', t || '_insert_editor', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_project_member(project_id, ''editor'')) with check (public.is_project_member(project_id, ''editor''))', t || '_update_editor', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_project_member(project_id, ''editor''))', t || '_delete_editor', t);
  end loop;
end $$;

-- Project-scoped, read-only for clients (written by services with service role)
do $$
declare t text;
begin
  foreach t in array array[
    'builds','sandboxes','deployments','pull_requests','git_sync_events','runs','runs_default',
    'guardrail_violations','approvals','project_events','code_chunks','project_env_vars','domains',
    'project_settings','mcp_servers','guardrails','alert_rules'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))', t || '_select_member', t);
  end loop;
end $$;

-- Child tables readable through their parent
create policy build_events_select_member on public.build_events for select to authenticated
  using (exists (select 1 from public.builds b where b.id = build_id and public.is_project_member(b.project_id)));
create policy deployment_events_select_member on public.deployment_events for select to authenticated
  using (exists (select 1 from public.deployments d where d.id = deployment_id and public.is_project_member(d.project_id)));
create policy eval_cases_select_member on public.eval_cases for select to authenticated
  using (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id)));
create policy eval_cases_write_editor on public.eval_cases for all to authenticated
  using (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')))
  with check (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')));
create policy eval_results_select_member on public.eval_results for select to authenticated
  using (exists (select 1 from public.eval_runs r where r.id = eval_run_id and public.is_project_member(r.project_id)));
create policy mcp_tools_select_member on public.mcp_tools for select to authenticated
  using (exists (select 1 from public.mcp_servers s where s.id = mcp_server_id and public.is_project_member(s.project_id)));
create policy agent_tools_select_member on public.agent_tools for select to authenticated
  using (exists (select 1 from public.agents a where a.id = agent_id and public.is_project_member(a.project_id)));
create policy agent_tools_write_editor on public.agent_tools for all to authenticated
  using (exists (select 1 from public.agents a where a.id = agent_id and public.is_project_member(a.project_id, 'editor')))
  with check (exists (select 1 from public.agents a where a.id = agent_id and public.is_project_member(a.project_id, 'editor')));
create policy alert_events_select_member on public.alert_events for select to authenticated
  using (exists (select 1 from public.alert_rules r where r.id = rule_id and public.is_project_member(r.project_id)));
create policy import_reports_select_member on public.import_reports for select to authenticated
  using (exists (select 1 from public.imports i where i.id = import_id and public.is_workspace_member(i.workspace_id, 'editor')));

-- Workspace-scoped tables
create policy imports_select_editor on public.imports for select to authenticated
  using (public.is_workspace_member(workspace_id, 'editor'));
create policy integrations_select_member on public.integrations for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy activity_events_select_member on public.activity_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy subscriptions_select_admin on public.subscriptions for select to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));
create policy spend_controls_select_admin on public.spend_controls for select to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));
create policy usage_events_select_admin on public.usage_events for select to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));
create policy credit_reservations_select_admin on public.credit_reservations for select to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));
create policy audit_logs_select_admin on public.audit_logs for select to authenticated
  using (public.is_workspace_member(workspace_id, 'admin'));
-- secrets: no client policies at all -> invisible; read via list_secrets_masked(), write via API (service role)

-- notifications: own only
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on function public.list_secrets_masked(uuid) from public, anon;
grant execute on function public.list_secrets_masked(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 18. Realtime publication (build/deploy events, graph, comments, notifications)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.build_events, public.deployment_events, public.agents, public.agent_edges,
      public.checkpoints, public.comments, public.notifications, public.approvals;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 19. Storage buckets and policies
-- Path conventions:
--   project-attachments/{project_id}/{uuid}-{filename}   (private, ≤ 20 MB)
--   imports/{workspace_id}/{uuid}.zip                     (private, ≤ 200 MB)
--   thumbnails/{project_id}.png                           (public)
--   template-media/{template_slug}/{file}                 (public)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-attachments', 'project-attachments', false, 20971520,
    array['image/png','image/jpeg','image/webp','application/pdf','text/markdown','text/plain','text/csv',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('imports', 'imports', false, 209715200, array['application/zip','application/x-zip-compressed']),
  ('thumbnails', 'thumbnails', true, 2097152, array['image/png','image/jpeg','image/webp']),
  ('template-media', 'template-media', true, 20971520, array['image/png','image/jpeg','image/webp','image/gif','video/mp4'])
on conflict (id) do nothing;

create or replace function public.storage_first_segment_uuid(object_name text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "attachments read by project members" on storage.objects for select to authenticated
  using (bucket_id = 'project-attachments' and public.is_project_member(public.storage_first_segment_uuid(name)));
create policy "attachments upload by project editors" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-attachments' and public.is_project_member(public.storage_first_segment_uuid(name), 'editor'));
create policy "attachments delete by project editors" on storage.objects for delete to authenticated
  using (bucket_id = 'project-attachments' and public.is_project_member(public.storage_first_segment_uuid(name), 'editor'));

create policy "imports read by workspace editors" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and public.is_workspace_member(public.storage_first_segment_uuid(name), 'editor'));
create policy "imports upload by workspace editors" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and public.is_workspace_member(public.storage_first_segment_uuid(name), 'editor'));

create policy "thumbnails public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'thumbnails');
create policy "template media public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'template-media');
-- thumbnails / template-media writes: service role only.

-- =============================================================================
-- End of schema
-- =============================================================================
