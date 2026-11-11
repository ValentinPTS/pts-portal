-- Part 4.2 — the laboratories (Zadanie §8 «Лаборатория»): the second of the three
-- levels. A laboratory belongs to a legal entity (0031) — several per entity — and has
-- its name as on its accreditation certificate, a delivery address, the «мобилен
-- офис» mark, and its accreditation number (information only: accreditation is no
-- condition of taking part, Реш. 108). In the identity store, like its entity:
-- reached only through the functions below, every opening on record with WHICH
-- laboratories; a read by hand audited (0025); never deleted — «неактивна» is its end.
--
-- (Not public.labs: those are the laboratories' ACCOUNTS of the earlier portal — the
-- users of 4.3 take their place.)
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0031.

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0036_notice_recipients) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  if exists (select 1 from public.app_migrations where name > '0032_laboratories') then
    raise exception '0032_laboratories is superseded by a later migration — running it again would undo that. Nothing was changed.';
  end if;
end $$;


create table if not exists identity.laboratories (
  id uuid primary key,
  entity_id uuid not null references identity.legal_entities(id),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 1 and 300),
  mobile_office boolean not null default false,
  accreditation_no text not null default '' check (char_length(accreditation_no) <= 60),
  state text not null default 'active' check (state in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by text not null check (char_length(btrim(created_by)) > 0),
  updated_at timestamptz not null default now()
);
create index if not exists laboratories_entity on identity.laboratories (entity_id);
alter table identity.laboratories enable row level security;
revoke all on identity.laboratories from public, anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'identity_auditor') then
    grant select, insert, update, delete on identity.laboratories to identity_auditor;
  end if;
end $$;

-- never deleted
create or replace function identity.laboratories_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'identity.laboratories: a laboratory is never deleted — set it inactive';
end $$;
revoke execute on function identity.laboratories_guard() from public, anon, authenticated, service_role;
drop trigger if exists laboratories_no_delete on identity.laboratories;
create trigger laboratories_no_delete before delete on identity.laboratories
  for each row execute function identity.laboratories_guard();
drop trigger if exists laboratories_no_truncate on identity.laboratories;
create trigger laboratories_no_truncate before truncate on identity.laboratories
  for each statement execute function identity.laboratories_guard();

alter table identity.openings add column if not exists laboratory_ids uuid[];
-- the one asked for, even when it matched nothing
alter table identity.openings add column if not exists laboratory_id uuid;

-- the rules held by the database itself (4.2 review): a laboratory never moves to
-- another entity; it is active only under an entity that is not inactive — read under a
-- share lock, so a laboratory made active while its entity is made inactive cannot both
-- commit
create or replace function identity.laboratories_rules() returns trigger
  language plpgsql set search_path = '' as $$
declare st text;
begin
  if tg_op = 'UPDATE' and new.entity_id <> old.entity_id then
    raise exception 'identity.laboratories: a laboratory never moves to another entity';
  end if;
  if new.state = 'active' then
    select e.state into st from identity.legal_entities e where e.id = new.entity_id for share;
    if st is null or st = 'inactive' then raise exception 'identity: no such entity, or it is inactive'; end if;
  end if;
  return new;
end $$;
revoke execute on function identity.laboratories_rules() from public, anon, authenticated, service_role;
drop trigger if exists laboratories_rules on identity.laboratories;
create trigger laboratories_rules before insert or update of state, entity_id on identity.laboratories
  for each row execute function identity.laboratories_rules();

-- an entity made inactive takes its laboratories with it, in the same step (4.2 review)
create or replace function identity.entity_inactive_laboratories() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.state = 'inactive' and old.state <> 'inactive' then
    update identity.laboratories set state = 'inactive', updated_at = now() where entity_id = new.id and state = 'active';
  end if;
  return new;
end $$;
revoke execute on function identity.entity_inactive_laboratories() from public, anon, authenticated, service_role;
drop trigger if exists entity_inactive_laboratories on identity.legal_entities;
create trigger entity_inactive_laboratories after update of state on identity.legal_entities
  for each row execute function identity.entity_inactive_laboratories();

-- open: the laboratories — of one entity, one laboratory, or all — recorded with who,
-- why and which, before anything returns
create or replace function public.identity_laboratories(p_actor text, p_purpose text, p_entity uuid default null, p_laboratory uuid default null)
  returns table (id uuid, entity_id uuid, name text, delivery_address text, mobile_office boolean, accreditation_no text, state text, created_at timestamptz, created_by text)
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
    select l.id, l.entity_id, l.name, l.delivery_address, l.mobile_office, l.accreditation_no, l.state, l.created_at, l.created_by
    from identity.laboratories l
    where l.id = any (coalesce(ids, '{}'))  -- exactly the ones recorded (never deleted)
    order by l.name;
end $$;

-- put: a new laboratory of an entity (every required field), or some fields of one
-- (only the keys given; never its entity, maker or creation) — recorded as a write
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
      state = case when p_fields ? 'state' then p_fields->>'state' else l.state end,
      updated_at = now()
    where l.id = p_laboratory;
  else
    -- a new one only under an entity that is not inactive (laboratories_rules holds it)
    insert into identity.laboratories (id, entity_id, name, delivery_address, mobile_office, accreditation_no, state, created_by)
    values (p_laboratory, (p_fields->>'entity_id')::uuid, p_fields->>'name', p_fields->>'delivery_address',
            coalesce((p_fields->>'mobile_office')::boolean, false), coalesce(p_fields->>'accreditation_no', ''),
            coalesce(p_fields->>'state', 'active'), trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, laboratory_id, laboratory_ids, rows)
    values (trim(p_actor), 'write', (select l.entity_id from identity.laboratories l where l.id = p_laboratory), p_laboratory, array[p_laboratory], 1);
end $$;

revoke execute on function public.identity_laboratories(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_laboratory_put(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.identity_laboratories(text, text, uuid, uuid) to service_role;
grant execute on function public.identity_laboratory_put(text, uuid, jsonb) to service_role;

insert into public.app_migrations (name) values ('0032_laboratories') on conflict (name) do nothing;

commit;
