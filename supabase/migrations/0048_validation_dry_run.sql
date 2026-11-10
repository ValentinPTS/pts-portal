-- Part 8.5 — level 3, the dry run (Реш. 131–133; lib/dry-run-model.ts), and the «pass» checks made
-- strict (8.5 review): a value that is missing is never taken for a pass — every condition is
-- coalesced to false (a NULL in a CHECK is accepted by Postgres, which would let a pass through).
--   • levels 1–2 (as 0047): no item not matching; no difference the portal found; a run of 2.0 (except
--     sampling) with 2.0's report and the transfer check «the same»; level 2 with the number read;
--   • level 3: every scenario ticked «match» AND its record in the round (auto.scenarios.happened).
-- Replaces 0047's validation_tests_pass. Safe to run more than once.

alter table public.validation_tests drop constraint if exists validation_tests_pass;
alter table public.validation_tests add constraint validation_tests_pass check (
  result = 'fail' or (
    result = 'pass'
    and coalesce(not (items @> '[{"result": "mismatch"}]'::jsonb), false)
    and (level >= 3 or coalesce((auto->>'unexpected') = '0', false))
    and (level >= 3 or kind = 'sampling' or coalesce((auto ? 'importId') and (auto->>'transferSame') = 'true', false))
    and (level <> 2 or coalesce((auto->>'numberRead') = 'true', false))
  )
);

alter table public.validation_tests drop constraint if exists validation_tests_dry_run;
alter table public.validation_tests add constraint validation_tests_dry_run check (
  result = 'fail' or level <> 3 or coalesce(
    (auto->'scenarios'->'happened') @> '{"mail": true, "deadlines": true, "reminder": true, "late": true, "extension": true, "reissued": true, "export": true}'::jsonb
    and items @> '[{"key": "mail", "result": "match"}, {"key": "deadlines", "result": "match"}, {"key": "reminder", "result": "match"}, {"key": "late", "result": "match"}, {"key": "extension", "result": "match"}, {"key": "reissued", "result": "match"}, {"key": "export", "result": "match"}]'::jsonb,
    false)
);

insert into public.app_migrations (name) values ('0048_validation_dry_run') on conflict (name) do nothing;
