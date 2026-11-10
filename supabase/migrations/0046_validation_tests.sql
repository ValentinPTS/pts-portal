-- Part 8.3 — the validation tests (Реш. 134, 135; Manual 7.5.2; П 7.4.1 т. 4.6.2;
-- lib/validation-tests.ts). A test of a level, on a day, judged against the acceptance criteria
-- edition in force that day for that level (0045): the round it was run on, the items a person
-- compared (each matching, not matching or not applicable, with why), what the portal checked by
-- itself frozen at the recording, the result, the conclusion, who recorded it (the checker).
-- Never changed or removed: one recorded by mistake is VOIDED — a second record with the reason.
-- An edition of the criteria a test rests on is not voided (the portal holds it).
--
-- Not round data: the provider's own validation record (the round it was run on is a replay or a
-- simulation round, codes only). Safe to run more than once. Same access posture as the rest.

create table if not exists public.validation_tests (
  id uuid primary key,
  level integer not null check (level between 1 and 5),
  kind text not null default 'pts-t' check (kind in ('pts-t', 'calibration', 'ilc', 'sampling')),  -- the round's (8.4)
  tested_on date not null,
  scheme_id text not null,
  scheme_number text not null default '',
  replay_of text,
  criteria_id uuid not null references public.validation_criteria (id),
  criteria_edition integer not null,
  criteria_recorded_after boolean not null default false,
  scope text not null default '' check (char_length(scope) <= 1000),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  auto jsonb not null check (jsonb_typeof(auto) = 'object'),
  -- «pass» never with an item not matching, or a difference the portal found (8.3 review)
  result text not null check (result = 'fail' or (result = 'pass' and (auto->>'unexpected') = '0' and not (items @> '[{"result": "mismatch"}]'::jsonb))),
  conclusion text not null check (char_length(btrim(conclusion)) between 5 and 2000),
  file_path text,
  file_name text,
  file_mime text,
  file_size integer,
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists validation_tests_level on public.validation_tests (level, tested_on);
alter table public.validation_tests enable row level security;
revoke all on public.validation_tests from anon, authenticated;

create or replace function public.validation_tests_guard() returns trigger
  language plpgsql set search_path = '' as $$
declare
  ed record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'validation_tests is a record: a test is never changed or removed — one recorded by mistake is voided';
  end if;
  -- one at a time per edition, with its voiding (8.3 review): a test never lands on an edition being voided
  perform pg_advisory_xact_lock(hashtextextended('validation_criteria:' || new.criteria_id::text, 0));
  select c.signed_on, c.levels into ed from public.validation_criteria c where c.id = new.criteria_id;
  if exists (select 1 from public.validation_criteria_voids v where v.criteria_id = new.criteria_id) then
    raise exception 'validation_tests: the criteria edition is voided — no test rests on it';
  end if;
  if not (new.level = any (ed.levels)) or ed.signed_on > new.tested_on then
    raise exception 'validation_tests: the edition does not cover this level on the test''s day (Реш. 134)';
  end if;
  new.recorded_at := now();
  if new.tested_on > current_date + 1 or new.tested_on < date '2026-01-01' then
    raise exception 'validation_tests: the day of the test is not a real one';
  end if;
  if new.file_mime is not null and new.file_mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'validation_tests: the evidence is a PDF, PNG or JPG';
  end if;
  return new;
end $$;
revoke execute on function public.validation_tests_guard() from public, anon, authenticated;
drop trigger if exists validation_tests_guard on public.validation_tests;
create trigger validation_tests_guard before insert or update or delete on public.validation_tests
  for each row execute function public.validation_tests_guard();
drop trigger if exists validation_tests_no_truncate on public.validation_tests;
create trigger validation_tests_no_truncate before truncate on public.validation_tests
  for each statement execute function public.validation_tests_guard();
revoke update, delete, truncate on public.validation_tests from service_role;

create table if not exists public.validation_test_voids (
  test_id uuid primary key references public.validation_tests (id),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  voided_by text not null,
  voided_at timestamptz not null default now()
);
alter table public.validation_test_voids enable row level security;
revoke all on public.validation_test_voids from anon, authenticated;

create or replace function public.validation_test_voids_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'validation_test_voids is a record: a voiding is never changed or removed';
  end if;
  new.voided_at := now();
  new.reason := btrim(new.reason);
  return new;
end $$;
revoke execute on function public.validation_test_voids_guard() from public, anon, authenticated;
drop trigger if exists validation_test_voids_guard on public.validation_test_voids;
create trigger validation_test_voids_guard before insert or update or delete on public.validation_test_voids
  for each row execute function public.validation_test_voids_guard();
drop trigger if exists validation_test_voids_no_truncate on public.validation_test_voids;
create trigger validation_test_voids_no_truncate before truncate on public.validation_test_voids
  for each statement execute function public.validation_test_voids_guard();
revoke update, delete, truncate on public.validation_test_voids from service_role;

-- an edition of the criteria a test rests on is not voided (8.1 review) — the database holds it too, in a
-- trigger of its own (8.3 review: 0045's guard, run again, never takes it away)
create or replace function public.validation_criteria_voids_rests() returns trigger
  language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('validation_criteria:' || new.criteria_id::text, 0));
  if exists (select 1 from public.validation_tests t where t.criteria_id = new.criteria_id
             and not exists (select 1 from public.validation_test_voids v where v.test_id = t.id)) then
    raise exception 'validation_criteria_voids: a recorded test rests on this edition — it is not voided';
  end if;
  return new;
end $$;
revoke execute on function public.validation_criteria_voids_rests() from public, anon, authenticated;
drop trigger if exists validation_criteria_voids_rests on public.validation_criteria_voids;
create trigger validation_criteria_voids_rests before insert on public.validation_criteria_voids
  for each row execute function public.validation_criteria_voids_rests();

insert into public.app_migrations (name) values ('0046_validation_tests') on conflict (name) do nothing;
