-- Part 4.1 — the legal entity (Zadanie §8 «Юридическо лице»; А13; Н1). The first of
-- the three levels (entity → laboratories 4.2 → users 4.3), built inside the identity
-- store of 0024: a schema closed to the API, reached only through the functions
-- below, every opening on record in identity.openings (now naming WHICH entities).
--
--   identity.legal_entities — name, ЕИК (a Bulgarian one: 9 or 13 digits, its check
--     digit checked by the portal), the registration number's normal form (eik_key —
--     one company once, however it is typed), country, VAT number (normal form),
--     address for correspondence, МОЛ, language, state (pending | active | inactive —
--     never deleted; active only with PTS's check), the VIES answer or an attached
--     document — every document ever attached kept in proof_history — PTS's manual
--     check, who made it and from where.
--
-- A read in the SQL editor is recorded by Postgres audit logging (0025): the table is
-- granted to identity_auditor like identity.participants.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after
-- 0030 (and before this version is deployed — the build gate checks it).

begin;

create table if not exists identity.legal_entities (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  country text not null default 'BG' check (country ~ '^[A-Z]{2}$'),
  eik text not null check (char_length(btrim(eik)) between 1 and 20),
  -- the registration number's normal form: upper case, letters and digits only
  eik_key text not null check (eik_key ~ '^[A-Z0-9]{1,20}$'),
  vat text not null default '' check (vat = '' or vat ~ '^[A-Z]{2}[A-Z0-9]{4,14}$'),
  correspondence_address text not null check (char_length(btrim(correspondence_address)) between 1 and 300),
  mol text not null default '' check (char_length(mol) <= 120),
  language text not null default 'bg' check (language in ('bg', 'en')),
  state text not null default 'pending' check (state in ('pending', 'active', 'inactive')),
  vies jsonb,
  proof_path text,
  proof_history jsonb not null default '[]'::jsonb,
  manual_check jsonb,
  origin text not null default 'pdf' check (origin in ('pdf', 'portal')),
  created_at timestamptz not null default now(),
  created_by text not null check (char_length(btrim(created_by)) > 0),
  updated_at timestamptz not null default now(),
  -- a Bulgarian ЕИК is 9 or 13 digits
  constraint legal_entities_bg_eik check (country <> 'BG' or eik ~ '^([0-9]{9}|[0-9]{13})$'),
  -- active only with PTS's own check on record
  constraint legal_entities_active_checked check (state <> 'active' or manual_check is not null)
);
-- one company once: the same registration number (normal form) in the same country
create unique index if not exists legal_entities_eik_key on identity.legal_entities (country, eik_key);
alter table identity.legal_entities enable row level security;
revoke all on identity.legal_entities from public, anon, authenticated, service_role;
-- a read by hand (the SQL editor) is in the audit log, as identity.participants' is (0025)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'identity_auditor') then
    grant select, insert, update, delete on identity.legal_entities to identity_auditor;
  end if;
end $$;

-- an entity is never deleted: «неактивно» is its end
create or replace function identity.legal_entities_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'identity.legal_entities: an entity is never deleted — set it inactive';
end $$;
revoke execute on function identity.legal_entities_guard() from public, anon, authenticated, service_role;
drop trigger if exists legal_entities_no_delete on identity.legal_entities;
create trigger legal_entities_no_delete before delete on identity.legal_entities
  for each row execute function identity.legal_entities_guard();
drop trigger if exists legal_entities_no_truncate on identity.legal_entities;
create trigger legal_entities_no_truncate before truncate on identity.legal_entities
  for each statement execute function identity.legal_entities_guard();

-- the record of openings names the entities too — which ones, not only how many
alter table identity.openings add column if not exists entity_id uuid;
alter table identity.openings add column if not exists entity_ids uuid[];

-- open: the entities — all, or one — recorded with who, why and which, before anything returns
create or replace function public.identity_entities(p_actor text, p_purpose text, p_entity uuid default null)
  returns table (id uuid, name text, country text, eik text, vat text, correspondence_address text, mol text, language text,
                 state text, vies jsonb, proof_path text, proof_history jsonb, manual_check jsonb, origin text, created_at timestamptz, created_by text)
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
           e.proof_path, e.proof_history, e.manual_check, e.origin, e.created_at, e.created_by
    from identity.legal_entities e where e.id = any (coalesce(ids, '{}'))  -- exactly the ones recorded (never deleted)
    order by e.name;
end $$;

-- is this registration number (normal form) already an entity's — but the one being
-- edited? The question only, not the entities: recorded with which one matched
create or replace function public.identity_entity_key_taken(p_actor text, p_country text, p_key text, p_except uuid default null)
  returns boolean
  language plpgsql security definer set search_path = '' as $$
declare hit uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who asks?'; end if;
  select e.id into hit from identity.legal_entities e
    where e.country = p_country and e.eik_key = p_key and (p_except is null or e.id <> p_except) limit 1;
  insert into identity.openings (actor, purpose, entity_ids, rows)
    values (trim(p_actor), 'write', case when hit is null then null else array[hit] end, case when hit is null then 0 else 1 end);
  return hit is not null;
end $$;

-- put: a new entity (every required field), or some fields of one (only the keys
-- given; never its origin, maker or creation) — recorded as a write
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
    insert into identity.legal_entities (id, name, country, eik, eik_key, vat, correspondence_address, mol, language, state, vies, proof_path, proof_history, manual_check, origin, created_by)
    values (p_entity, p_fields->>'name', coalesce(p_fields->>'country', 'BG'), p_fields->>'eik', p_fields->>'eik_key', coalesce(p_fields->>'vat', ''),
            p_fields->>'correspondence_address', coalesce(p_fields->>'mol', ''), coalesce(p_fields->>'language', 'bg'),
            coalesce(p_fields->>'state', 'pending'), nullif(p_fields->'vies', 'null'::jsonb), nullif(p_fields->>'proof_path', ''),
            coalesce(nullif(p_fields->'proof_history', 'null'::jsonb), '[]'::jsonb),
            nullif(p_fields->'manual_check', 'null'::jsonb), coalesce(p_fields->>'origin', 'pdf'), trim(p_actor));
  end if;
  insert into identity.openings (actor, purpose, entity_id, entity_ids, rows) values (trim(p_actor), 'write', p_entity, array[p_entity], 1);
end $$;

revoke execute on function public.identity_entities(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_key_taken(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.identity_entity_put(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.identity_entities(text, text, uuid) to service_role;
grant execute on function public.identity_entity_key_taken(text, text, text, uuid) to service_role;
grant execute on function public.identity_entity_put(text, uuid, jsonb) to service_role;

insert into public.app_migrations (name) values ('0031_legal_entities') on conflict (name) do nothing;

commit;
