-- =============================================================================
-- Architect 2.0 — migration 002: conversation memory (project chat history)
-- Run in Supabase → SQL Editor AFTER database.sql. Safe to run once.
-- Spec: docs/specs/conversation-memory.md
-- =============================================================================
begin;

set search_path = public, extensions;

create type public.chat_context as enum ('project', 'history', 'both');

create table public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  role          text not null check (role in ('user', 'assistant')),
  mode          text not null default 'build' check (mode in ('plan', 'build')),
  content       text not null check (char_length(content) between 1 and 10000),
  context_type  public.chat_context,
  confidence    numeric(3,2) check (confidence between 0 and 1),
  sources       jsonb not null default '[]'::jsonb,
  reply_to      uuid references public.chat_messages(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index chat_messages_project_created_idx on public.chat_messages(project_id, created_at desc);

alter table public.chat_messages enable row level security;

create policy chat_messages_select_member on public.chat_messages for select to authenticated
  using (public.is_project_member(project_id));

-- Users may only insert their OWN 'user' messages. Assistant rows are written by the server
-- with the service role so nobody can forge assistant turns (see supabase/rls-policies.sql).
create policy chat_messages_insert_editor on public.chat_messages for insert to authenticated
  with check (role = 'user' and author_id = (select auth.uid()) and public.is_project_member(project_id, 'editor'));

create policy chat_messages_delete_admin on public.chat_messages for delete to authenticated
  using (public.is_project_member(project_id, 'admin'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

commit;
