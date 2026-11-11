-- Part 4.6 — notices per person (N28), the laboratory switcher, and X1.
--
--   public.notification_reads — who read which notice in the portal: one row per
--     person (PTS's people by their e-mail, a laboratory account or a participant's
--     user by its id — never a name), set once, never changed or removed. A notice
--     read by one person is no longer «read» for everyone (N28).
--   identity.entity_users + receives_notices — whether this user is a recipient of the
--     laboratories' notices by e-mail (each person, not one address per laboratory).
--   identity.laboratories + accreditation_body — X1: the accreditation body travels
--     with the laboratory (and its frozen copy, 4.5), as the country with its entity.
--   identity_notice_recipients — for a participation (scheme + code): the e-mails of
--     its entity's active users who receive the notices, by the copy in force (4.5);
--     with a copy but nobody yet, its entity alone — the notice waits.
--   identity_participations_of_entity — a participant's user's own participations
--     (the copies in force of its entity's laboratories): the laboratory switcher.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0035.

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0037_retention) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  -- only a RE-run: this file recorded already and a later one too (a first application out of order
  -- passes — round 2, R2S-6)
  if exists (select 1 from public.app_migrations where name = '0036_notice_recipients')
     and exists (select 1 from public.app_migrations where name > '0036_notice_recipients') then
    raise exception '0036_notice_recipients is superseded by a later migration — running it again would undo that. Nothing was changed.';
  end if;
end $$;


-- ── read state, per person (N28) ─────────────────────────────────────────────────
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id),
  reader text not null check (char_length(btrim(reader)) between 3 and 300),
  read_at timestamptz not null default now(),
  primary key (notification_id, reader)
);
create index if not exists notification_reads_reader on public.notification_reads (reader, read_at desc);
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon, authenticated;
create or replace function public.notification_reads_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'notification_reads: a read is set once — never changed, never removed';
end $$;
revoke execute on function public.notification_reads_guard() from public, anon, authenticated;
drop trigger if exists notification_reads_guard on public.notification_reads;
create trigger notification_reads_guard before update or delete on public.notification_reads
  for each row execute function public.notification_reads_guard();
drop trigger if exists notification_reads_no_truncate on public.notification_reads;
create trigger notification_reads_no_truncate before truncate on public.notification_reads
  for each statement execute function public.notification_reads_guard();

-- ── recipients per person ───────────────────────────────────────────────────────
alter table identity.entity_users add column if not exists receives_notices boolean not null default true;

