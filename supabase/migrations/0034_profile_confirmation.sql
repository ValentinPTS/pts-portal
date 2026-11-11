-- Part 4.4 — a profile from a PDF application (Реш. 145). In the transitional period
-- PTS keeps the PDF application and enters the profile itself (origin «pdf», 0031);
-- the invitation (1.8) goes to the entity's users; a user sets a password, and the
-- profile's administrator reviews, completes and CONFIRMS the data. From that date the
-- data is the laboratory's. At the confirmation a notice goes to the entity's official
-- e-mail (К23), with the link to the privacy section M4 (Реш. 152).
--
--   identity.legal_entities + official_email — where the notices to the organisation
--     go (К23); + confirmed_at, confirmed_by — when, and which of its users: once, never
--     changed after (a trigger).
--   identity.entity_users — the sign-in account linked at the invitation, by a function
--     of its own (only an invited user; only the account of the user's own login, as
--     auth.users has it — 4.3 review), never by the put; accepted when the password is
--     set (invited → active).
--   public.sent_messages + entity_id — a message to a participant's user names its
--     entity, as a laboratory's names the laboratory.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0033.

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0037_retention) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  -- refused once a migration that redefines what this one makes is recorded — a re-run, or a first
  -- application after it, would undo it (round 3); before it, a first application passes (R2S-6)
  if exists (select 1 from public.app_migrations where name in ('0036_notice_recipients', '0037_retention')) then
    raise exception '0034_profile_confirmation is superseded by a later migration already applied — running it now would undo that. Nothing was changed.';
  end if;
end $$;


-- ── the official e-mail and the confirmation ────────────────────────────────────
alter table identity.legal_entities add column if not exists official_email text not null default '';
alter table identity.legal_entities drop constraint if exists legal_entities_official_email;
alter table identity.legal_entities add constraint legal_entities_official_email
  check (official_email = '' or (char_length(official_email) between 6 and 254 and official_email = lower(btrim(official_email)) and official_email ~ '^[^@\s]+@[^@\s]+\.[a-z0-9-]{2,63}$'));
alter table identity.legal_entities add column if not exists confirmed_at timestamptz;
alter table identity.legal_entities add column if not exists confirmed_by uuid;
alter table identity.legal_entities drop constraint if exists legal_entities_confirmed_by;
alter table identity.legal_entities add constraint legal_entities_confirmed_by foreign key (confirmed_by) references identity.entity_users(id);
alter table identity.legal_entities drop constraint if exists legal_entities_confirmed_whole;
alter table identity.legal_entities add constraint legal_entities_confirmed_whole check ((confirmed_at is null) = (confirmed_by is null));

-- a confirmation, once made, stays as it was made — by every writer
create or replace function identity.legal_entities_confirmation_kept() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if old.confirmed_at is not null and (new.confirmed_at is distinct from old.confirmed_at or new.confirmed_by is distinct from old.confirmed_by) then
    raise exception 'identity: a confirmation is never changed';
  end if;
  return new;
end $$;
revoke execute on function identity.legal_entities_confirmation_kept() from public, anon, authenticated, service_role;
drop trigger if exists legal_entities_confirmation_kept on identity.legal_entities;
create trigger legal_entities_confirmation_kept before update on identity.legal_entities
  for each row execute function identity.legal_entities_confirmation_kept();

-- ── a message to a participant's user names its entity ──────────────────────────
alter table public.sent_messages add column if not exists entity_id uuid;
create index if not exists sent_messages_entity on public.sent_messages (entity_id, sent_at desc);
-- the record's guard (0020), with the new column among those never changed
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
  if old.outcome <> 'pending' or new.outcome = 'pending'
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

-- ── the entities, opened — now with the official e-mail and the confirmation ──────
-- (what it returns changes, so it is made again, with its rights)
drop function if exists public.identity_entities(text, text, uuid);
create function public.identity_entities(p_actor text, p_purpose text, p_entity uuid default null)
  returns table (id uuid, name text, country text, eik text, vat text, correspondence_address text, mol text, language text,
                 state text, vies jsonb, proof_path text, proof_history jsonb, manual_check jsonb, origin text, created_at timestamptz, created_by text,
                 official_email text, confirmed_at timestamptz, confirmed_by uuid)
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
           e.official_email, e.confirmed_at, e.confirmed_by
    from identity.legal_entities e where e.id = any (coalesce(ids, '{}'))  -- exactly the ones recorded (never deleted)
    order by e.name;
