-- Keep the single in-progress focus timer for each account in Supabase.
-- Completed sessions remain in public.focus_sessions.

create table if not exists public.active_focus_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_id uuid not null unique default gen_random_uuid(),
  duration_seconds integer not null default 1500 check (duration_seconds between 1 and 14400),
  remaining_seconds integer not null default 1500 check (remaining_seconds between 0 and duration_seconds),
  started_at timestamptz not null,
  resumed_at timestamptz,
  is_running boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not is_running or resumed_at is not null)
);

create or replace function public.set_active_focus_session_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists active_focus_sessions_set_updated_at on public.active_focus_sessions;
create trigger active_focus_sessions_set_updated_at before update on public.active_focus_sessions
for each row execute function public.set_active_focus_session_updated_at();

alter table public.active_focus_sessions enable row level security;
alter table public.active_focus_sessions force row level security;

drop policy if exists active_focus_sessions_owner_all on public.active_focus_sessions;
create policy active_focus_sessions_owner_all on public.active_focus_sessions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.active_focus_sessions from anon, authenticated, public;
grant select, insert, update, delete on public.active_focus_sessions to authenticated;
