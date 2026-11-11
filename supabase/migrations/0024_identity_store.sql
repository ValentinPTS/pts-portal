-- Part 2.3 — the identity store (Н1; D4; Реш. 93, 142). Who is behind a code lives
-- apart from the coded data:
--
--   identity — a schema closed to the API: it is not one of the exposed schemas, and
--     no API role (anon, authenticated, service_role) has any right on it. The portal
--     reaches it ONLY through the functions below, which record every opening in
--     identity.openings (who, for what, which scheme, how many rows) — in the
--     database itself, not only in the portal's journal.
--   identity.participants — a participant's laboratory name, contact, e-mail, phone,
--     country, delivery address and the link to its laboratory account (lab_id):
--     the code ↔ laboratory mapping. COPIED here from public.participants; the code
--     of this version reads and writes it only here.
--
-- The move is in two steps, so the site never breaks and can be rolled back:
--   0024 (this) — EXPAND: copy every row; keep the old columns, mirrored into the
--     store by a trigger while the previous version may still be running;
--   0027 — CONTRACT (supabase/migrations-later/, applied only AFTER this version
--     is live): check the copy once more, then drop the old columns from
--     public.participants, which then keeps the coded data only.
--
-- The laboratory accounts (public.labs) and the account applications hold names but
-- no codes; Phase 4 builds the entity model inside this schema and moves them in.
-- A read that bypasses the portal — the owner in the SQL editor — is recorded by
-- Postgres audit logging (0025).
--
-- Nothing is removed by this migration. All in one transaction; safe to run more
-- than once. Same access posture as the rest (0018).

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0050_online_applications) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  if exists (select 1 from public.app_migrations where name > '0024_identity_store') then
    raise exception '0024_identity_store is superseded by a later migration — running it again would undo that. Nothing was changed.';
  end if;
end $$;


create schema if not exists identity;
revoke all on schema identity from public, anon, authenticated, service_role;

create table if not exists identity.participants (
  participant_id uuid primary key references public.participants(id),
  lab_name text not null default '',
  contact text not null default '',
  email text not null default '',
  phone text not null default '',
  country text not null default '',
  delivery_address text not null default '',
  lab_id uuid
);
create index if not exists identity_participants_lab on identity.participants (lab_id);
-- closed twice over: no right for any API role, and row-level security with no policy
alter table identity.participants enable row level security;
revoke all on identity.participants from public, anon, authenticated, service_role;

-- every opening of the mapping, by the database's own clock: never changed, never removed
create table if not exists identity.openings (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null check (length(actor) > 0),
  purpose text not null,
  scheme_id text,
  participant_id uuid,
  lab_id uuid,
  participant_ids uuid[], -- WHICH participants were opened, not only how many
  rows integer not null,
  db_user text not null default current_user,
  login_user text not null default session_user
);
create index if not exists identity_openings_scheme on identity.openings (scheme_id, at);
alter table identity.openings enable row level security;
revoke all on identity.openings from public, anon, authenticated, service_role;

create or replace function identity.openings_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'identity.openings is a record: never changed, never removed';
end $$;
revoke execute on function identity.openings_guard() from public, anon, authenticated, service_role;
drop trigger if exists openings_guard on identity.openings;
create trigger openings_guard before update or delete on identity.openings
  for each row execute function identity.openings_guard();
drop trigger if exists openings_no_truncate on identity.openings;
create trigger openings_no_truncate before truncate on identity.openings
  for each statement execute function identity.openings_guard();
create or replace function identity.openings_stamp() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.at := now(); new.db_user := current_user; new.login_user := session_user;
  return new;
end $$;
revoke execute on function identity.openings_stamp() from public, anon, authenticated, service_role;
drop trigger if exists openings_stamp on identity.openings;
create trigger openings_stamp before insert on identity.openings
  for each row execute function identity.openings_stamp();