end $$;

-- put (0031), with the official e-mail; never the confirmation, origin, maker or creation
create or replace function public.identity_entity_put(p_actor text, p_entity uuid, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  if exists (select 1 from identity.legal_entities where id = p_entity) then
    update identity.legal_entities e set
      name = case when p_fields ? 'name' then p_fields->>'name' else e.name end,
      country = case when p_fields ? 'country' then p_fields->>'country' else e.country end,
      eik = case when p_fields ? 'eik' then p_fields->>'eik' else e.eik end,
      eik_key = case when p_fields ? 'eik_key' then p_fields->>'eik_key' else e.eik_key end,
      vat = case when p_fields ? 'vat' then coalesce(p_fields->>'vat', '') else e.vat end,
      correspondence_address = case when p_fields ? 'correspondence_address' then p_fields->>'correspondence_address' else e.correspondence_address end,
      official_email = case when p_fields ? 'official_email' then lower(btrim(coalesce(p_fields->>'official_email', ''))) else e.official_email end,
      mol = case when p_fields ? 'mol' then coalesce(p_fields->>'mol', '') else e.mol end,
      language = case when p_fields ? 'language' then p_fields->>'language' else e.language end,
      state = case when p_fields ? 'state' then p_fields->>'state' else e.state end,
      vies = case when p_fields ? 'vies' then nullif(p_fields->'vies', 'null'::jsonb) else e.vies end,
      proof_path = case when p_fields ? 'proof_path' then nullif(p_fields->>'proof_path', '') else e.proof_path end,
      proof_history = case when p_fields ? 'proof_history' then coalesce(nullif(p_fields->'proof_history', 'null'::jsonb), '[]'::jsonb) else e.proof_history end,
      manual_check = case when p_fields ? 'manual_check' then nullif(p_fields->'manual_check', 'null'::jsonb) else e.manual_check end,
      updated_at = now()
    where e.id = p_entity;
  else
    insert into identity.legal_entities (id, name, country, eik, eik_key, vat, correspondence_address, official_email, mol, language, state, vies, proof_path, proof_history, manual_check, origin, created_by)
    values (p_entity, p_fields->>'name', coalesce(p_fields->>'country', 'BG'), p_fields->>'eik', p_fields->>'eik_key', coalesce(p_fields->>'vat', ''),
            p_fields->>'correspondence_address', lower(btrim(coalesce(p_fields->>'official_email', ''))), coalesce(p_fields->>'mol', ''), coalesce(p_fields->>'language', 'bg'),
            coalesce(p_fields->>'state', 'pending'), nullif(p_fields->'vies', 'null'::jsonb), nullif(p_fields->>'proof_path', ''),
            coalesce(nullif(p_fields->'proof_history', 'null'::jsonb), '[]'::jsonb),
            nullif(p_fields->'manual_check', 'null'::jsonb), coalesce(p_fields->>'origin', 'pdf'), trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, entity_ids, rows) values (trim(p_actor), 'write', p_entity, array[p_entity], 1);
end $$;

-- ── the sign-in account: linked at the invitation, accepted at the password ────────
-- link: only an invited user; only the account auth.users holds for the user's own
-- login; never one already another's (the unique index of 0033) — recorded as a write
create or replace function public.identity_entity_user_link(p_actor text, p_user uuid, p_auth uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare st text; em text; cur uuid; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  select u.state, u.email, u.auth_user_id, u.entity_id into st, em, cur, ent from identity.entity_users u where u.id = p_user for update;
  if not found then raise exception 'identity: no such user'; end if;
  if st <> 'invited' then raise exception 'identity: only an invited user is linked to a sign-in account'; end if;
  if cur is not null and cur <> p_auth then raise exception 'identity: the user is linked to another sign-in account'; end if;
  if not exists (select 1 from auth.users a where a.id = p_auth and lower(btrim(a.email)) = em) then
    raise exception 'identity: that sign-in account is not this user''s login';
  end if;
  update identity.entity_users set auth_user_id = p_auth, updated_at = now() where id = p_user;
  insert into identity.openings (actor, purpose, entity_id, user_id, user_ids, rows) values (trim(p_actor), 'write', ent, p_user, array[p_user], 1);
end $$;

-- accept: the invited user of this sign-in account becomes active (its entity not
-- inactive — 0033's rules hold it); returns the user, or nothing — recorded
create or replace function public.identity_entity_user_accept(p_actor text, p_auth uuid)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare uid uuid; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  update identity.entity_users u set state = 'active', updated_at = now()
    where u.auth_user_id = p_auth and u.state = 'invited'
    returning u.id, u.entity_id into uid, ent;
  if uid is not null then
    insert into identity.openings (actor, purpose, entity_id, user_id, user_ids, rows) values (trim(p_actor), 'write', ent, uid, array[uid], 1);
  end if;
  return uid;
end $$;

-- the user of a sign-in account — the laboratory's own (lab.own), at most one,
-- recorded with which
create or replace function public.identity_entity_user_by_auth(p_actor text, p_auth uuid)
  returns table (id uuid, entity_id uuid, email text, name text, job_position text, phone text, role text, two_factor_required boolean,
                 state text, auth_user_id uuid, created_at timestamptz, created_by text)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[]; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  select count(*), array_agg(u.id order by u.id), min(u.entity_id::text)::uuid into n, ids, ent
    from identity.entity_users u where p_auth is not null and u.auth_user_id = p_auth;
  insert into identity.openings (actor, purpose, entity_id, user_ids, rows) values (trim(p_actor), 'lab.own', ent, ids, n);
  return query
    select u.id, u.entity_id, u.email, u.name, u.position, u.phone, u.role, u.two_factor_required, u.state, u.auth_user_id, u.created_at, u.created_by
    from identity.entity_users u where u.id = any (coalesce(ids, '{}'));
end $$;

-- the user of a login — for a new password asked for by its address (no session yet):
-- which one, its state, and whether it has a sign-in account to write to; recorded
-- (purpose «send»: a message is about to go) (4.4 review)
create or replace function public.identity_entity_user_for_login(p_actor text, p_email text)
  returns table (id uuid, entity_id uuid, state text, linked boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid; ent uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who asks?'; end if;
  select u.id, u.entity_id into uid, ent from identity.entity_users u where u.email = lower(btrim(p_email)) limit 1;
  insert into identity.openings (actor, purpose, entity_id, user_ids, rows)
    values (trim(p_actor), 'send', ent, case when uid is null then null else array[uid] end, case when uid is null then 0 else 1 end);
  return query select u.id, u.entity_id, u.state, u.auth_user_id is not null from identity.entity_users u where u.id = uid;
end $$;

-- confirm: the profile's ACTIVE administrator confirms its entity's data — once; with
-- the official e-mail there to be told (К23). Returns when, and whether it is now.
create or replace function public.identity_entity_confirm(p_actor text, p_entity uuid, p_user uuid)
  returns table (confirmed_at timestamptz, now_confirmed boolean)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare st text; was timestamptz; em text; t_now timestamptz;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  select e.state, e.confirmed_at, e.official_email into st, was, em from identity.legal_entities e where e.id = p_entity for update;
  if not found or st = 'inactive' then raise exception 'identity: no such entity, or it is inactive'; end if;
  if not exists (select 1 from identity.entity_users u where u.id = p_user and u.entity_id = p_entity and u.role = 'admin' and u.state = 'active') then
    raise exception 'identity: only the profile''s active administrator confirms';
  end if;
  insert into identity.openings (actor, purpose, entity_id, entity_ids, user_id, user_ids, rows) values (trim(p_actor), 'write', p_entity, array[p_entity], p_user, array[p_user], 1);
  if was is not null then
    return query select was, false;
    return;
  end if;
  if em = '' then raise exception 'identity: the official e-mail is required to confirm'; end if;
  update identity.legal_entities e set confirmed_at = now(), confirmed_by = p_user, updated_at = now() where e.id = p_entity
    returning e.confirmed_at into t_now;
  return query select t_now, true;
end $$;

revoke execute on function public.identity_entities(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_put(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_link(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_accept(text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_by_auth(text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_confirm(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_for_login(text, text) from public, anon, authenticated;
grant execute on function public.identity_entities(text, text, uuid) to service_role;
grant execute on function public.identity_entity_put(text, uuid, jsonb) to service_role;
grant execute on function public.identity_entity_user_link(text, uuid, uuid) to service_role;
grant execute on function public.identity_entity_user_accept(text, uuid) to service_role;
grant execute on function public.identity_entity_user_by_auth(text, uuid) to service_role;
grant execute on function public.identity_entity_confirm(text, uuid, uuid) to service_role;
grant execute on function public.identity_entity_user_for_login(text, text) to service_role;

insert into public.app_migrations (name) values ('0034_profile_confirmation') on conflict (name) do nothing;

commit;
