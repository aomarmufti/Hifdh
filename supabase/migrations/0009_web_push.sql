-- Where to deliver a reminder. One row per installed device, so the same
-- account on a phone and an iPad each get their own.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_sent_on date,          -- per-day dedupe, in the user's own timezone
  failures    integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy own_rows on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A reminder time is meaningless without the zone it is meant in. 05:30 in
-- London is not 05:30 in Toronto, and the sender runs in UTC.
alter table public.settings
  add column timezone text not null default 'UTC';

-- Server-side secrets. No RLS policy at all, so only the service role can read
-- this - the anon and authenticated roles get nothing, not even an empty row.
-- Values are inserted out of band; they are never committed.
create table public.push_config (
  id          integer primary key default 1 check (id = 1),
  vapid_public  text not null,
  vapid_private text not null,
  vapid_subject text not null,
  cron_secret   text not null,
  updated_at  timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- The sweep. Reads the secret at call time so rotating it does not mean
-- rewriting the schedule.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.fire_reminder_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare secret text;
begin
  select cron_secret into secret from public.push_config where id = 1;
  perform net.http_post(
    url := 'https://kddjvlcfmrpuqhvjthks.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$fn$;
revoke execute on function public.fire_reminder_sweep() from public, anon, authenticated;

-- Every five minutes: fine enough that a 05:30 reminder lands by 05:35, cheap
-- enough to be free. The function itself decides who is actually due.
select cron.schedule('hifdh-reminders', '*/5 * * * *', 'select public.fire_reminder_sweep()');
