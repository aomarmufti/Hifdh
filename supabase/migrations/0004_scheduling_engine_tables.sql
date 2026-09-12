-- The weekly_plan table and its seed trigger encoded a fixed, hand-written
-- rotation. The schedule is now derived from what is actually memorized, so
-- both go, along with daily_log which daily_tasks replaces.
drop trigger if exists on_auth_user_created_seed_plan on auth.users;
drop function if exists public.seed_weekly_plan();
drop table if exists public.weekly_plan;
drop table if exists public.daily_log;

create table public.plan_config (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  direction            text     not null default 'backward'
                                check (direction in ('backward', 'forward')),
  lesson_days          smallint[] not null default '{1,5}',   -- ISO weekdays
  new_pages_per_lesson integer  not null default 1  check (new_pages_per_lesson between 0 and 10),
  sabqi_window_pages   integer  not null default 10 check (sabqi_window_pages between 0 and 604),
  sabqi_pages_per_day  integer  not null default 5  check (sabqi_pages_per_day between 0 and 604),
  manzil_pages_per_day integer  not null default 8  check (manzil_pages_per_day between 0 and 604),
  rest_days            smallint[] not null default '{}',
  updated_at           timestamptz not null default now()
);

-- The cursors are the schedule's memory: they only move when work is planned,
-- so a missed day cannot desynchronise the rotation.
create table public.progress (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  mem_from          integer not null check (mem_from between 1 and 604),
  mem_to            integer not null check (mem_to between 1 and 604),
  sabqi_cursor      integer not null default 0,
  manzil_cursor     integer not null default 0,
  last_planned_date date,
  updated_at        timestamptz not null default now(),
  check (mem_from <= mem_to)
);

-- A row that is not done is carried to the next day, which is why
-- carried_from exists.
create table public.daily_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  task_date    date not null,
  kind         text not null check (kind in ('sabaq', 'sabqi', 'manzil')),
  page_from    integer not null,
  page_to      integer not null,
  label        text not null default '',
  done         boolean not null default false,
  done_at      timestamptz,
  carried_from date,
  created_at   timestamptz not null default now()
);
create index daily_tasks_user_date_idx on public.daily_tasks (user_id, task_date desc);
create index daily_tasks_open_idx on public.daily_tasks (user_id, done, task_date);

-- Shared, read-only content: the daily opening message.
create table public.inspirations (
  id            serial primary key,
  kind          text not null check (kind in ('ayah', 'hadith')),
  body          text not null,
  source        text not null,
  encouragement text not null default ''
);

alter table public.plan_config  enable row level security;
alter table public.progress     enable row level security;
alter table public.daily_tasks  enable row level security;
alter table public.inspirations enable row level security;

create policy own_rows on public.plan_config
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.progress
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.daily_tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy read_all on public.inspirations for select to authenticated using (true);
