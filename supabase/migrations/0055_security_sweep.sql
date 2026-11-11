-- The security sweep after Phase 10 (2026-11-11) — what the database review found:
--   1. the public forms' limit (the registration, the password reset): a count in the database,
--      per hour, per address (a keyed hash that includes the hour; an IPv6 address by its /64) and
--      for everyone — before, it lived in one server's memory, and every new instance or address
--      started at zero; each request writes rows the database keeps for years;
--   2. a version of results, a correction and a draft belong to the participation's OWN scheme —
--      the database checks it (the lock of 6.6/0044 reads the row's scheme);
--   3. an erasure on request blanks the portal's messages to the profile still awaiting their
--      outcome too (0037 left them in plain text for good);
--   4. a function made from now on is not executable by PUBLIC unless granted (Postgres grants
--      it by default — each migration already takes it away; this makes a forgotten one fail
--      closed);
--   4b. an opening by the public certificate register is logged under its own purpose, «register»;
--   5. until 0027 (migrations-later) removes them, every read of the old identity columns of
--      public.participants is in the audit log (pgaudit's role, 0025).
--
-- Not round data. Nothing is removed by this file. Safe to run more than once; the
-- constraints of 2 check new rows (NOT VALID) — the old ones are left as they are.
-- Apply after 0054.

begin;

-- ── 1. the public forms' limit ───────────────────────────────────────────────────────────
create table if not exists public.public_form_attempts (
  bucket text not null check (bucket ~ '^(a:[0-9a-f]{64}|g:[a-z_]{1,40})$'),
  hour text not null check (hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  n integer not null check (n >= 0),
  primary key (bucket, hour)
);
alter table public.public_form_attempts enable row level security;
revoke all on public.public_form_attempts from anon, authenticated;

-- One request of a public form: refused (false) at a ceiling — of the address, or of everyone
-- for that form; else counted. The hours before this one removed.
create or replace function public.public_form_try(p_form text, p_hour text, p_address text, p_per_address integer, p_global integer)
  returns boolean language plpgsql security definer set search_path = '' as $$
declare a integer; g integer;
begin
  if coalesce(p_form, '') !~ '^[a-z_]{1,40}$' then raise exception 'public form: which form'; end if;
  perform pg_advisory_xact_lock(hashtext('public_form:' || p_form || ':' || p_hour));
  delete from public.public_form_attempts where hour < p_hour;
  select coalesce(max(n), 0) into a from public.public_form_attempts where bucket = p_address and hour = p_hour;
  select coalesce(max(n), 0) into g from public.public_form_attempts where bucket = 'g:' || p_form and hour = p_hour;
  if a >= p_per_address or g >= p_global then
    return false;
  end if;
  insert into public.public_form_attempts (bucket, hour, n) values (p_address, p_hour, 1), ('g:' || p_form, p_hour, 1)
    on conflict (bucket, hour) do update set n = public.public_form_attempts.n + 1;
  return true;
end $$;
revoke execute on function public.public_form_try(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.public_form_try(text, text, text, integer, integer) to service_role;

-- ── 2. a row's scheme is its participation's scheme ──────────────────────────────────────
alter table public.participants drop constraint if exists participants_id_scheme;
alter table public.participants add constraint participants_id_scheme unique (id, scheme_id);
alter table public.submissions drop constraint if exists submissions_participation_scheme;
alter table public.submissions add constraint submissions_participation_scheme
  foreign key (participant_id, scheme_id) references public.participants (id, scheme_id) not valid;
alter table public.result_corrections drop constraint if exists result_corrections_participation_scheme;
alter table public.result_corrections add constraint result_corrections_participation_scheme
  foreign key (participant_id, scheme_id) references public.participants (id, scheme_id) not valid;
alter table public.submission_drafts drop constraint if exists submission_drafts_participation_scheme;
alter table public.submission_drafts add constraint submission_drafts_participation_scheme
  foreign key (participant_id, scheme_id) references public.participants (id, scheme_id) not valid;

-- ── 3. the erasure (0037), its messages awaiting an outcome blanked too ─────────────────
-- (0037's guard allows the blanking of a pending row — its outcome unchanged — and its
-- later outcome on the blanked row)
create or replace function public.identity_entity_erase(p_actor text, p_entity uuid, p_request_no text, p_request_date date)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare st text; was timestamptz; accounts uuid[]; proofs text[]; uids uuid[]; lids uuid[]; n_msgs integer;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  if coalesce(btrim(p_request_no), '') !~ '^[0-9A-Za-zА-Яа-я№/.-]{1,30}$' or p_request_date is null or p_request_date > current_date then
    raise exception 'identity: an erasure needs the request it answers — its incoming number and date';
  end if;
  select e.state, e.erased_at into st, was from identity.legal_entities e where e.id = p_entity for update;
  if not found then raise exception 'identity: no such entity'; end if;
  if was is not null then raise exception 'identity: the profile is erased already'; end if;
  if exists (select 1 from identity.participation_snapshots s where s.entity_id = p_entity) then
    raise exception 'identity: a profile with a participation is kept — its data is in its rounds'' records';
  end if;
  select coalesce(array_agg(distinct a) filter (where a is not null), '{}') into accounts from (
    select u.auth_user_id as a from identity.entity_users u where u.entity_id = p_entity
    union all select unnest(u.past_auth_user_ids) from identity.entity_users u where u.entity_id = p_entity) x;
  select coalesce(array_agg(distinct p) filter (where p is not null), '{}') into proofs from (
    select e.proof_path as p from identity.legal_entities e where e.id = p_entity
    union all select h->>'path' from identity.legal_entities e, jsonb_array_elements(e.proof_history) h where e.id = p_entity) x;
  select coalesce(array_agg(u.id order by u.id), '{}') into uids from identity.entity_users u where u.entity_id = p_entity;
  select coalesce(array_agg(l.id order by l.id), '{}') into lids from identity.laboratories l where l.entity_id = p_entity;
  -- its users and laboratories first (their entity not erased yet), then the entity
  update identity.entity_users u set email = 'erased-' || u.id::text || '@erased.invalid', name = '‹изтрит›', position = '', phone = '',
    auth_user_id = null, past_auth_user_ids = '{}', receives_notices = false, state = 'inactive', updated_at = now()
    where u.entity_id = p_entity;
  update identity.laboratories l set name = '‹изтрита›', delivery_address = '—', mobile_office = false, accreditation_no = '', accreditation_body = '',
    state = 'inactive', updated_at = now()
    where l.entity_id = p_entity;
  -- the messages the portal sent it: their address and words blanked — those still awaiting
  -- their outcome too (the security sweep: they were left in plain text for good)
  update public.sent_messages m set to_address = '‹изтрито›', subject = '‹изтрито›', body = '‹изтрито›', error = null, anonymised_at = now()
    where m.entity_id = p_entity and m.anonymised_at is null;
  get diagnostics n_msgs = row_count;
  update identity.legal_entities e set name = '‹изтрито по искане›', country = 'XX',
    eik = 'ERASED-' || substr(e.id::text, 1, 8), eik_key = 'ERASED' || upper(substr(replace(e.id::text, '-', ''), 1, 8)),
    vat = '', correspondence_address = '—', official_email = '', mol = '', vies = null, proof_path = null, proof_history = '[]'::jsonb,
    manual_check = null, state = 'inactive', erased_at = now(), erased_by = trim(p_actor),
    erase_request_no = btrim(p_request_no), erase_request_date = p_request_date, updated_at = now()
    where e.id = p_entity;
  insert into identity.openings (actor, purpose, entity_id, entity_ids, user_ids, laboratory_ids, rows)
    values (trim(p_actor), 'write', p_entity, array[p_entity], uids, lids, 1 + coalesce(array_length(uids, 1), 0) + coalesce(array_length(lids, 1), 0));
  return jsonb_build_object('accounts', to_jsonb(accounts), 'proofs', to_jsonb(proofs),
                            'laboratories', coalesce(array_length(lids, 1), 0), 'users', coalesce(array_length(uids, 1), 0), 'messages', n_msgs);
end $$;
revoke execute on function public.identity_entity_erase(text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.identity_entity_erase(text, uuid, text, date) to service_role;

-- ── 3b. an opening for the public certificate register under its own purpose (10.4; SC-4: it was
-- logged as «system», a job of the portal itself) ────────────────────────────────────────────
create or replace function public.identity_purpose_ok(p text) returns boolean
  language sql immutable set search_path = '' as $$
  select p in ('names.view', 'export', 'send', 'dispatch', 'lab.own', 'write', 'system', 'register')
$$;
revoke execute on function public.identity_purpose_ok(text) from public, anon, authenticated;

-- ── 4. functions made from now on: not executable by PUBLIC unless granted ──────────────
alter default privileges revoke execute on functions from public;

-- ── 5. the old identity columns of public.participants, read on the audit log ───────────
grant select on public.participants to identity_auditor;

insert into public.app_migrations (name) values ('0055_security_sweep') on conflict (name) do nothing;

commit;
