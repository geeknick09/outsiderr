-- STEP 53: allow "Repeats monthly" on community events
alter table public.events
  drop constraint if exists events_recurrence_check;
alter table public.events
  add constraint events_recurrence_check
  check (recurrence is null or recurrence in ('WEEKLY', 'MONTHLY'));
