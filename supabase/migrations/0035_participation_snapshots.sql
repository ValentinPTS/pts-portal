-- Part 4.5 — a frozen copy per participation (J12; Zadanie: «данните на лабораторията се
-- „снимат" към всяко участие, за да не се менят със задна дата»). When PTS links a
-- participation to the laboratory it is for (4.2), the database takes the legal
-- entity's and the laboratory's data AS THEY ARE THEN and keeps that copy with the
-- participation — later changes to the entity or the laboratory never reach it.
--
--   identity.participation_snapshots — the copies of a participation, versioned: the
--     newest is in force; a wrong link is corrected by a NEW version with its reason,
--     the earlier one kept (4.5 review). Each: the entity and the laboratory (their ids,
--     and their data then — the entity's name, country, ЕИК, VAT, correspondence
--     address, language, state, origin, confirmation; the laboratory's name, delivery
--     address, «мобилен офис», accreditation number), the participation's own
--     laboratory fields it replaced, when and by whom. Never changed — but for the one
--     sanctioned anonymisation of its personal fields.
--   The PERSON: the contact by reference only (contact_user_id → identity.entity_users),
--     and the two fields that may name one — the МОЛ and the official e-mail — in
--     columns of their own, which the anonymisation after six years (Zadanie §10)
--     blanks (identity_participation_anonymise); nothing else of a person is copied.
--   identity.participants — once a participation has a copy, its laboratory name and
--     delivery address are the copy's: the database refuses any other value (its
--     documents say what was frozen; a correction is a new version).
--
-- The copy is made by the database from its own rows — never a copy the portal sends.
-- In the identity store like the rest: reached only through the functions below, every
-- opening on record; a read by hand audited (0025).
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0034.

begin;

create table if not exists identity.participation_snapshots (
  participant_id uuid not null references public.participants(id),
  version integer not null check (version >= 1),
  entity_id uuid not null references identity.legal_entities(id),
  laboratory_id uuid not null references identity.laboratories(id),
  -- the person: a reference, never a copy (anonymised with the user, Zadanie §10)
  contact_user_id uuid references identity.entity_users(id),
  entity jsonb not null,
  laboratory jsonb not null,
  -- the fields that may name a person — blanked by the anonymisation, nothing else is
  mol text not null default '',
  official_email text not null default '',
  anonymised_at timestamptz,
  -- what the participation's own laboratory fields were before this copy replaced them
  replaced jsonb not null default '{}'::jsonb,
  -- a correction: the version it supersedes, and why
  supersedes integer,
  reason text not null default '' check (char_length(reason) <= 300),
  taken_at timestamptz not null default now(),
  taken_by text not null check (char_length(btrim(taken_by)) > 0),
  primary key (participant_id, version),
  constraint participation_snapshots_correction check ((version = 1 and supersedes is null) or (version > 1 and supersedes = version - 1 and char_length(btrim(reason)) > 0))
);
create index if not exists participation_snapshots_entity on identity.participation_snapshots (entity_id);
create index if not exists participation_snapshots_laboratory on identity.participation_snapshots (laboratory_id);
alter table identity.participation_snapshots enable row level security;
revoke all on identity.participation_snapshots from public, anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'identity_auditor') then
    grant select, insert, update, delete on identity.participation_snapshots to identity_auditor;
  end if;
end $$;

-- frozen for every writer: never removed; never changed — but the one anonymisation,
-- which blanks the МОЛ and the official e-mail and stamps when, and nothing else
create or replace function identity.participation_snapshots_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.anonymised_at is null and new.anonymised_at is not null
     and new.mol = '' and new.official_email = ''
     and (new.participant_id, new.version, new.entity_id, new.laboratory_id, new.contact_user_id, new.entity, new.laboratory,
          new.replaced, new.supersedes, new.reason, new.taken_at, new.taken_by)
         is not distinct from
         (old.participant_id, old.version, old.entity_id, old.laboratory_id, old.contact_user_id, old.entity, old.laboratory,
          old.replaced, old.supersedes, old.reason, old.taken_at, old.taken_by) then
    return new;
  end if;
  raise exception 'identity.participation_snapshots: a participation''s copy is frozen — never changed, never removed';
end $$;
revoke execute on function identity.participation_snapshots_guard() from public, anon, authenticated, service_role;
drop trigger if exists participation_snapshots_frozen on identity.participation_snapshots;
create trigger participation_snapshots_frozen before update or delete on identity.participation_snapshots
  for each row execute function identity.participation_snapshots_guard();
drop trigger if exists participation_snapshots_no_truncate on identity.participation_snapshots;
create trigger participation_snapshots_no_truncate before truncate on identity.participation_snapshots
  for each statement execute function identity.participation_snapshots_guard();

-- a participation with a copy: its laboratory name and delivery address are the copy's
-- in force — by every writer (identity_put, identity_update_participant, by hand)
create or replace function identity.participants_frozen_fields() returns trigger
  language plpgsql set search_path = '' as $$
