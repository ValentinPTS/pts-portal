-- Part 2.1 (the provider's role model — lib/role-model.ts; Реш. 93, 114, 140, 142,
-- 143; D5, D10, D18). Rights sit on the role type.
--
--   staff_users.permanent_role — quality (the quality manager) or software_admin
--     (separate: technical access, never processes, reviews or approves —
--     П 7.4.1 т. 3). The head of the PT provider is named in PROVIDER_HEAD_EMAILS
--     (1.6), so a release's authoriser is not something a manager can grant.
--   scheme_roles — the roles of one scheme, from its Order: scheme manager, coding
--     expert, statistics expert, technical expert. A role is never removed: it is
--     ENDED (ended_at, ended_by), so the record keeps who held what, and when.
--
-- The earlier roles (staff_users.role: manager / staff / auditor) keep gating until
-- part 2.4 enforces this model in every page, action and the data itself.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

alter table public.staff_users add column if not exists permanent_role text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_users_permanent_role_check') then
    alter table public.staff_users add constraint staff_users_permanent_role_check
      check (permanent_role is null or permanent_role in ('quality', 'software_admin'));
  end if;
end $$;

create table if not exists public.scheme_roles (
  id uuid primary key,
  scheme_id text not null,
  person_email text not null,
  role text not null check (role in ('scheme_manager', 'coding_expert', 'statistics_expert', 'technical_expert')),
  order_ref text,                -- the Order (Заповед) that gives it: its number and date
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by text
);
create index if not exists scheme_roles_scheme on public.scheme_roles (scheme_id, ended_at);
-- one person holds a role in a scheme once at a time (a double submit is refused)
create unique index if not exists scheme_roles_held_once on public.scheme_roles (scheme_id, lower(person_email), role) where ended_at is null;
create index if not exists scheme_roles_person on public.scheme_roles (person_email, ended_at);
alter table public.scheme_roles enable row level security;
revoke all on public.scheme_roles from anon, authenticated;

create or replace function public.scheme_roles_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'scheme_roles is a record: a role is ended, never removed';
  end if;
  if tg_op = 'INSERT' then
    new.assigned_at := now();
    if new.ended_at is not null or new.ended_by is not null then
      raise exception 'scheme_roles: a role starts held';
    end if;
    -- the software administrator never processes, reviews or approves (П 7.4.1 т. 3).
    -- The person's team row is locked first, so this and the permanent-role guard
    -- below cannot both pass at once: the one that waits sees what the other committed.
    perform 1 from public.staff_users u where lower(u.email) = lower(new.person_email) for update;
    if exists (select 1 from public.staff_users u where lower(u.email) = lower(new.person_email) and u.permanent_role = 'software_admin') then
      raise exception 'scheme_roles: the software administrator holds no scheme role';
    end if;
    return new;
  end if;
  -- an update: only the ending, once
  if (new.id, new.scheme_id, new.person_email, new.role, new.order_ref, new.assigned_by, new.assigned_at)
     is distinct from (old.id, old.scheme_id, old.person_email, old.role, old.order_ref, old.assigned_by, old.assigned_at)
     or old.ended_at is not null or new.ended_at is null or new.ended_by is null then
    raise exception 'scheme_roles: only a held role is ended, once';
  end if;
  new.ended_at := now();
  return new;
end $$;
revoke execute on function public.scheme_roles_guard() from public, anon, authenticated;
drop trigger if exists scheme_roles_guard on public.scheme_roles;
create trigger scheme_roles_guard before insert or update or delete on public.scheme_roles
  for each row execute function public.scheme_roles_guard();
drop trigger if exists scheme_roles_no_truncate on public.scheme_roles;
create trigger scheme_roles_no_truncate before truncate on public.scheme_roles
  for each statement execute function public.scheme_roles_guard();
revoke delete, truncate on public.scheme_roles from service_role;

-- …and nobody BECOMES the software administrator while holding a scheme role (the
-- UPDATE holds the row's lock, which an insert above waits for)
create or replace function public.staff_users_permanent_role_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.permanent_role = 'software_admin' and old.permanent_role is distinct from 'software_admin'
     and exists (select 1 from public.scheme_roles r where lower(r.person_email) = lower(new.email) and r.ended_at is null) then
    raise exception 'staff_users: end this person''s scheme roles first — the software administrator holds none';
  end if;
  return new;
end $$;
revoke execute on function public.staff_users_permanent_role_guard() from public, anon, authenticated;
drop trigger if exists staff_users_permanent_role_guard on public.staff_users;
create trigger staff_users_permanent_role_guard before update of permanent_role on public.staff_users
  for each row execute function public.staff_users_permanent_role_guard();

insert into public.app_migrations (name) values ('0023_role_model') on conflict (name) do nothing;
