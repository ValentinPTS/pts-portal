-- Part 1.11 (change control; ISO/IEC 17043 §7.5.2, provider decision 67, the plan's
-- ground rule 7): every change of the information system — a release, an update of
-- a dependency or the platform, a change of a system setting — is authorised,
-- documented and validated BEFORE it is put to use, and the register says so.
--
--   kind        release | update | setting
--   title, what what changed            (fixed once written)
--   validation  how it was validated     (fixed once written)
--   ref         a release: its whole commit, 40 hexadecimal characters (the build
--               gate deploys only an authorised commit, matched exactly); a setting:
--               what was changed ("template:…")
--   status      proposed → authorised (by the head of the PT provider, never the
--               person who proposed it) → deployed
--               (marked when that commit starts in production), or → rejected
--
-- A record: an entry is never removed, its words never change, and its status only
-- moves forward — the trigger below. Safe to run more than once. Same access posture
-- as the rest (RLS on, no policy, no rights for anon/authenticated — 0018).

create table if not exists public.change_register (
  id uuid primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('release', 'update', 'setting')),
  title text not null check (length(title) > 0),
  what text not null,
  validation text not null,
  ref text,
  requested_by text not null,
  status text not null check (status in ('proposed', 'authorised', 'deployed', 'rejected')),
  authorised_by text,
  authorised_at timestamptz,
  deployed_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  reason text
);
create index if not exists change_register_created on public.change_register (created_at desc);
create index if not exists change_register_ref on public.change_register (kind, ref);
alter table public.change_register enable row level security;
revoke all on public.change_register from anon, authenticated;

create or replace function public.change_register_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'change_register is a record: its entries are never removed';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); -- the database's clock, not the app's
    if new.kind in ('release', 'update') then
      -- a release or an update starts proposed, with nothing decided yet
      if new.status <> 'proposed' or new.authorised_by is not null or new.authorised_at is not null
         or new.deployed_at is not null or new.rejected_by is not null or new.rejected_at is not null then
        raise exception 'change_register: a release or an update is first proposed, with nothing decided';
      end if;
      if new.kind = 'release' and (new.ref is null or new.ref !~ '^[0-9a-f]{40}$') then
        raise exception 'change_register: a release names its whole commit (40 hexadecimal characters)';
      end if;
    else
      -- a setting changed in the portal is recorded as made, with who made it
      if new.status <> 'deployed' or new.authorised_by is null or new.rejected_by is not null then
        raise exception 'change_register: a setting is recorded as made, with who made it';
      end if;
      new.authorised_at := now();
      new.deployed_at := now();
    end if;
    return new;
  end if;
  -- an update: the words never change
  if (new.id, new.created_at, new.kind, new.title, new.what, new.validation, new.ref, new.requested_by)
     is distinct from (old.id, old.created_at, old.kind, old.title, old.what, old.validation, old.ref, old.requested_by) then
    raise exception 'change_register: an entry''s words never change — propose a new one';
  end if;
  -- …and the status only moves forward, each step keeping what came before
  if old.status = 'proposed' and new.status = 'authorised' then
    if new.authorised_by is null or new.authorised_by = old.requested_by then
      raise exception 'change_register: authorised by someone other than who proposed it';
    end if;
    if new.rejected_by is not null or new.rejected_at is not null or new.deployed_at is not null or new.reason is distinct from old.reason then
      raise exception 'change_register: an authorisation changes nothing else';
    end if;
    new.authorised_at := now();
  elsif old.status = 'proposed' and new.status = 'rejected' then
    if new.rejected_by is null or new.rejected_by = old.requested_by then
      raise exception 'change_register: rejected by someone other than who proposed it';
    end if;
    if new.authorised_by is not null or new.authorised_at is not null or new.deployed_at is not null then
      raise exception 'change_register: a rejection changes nothing else';
    end if;
    new.rejected_at := now();
  elsif old.status = 'authorised' and new.status = 'deployed' then
    if new.authorised_by is distinct from old.authorised_by or new.authorised_at is distinct from old.authorised_at
       or new.rejected_by is not null or new.rejected_at is not null or new.reason is distinct from old.reason then
      raise exception 'change_register: «in use» changes nothing else';
    end if;
    new.deployed_at := now();
  else
    raise exception 'change_register: % → % is not a step forward', old.status, new.status;
  end if;
  return new;
end $$;
revoke execute on function public.change_register_guard() from public, anon, authenticated;
drop trigger if exists change_register_guard on public.change_register;
create trigger change_register_guard before insert or update or delete on public.change_register
  for each row execute function public.change_register_guard();
drop trigger if exists change_register_no_truncate on public.change_register;
create trigger change_register_no_truncate before truncate on public.change_register
  for each statement execute function public.change_register_guard();
revoke delete, truncate on public.change_register from service_role;

insert into public.app_migrations (name) values ('0022_change_register') on conflict (name) do nothing;
