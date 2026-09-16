-- Two rotations became one. The sabqi/manzil split was pedagogically correct
-- and nobody could understand it; a single "revise everything, N pages a day,
-- covered every X days" is a promise a person can hold in their head.
alter table public.plan_config
  add column revision_pages_per_day integer not null default 10
    check (revision_pages_per_day between 0 and 604);

update public.plan_config
   set revision_pages_per_day = greatest(1, sabqi_pages_per_day + manzil_pages_per_day);

alter table public.plan_config
  drop column sabqi_pages_per_day,
  drop column manzil_pages_per_day,
  drop column sabqi_window_pages;

alter table public.plan_config alter column arabic_enabled set default false;

alter table public.progress add column revision_cursor integer not null default 0;
update public.progress set revision_cursor = least(sabqi_cursor, manzil_cursor)
 where sabqi_cursor > 0 or manzil_cursor > 0;
update public.progress set revision_cursor = mem_from where revision_cursor = 0;
alter table public.progress drop column sabqi_cursor, drop column manzil_cursor;

-- Task kinds in plain English. 'reading' and 'reflection' are accepted now so
-- the later tracks do not need another constraint change.
alter table public.daily_tasks drop constraint daily_tasks_kind_check;
update public.daily_tasks set kind = 'new'      where kind = 'sabaq';
update public.daily_tasks set kind = 'revision' where kind in ('sabqi', 'manzil');
alter table public.daily_tasks add constraint daily_tasks_kind_check
  check (kind in ('new', 'revision', 'reading', 'reflection', 'arabic'));