declare lab jsonb;
begin
  if new.lab_name is distinct from old.lab_name or new.delivery_address is distinct from old.delivery_address then
    select s.laboratory into lab from identity.participation_snapshots s
      where s.participant_id = new.participant_id order by s.version desc limit 1;
    if lab is not null and (new.lab_name is distinct from lab->>'name' or new.delivery_address is distinct from lab->>'delivery_address') then
      raise exception 'identity: the participation''s laboratory is frozen — correct its link instead';
    end if;
  end if;
  return new;
end $$;
revoke execute on function identity.participants_frozen_fields() from public, anon, authenticated, service_role;
drop trigger if exists participants_frozen_fields on identity.participants;
create trigger participants_frozen_fields before update of lab_name, delivery_address on identity.participants
  for each row execute function identity.participants_frozen_fields();

-- freeze: a participation's copy, from the database's own rows — the first, or (with a
-- reason) a correction that supersedes the one in force. One at a time per
-- participation (its row locked). The laboratory active and its entity not inactive,
-- locked in the order every other writer takes them — the entity, then the laboratory
-- (4.5 review: no deadlock with an entity made inactive). The contact, if named, a user
-- of that entity, not inactive. The participation's laboratory name and delivery
-- address follow the copy (what they were is kept in it). Recorded as a write.
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
  -- the laboratory's entity never changes (0032): read without a lock, then lock in order
  select x.entity_id into ent from identity.laboratories x where x.id = p_laboratory;
  if not found then raise exception 'identity: no such laboratory, or it is inactive'; end if;
  select x.id, x.name, x.country, x.eik, x.vat, x.correspondence_address, x.official_email, x.mol, x.language, x.state, x.origin, x.confirmed_at into e
    from identity.legal_entities x where x.id = ent for share;
  if not found or e.state = 'inactive' then raise exception 'identity: no such entity, or it is inactive'; end if;
  select x.id, x.name, x.delivery_address, x.mobile_office, x.accreditation_no, x.state into l
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
          jsonb_build_object('name', l.name, 'delivery_address', l.delivery_address, 'mobile_office', l.mobile_office, 'accreditation_no', l.accreditation_no),
          e.mol, e.official_email,
          jsonb_build_object('lab_name', was.lab_name, 'delivery_address', was.delivery_address),
          prev, coalesce(btrim(p_reason), ''), trim(p_actor));
  -- the participation's laboratory fields as frozen (its country, typed, stays its own)
  update identity.participants i set lab_name = l.name, delivery_address = l.delivery_address where i.participant_id = p_participant;
  insert into identity.openings (actor, purpose, participant_id, entity_id, laboratory_id, user_id, rows)
    values (trim(p_actor), 'write', p_participant, e.id, l.id, p_contact, 1);
  return v;
end $$;

-- open: the copies of a scheme's participations, every version — recorded with who, why
-- and which
create or replace function public.identity_participation_snapshots(p_actor text, p_purpose text, p_scheme text)
  returns table (participant_id uuid, version integer, entity_id uuid, laboratory_id uuid, contact_user_id uuid, entity jsonb, laboratory jsonb,
                 mol text, official_email text, anonymised_at timestamptz, replaced jsonb, supersedes integer, reason text, taken_at timestamptz, taken_by text)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  if p_scheme is null then raise exception 'identity: which scheme?'; end if;
  select count(*), array_agg(distinct s.participant_id) into n, ids
    from identity.participation_snapshots s join public.participants p on p.id = s.participant_id where p.scheme_id = p_scheme;
  insert into identity.openings (actor, purpose, scheme_id, participant_ids, rows) values (trim(p_actor), p_purpose, p_scheme, ids, n);
  return query
    select s.participant_id, s.version, s.entity_id, s.laboratory_id, s.contact_user_id, s.entity, s.laboratory, s.mol, s.official_email,
           s.anonymised_at, s.replaced, s.supersedes, s.reason, s.taken_at, s.taken_by
    from identity.participation_snapshots s where s.participant_id = any (coalesce(ids, '{}'))  -- exactly the ones recorded
    order by s.taken_at, s.version;
end $$;

-- anonymise: the personal fields of a participation's copies blanked (Zadanie §10, after
-- six years) — the one change a copy allows; recorded
create or replace function public.identity_participation_anonymise(p_actor text, p_participant uuid)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  update identity.participation_snapshots s set mol = '', official_email = '', anonymised_at = now()
    where s.participant_id = p_participant and s.anonymised_at is null;
  get diagnostics n = row_count;
  insert into identity.openings (actor, purpose, participant_id, rows) values (trim(p_actor), 'write', p_participant, n);
  return n;
end $$;

revoke execute on function public.identity_participation_freeze(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.identity_participation_snapshots(text, text, text) from public, anon, authenticated;
revoke execute on function public.identity_participation_anonymise(text, uuid) from public, anon, authenticated;
grant execute on function public.identity_participation_freeze(text, uuid, uuid, uuid, text) to service_role;
grant execute on function public.identity_participation_snapshots(text, text, text) to service_role;
grant execute on function public.identity_participation_anonymise(text, uuid) to service_role;

insert into public.app_migrations (name) values ('0035_participation_snapshots') on conflict (name) do nothing;

commit;
