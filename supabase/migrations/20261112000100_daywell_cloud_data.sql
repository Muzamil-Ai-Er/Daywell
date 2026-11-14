-- Daywell account-owned data. All browser data APIs use the signed-in user's
-- Supabase access token, so these policies are enforced by PostgreSQL itself.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  role text not null default '' check (role in ('', 'Student', 'Professional', 'Student & professional', 'Other')),
  focus text not null default '' check (char_length(focus) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  duration integer not null default 30 check (duration between 10 and 240),
  category text not null default 'Personal' check (category in ('Personal', 'Work', 'Study')),
  completed boolean not null default false,
  due_date date,
  due_label text not null default '' check (char_length(due_label) <= 100),
  due_at timestamp without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date, due_at);
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed);

create table if not exists public.schedules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day_start time not null default '09:00',
  day_end time not null default '17:00',
  check (day_end > day_start),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_income numeric(14, 2) check (monthly_income is null or monthly_income >= 0),
  monthly_expenses numeric(14, 2) check (monthly_expenses is null or monthly_expenses >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'CNY', 'NZD')),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  duration_seconds integer not null check (duration_seconds between 1 and 14400),
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);
create index if not exists focus_sessions_user_completed_idx on public.focus_sessions (user_id, completed_at desc);

create table if not exists public.legacy_imports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  imported_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
drop trigger if exists schedules_set_updated_at on public.schedules;
create trigger schedules_set_updated_at before update on public.schedules
for each row execute function public.set_updated_at();
drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at before update on public.budgets
for each row execute function public.set_updated_at();
drop trigger if exists preferences_set_updated_at on public.user_preferences;
create trigger preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

-- A profile row is created only for the account Supabase Auth just created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (user_id) do nothing;
  insert into public.schedules (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.budgets (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_daywell on auth.users;
create trigger on_auth_user_created_daywell after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill account defaults for accounts that existed before this migration.
insert into public.profiles (user_id, full_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 80) from auth.users
on conflict (user_id) do nothing;
insert into public.schedules (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.budgets (user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.user_preferences (user_id) select id from auth.users on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
alter table public.schedules enable row level security;
alter table public.schedules force row level security;
alter table public.budgets enable row level security;
alter table public.budgets force row level security;
alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;
alter table public.focus_sessions enable row level security;
alter table public.focus_sessions force row level security;
alter table public.legacy_imports enable row level security;
alter table public.legacy_imports force row level security;

drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists tasks_owner_all on public.tasks;
create policy tasks_owner_all on public.tasks for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists schedules_owner_all on public.schedules;
create policy schedules_owner_all on public.schedules for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists budgets_owner_all on public.budgets;
create policy budgets_owner_all on public.budgets for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists preferences_owner_all on public.user_preferences;
create policy preferences_owner_all on public.user_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists focus_sessions_owner_all on public.focus_sessions;
create policy focus_sessions_owner_all on public.focus_sessions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists legacy_imports_owner_select_insert on public.legacy_imports;
create policy legacy_imports_owner_select_insert on public.legacy_imports for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.tasks, public.schedules, public.budgets,
  public.user_preferences, public.focus_sessions from anon, authenticated, public;
revoke all on public.legacy_imports from anon, authenticated, public;
grant select, insert, update, delete on public.profiles, public.tasks,
  public.schedules, public.budgets, public.user_preferences, public.focus_sessions
  to authenticated;
grant select, insert on public.legacy_imports to authenticated;

-- Import is atomic and one-time per account. The owning identity comes from
-- auth.uid(), never from caller-provided JSON.
create or replace function public.import_daywell_legacy(
  p_profile jsonb,
  p_tasks jsonb,
  p_schedule jsonb,
  p_budget jsonb,
  p_preferences jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  task_row jsonb;
begin
  if owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if exists (select 1 from public.legacy_imports where user_id = owner_id) then
    raise exception using errcode = '23505', message = 'Legacy import has already been completed.';
  end if;
  if exists (select 1 from public.tasks where user_id = owner_id) then
    raise exception using errcode = '23505', message = 'This account already has tasks.';
  end if;

  insert into public.profiles (user_id, full_name, role, focus)
  values (
    owner_id,
    left(coalesce(p_profile ->> 'full_name', ''), 80),
    coalesce(p_profile ->> 'role', ''),
    left(coalesce(p_profile ->> 'focus', ''), 120)
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    focus = excluded.focus;

  for task_row in
    select task_json
    from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) as items(task_json)
  loop
    insert into public.tasks (
      user_id, title, priority, duration, category, completed, due_date, due_label, due_at
    ) values (
      owner_id,
      btrim(task_row ->> 'title'),
      coalesce(task_row ->> 'priority', 'medium'),
      coalesce(nullif(task_row ->> 'duration', '')::integer, 30),
      coalesce(task_row ->> 'category', 'Personal'),
      coalesce((task_row ->> 'completed')::boolean, false),
      nullif(coalesce(task_row ->> 'due_date', ''), '')::date,
      left(coalesce(task_row ->> 'due_label', ''), 100),
      nullif(coalesce(task_row ->> 'due_at', ''), '')::timestamp without time zone
    );
  end loop;

  insert into public.schedules (user_id, day_start, day_end)
  values (
    owner_id,
    coalesce(nullif(p_schedule ->> 'day_start', '')::time, '09:00'::time),
    coalesce(nullif(p_schedule ->> 'day_end', '')::time, '17:00'::time)
  ) on conflict (user_id) do update set
    day_start = excluded.day_start,
    day_end = excluded.day_end;

  insert into public.budgets (user_id, monthly_income, monthly_expenses)
  values (
    owner_id,
    nullif(p_budget ->> 'monthly_income', '')::numeric,
    nullif(p_budget ->> 'monthly_expenses', '')::numeric
  ) on conflict (user_id) do update set
    monthly_income = excluded.monthly_income,
    monthly_expenses = excluded.monthly_expenses;

  insert into public.user_preferences (user_id, currency, theme)
  values (
    owner_id,
    coalesce(p_preferences ->> 'currency', 'INR'),
    coalesce(p_preferences ->> 'theme', 'light')
  ) on conflict (user_id) do update set
    currency = excluded.currency,
    theme = excluded.theme;

  insert into public.legacy_imports (user_id) values (owner_id);
end;
$$;
revoke all on function public.import_daywell_legacy(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_daywell_legacy(jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
