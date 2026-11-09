-- Part 3.4 — the holiday calendar (Zadanie §9, §11; lib/holidays.ts). A calibration
-- participant has a set number of WORKING days from the receipt of the instrument
-- (M1: «максимум пет работни дни»); working days are Monday to Friday less the days
-- this calendar has off — Bulgaria's official holidays, a day given off in place of
-- one that fell on a weekend, any day the government declares. PTS updates it every
-- year. A record, like the rest: a day is ADDED or REMOVED by a new row — who and
-- when — and the calendar is the latest row of each day; nothing is changed or
-- deleted.
--
-- 0027 is the identity store's contract — supabase/migrations-later/, applied only
-- after the upload (IDENTITY-STORE-BG.md); this one goes in before, with 0016–0029.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

create table if not exists public.holiday_entries (
  id uuid primary key,
  day date not null check (day between date '2000-01-01' and date '2100-12-31'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  action text not null check (action in ('add', 'remove')),
  recorded_by text not null check (char_length(btrim(recorded_by)) > 0),
  recorded_at timestamptz not null default now()
);
create index if not exists holiday_entries_day on public.holiday_entries (day, recorded_at);
alter table public.holiday_entries enable row level security;
revoke all on public.holiday_entries from anon, authenticated;

create or replace function public.holiday_entries_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'holiday_entries is a record: a day is added or removed by a new row, never a change';
  end if;
  new.recorded_at := now();
  new.name := btrim(new.name);
  return new;
end $$;
revoke execute on function public.holiday_entries_guard() from public, anon, authenticated;
drop trigger if exists holiday_entries_guard on public.holiday_entries;
create trigger holiday_entries_guard before insert or update or delete on public.holiday_entries
  for each row execute function public.holiday_entries_guard();
drop trigger if exists holiday_entries_no_truncate on public.holiday_entries;
create trigger holiday_entries_no_truncate before truncate on public.holiday_entries
  for each statement execute function public.holiday_entries_guard();
revoke update, delete, truncate on public.holiday_entries from service_role;

insert into public.app_migrations (name) values ('0030_holidays') on conflict (name) do nothing;
