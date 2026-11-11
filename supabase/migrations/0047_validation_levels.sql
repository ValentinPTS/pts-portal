-- Part 8.4 — the validation tests by the round's kind (Zadanie §13; А9; lib/validation-test-model.ts).
-- The database holds what the portal holds (8.4 review — defence in depth):
--   • the level goes with the round's kind: level 1 — PTS testing (the reference round); level 2 —
--     calibration, ILC, sampling; level 3 — the dry run's PT testing, calibration, ILC (Реш. 131);
--   • «pass» never with an item not matching; levels 1–2 never with a difference the portal found in the
--     file; a run of 2.0 (levels 1–2 except sampling, А9) never without 2.0's report and the transfer
--     check «the same»; level 2 never without the original number read.
-- Replaces 0046's «pass» check (its constraint, by the name Postgres gave it). Safe to run more than once.

begin;

-- re-run guard (the security sweep, 2026-11-11): a later migration (0048_validation_dry_run) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  -- refused once a migration that redefines what this one makes is recorded — a re-run, or a first
  -- application after it, would undo it (round 3); before it, a first application passes (R2S-6)
  if exists (select 1 from public.app_migrations where name in ('0048_validation_dry_run')) then
    raise exception '0047_validation_levels is superseded by a later migration already applied — running it now would undo that. Nothing was changed.';
  end if;
end $$;

alter table public.validation_tests drop constraint if exists validation_tests_result_check;
alter table public.validation_tests drop constraint if exists validation_tests_pass;
alter table public.validation_tests add constraint validation_tests_pass check (
  result = 'fail' or (
    result = 'pass'
    and not (items @> '[{"result": "mismatch"}]'::jsonb)
    and (level >= 3 or (auto->>'unexpected') = '0')
    and (level >= 3 or kind = 'sampling' or ((auto ? 'importId') and (auto->>'transferSame') = 'true'))
    and (level <> 2 or (auto->>'numberRead') = 'true')
  )
);

alter table public.validation_tests drop constraint if exists validation_tests_level_kind;
alter table public.validation_tests add constraint validation_tests_level_kind check (
  (level = 1 and kind = 'pts-t')
  or (level = 2 and kind in ('calibration', 'ilc', 'sampling'))
  or (level = 3 and kind in ('pts-t', 'calibration', 'ilc'))
  or level in (4, 5)
);

insert into public.app_migrations (name) values ('0047_validation_levels') on conflict (name) do nothing;

commit;
