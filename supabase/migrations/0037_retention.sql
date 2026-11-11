-- Part 4.7 — retention (Zadanie §10).
--
--   A profile with NO participation is kept until its deletion is requested; then the
--   head of the PT provider erases it by hand, on record: the legal entity, its
--   laboratories and its users anonymised in one step (identity_entity_erase), and the
--   messages the portal sent them (their addresses and words) — nothing of who they
--   were left; the rows kept for the record of openings. The request is named by its
--   incoming number and date only (never free text that could name a person). A
--   profile WITH a participation is kept: its data is in its rounds' records (the
--   frozen copies, 4.5). An erased profile is never changed after, and nothing is added
--   to it. Its sign-in accounts — the ones it has and every one it had (a login once
--   changed) — are returned for the portal to delete.
--
--   A rejected registration (a request for a laboratory account) is kept six years,
--   with its reason (required from now on); only then may it be removed — the database
--   refuses earlier, by every writer.
--
-- Nothing is removed by this file. All in one transaction; safe to run more than once.
-- Apply after 0036.

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0055_security_sweep) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  -- only a RE-run: this file recorded already and a later one too (a first application out of order
  -- passes — round 2, R2S-6)
  if exists (select 1 from public.app_migrations where name = '0037_retention')
     and exists (select 1 from public.app_migrations where name > '0037_retention') then
    raise exception '0037_retention is superseded by a later migration — running it again would undo that. Nothing was changed.';
  end if;
end $$;


-- ── the erasure of a profile on request ──────────────────────────────────────────
alter table identity.legal_entities add column if not exists erased_at timestamptz;
alter table identity.legal_entities add column if not exists erased_by text;
alter table identity.legal_entities add column if not exists erase_request_no text;
alter table identity.legal_entities add column if not exists erase_request_date date;
alter table identity.legal_entities drop constraint if exists legal_entities_erased_whole;
alter table identity.legal_entities add constraint legal_entities_erased_whole
  check ((erased_at is null) = (erased_by is null) and (erased_at is null) = (erase_request_no is null) and (erased_at is null) = (erase_request_date is null)
         and (erase_request_no is null or erase_request_no ~ '^[0-9A-Za-zА-Яа-я№/.-]{1,30}$'));

-- every sign-in account a user had: a login once changed leaves one behind (0034) —
-- the erasure deletes those too
alter table identity.entity_users add column if not exists past_auth_user_ids uuid[] not null default '{}';

