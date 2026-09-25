-- =============================================================================
-- Architect 2.0 — security hardening (docs/security/security-plan.md)
-- Paste into Supabase → SQL Editor and run AFTER database.sql (and migration 002).
-- Idempotent: safe to run more than once.
-- =============================================================================
begin;
set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. Rate limiting (service role only — no user-facing policies)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users(id) on delete cascade,
  subject    text        not null,               -- user id, or a hashed IP+email for anonymous endpoints (login)
  action     text        not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_limit_events_lookup on public.rate_limit_events (user_id, action, created_at desc);
create index if not exists idx_rate_limit_events_subject on public.rate_limit_events (subject, action, created_at desc);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Housekeeping: drop events older than 2 days (schedule daily with pg_cron if available).
create or replace function public.purge_rate_limit_events()
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
$$;
revoke all on function public.purge_rate_limit_events() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. RLS on every public table (defence in depth for tables added later)
-- -----------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Function execution rights (advisor lints 0028 / 0029)
-- -----------------------------------------------------------------------------
-- Trigger functions must never be callable through /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_project() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.agents_set_first_entry() from public, anon, authenticated;
revoke execute on function public.agent_edges_same_project() from public, anon, authenticated;

-- RLS helpers: needed by signed-in users (policies run as the caller), never by anon.
revoke execute on function public.is_workspace_member(uuid, public.member_role) from public, anon;
revoke execute on function public.is_workspace_developer(uuid) from public, anon;
revoke execute on function public.is_project_member(uuid, public.member_role) from public, anon;
revoke execute on function public.is_project_developer(uuid) from public, anon;
revoke execute on function public.project_workspace_id(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid, public.member_role) to authenticated;
grant execute on function public.is_workspace_developer(uuid) to authenticated;
grant execute on function public.is_project_member(uuid, public.member_role) to authenticated;
grant execute on function public.is_project_developer(uuid) to authenticated;
grant execute on function public.project_workspace_id(uuid) to authenticated;

-- Do not reveal which workspace owns an arbitrary project id to non-members.
create or replace function public.project_workspace_id(p uuid)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select pr.workspace_id from public.projects pr
  where pr.id = p
    and exists (select 1 from public.workspace_members m where m.workspace_id = pr.workspace_id and m.user_id = (select auth.uid()));
$$;

-- Intended RPCs: signed-in users only.
revoke execute on function public.list_secrets_masked(uuid) from public, anon;
revoke execute on function public.seed_demo_project(uuid) from public, anon;
revoke execute on function public.unique_workspace_slug(text) from public, anon, authenticated;
revoke execute on function public.create_runs_partition(date) from public, anon, authenticated;
revoke execute on function public.member_role_rank(public.member_role) from anon;

-- -----------------------------------------------------------------------------
-- 4. Invitations must match the VERIFIED auth email, not the editable profile email
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  ws  public.workspaces;
  verified_email citext;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_token is null or char_length(p_token) < 20 then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  select * into inv from public.invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if inv.accepted_at is not null or inv.expires_at < now() then raise exception 'EXPIRED' using errcode = '22023'; end if;
  select u.email into verified_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if verified_email is null or verified_email is distinct from inv.email then
    raise exception 'FORBIDDEN: invitation is for a different email' using errcode = '42501';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, is_developer)
  values (inv.workspace_id, uid, inv.role, inv.is_developer)
  on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  update public.profiles set onboarded_at = coalesce(onboarded_at, now()), last_workspace_id = inv.workspace_id where id = uid;
  select * into ws from public.workspaces where id = inv.workspace_id;
  return ws;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Column-level write privileges (RLS limits rows; these limit columns)
-- -----------------------------------------------------------------------------
-- profiles: users cannot change email, onboarding state or ids.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, default_mode, use_case, preferred_framework, preferred_language, theme, mode_prefs, last_workspace_id, last_seen_at) on public.profiles to authenticated;

-- workspaces: admins cannot grant themselves plans, credits or ownership (billing/service role only).
revoke update on public.workspaces from anon, authenticated;
grant update (name, code_mode_restricted, prod_deploy_role, training_opt_out) on public.workspaces to authenticated;
revoke insert on public.workspaces from anon, authenticated;   -- created only via complete_onboarding / create_workspace

-- workspace_members: only role and developer flag change; inserts only via RPCs.
revoke update on public.workspace_members from anon, authenticated;
grant update (role, is_developer) on public.workspace_members to authenticated;
revoke insert on public.workspace_members from anon, authenticated;

