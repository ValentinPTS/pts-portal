-- Part 2.5 — the three processing acts of a scheme (Реш. 140; П 7.4.1 т. 3;
-- lib/processing-model.ts). Per scheme, three people are DESIGNATED:
--   process — the statistics expert or a technical expert of the scheme;
--   review  — the quality manager, or an authorised person from the scheme's Order
--             (the new scheme role «reviewer»);
--   approve — the scheme manager.
-- When two of the three are one person, a written justification is required. When the
-- quality manager processes, the reviewer is an authorised person from the Order, and
-- not the quality manager. The software administrator does none of the three.
--
-- The portal checks all of this before it writes; the database checks it again when
-- the row is written, and works out which acts coincide ITSELF — a caller cannot
-- record a coinciding designation without a justification. A designation is never
-- changed or removed: a new one ENDS the current one (processing_roles_set, in one
-- transaction), so the record keeps who was designated, when, and by whom.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

-- the authorised person for the independent review: a role of the Order
alter table public.scheme_roles drop constraint if exists scheme_roles_role_check;
alter table public.scheme_roles add constraint scheme_roles_role_check
  check (role in ('scheme_manager', 'coding_expert', 'statistics_expert', 'technical_expert', 'reviewer'));

create table if not exists public.processing_roles (
  id uuid primary key,
  scheme_id text not null,
  processor_email text not null,
  reviewer_email text not null,
  approver_email text not null,
  reviewer_basis text not null check (reviewer_basis in ('quality', 'order')),
  coincide text[] not null default '{}',   -- set by the guard below, never by the caller
  justification text not null default '' check (char_length(justification) <= 2000),
  set_by text not null,
  set_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by text
);
-- one current designation per scheme
create unique index if not exists processing_roles_current on public.processing_roles (scheme_id) where ended_at is null;
create index if not exists processing_roles_scheme on public.processing_roles (scheme_id, set_at);
alter table public.processing_roles enable row level security;
revoke all on public.processing_roles from anon, authenticated;

