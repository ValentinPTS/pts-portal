-- Part 10.4 — the certificate register's lookup (D20; Реш. 55, 56, 93, 115; lib/cert-register-model.ts,
-- lib/cert-register.ts). The portal answers a lookup by the certificate's number AND code (its own page,
-- and the website's question) — «valid» with Реш. 56's data, or «invalid»; attempts limited.
--   register_attempts: per HOUR and BUCKET — an address (a keyed hash that includes the hour, so two hours
--                      of one address never link; an IPv6 address by its /64), a typed number (a keyed hash),
--                      and everyone — how many lookups failed and how many were made; older hours removed;
--   register_lookups:  how many lookups a day ended how (valid / invalid / incomplete / limited) — never the
--                      code typed, never the address.
-- A lookup TAKES A TICKET before it looks (10.4 review: a check first and a count after let a burst of
-- 99 at once through — the codes of a scheme are only 01–99): the ticket counts as failed in every bucket
-- at once, under the register's lock; a valid answer gives it back. Ceilings: an address 10 failed and 30
-- in all an hour; a number 20 failed; everyone 300 failed — and a scheme's code 20 failed a DAY (the
-- security sweep, SC-2: a report names the codes, so only a number's five digits are secret; each guess a
-- new number never filled the number's ceiling). A code's bucket is kept by its day (the day's first hour).
--
-- Not round data: the register's own counters, no participant in them.
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy, no rights
-- for anon/authenticated — 0018).

create table if not exists public.register_attempts (
  bucket text not null check (bucket ~ '^(a:[0-9a-f]{64}|n:[0-9a-f]{64}|c:[0-9a-f]{64}|g)$'),
  hour text not null check (hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  failed integer not null check (failed >= 0),
  tries integer not null check (tries >= 0),
  primary key (bucket, hour)
);
create table if not exists public.register_lookups (
  day date not null,
  outcome text not null check (outcome in ('valid', 'invalid', 'incomplete', 'limited')),
  n integer not null check (n >= 0),
  primary key (day, outcome)
);
alter table public.register_attempts enable row level security;
alter table public.register_lookups enable row level security;
revoke all on public.register_attempts, public.register_lookups from anon, authenticated;

-- A ticket for one lookup: refused (false) when any ceiling is reached; else counted as failed in each
-- bucket, and as a try for the address. The hours before this one removed (a code's: the days before).
-- (its answer: 'ok', or which ceiling — 'all', 'code', 'number', 'address' — said in its own words, round 2)
create or replace function public.register_try(p_hour text, p_day text, p_address text, p_number text, p_code text)
  returns text language plpgsql security definer set search_path = '' as $$
declare
  af integer; at integer; nf integer; gf integer; cf integer;
begin
  if p_day is distinct from substr(p_hour, 1, 10) || 'T00' or p_code !~ '^c:' then raise exception 'register: which day, which code'; end if;
  -- one lock for the register: a code's day spans the hours
  perform pg_advisory_xact_lock(hashtext('register'));
  delete from public.register_attempts where hour < p_hour and bucket !~ '^c:';
  delete from public.register_attempts where hour < p_day and bucket ~ '^c:';
  select coalesce(max(failed), 0), coalesce(max(tries), 0) into af, at from public.register_attempts where bucket = p_address and hour = p_hour;
  select coalesce(max(failed), 0) into nf from public.register_attempts where bucket = p_number and hour = p_hour;
  select coalesce(max(failed), 0) into gf from public.register_attempts where bucket = 'g' and hour = p_hour;
  select coalesce(max(failed), 0) into cf from public.register_attempts where bucket = p_code and hour = p_day;
  if gf >= 300 then return 'all'; end if;
  if cf >= 20 then return 'code'; end if;
  if nf >= 20 then return 'number'; end if;
  if af >= 10 or at >= 30 then return 'address'; end if;
  insert into public.register_attempts (bucket, hour, failed, tries)
    select b, case when b = p_code then p_day else p_hour end, 1, 1 from unnest(array[p_address, p_number, 'g', p_code]) as b
    on conflict (bucket, hour) do update set failed = public.register_attempts.failed + 1, tries = public.register_attempts.tries + 1;
  return 'ok';
end $$;
-- A valid answer gives its ticket back (the try stays counted).
create or replace function public.register_refund(p_hour text, p_day text, p_address text, p_number text, p_code text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('register'));
  update public.register_attempts set failed = greatest(failed - 1, 0)
    where (hour = p_hour and bucket in (p_address, p_number, 'g')) or (hour = p_day and bucket = p_code);
end $$;
-- One lookup's outcome, counted for the day.
create or replace function public.register_count(p_outcome text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.register_lookups (day, outcome, n) values (current_date, p_outcome, 1)
    on conflict (day, outcome) do update set n = public.register_lookups.n + 1;
end $$;
revoke execute on function public.register_try(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.register_refund(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.register_count(text) from public, anon, authenticated;
grant execute on function public.register_try(text, text, text, text, text) to service_role;
grant execute on function public.register_refund(text, text, text, text, text) to service_role;
grant execute on function public.register_count(text) to service_role;

insert into public.app_migrations (name) values ('0054_certificate_register') on conflict (name) do nothing;
