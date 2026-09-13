-- Arabic has no page model to schedule from, so it is a standing daily task
-- with text the user sets, on the days they choose.
alter table public.plan_config
  add column arabic_enabled boolean    not null default true,
  add column arabic_text    text       not null default '',
  add column arabic_days    smallint[] not null default '{1,2,3,4,5,6,7}';

alter table public.daily_tasks drop constraint daily_tasks_kind_check;
alter table public.daily_tasks add constraint daily_tasks_kind_check
  check (kind in ('sabaq', 'sabqi', 'manzil', 'arabic'));
