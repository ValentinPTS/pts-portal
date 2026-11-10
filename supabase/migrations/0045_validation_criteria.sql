-- Part 8.1 — the acceptance criteria, signed by PTS before any test (Реш. 134; Manual 7.5.2,
-- Реш. 144; П 7.4.1 т. 4.6.2; lib/validation-criteria.ts). PTS writes the criteria — what must
-- match, with what tolerance, for each of the five levels — and the head of the PT provider
-- signs them on paper. The portal records each EDITION: the signed scan (the private
-- «validation-docs» bucket, served through a gated route) with its SHA-256, the day it was
-- signed, who signed it (as written on it), the levels it covers, what changed, who recorded it.
-- An edition is the WHOLE document: the one in force on a day is the latest signed on or before it,
-- and it replaces every earlier one. Its number is the one written on the paper (the portal checks
-- it is not recorded already and follows the days signed). Never changed or removed: one recorded by
-- mistake is VOIDED — a second record with the reason, by whom and when — never deleted; its number
-- may then be recorded again, with the right paper.
--
-- Not round data: the provider's own validation record, no participant in it.
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy, no rights
-- for anon/authenticated — 0018).

create table if not exists public.validation_criteria (
  id uuid primary key,
  edition integer not null check (edition between 1 and 999),  -- as written on the signed document
  signed_on date not null,
  signed_by text not null check (char_length(btrim(signed_by)) between 3 and 200),
  levels integer[] not null check (cardinality(levels) between 1 and 5 and levels <@ array[1, 2, 3, 4, 5]),
  note text not null default '' check (char_length(note) <= 1000),
  file_path text not null,        -- the signed scan, in the private bucket
  file_name text not null default '',
  file_mime text not null,
  file_size integer not null check (file_size > 0),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists validation_criteria_edition on public.validation_criteria (edition, signed_on);
alter table public.validation_criteria enable row level security;
revoke all on public.validation_criteria from anon, authenticated;

create or replace function public.validation_criteria_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'validation_criteria is a record: a new edition is a new row, never a change';
  end if;
  new.recorded_at := now();
  -- (a day's grace: the database's date is UTC, PTS's is Sofia's)
  if new.signed_on > current_date + 1 or new.signed_on < date '2026-01-01' then
    raise exception 'validation_criteria: the date it was signed is not a real one';
  end if;
  if new.file_mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'validation_criteria: the signed scan is a PDF, PNG or JPG';
  end if;
  return new;
end $$;
revoke execute on function public.validation_criteria_guard() from public, anon, authenticated;
drop trigger if exists validation_criteria_guard on public.validation_criteria;
create trigger validation_criteria_guard before insert or update or delete on public.validation_criteria
  for each row execute function public.validation_criteria_guard();
drop trigger if exists validation_criteria_no_truncate on public.validation_criteria;
create trigger validation_criteria_no_truncate before truncate on public.validation_criteria
  for each statement execute function public.validation_criteria_guard();
revoke update, delete, truncate on public.validation_criteria from service_role;

create table if not exists public.validation_criteria_voids (
  criteria_id uuid primary key references public.validation_criteria (id),  -- voided once
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  voided_by text not null,
  voided_at timestamptz not null default now()
);
alter table public.validation_criteria_voids enable row level security;
revoke all on public.validation_criteria_voids from anon, authenticated;

create or replace function public.validation_criteria_voids_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'validation_criteria_voids is a record: a voiding is never changed or removed';
  end if;
  new.voided_at := now();
  new.reason := btrim(new.reason);
  return new;
end $$;
revoke execute on function public.validation_criteria_voids_guard() from public, anon, authenticated;
drop trigger if exists validation_criteria_voids_guard on public.validation_criteria_voids;
create trigger validation_criteria_voids_guard before insert or update or delete on public.validation_criteria_voids
  for each row execute function public.validation_criteria_voids_guard();
drop trigger if exists validation_criteria_voids_no_truncate on public.validation_criteria_voids;
create trigger validation_criteria_voids_no_truncate before truncate on public.validation_criteria_voids
  for each statement execute function public.validation_criteria_voids_guard();
revoke update, delete, truncate on public.validation_criteria_voids from service_role;

insert into public.app_migrations (name) values ('0045_validation_criteria') on conflict (name) do nothing;