-- EXPAND: copy every row and check the copy; the old columns stay (0027 drops them)
-- and, while they do, whatever the previous version writes there is mirrored in
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'participants' and column_name = 'lab_name') then
    execute $m$
      insert into identity.participants (participant_id, lab_name, contact, email, phone, country, delivery_address, lab_id)
      select id, coalesce(lab_name, ''), coalesce(contact, ''), coalesce(email, ''), coalesce(phone, ''),
             coalesce(country, ''), coalesce(delivery_address, ''), lab_id
      from public.participants
      on conflict (participant_id) do nothing
    $m$;
    if exists (select 1 from public.participants p where not exists (select 1 from identity.participants i where i.participant_id = p.id)) then
      raise exception 'identity: not every participant was copied';
    end if;
    -- this version adds a participant without the old columns
    alter table public.participants alter column lab_name drop not null;
    alter table public.participants alter column lab_name set default '';
    execute $t$
      create or replace function identity.mirror_old_columns() returns trigger
        language plpgsql security definer set search_path = '' as $f$
      begin
        insert into identity.participants as i (participant_id, lab_name, contact, email, phone, country, delivery_address, lab_id)
        values (new.id, coalesce(new.lab_name, ''), coalesce(new.contact, ''), coalesce(new.email, ''), coalesce(new.phone, ''),
                coalesce(new.country, ''), coalesce(new.delivery_address, ''), new.lab_id)
        on conflict (participant_id) do update set
          lab_name = excluded.lab_name, contact = excluded.contact, email = excluded.email, phone = excluded.phone,
          country = excluded.country, delivery_address = excluded.delivery_address, lab_id = excluded.lab_id;
        return new;
      end $f$
    $t$;
    revoke execute on function identity.mirror_old_columns() from public, anon, authenticated, service_role;
    drop trigger if exists mirror_old_columns_insert on public.participants;
    drop trigger if exists mirror_old_columns_update on public.participants;
    -- an insert by the previous version (this version's inserts set none of the old
    -- columns: their identity follows from identity_put within the same transaction)
    create trigger mirror_old_columns_insert after insert on public.participants
      for each row when (coalesce(new.lab_name, '') <> '') execute function identity.mirror_old_columns();
    create trigger mirror_old_columns_update after update of lab_name, contact, email, phone, country, delivery_address, lab_id on public.participants
      for each row execute function identity.mirror_old_columns();
  end if;
end $$;

