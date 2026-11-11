-- Part 4.3 — a legal entity's users (Zadanie §8 «Потребител», §6; Реш. 112; К5): the
-- third of the three levels. A person with a login e-mail (one login once: unique by
-- its lower-case form), a name, a position (free text — information only, never a
-- right), an optional phone, a role — the profile's administrator or a user — and
-- whether two-factor sign-in is required; «поканен» until the invitation is accepted
-- (4.4) and its sign-in account linked. Every user sees all the entity's laboratories.
-- In the identity store like the entity: reached only through the functions below,
-- every opening on record with WHICH users; a read by hand audited (0025); never
-- deleted — «неактивен» is the end.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0032.

begin;
-- re-run guard (the security sweep, 2026-11-11): a later migration (0037_retention) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  -- refused once a migration that redefines what this one makes is recorded — a re-run, or a first
  -- application after it, would undo it (round 3); before it, a first application passes (R2S-6)
  if exists (select 1 from public.app_migrations where name in ('0036_notice_recipients', '0037_retention')) then
    raise exception '0033_entity_users is superseded by a later migration already applied — running it now would undo that. Nothing was changed.';
  end if;
end $$;


create table if not exists identity.entity_users (
  id uuid primary key,
  entity_id uuid not null references identity.legal_entities(id),
  email text not null check (char_length(email) between 3 and 254 and email = lower(btrim(email))),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position text not null default '' check (char_length(position) <= 120),
  phone text not null default '' check (char_length(phone) <= 40),
  role text not null default 'user' check (role in ('admin', 'user')),
  two_factor_required boolean not null default false,
  state text not null default 'invited' check (state in ('invited', 'active', 'inactive')),
  -- the sign-in account, linked only when the invitation is accepted (4.4) — never by
  -- the put below; an active user has one (4.3 review)
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  created_by text not null check (char_length(btrim(created_by)) > 0),
  updated_at timestamptz not null default now(),
  constraint entity_users_active_signs_in check (state <> 'active' or auth_user_id is not null)
);
-- one login once
create unique index if not exists entity_users_email on identity.entity_users (email);
create unique index if not exists entity_users_auth on identity.entity_users (auth_user_id) where auth_user_id is not null;
create index if not exists entity_users_entity on identity.entity_users (entity_id);
alter table identity.entity_users enable row level security;
revoke all on identity.entity_users from public, anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'identity_auditor') then
    grant select, insert, update, delete on identity.entity_users to identity_auditor;
  end if;
end $$;

-- never deleted
create or replace function identity.entity_users_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'identity.entity_users: a user is never deleted — set it inactive';
end $$;
revoke execute on function identity.entity_users_guard() from public, anon, authenticated, service_role;
drop trigger if exists entity_users_no_delete on identity.entity_users;
create trigger entity_users_no_delete before delete on identity.entity_users
  for each row execute function identity.entity_users_guard();
drop trigger if exists entity_users_no_truncate on identity.entity_users;
create trigger entity_users_no_truncate before truncate on identity.entity_users
  for each statement execute function identity.entity_users_guard();

alter table identity.openings add column if not exists user_ids uuid[];
alter table identity.openings add column if not exists user_id uuid;

-- the rules held by the database: a user never moves to another entity; it is not
-- invited or active under an inactive entity — read under a share lock
create or replace function identity.entity_users_rules() returns trigger
  language plpgsql set search_path = '' as $$
declare st text;
begin
  if tg_op = 'UPDATE' and new.entity_id <> old.entity_id then
    raise exception 'identity.entity_users: a user never moves to another entity';
  end if;
  if new.state <> 'inactive' then
    select e.state into st from identity.legal_entities e where e.id = new.entity_id for share;
    if st is null or st = 'inactive' then raise exception 'identity: no such entity, or it is inactive'; end if;
  end if;
  return new;
end $$;
revoke execute on function identity.entity_users_rules() from public, anon, authenticated, service_role;
drop trigger if exists entity_users_rules on identity.entity_users;
create trigger entity_users_rules before insert or update of state, entity_id on identity.entity_users
  for each row execute function identity.entity_users_rules();

-- the entity keeps an active administrator (4.3 review): held by the database for every
-- writer, not by one function — checked when an active administrator stops being one,
-- at the end of the transaction (so two administrators can be swapped in one), under a
-- lock on the entity; an inactive entity keeps none (its users went with it)
-- SECURITY DEFINER: a deferred trigger fires at COMMIT, after the portal's function has
-- returned — before Postgres 18 as the role in charge then (the API's service role,
-- which has no access to this schema). As its owner it reads the entity whatever role
-- commits (4.7 review).
create or replace function identity.entity_users_admin_kept() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  if old.role = 'admin' and old.state <> 'inactive' and (new.role <> 'admin' or new.state = 'inactive') then
    select e.state into st from identity.legal_entities e where e.id = new.entity_id for update;
    if st is distinct from 'inactive' and not exists (
      select 1 from identity.entity_users u where u.entity_id = new.entity_id and u.role = 'admin' and u.state <> 'inactive') then
      raise exception 'identity: the entity keeps at least one active administrator';
    end if;
  end if;
  return null;
