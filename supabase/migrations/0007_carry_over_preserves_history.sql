-- Carrying work forward used to move the row's date, which erased the fact
-- that the original day had work left undone: a day with 3 portions where only
-- 1 was done ended up recorded as 1 of 1, so a missed day looked perfect.
-- The original row now stays put and is flagged as carried away, and a fresh
-- copy is created for the new day.
alter table public.daily_tasks
  add column carried_away boolean not null default false;

create index daily_tasks_carry_idx
  on public.daily_tasks (user_id, done, carried_away, task_date);
