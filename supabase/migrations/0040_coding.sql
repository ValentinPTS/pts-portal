-- Part 5.3 — the coding act (Zadanie «Кодиране», stage 9; А2; Реш. 124; D17).
--
--   An application carries a PROVISIONAL reference (Z001…) until the coding act; the act
--   draws each participation on the final list a laboratory number at random
--   (lib/coding-model). This function records the act WHOLE, in ONE transaction, or
--   refuses it whole:
--     • the scheme's row, locked: the act's record appended to data->'coding', and the
--       scheme's own records kept by code (p_patch — proformas, «платена», certificates,
--       results, extensions, the device's stops…) moved to the new codes;
--     • each participation, its notices and its case events moved to the new code.
--   Refused if a reference was coded before (or is not one), if it is not the scheme's,
--   if two references would get one code, or if a code is taken — so a second act on
--   another server at the same moment is refused, never half-done.
--
--   sent_messages and the journal are append-only: they keep the reference; the record
--   on the scheme says which code it became (coded data — no name).
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0039.

begin;

drop function if exists public.code_participations(text, text, jsonb);

create or replace function public.code_participations(p_actor text, p_scheme text, p_record jsonb, p_patch jsonb)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  codes jsonb := p_record->'codes';
  k text;
  v text;
  n integer := 0;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'coding: who codes is required';
  end if;
  if codes is null or jsonb_typeof(codes) <> 'object' or codes = '{}'::jsonb then
    raise exception 'coding: the record has no codes';
  end if;
  if p_patch is not null and jsonb_typeof(p_patch) <> 'object' then
    raise exception 'coding: the patch is an object';
  end if;
  -- the scheme, locked for the whole act: of two acts at once, the second waits and is refused
  select s.data into d from public.schemes s where s.id = p_scheme for update;
  if d is null then
    raise exception 'coding: no scheme %', p_scheme;
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(d->'coding', '[]'::jsonb)) r
    where r->>'id' = p_record->>'id'
       or exists (select 1 from jsonb_object_keys(coalesce(r->'codes', '{}'::jsonb)) x where codes ? x)
  ) then
    raise exception 'coding: already coded';
  end if;
  if (select count(distinct e.value) from jsonb_each_text(codes) e) <> (select count(*) from jsonb_each_text(codes)) then
    raise exception 'coding: two references would get one code';
  end if;
  -- the scheme's participations, locked too
  perform 1 from public.participants p where p.scheme_id = p_scheme for update;
  for k, v in select e.key, e.value from jsonb_each_text(codes) e loop
    if k !~ '^Z[0-9]{3}$' then
      raise exception 'coding: % is not a provisional reference', k;
    end if;
    if coalesce(v, '') = '' or v ~ '^Z[0-9]{3}$' then
      raise exception 'coding: % is no code', v;
    end if;
    if exists (select 1 from public.participants p where p.scheme_id = p_scheme and p.code = v) then
      raise exception 'coding: the code % is taken', v;
    end if;
    update public.participants p set code = v where p.scheme_id = p_scheme and p.code = k;
    if not found then
      raise exception 'coding: no participation % in the scheme', k;
    end if;
    update public.notifications x set code = v where x.scheme_id = p_scheme and x.code = k;
    update public.case_events x set code = v where x.scheme_id = p_scheme and x.code = k;
    n := n + 1;
  end loop;
  -- the record, and the scheme's own records under the new codes
  update public.schemes s
     set data = (d || coalesce(p_patch, '{}'::jsonb)) || jsonb_build_object('coding', coalesce(d->'coding', '[]'::jsonb) || jsonb_build_array(p_record)),
         updated_at = now()
   where s.id = p_scheme;
  return n;
end $$;

revoke execute on function public.code_participations(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.code_participations(text, text, jsonb, jsonb) to service_role;

insert into public.app_migrations (name) values ('0040_coding') on conflict (name) do nothing;

commit;
