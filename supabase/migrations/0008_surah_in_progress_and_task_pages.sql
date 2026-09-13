-- Memorizing backwards takes surahs in descending order but learns each one
-- forwards, from its first page. Mid-surah the memorized pages therefore have
-- a hole in them, which a single range cannot express: the prefix of the surah
-- being learned is tracked separately and merges into the block when complete.
alter table public.progress
  add column partial_from integer check (partial_from between 1 and 604),
  add column partial_to   integer check (partial_to   between 1 and 604),
  add constraint progress_partial_ordered check (
    (partial_from is null and partial_to is null)
    or (partial_from is not null and partial_to is not null and partial_from <= partial_to)
  );

-- A revision portion can straddle that hole, so the exact pages are stored
-- rather than inferred from a span that would silently include unheld pages.
alter table public.daily_tasks
  add column pages smallint[] not null default '{}';
