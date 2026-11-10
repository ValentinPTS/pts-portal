-- Part 9.1 — registration and joining (Zadanie §8; Реш. 112, 152; К23). The public registration now
-- carries the three levels at once: the legal entity (its official e-mail and МОЛ, its language), its
-- first laboratory (the name on the accreditation certificate, the delivery address) and the person
-- registering (their position) — who becomes the profile's administrator. A registration whose ЕИК is an
-- existing entity's is a request to JOIN that entity (entity_id): approved by the entity's administrator,
-- or by PTS on the entity's signed letter (letter_path, in the private lab-docs bucket). The old account
-- requests stay readable as kind «account».
-- Identity data, as before (RLS on, no policy — only the server's key). Safe to run more than once.

alter table lab_applications add column if not exists kind text not null default 'account';
alter table lab_applications drop constraint if exists lab_applications_kind;
alter table lab_applications add constraint lab_applications_kind check (kind in ('account', 'entity', 'join'));
alter table lab_applications add column if not exists official_email text not null default '';
alter table lab_applications add column if not exists mol text not null default '';
alter table lab_applications add column if not exists language text not null default 'bg';
alter table lab_applications add column if not exists lab_name text not null default '';
alter table lab_applications add column if not exists delivery_address text not null default '';
alter table lab_applications add column if not exists position text not null default '';
-- a join: the entity asked to join; an approved registration: the entity it made
alter table lab_applications add column if not exists entity_id uuid;
-- who decided a join: the entity's administrator, or PTS (on a signed letter)
alter table lab_applications add column if not exists decided_as text;
alter table lab_applications drop constraint if exists lab_applications_decided_as;
alter table lab_applications add constraint lab_applications_decided_as check (decided_as is null or decided_as in ('admin', 'pts'));
alter table lab_applications add column if not exists letter_path text;
create index if not exists lab_applications_join on lab_applications (entity_id, status) where kind = 'join';

-- a registration's ЕИК: which entity it is, if any — the question only, not the entities opened; recorded
-- with the one matched (as identity_entity_key_taken, 0031). The public registration asks it, to make a
-- repeated ЕИК a request to JOIN that entity — never a second entity — and never to say so (neutral answer).
create or replace function public.identity_entity_by_key(p_actor text, p_country text, p_key text)
  returns uuid
  language plpgsql security definer set search_path = '' as $$
declare hit uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who asks?'; end if;
  select e.id into hit from identity.legal_entities e where e.country = p_country and e.eik_key = p_key limit 1;
  insert into identity.openings (actor, purpose, entity_ids, rows)
    values (trim(p_actor), 'write', case when hit is null then null else array[hit] end, case when hit is null then 0 else 1 end);
  return hit;
end $$;
revoke execute on function public.identity_entity_by_key(text, text, text) from public, anon, authenticated;
grant execute on function public.identity_entity_by_key(text, text, text) to service_role;

insert into public.app_migrations (name) values ('0049_registrations') on conflict (name) do nothing;