-- ── the only ways in (the portal's server key calls them; nobody else may) ──
create or replace function public.identity_purpose_ok(p text) returns boolean
  language sql immutable set search_path = '' as $$
  select p in ('names.view', 'export', 'send', 'dispatch', 'lab.own', 'write', 'system')
$$;

-- open: the identities of a scheme, of some participants, or of one laboratory's
-- participations — recorded, with who and why, before anything is returned
create or replace function public.identity_open(p_actor text, p_purpose text, p_scheme text default null, p_participants uuid[] default null, p_lab uuid default null)
  returns table (participant_id uuid, lab_name text, contact text, email text, phone text, country text, delivery_address text, lab_id uuid)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare n integer; ids uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  if p_scheme is null and p_participants is null and p_lab is null then raise exception 'identity: which ones?'; end if;
  select count(*), array_agg(i.participant_id order by i.participant_id) into n, ids
    from identity.participants i join public.participants p on p.id = i.participant_id
    where (p_scheme is null or p.scheme_id = p_scheme)
      and (p_participants is null or i.participant_id = any (p_participants))
      and (p_lab is null or i.lab_id = p_lab);
  insert into identity.openings (actor, purpose, scheme_id, lab_id, participant_ids, rows)
    values (trim(p_actor), p_purpose, p_scheme, p_lab, ids, n);
  return query
    select i.participant_id, i.lab_name, i.contact, i.email, i.phone, i.country, i.delivery_address, i.lab_id
    from identity.participants i join public.participants p on p.id = i.participant_id
    where (p_scheme is null or p.scheme_id = p_scheme)
      and (p_participants is null or i.participant_id = any (p_participants))
      and (p_lab is null or i.lab_id = p_lab);
end $$;

-- put: set some of a participant's identity (only the keys given), recorded
create or replace function public.identity_put(p_actor text, p_participant uuid, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  if not exists (select 1 from public.participants where id = p_participant) then raise exception 'identity: no such participant'; end if;
  insert into identity.participants as i (participant_id, lab_name, contact, email, phone, country, delivery_address, lab_id)
  values (p_participant, coalesce(p_fields->>'lab_name', ''), coalesce(p_fields->>'contact', ''), coalesce(p_fields->>'email', ''),
          coalesce(p_fields->>'phone', ''), coalesce(p_fields->>'country', ''), coalesce(p_fields->>'delivery_address', ''),
          nullif(p_fields->>'lab_id', '')::uuid)
  on conflict (participant_id) do update set
    lab_name = case when p_fields ? 'lab_name' then coalesce(p_fields->>'lab_name', '') else i.lab_name end,
    contact = case when p_fields ? 'contact' then coalesce(p_fields->>'contact', '') else i.contact end,
    email = case when p_fields ? 'email' then coalesce(p_fields->>'email', '') else i.email end,
    phone = case when p_fields ? 'phone' then coalesce(p_fields->>'phone', '') else i.phone end,
    country = case when p_fields ? 'country' then coalesce(p_fields->>'country', '') else i.country end,
    delivery_address = case when p_fields ? 'delivery_address' then coalesce(p_fields->>'delivery_address', '') else i.delivery_address end,
    lab_id = case when p_fields ? 'lab_id' then nullif(p_fields->>'lab_id', '')::uuid else i.lab_id end;
  insert into identity.openings (actor, purpose, participant_id, rows) values (trim(p_actor), 'write', p_participant, 1);
end $$;

-- add: a new participant — its coded row and its identity together, or neither (N14)
create or replace function public.identity_add_participant(p_actor text, p_row jsonb, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participants (id, scheme_id, code, participations, status, courier, sample_code, characteristics)
  values ((p_row->>'id')::uuid, p_row->>'scheme_id', p_row->>'code', coalesce((p_row->>'participations')::integer, 1),
          coalesce(p_row->>'status', 'applied'), p_row->>'courier', p_row->>'sample_code', nullif(p_row->'characteristics', 'null'::jsonb));
  perform public.identity_put(p_actor, (p_row->>'id')::uuid, p_fields);
end $$;

-- update: a participation's coded part and its identity together, or neither (N14);
-- only the keys given are set
create or replace function public.identity_update_participant(p_actor text, p_participant uuid, p_coded jsonb, p_fields jsonb)
  returns table (id uuid, scheme_id text, code text, participations integer, status text, courier text, sample_code text, characteristics jsonb)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_coded is not null and p_coded <> '{}'::jsonb then
    update public.participants p set
      participations = case when p_coded ? 'participations' then (p_coded->>'participations')::integer else p.participations end,
      status = case when p_coded ? 'status' then p_coded->>'status' else p.status end,
      courier = case when p_coded ? 'courier' then p_coded->>'courier' else p.courier end,
      sample_code = case when p_coded ? 'sample_code' then p_coded->>'sample_code' else p.sample_code end,
      characteristics = case when p_coded ? 'characteristics' then nullif(p_coded->'characteristics', 'null'::jsonb) else p.characteristics end
    where p.id = p_participant;
  end if;
  if p_fields is not null and p_fields <> '{}'::jsonb then
    perform public.identity_put(p_actor, p_participant, p_fields);
  end if;
  return query select p.id, p.scheme_id, p.code, p.participations, p.status, p.courier, p.sample_code, p.characteristics
    from public.participants p where p.id = p_participant;
end $$;

-- the round's openings, for its export (1.10) — the laboratory's own and the chain's
-- included (they name participants, not the scheme)
create or replace function public.identity_openings_for(p_scheme text)
  returns table (at timestamptz, actor text, purpose text, participant_id uuid, participant_ids uuid[], lab_id uuid, rows integer, db_user text, login_user text)
  language sql security definer set search_path = '' as $$
  select o.at, o.actor, o.purpose, o.participant_id, o.participant_ids, o.lab_id, o.rows, o.db_user, o.login_user
  from identity.openings o
  where o.scheme_id = p_scheme
     or o.participant_id in (select p.id from public.participants p where p.scheme_id = p_scheme)
     or o.participant_ids && (select coalesce(array_agg(p.id), '{}') from public.participants p where p.scheme_id = p_scheme)
  order by o.at
$$;

revoke execute on function public.identity_purpose_ok(text) from public, anon, authenticated;
revoke execute on function public.identity_open(text, text, text, uuid[], uuid) from public, anon, authenticated;
revoke execute on function public.identity_put(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_add_participant(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_openings_for(text) from public, anon, authenticated;
revoke execute on function public.identity_update_participant(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.identity_update_participant(text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.identity_open(text, text, text, uuid[], uuid) to service_role;
grant execute on function public.identity_put(text, uuid, jsonb) to service_role;
grant execute on function public.identity_add_participant(text, jsonb, jsonb) to service_role;
grant execute on function public.identity_openings_for(text) to service_role;

insert into public.app_migrations (name) values ('0024_identity_store') on conflict (name) do nothing;

commit;