-- the users opened (0033) and the user of a sign-in account (0034) — with it; what
-- they return changes, so they are made again, with their rights
drop function if exists public.identity_entity_users(text, text, uuid, uuid);
create function public.identity_entity_users(p_actor text, p_purpose text, p_entity uuid default null, p_user uuid default null)
  returns table (id uuid, entity_id uuid, email text, name text, job_position text, phone text, role text, two_factor_required boolean,
                 state text, auth_user_id uuid, created_at timestamptz, created_by text, receives_notices boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  select count(*), array_agg(u.id order by u.id) into n, ids from identity.entity_users u
    where (p_entity is null or u.entity_id = p_entity) and (p_user is null or u.id = p_user);
  insert into identity.openings (actor, purpose, entity_id, user_id, user_ids, rows) values (trim(p_actor), p_purpose, p_entity, p_user, ids, n);
  return query
    select u.id, u.entity_id, u.email, u.name, u.position, u.phone, u.role, u.two_factor_required, u.state, u.auth_user_id, u.created_at, u.created_by, u.receives_notices
    from identity.entity_users u
    where u.id = any (coalesce(ids, '{}'))
    order by u.name;
end $$;

drop function if exists public.identity_entity_user_by_auth(text, uuid);
create function public.identity_entity_user_by_auth(p_actor text, p_auth uuid)
  returns table (id uuid, entity_id uuid, email text, name text, job_position text, phone text, role text, two_factor_required boolean,
                 state text, auth_user_id uuid, created_at timestamptz, created_by text, receives_notices boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[]; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  select count(*), array_agg(u.id order by u.id), min(u.entity_id::text)::uuid into n, ids, ent
    from identity.entity_users u where p_auth is not null and u.auth_user_id = p_auth;
  insert into identity.openings (actor, purpose, entity_id, user_ids, rows) values (trim(p_actor), 'lab.own', ent, ids, n);
  return query
    select u.id, u.entity_id, u.email, u.name, u.position, u.phone, u.role, u.two_factor_required, u.state, u.auth_user_id, u.created_at, u.created_by, u.receives_notices
    from identity.entity_users u where u.id = any (coalesce(ids, '{}'));
end $$;

-- the put (0033), with receives_notices; everything else as it was
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

-- ── X1: the accreditation body, with the laboratory and its copy ─────────────────
alter table identity.laboratories add column if not exists accreditation_body text not null default '';
alter table identity.laboratories drop constraint if exists laboratories_accreditation_body;
alter table identity.laboratories add constraint laboratories_accreditation_body check (char_length(accreditation_body) <= 120);

drop function if exists public.identity_laboratories(text, text, uuid, uuid);
create function public.identity_laboratories(p_actor text, p_purpose text, p_entity uuid default null, p_laboratory uuid default null)
  returns table (id uuid, entity_id uuid, name text, delivery_address text, mobile_office boolean, accreditation_no text, state text, created_at timestamptz, created_by text, accreditation_body text)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  select count(*), array_agg(l.id order by l.id) into n, ids from identity.laboratories l
    where (p_entity is null or l.entity_id = p_entity) and (p_laboratory is null or l.id = p_laboratory);
  insert into identity.openings (actor, purpose, entity_id, laboratory_id, laboratory_ids, rows) values (trim(p_actor), p_purpose, p_entity, p_laboratory, ids, n);
  return query
    select l.id, l.entity_id, l.name, l.delivery_address, l.mobile_office, l.accreditation_no, l.state, l.created_at, l.created_by, l.accreditation_body
    from identity.laboratories l
    where l.id = any (coalesce(ids, '{}'))
    order by l.name;
end $$;

create or replace function public.identity_laboratory_put(p_actor text, p_laboratory uuid, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  if exists (select 1 from identity.laboratories where id = p_laboratory) then
    update identity.laboratories l set
      name = case when p_fields ? 'name' then p_fields->>'name' else l.name end,
      delivery_address = case when p_fields ? 'delivery_address' then p_fields->>'delivery_address' else l.delivery_address end,
      mobile_office = case when p_fields ? 'mobile_office' then coalesce((p_fields->>'mobile_office')::boolean, false) else l.mobile_office end,
      accreditation_no = case when p_fields ? 'accreditation_no' then coalesce(p_fields->>'accreditation_no', '') else l.accreditation_no end,
      accreditation_body = case when p_fields ? 'accreditation_body' then coalesce(p_fields->>'accreditation_body', '') else l.accreditation_body end,
      state = case when p_fields ? 'state' then p_fields->>'state' else l.state end,
      updated_at = now()
    where l.id = p_laboratory;
  else
    insert into identity.laboratories (id, entity_id, name, delivery_address, mobile_office, accreditation_no, accreditation_body, state, created_by)
    values (p_laboratory, (p_fields->>'entity_id')::uuid, p_fields->>'name', p_fields->>'delivery_address',
            coalesce((p_fields->>'mobile_office')::boolean, false), coalesce(p_fields->>'accreditation_no', ''), coalesce(p_fields->>'accreditation_body', ''),
            coalesce(p_fields->>'state', 'active'), trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, laboratory_id, laboratory_ids, rows)
    values (trim(p_actor), 'write', (select l.entity_id from identity.laboratories l where l.id = p_laboratory), p_laboratory, array[p_laboratory], 1);
end $$;

-- the freeze (0035), with the accreditation body in the laboratory's copy
create or replace function public.identity_participation_freeze(p_actor text, p_participant uuid, p_laboratory uuid, p_contact uuid default null, p_reason text default null)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare ent uuid; l record; e record; prev integer; v integer; was record;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  perform 1 from public.participants p where p.id = p_participant for update;
  if not found then raise exception 'identity: no such participant'; end if;
  select max(s.version) into prev from identity.participation_snapshots s where s.participant_id = p_participant;
  if prev is not null and coalesce(btrim(p_reason), '') = '' then raise exception 'identity: the participation is frozen already — a correction needs its reason'; end if;
  select i.lab_name, i.delivery_address into was from identity.participants i where i.participant_id = p_participant;
  if not found then raise exception 'identity: no such participant'; end if;
  select x.entity_id into ent from identity.laboratories x where x.id = p_laboratory;
  if not found then raise exception 'identity: no such laboratory, or it is inactive'; end if;
  select x.id, x.name, x.country, x.eik, x.vat, x.correspondence_address, x.official_email, x.mol, x.language, x.state, x.origin, x.confirmed_at into e
    from identity.legal_entities x where x.id = ent for share;
  if not found or e.state = 'inactive' then raise exception 'identity: no such entity, or it is inactive'; end if;
  select x.id, x.name, x.delivery_address, x.mobile_office, x.accreditation_no, x.accreditation_body, x.state into l
    from identity.laboratories x where x.id = p_laboratory for share;
  if not found or l.state <> 'active' then raise exception 'identity: no such laboratory, or it is inactive'; end if;
  if p_contact is not null and not exists (
    select 1 from identity.entity_users u where u.id = p_contact and u.entity_id = e.id and u.state <> 'inactive') then
    raise exception 'identity: the contact is not a user of that entity';
  end if;
  v := coalesce(prev, 0) + 1;
  insert into identity.participation_snapshots (participant_id, version, entity_id, laboratory_id, contact_user_id, entity, laboratory, mol, official_email, replaced, supersedes, reason, taken_by)
  values (p_participant, v, e.id, l.id, p_contact,
          jsonb_build_object('name', e.name, 'country', e.country, 'eik', e.eik, 'vat', e.vat, 'correspondence_address', e.correspondence_address,
                             'language', e.language, 'state', e.state, 'origin', e.origin, 'confirmed_at', e.confirmed_at),
          jsonb_build_object('name', l.name, 'delivery_address', l.delivery_address, 'mobile_office', l.mobile_office, 'accreditation_no', l.accreditation_no,
                             'accreditation_body', l.accreditation_body),
          e.mol, e.official_email,
          jsonb_build_object('lab_name', was.lab_name, 'delivery_address', was.delivery_address),
          prev, coalesce(btrim(p_reason), ''), trim(p_actor));
  update identity.participants i set lab_name = l.name, delivery_address = l.delivery_address where i.participant_id = p_participant;
  insert into identity.openings (actor, purpose, participant_id, entity_id, laboratory_id, user_id, rows)
    values (trim(p_actor), 'write', p_participant, e.id, l.id, p_contact, 1);
  return v;
end $$;

-- ── a participation's recipients: its entity's active users who receive notices ───
create or replace function public.identity_notice_recipients(p_actor text, p_scheme text, p_code text)
  returns table (entity_id uuid, user_id uuid, email text)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare pid uuid; ent uuid; ids uuid[]; n integer;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  select p.id into pid from public.participants p where p.scheme_id = p_scheme and p.code = p_code;
  if pid is not null then
    select s.entity_id into ent from identity.participation_snapshots s where s.participant_id = pid order by s.version desc limit 1;
  end if;
  select count(*), array_agg(u.id order by u.id) into n, ids from identity.entity_users u
    where ent is not null and u.entity_id = ent and u.state = 'active' and u.receives_notices;
  insert into identity.openings (actor, purpose, scheme_id, participant_id, entity_id, user_ids, rows)
    values (trim(p_actor), 'send', p_scheme, pid, ent, ids, coalesce(n, 0));
  -- a copy, but nobody (yet) to tell: one row with its entity and no user — the notice
  -- waits for a recipient rather than going to an earlier address (4.6 review)
  if ent is not null and coalesce(n, 0) = 0 then
    return query select ent, null::uuid, null::text;
    return;
  end if;
  return query select u.entity_id, u.id, u.email from identity.entity_users u where u.id = any (coalesce(ids, '{}')) order by u.email;
end $$;

-- the entity of a participation's copy in force — is there anyone to tell? (recorded)
create or replace function public.identity_participation_entity(p_actor text, p_scheme text, p_code text)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare pid uuid; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  select p.id into pid from public.participants p where p.scheme_id = p_scheme and p.code = p_code;
  if pid is not null then
    select s.entity_id into ent from identity.participation_snapshots s where s.participant_id = pid order by s.version desc limit 1;
  end if;
  insert into identity.openings (actor, purpose, scheme_id, participant_id, entity_id, rows)
    values (trim(p_actor), 'send', p_scheme, pid, ent, case when ent is null then 0 else 1 end);
  return ent;
end $$;

-- ── the laboratory switcher: a participant's user's own participations ───────────
create or replace function public.identity_participations_of_entity(p_actor text, p_entity uuid)
  returns table (participant_id uuid, scheme_id text, code text, status text, laboratory_id uuid, version integer)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  select count(*), array_agg(x.participant_id order by x.participant_id) into n, ids from (
    select distinct on (s.participant_id) s.participant_id, s.entity_id from identity.participation_snapshots s
    order by s.participant_id, s.version desc) x
    where x.entity_id = p_entity;
  insert into identity.openings (actor, purpose, entity_id, participant_ids, rows) values (trim(p_actor), 'lab.own', p_entity, ids, coalesce(n, 0));
  return query
    select distinct on (s.participant_id) s.participant_id, p.scheme_id, p.code, p.status, s.laboratory_id, s.version
    from identity.participation_snapshots s join public.participants p on p.id = s.participant_id
    where s.participant_id = any (coalesce(ids, '{}'))
    order by s.participant_id, s.version desc;
end $$;

revoke execute on function public.identity_entity_users(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_by_auth(text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_put(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_laboratories(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_laboratory_put(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_participation_freeze(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.identity_notice_recipients(text, text, text) from public, anon, authenticated;
revoke execute on function public.identity_participations_of_entity(text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_participation_entity(text, text, text) from public, anon, authenticated;
grant execute on function public.identity_entity_users(text, text, uuid, uuid) to service_role;
grant execute on function public.identity_entity_user_by_auth(text, uuid) to service_role;
grant execute on function public.identity_entity_user_put(text, uuid, jsonb) to service_role;
grant execute on function public.identity_laboratories(text, text, uuid, uuid) to service_role;
grant execute on function public.identity_laboratory_put(text, uuid, jsonb) to service_role;
grant execute on function public.identity_participation_freeze(text, uuid, uuid, uuid, text) to service_role;
grant execute on function public.identity_notice_recipients(text, text, text) to service_role;
grant execute on function public.identity_participations_of_entity(text, uuid) to service_role;
grant execute on function public.identity_participation_entity(text, text, text) to service_role;

insert into public.app_migrations (name) values ('0036_notice_recipients') on conflict (name) do nothing;

commit;
