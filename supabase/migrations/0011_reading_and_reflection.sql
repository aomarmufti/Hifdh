-- Reading has nothing to do with memorizing: a stretch of the mushaf and a
-- pace, with its own cursor so it advances independently of revision.
create table public.reading_plan (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  enabled       boolean not null default false,
  from_surah    smallint not null default 1   check (from_surah between 1 and 114),
  to_surah      smallint not null default 114 check (to_surah   between 1 and 114),
  pages_per_day integer  not null default 4   check (pages_per_day between 0 and 604),
  days          smallint[] not null default '{1,2,3,4,5,6,7}',
  cursor        integer  not null default 1,
  started_on    date,
  updated_at    timestamptz not null default now(),
  check (from_surah <= to_surah)
);

-- A verse you sat with, and what you saw in it. The reference is stored as
-- numbers, so this needs no Qur'an text to work - only to display the verse,
-- which is a separate problem for later.
create table public.reflections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  on_date    date not null,
  surah      smallint not null check (surah between 1 and 114),
  ayah_from  smallint check (ayah_from >= 1),
  ayah_to    smallint check (ayah_to >= 1),
  note       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ayah_to is null or ayah_from is null or ayah_to >= ayah_from)
);
create index reflections_user_date_idx on public.reflections (user_id, on_date desc);
create index reflections_pinned_idx on public.reflections (user_id, pinned) where pinned;

alter table public.reading_plan enable row level security;
alter table public.reflections  enable row level security;

create policy own_rows on public.reading_plan
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.reflections
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