end $$;
revoke execute on function identity.entity_users_admin_kept() from public, anon, authenticated, service_role;
drop trigger if exists entity_users_admin_kept on identity.entity_users;
create constraint trigger entity_users_admin_kept after update of role, state on identity.entity_users
  deferrable initially deferred for each row execute function identity.entity_users_admin_kept();

-- an entity made inactive takes its users with it, in the same step — none can sign in
create or replace function identity.entity_inactive_users() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.state = 'inactive' and old.state <> 'inactive' then
    update identity.entity_users set state = 'inactive', updated_at = now() where entity_id = new.id and state <> 'inactive';
  end if;
  return new;
end $$;
revoke execute on function identity.entity_inactive_users() from public, anon, authenticated, service_role;
drop trigger if exists entity_inactive_users on identity.legal_entities;
create trigger entity_inactive_users after update of state on identity.legal_entities
  for each row execute function identity.entity_inactive_users();

-- open: the users — of one entity, one user, or all — recorded with who, why and which
create or replace function public.identity_entity_users(p_actor text, p_purpose text, p_entity uuid default null, p_user uuid default null)
  -- (job_position: POSITION is a keyword that may not name an output column — 4.3 review)
  returns table (id uuid, entity_id uuid, email text, name text, job_position text, phone text, role text, two_factor_required boolean,
                 state text, auth_user_id uuid, created_at timestamptz, created_by text)
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
    select u.id, u.entity_id, u.email, u.name, u.position, u.phone, u.role, u.two_factor_required, u.state, u.auth_user_id, u.created_at, u.created_by
    from identity.entity_users u
    where u.id = any (coalesce(ids, '{}'))  -- exactly the ones recorded (never deleted)
    order by u.name;
end $$;

-- is this login e-mail already a user's — but the one being edited? The question only
create or replace function public.identity_user_email_taken(p_actor text, p_email text, p_except uuid default null)
  returns boolean
  language plpgsql security definer set search_path = '' as $$
declare hit uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who asks?'; end if;
  select u.id into hit from identity.entity_users u where u.email = lower(btrim(p_email)) and (p_except is null or u.id <> p_except) limit 1;
  insert into identity.openings (actor, purpose, user_ids, rows)
    values (trim(p_actor), 'write', case when hit is null then null else array[hit] end, case when hit is null then 0 else 1 end);
  return hit is not null;
end $$;

-- put: a new user of an entity (not inactive), or some fields of one (only the keys
-- given; never its entity, sign-in account, maker or creation) — recorded as a write.
-- One change of an entity's users at a time (a lock on the entity). The entity's first
-- user — or the first while it has no active administrator — is its administrator,
-- whatever was asked (4.3 review). A changed login e-mail is a new invitation's: the
-- sign-in account unlinked, «поканен» again — unless inactive, which it stays.
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
      state = case when new_email <> old_email and (case when p_fields ? 'state' then p_fields->>'state' else u.state end) = 'active' then 'invited'
                   when p_fields ? 'state' then p_fields->>'state' else u.state end,
      auth_user_id = case when new_email <> old_email then null else u.auth_user_id end,
      updated_at = now()
    where u.id = p_user;
  else
    ent := (p_fields->>'entity_id')::uuid;
    perform 1 from identity.legal_entities where id = ent for update;
    st := coalesce(p_fields->>'state', 'invited');
    insert into identity.entity_users (id, entity_id, email, name, position, phone, role, two_factor_required, state, created_by)
    values (p_user, ent, lower(btrim(p_fields->>'email')), p_fields->>'name', coalesce(p_fields->>'position', ''), coalesce(p_fields->>'phone', ''),
            case when not exists (select 1 from identity.entity_users u where u.entity_id = ent and u.role = 'admin' and u.state <> 'inactive') then 'admin'
                 else coalesce(p_fields->>'role', 'user') end,
            coalesce((p_fields->>'two_factor_required')::boolean, false), st, trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, user_id, user_ids, rows) values (trim(p_actor), 'write', ent, p_user, array[p_user], 1);
end $$;

revoke execute on function public.identity_entity_users(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.identity_user_email_taken(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_user_put(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.identity_entity_users(text, text, uuid, uuid) to service_role;
grant execute on function public.identity_user_email_taken(text, text, uuid) to service_role;
grant execute on function public.identity_entity_user_put(text, uuid, jsonb) to service_role;

insert into public.app_migrations (name) values ('0033_entity_users') on conflict (name) do nothing;

commit;