-- an erased profile is never changed after, and nothing is added to it — the entity,
-- its laboratories, its users (an entity never moves: its new row's entity is its own)
create or replace function identity.erased_kept() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'legal_entities' then
    if old.erased_at is not null then raise exception 'identity: an erased profile is never changed'; end if;
    return new;
  end if;
  if exists (select 1 from identity.legal_entities e where e.id = new.entity_id and e.erased_at is not null) then
    raise exception 'identity: an erased profile is never changed';
  end if;
  return new;
end $$;
revoke execute on function identity.erased_kept() from public, anon, authenticated, service_role;
drop trigger if exists legal_entities_erased_kept on identity.legal_entities;
create trigger legal_entities_erased_kept before update on identity.legal_entities
  for each row execute function identity.erased_kept();
drop trigger if exists laboratories_erased_kept on identity.laboratories;
create trigger laboratories_erased_kept before insert or update on identity.laboratories
  for each row execute function identity.erased_kept();
drop trigger if exists entity_users_erased_kept on identity.entity_users;
create trigger entity_users_erased_kept before insert or update on identity.entity_users
  for each row execute function identity.erased_kept();

-- the users' put (0036), now keeping the sign-in account a changed login leaves behind
create or replace function public.identity_entity_user_put(p_actor text, p_user uuid, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare ent uuid; old_email text; new_email text; st text;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  select u.entity_id, u.email into ent, old_email from identity.entity_users u where u.id = p_user;
  if found then
    perform 1 from identity.legal_entities where id = ent for update;
    new_email := case when p_fields ? 'email' then lower(btrim(p_fields->>'email')) else old_email end;
    update identity.entity_users u set
      email = new_email,
      name = case when p_fields ? 'name' then p_fields->>'name' else u.name end,
      position = case when p_fields ? 'position' then coalesce(p_fields->>'position', '') else u.position end,
      phone = case when p_fields ? 'phone' then coalesce(p_fields->>'phone', '') else u.phone end,
      role = case when p_fields ? 'role' then p_fields->>'role' else u.role end,
      two_factor_required = case when p_fields ? 'two_factor_required' then coalesce((p_fields->>'two_factor_required')::boolean, false) else u.two_factor_required end,
      receives_notices = case when p_fields ? 'receives_notices' then coalesce((p_fields->>'receives_notices')::boolean, true) else u.receives_notices end,
      state = case when new_email <> old_email and (case when p_fields ? 'state' then p_fields->>'state' else u.state end) = 'active' then 'invited'
                   when p_fields ? 'state' then p_fields->>'state' else u.state end,
      past_auth_user_ids = case when new_email <> old_email and u.auth_user_id is not null then array_append(u.past_auth_user_ids, u.auth_user_id) else u.past_auth_user_ids end,
      auth_user_id = case when new_email <> old_email then null else u.auth_user_id end,
      updated_at = now()
    where u.id = p_user;
  else
    ent := (p_fields->>'entity_id')::uuid;
    perform 1 from identity.legal_entities where id = ent for update;
    st := coalesce(p_fields->>'state', 'invited');
    insert into identity.entity_users (id, entity_id, email, name, position, phone, role, two_factor_required, receives_notices, state, created_by)
    values (p_user, ent, lower(btrim(p_fields->>'email')), p_fields->>'name', coalesce(p_fields->>'position', ''), coalesce(p_fields->>'phone', ''),
            case when not exists (select 1 from identity.entity_users u where u.entity_id = ent and u.role = 'admin' and u.state <> 'inactive') then 'admin'
                 else coalesce(p_fields->>'role', 'user') end,
            coalesce((p_fields->>'two_factor_required')::boolean, false), coalesce((p_fields->>'receives_notices')::boolean, true), st, trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, user_id, user_ids, rows) values (trim(p_actor), 'write', ent, p_user, array[p_user], 1);
end $$;

-- the messages the portal sent: their address and words blanked by the erasure — the
-- one change a sent message allows (0020/0034's guard otherwise)
alter table public.sent_messages add column if not exists anonymised_at timestamptz;
create or replace function public.sent_messages_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.outcome <> 'pending' then
      raise exception 'sent_messages: a message is recorded pending, before it is sent';
    end if;
    return new;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'sent_messages is a record: its rows are never removed';
  end if;
  -- the anonymisation of an erased profile's messages (4.7): the address and the words
  -- blanked, stamped — nothing else
  if old.anonymised_at is null and new.anonymised_at is not null
     and new.to_address = '‹изтрито›' and new.subject = '‹изтрито›' and new.body = '‹изтрито›' and new.error is null
     and (new.id, new.sent_at, new.class, new.kind, new.lab_id, new.entity_id, new.scheme_id, new.code, new.approved_by, new.approval_ref, new.outcome)
         is not distinct from
         (old.id, old.sent_at, old.class, old.kind, old.lab_id, old.entity_id, old.scheme_id, old.code, old.approved_by, old.approval_ref, old.outcome) then
    return new;
  end if;
  if old.outcome <> 'pending' or new.outcome = 'pending' or new.anonymised_at is distinct from old.anonymised_at
     or (new.id, new.sent_at, new.class, new.kind, new.lab_id, new.entity_id, new.scheme_id, new.code,
         new.to_address, new.subject, new.body, new.approved_by, new.approval_ref)
        is distinct from
        (old.id, old.sent_at, old.class, old.kind, old.lab_id, old.entity_id, old.scheme_id, old.code,
         old.to_address, old.subject, old.body, old.approved_by, old.approval_ref) then
    raise exception 'sent_messages is a record: only a pending row''s outcome may be set, once';
  end if;
  return new;
end $$;
revoke execute on function public.sent_messages_guard() from public, anon, authenticated;

-- the entities opened (0034) — with whether each was erased (and on which request), and
-- whether it has a participation; made again, with its rights
drop function if exists public.identity_entities(text, text, uuid);
create function public.identity_entities(p_actor text, p_purpose text, p_entity uuid default null)
  returns table (id uuid, name text, country text, eik text, vat text, correspondence_address text, mol text, language text,
                 state text, vies jsonb, proof_path text, proof_history jsonb, manual_check jsonb, origin text, created_at timestamptz, created_by text,
                 official_email text, confirmed_at timestamptz, confirmed_by uuid, erased_at timestamptz, erase_request_no text, erase_request_date date,
                 has_participations boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  select count(*), array_agg(e.id order by e.id) into n, ids from identity.legal_entities e where p_entity is null or e.id = p_entity;
  insert into identity.openings (actor, purpose, entity_id, entity_ids, rows) values (trim(p_actor), p_purpose, p_entity, ids, n);
  return query
    select e.id, e.name, e.country, e.eik, e.vat, e.correspondence_address, e.mol, e.language, e.state, e.vies,
           e.proof_path, e.proof_history, e.manual_check, e.origin, e.created_at, e.created_by,
           e.official_email, e.confirmed_at, e.confirmed_by, e.erased_at, e.erase_request_no, e.erase_request_date,
           exists (select 1 from identity.participation_snapshots s where s.entity_id = e.id)
    from identity.legal_entities e where e.id = any (coalesce(ids, '{}'))
    order by e.name;
end $$;

-- erase: a profile with no participation, on a request (its incoming number and date),
-- in one step — its users and laboratories first, then the entity; the messages sent to
-- it anonymised. Returns its sign-in accounts (every one it has had) and its documents,
-- for the portal to delete. Recorded as a write, with which rows.
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
  -- the messages the portal sent it: their address and words blanked
  update public.sent_messages m set to_address = '‹изтрито›', subject = '‹изтрито›', body = '‹изтрито›', error = null, anonymised_at = now()
    where m.entity_id = p_entity and m.anonymised_at is null and m.outcome <> 'pending';
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

revoke execute on function public.identity_entities(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_put(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_entity_erase(text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.identity_entities(text, text, uuid) to service_role;
grant execute on function public.identity_entity_user_put(text, uuid, jsonb) to service_role;
grant execute on function public.identity_entity_erase(text, uuid, text, date) to service_role;

-- ── rejected registrations: six years, with their reason ─────────────────────────
-- the reason, from now on (earlier rows are as they were: NOT VALID)
alter table public.lab_applications drop constraint if exists lab_applications_reject_reason;
alter table public.lab_applications add constraint lab_applications_reject_reason
  check (status <> 'rejected' or char_length(btrim(coalesce(reject_reason, ''))) >= 3) not valid;
-- removed only when rejected six years ago and more — by every writer; a pending or an
-- approved one is never removed
create or replace function public.lab_applications_kept() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then raise exception 'lab_applications: a registration is removed one by one, after its six years'; end if;
  if old.status = 'rejected' and old.reviewed_at is not null and old.reviewed_at < now() - interval '6 years' then
    return old;
  end if;
  raise exception 'lab_applications: a registration is kept — a rejected one six years from its rejection (Zadanie §10)';
end $$;
revoke execute on function public.lab_applications_kept() from public, anon, authenticated;
drop trigger if exists lab_applications_kept on public.lab_applications;
create trigger lab_applications_kept before delete on public.lab_applications
  for each row execute function public.lab_applications_kept();
drop trigger if exists lab_applications_no_truncate on public.lab_applications;
create trigger lab_applications_no_truncate before truncate on public.lab_applications
  for each statement execute function public.lab_applications_kept();

insert into public.app_migrations (name) values ('0037_retention') on conflict (name) do nothing;

commit;
