-- Weekly plan: 7 rows per user, one per ISO weekday (1=Mon .. 7=Sun)
create table public.weekly_plan (
  user_id    uuid not null references auth.users(id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  sabqi      text not null default '',
  manzil     text not null default '',
  arabic     text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, weekday)
);

-- Daily log: one row per user per date, permanent
create table public.daily_log (
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  sabqi_done    boolean not null default false,
  manzil_done   boolean not null default false,
  arabic_done   boolean not null default false,
  sabqi_done_at  timestamptz,
  manzil_done_at timestamptz,
  arabic_done_at timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- Weekly review: one row per user per week-ending date, permanent
create table public.weekly_review (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  review_date            date not null,
  zero_hesitation_pages  text not null default '',
  weak_pages             text not null default '',
  arabic_pages_completed integer,
  vocab_roots_logged     integer,
  note                   text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, review_date)
);

-- Per-user settings (reminder time etc.)
create table public.settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  reminder_time text,
  updated_at    timestamptz not null default now()
);

create index daily_log_user_date_idx on public.daily_log (user_id, log_date desc);
create index weekly_review_user_date_idx on public.weekly_review (user_id, review_date desc);

alter table public.weekly_plan   enable row level security;
alter table public.daily_log     enable row level security;
alter table public.weekly_review enable row level security;
alter table public.settings      enable row level security;

create policy own_rows on public.weekly_plan
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.daily_log
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.weekly_review
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