-- projects: cannot be moved between workspaces or re-attributed.
revoke update on public.projects from anon, authenticated;
grant update (name, description, initial_prompt, status, mode_default, framework, language, auto_commit, thumbnail_url, preview_url, live_url, deleted_at, working_branch) on public.projects to authenticated;

-- agents / edges: cannot be moved to another project.
revoke update on public.agents from anon, authenticated;
grant update (name, role, type, framework, model, instructions, memory, guardrail_ids, position, is_entry, locked, runtime_status) on public.agents to authenticated;
revoke update on public.agent_edges from anon, authenticated;
grant update (condition, label) on public.agent_edges to authenticated;

-- Server-owned tables: no client writes at all.
do $$
declare t text;
begin
  foreach t in array array['secrets','credit_reservations','usage_events','subscriptions','spend_controls','audit_logs',
    'deployments','deployment_events','builds','build_events','runs','guardrail_violations','approvals','project_events',
    'sandboxes','git_sync_events','cli_device_codes','code_chunks','templates','github_installations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Conversation memory: users may only insert their OWN 'user' messages.
--    Assistant turns are written by the server with the service role, so nobody can
--    forge assistant history to steer the model.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chat_messages') is not null then
    execute 'drop policy if exists chat_messages_insert_editor on public.chat_messages';
    execute $p$create policy chat_messages_insert_editor on public.chat_messages for insert to authenticated
      with check (role = 'user' and author_id = (select auth.uid()) and public.is_project_member(project_id, 'editor'))$p$;
    execute 'revoke update on public.chat_messages from anon, authenticated';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Policy performance: evaluate auth.uid() once per statement (advisor lint 0003)
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_self_or_teammate on public.profiles;
create policy profiles_select_self_or_teammate on public.profiles for select to authenticated
  using (id = (select auth.uid()) or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces for delete to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists workspace_members_delete_admin_or_self on public.workspace_members;
create policy workspace_members_delete_admin_or_self on public.workspace_members for delete to authenticated
  using (role <> 'owner' and (public.is_workspace_member(workspace_id, 'admin') or user_id = (select auth.uid())));
drop policy if exists api_tokens_own on public.api_tokens;
create policy api_tokens_own on public.api_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists projects_insert_editor on public.projects;
create policy projects_insert_editor on public.projects for insert to authenticated
  with check (public.is_workspace_member(workspace_id, 'editor') and created_by = (select auth.uid()));
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One permissive policy per action (advisor lint 0006).
drop policy if exists agent_tools_write_editor on public.agent_tools;
drop policy if exists agent_tools_insert_editor on public.agent_tools;
drop policy if exists agent_tools_delete_editor on public.agent_tools;
create policy agent_tools_insert_editor on public.agent_tools for insert to authenticated
  with check (exists (select 1 from public.agents a where a.id = agent_id and public.is_project_member(a.project_id, 'editor')));
create policy agent_tools_delete_editor on public.agent_tools for delete to authenticated
  using (exists (select 1 from public.agents a where a.id = agent_id and public.is_project_member(a.project_id, 'editor')));
revoke update on public.agent_tools from anon, authenticated;
drop policy if exists eval_cases_write_editor on public.eval_cases;
drop policy if exists eval_cases_insert_editor on public.eval_cases;
drop policy if exists eval_cases_update_editor on public.eval_cases;
drop policy if exists eval_cases_delete_editor on public.eval_cases;
create policy eval_cases_insert_editor on public.eval_cases for insert to authenticated
  with check (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')));
create policy eval_cases_update_editor on public.eval_cases for update to authenticated
  using (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')))
  with check (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')));
create policy eval_cases_delete_editor on public.eval_cases for delete to authenticated
  using (exists (select 1 from public.eval_sets s where s.id = eval_set_id and public.is_project_member(s.project_id, 'editor')));

-- -----------------------------------------------------------------------------
-- 8. Storage: private buckets, attachment size matches the app limit (10 MB)
-- -----------------------------------------------------------------------------
update storage.buckets set public = false, file_size_limit = 10485760 where id = 'project-attachments';
update storage.buckets set public = false where id = 'imports';

-- -----------------------------------------------------------------------------
-- 9. Cover every foreign key with an index (advisor lint 0001)
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1 and cl.relkind = 'r'
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.conname || '_idx', 63), r.tbl, r.col);
  end loop;
end $$;

commit;