create or replace function public.processing_roles_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'processing_roles is a record: a designation is ended, never removed';
  end if;
  if tg_op = 'INSERT' then
    new.set_at := now();
    if new.ended_at is not null or new.ended_by is not null then
      raise exception 'processing_roles: a designation starts current';
    end if;
    new.processor_email := lower(btrim(new.processor_email));
    new.reviewer_email := lower(btrim(new.reviewer_email));
    new.approver_email := lower(btrim(new.approver_email));
    new.justification := btrim(coalesce(new.justification, ''));
    -- which acts fall to one person: the database's own reading, not the caller's
    new.coincide := array_remove(array[
      case when new.processor_email = new.reviewer_email then 'process-review' end,
      case when new.processor_email = new.approver_email then 'process-approve' end,
      case when new.reviewer_email = new.approver_email then 'review-approve' end
    ]::text[], null);
    if cardinality(new.coincide) > 0 and char_length(new.justification) < 10 then
      raise exception 'processing_roles: two of the three acts are one person — a written justification is required (Реш. 140)';
    end if;
    -- what is checked below is locked first, as the scheme-role guard does (0023): a
    -- role ended or a person deactivated at the same moment waits for this, or this
    -- for it — and then sees what the other committed
    perform 1 from public.staff_users u
      where lower(u.email) in (new.processor_email, new.reviewer_email, new.approver_email) for update;
    perform 1 from public.scheme_roles r
      where r.scheme_id = new.scheme_id and r.ended_at is null
        and lower(r.person_email) in (new.processor_email, new.reviewer_email, new.approver_email) for update;
    -- PTS's active people only: a deactivated team member or the auditor (read-only)
    -- does none of the three
    if exists (select 1 from public.staff_users u
               where lower(u.email) in (new.processor_email, new.reviewer_email, new.approver_email)
                 and (u.status <> 'active' or u.role = 'auditor')) then
      raise exception 'processing_roles: only an active member of PTS''s team is designated';
    end if;
    -- the software administrator never processes, reviews or approves (П 7.4.1 т. 3)
    if exists (select 1 from public.staff_users u
               where lower(u.email) in (new.processor_email, new.reviewer_email, new.approver_email)
                 and u.permanent_role = 'software_admin') then
      raise exception 'processing_roles: the software administrator does none of the three acts';
    end if;
    -- who may do each act
    if not exists (select 1 from public.scheme_roles r
                   where r.scheme_id = new.scheme_id and lower(r.person_email) = new.processor_email
                     and r.role in ('statistics_expert', 'technical_expert') and r.ended_at is null) then
      raise exception 'processing_roles: the processor is not a statistics or technical expert of this scheme';
    end if;
    if not exists (select 1 from public.scheme_roles r
                   where r.scheme_id = new.scheme_id and lower(r.person_email) = new.approver_email
                     and r.role = 'scheme_manager' and r.ended_at is null) then
      raise exception 'processing_roles: the approver is not the scheme manager of this scheme';
    end if;
    if new.reviewer_basis = 'quality' then
      if not exists (select 1 from public.staff_users u
                     where lower(u.email) = new.reviewer_email and u.permanent_role = 'quality' and u.status = 'active') then
        raise exception 'processing_roles: the reviewer is not the quality manager';
      end if;
    elsif not exists (select 1 from public.scheme_roles r
                      where r.scheme_id = new.scheme_id and lower(r.person_email) = new.reviewer_email
                        and r.role = 'reviewer' and r.ended_at is null) then
      raise exception 'processing_roles: the reviewer is not an authorised person from this scheme''s Order';
    end if;
    -- the quality manager processes: the review is an authorised person's from the Order
    if exists (select 1 from public.staff_users u
               where lower(u.email) = new.processor_email and u.permanent_role = 'quality' and u.status = 'active')
       and (new.reviewer_basis <> 'order' or new.reviewer_email = new.processor_email) then
      raise exception 'processing_roles: the quality manager processes — the reviewer is another person, from the Order (Реш. 140)';
    end if;
    return new;
  end if;
  -- an update: only the ending, once
  if (new.id, new.scheme_id, new.processor_email, new.reviewer_email, new.approver_email, new.reviewer_basis,
      new.coincide, new.justification, new.set_by, new.set_at)
     is distinct from (old.id, old.scheme_id, old.processor_email, old.reviewer_email, old.approver_email, old.reviewer_basis,
      old.coincide, old.justification, old.set_by, old.set_at)
     or old.ended_at is not null or new.ended_at is null or new.ended_by is null then
    raise exception 'processing_roles: only a current designation is ended, once';
  end if;
  new.ended_at := now();
  return new;
end $$;
revoke execute on function public.processing_roles_guard() from public, anon, authenticated;
drop trigger if exists processing_roles_guard on public.processing_roles;
create trigger processing_roles_guard before insert or update or delete on public.processing_roles
  for each row execute function public.processing_roles_guard();
drop trigger if exists processing_roles_no_truncate on public.processing_roles;
create trigger processing_roles_no_truncate before truncate on public.processing_roles
  for each statement execute function public.processing_roles_guard();
revoke delete, truncate on public.processing_roles from service_role;

-- a new designation ends the current one — both or neither
create or replace function public.processing_roles_set(p_id uuid, p_scheme_id text, p_processor text, p_reviewer text,
  p_approver text, p_reviewer_basis text, p_justification text, p_by text)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  prev public.processing_roles;
  r public.processing_roles;
begin
  if coalesce(btrim(p_by), '') = '' then
    raise exception 'processing_roles: who designates is required';
  end if;
  update public.processing_roles set ended_at = now(), ended_by = p_by
    where scheme_id = p_scheme_id and ended_at is null
    returning * into prev;
  insert into public.processing_roles (id, scheme_id, processor_email, reviewer_email, approver_email, reviewer_basis, justification, set_by)
    values (p_id, p_scheme_id, p_processor, p_reviewer, p_approver, p_reviewer_basis, coalesce(p_justification, ''), p_by)
    returning * into r;
  -- the new one, and the one THIS call ended (for the journal's «before»)
  return jsonb_build_object('entry', to_jsonb(r), 'previous', case when prev.id is null then null else to_jsonb(prev) end);
end $$;
revoke execute on function public.processing_roles_set(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.processing_roles_set(uuid, text, text, text, text, text, text, text) to service_role;

insert into public.app_migrations (name) values ('0026_processing_roles') on conflict (name) do nothing;
