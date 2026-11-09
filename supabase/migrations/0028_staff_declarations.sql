-- Part 2.8 — the staff confidentiality declaration Ф 4.2-1, recorded per provider
-- person (E17; ISO/IEC 17043 §4.2; lib/staff-declarations.ts). Each of PTS's people
-- signs PTS's own form; the portal records the date it was signed and keeps the
-- signed scan (the private «staff-declarations» bucket, served through a gated,
-- journalled route). A declaration signed again is a new row: nothing is changed or
-- removed, the latest signed is the one in force, and the record keeps them all. One
-- recorded by mistake (the wrong person, a mistyped date) is VOIDED — a second record
-- with the reason, by whom and when — never deleted; a voided one is in force for
-- nobody and its scan opens for the head only.
--
-- 0027 is the identity store's contract — supabase/migrations-later/, applied only
-- after the upload (IDENTITY-STORE-BG.md); this one goes in before, with 0016–0026.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

create table if not exists public.staff_declarations (
  id uuid primary key,
  person_email text not null,
  signed_on date not null,
  file_path text not null,        -- the signed scan, in the private bucket
  file_name text not null default '',
  file_mime text not null,
  file_size integer not null check (file_size > 0),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists staff_declarations_person on public.staff_declarations (lower(person_email), signed_on);
alter table public.staff_declarations enable row level security;
revoke all on public.staff_declarations from anon, authenticated;

create or replace function public.staff_declarations_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'staff_declarations is a record: a declaration signed again is a new row, never a change';
  end if;
  new.recorded_at := now();
  new.person_email := lower(btrim(new.person_email));
  -- (a day's grace: the database's date is UTC, PTS's is Sofia's)
  if new.signed_on > current_date + 1 or new.signed_on < date '2000-01-01' then
    raise exception 'staff_declarations: the date it was signed is not a real one';
  end if;
  if new.file_mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'staff_declarations: the scan is a PDF, PNG or JPG';
  end if;
  return new;
end $$;
revoke execute on function public.staff_declarations_guard() from public, anon, authenticated;
drop trigger if exists staff_declarations_guard on public.staff_declarations;
create trigger staff_declarations_guard before insert or update or delete on public.staff_declarations
  for each row execute function public.staff_declarations_guard();
drop trigger if exists staff_declarations_no_truncate on public.staff_declarations;
create trigger staff_declarations_no_truncate before truncate on public.staff_declarations
  for each statement execute function public.staff_declarations_guard();
revoke update, delete, truncate on public.staff_declarations from service_role;

create table if not exists public.staff_declaration_voids (
  declaration_id uuid primary key references public.staff_declarations (id),  -- voided once
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  voided_by text not null,
  voided_at timestamptz not null default now()
);
alter table public.staff_declaration_voids enable row level security;
revoke all on public.staff_declaration_voids from anon, authenticated;

create or replace function public.staff_declaration_voids_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'staff_declaration_voids is a record: a voiding is never changed or removed';
  end if;
  new.voided_at := now();
  new.reason := btrim(new.reason);
  return new;
end $$;
revoke execute on function public.staff_declaration_voids_guard() from public, anon, authenticated;
drop trigger if exists staff_declaration_voids_guard on public.staff_declaration_voids;
create trigger staff_declaration_voids_guard before insert or update or delete on public.staff_declaration_voids
  for each row execute function public.staff_declaration_voids_guard();
drop trigger if exists staff_declaration_voids_no_truncate on public.staff_declaration_voids;
create trigger staff_declaration_voids_no_truncate before truncate on public.staff_declaration_voids
  for each statement execute function public.staff_declaration_voids_guard();
revoke update, delete, truncate on public.staff_declaration_voids from service_role;

insert into public.app_migrations (name) values ('0028_staff_declarations') on conflict (name) do nothing;
