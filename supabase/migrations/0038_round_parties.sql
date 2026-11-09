-- Part 4.8 — the round export's participant tables. The round's legal entities — those
-- its participations' copies name (4.5) — with all their laboratories and users, as
-- they are on the day of the export, read in ONE opening recorded against the round
-- (scheme_id, and which entities, laboratories and users), so the round's own record
-- of openings (identity_openings_for) shows it. Only what the export writes: never a
-- sign-in account, a stored document, PTS's check note or an erasure's request.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0037.

begin;

create or replace function public.identity_round_parties(p_actor text, p_purpose text, p_scheme text)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare ents uuid[]; labs uuid[]; users uuid[];
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who opens it?'; end if;
  if not public.identity_purpose_ok(p_purpose) then raise exception 'identity: for what?'; end if;
  if p_scheme is null then raise exception 'identity: which scheme?'; end if;
  select coalesce(array_agg(distinct s.entity_id), '{}') into ents
    from identity.participation_snapshots s join public.participants p on p.id = s.participant_id where p.scheme_id = p_scheme;
  select coalesce(array_agg(l.id order by l.id), '{}') into labs from identity.laboratories l where l.entity_id = any (ents);
  select coalesce(array_agg(u.id order by u.id), '{}') into users from identity.entity_users u where u.entity_id = any (ents);
  insert into identity.openings (actor, purpose, scheme_id, entity_ids, laboratory_ids, user_ids, rows)
    values (trim(p_actor), p_purpose, p_scheme, ents, labs, users, coalesce(array_length(ents, 1), 0) + coalesce(array_length(labs, 1), 0) + coalesce(array_length(users, 1), 0));
  return jsonb_build_object(
    'entities', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'country', e.country, 'eik', e.eik, 'vat', e.vat, 'correspondenceAddress', e.correspondence_address,
        'officialEmail', e.official_email, 'mol', e.mol, 'language', e.language, 'state', e.state, 'origin', e.origin,
        'confirmedAt', e.confirmed_at, 'erasedAt', e.erased_at, 'viesStatus', e.vies->>'status', 'viesName', e.vies->>'name',
        'manualCheckAt', e.manual_check->>'at') order by e.name)
      from identity.legal_entities e where e.id = any (ents)), '[]'::jsonb),
    'laboratories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'entityId', l.entity_id, 'name', l.name, 'deliveryAddress', l.delivery_address, 'mobileOffice', l.mobile_office,
        'accreditationNo', l.accreditation_no, 'accreditationBody', l.accreditation_body, 'state', l.state) order by l.name)
      from identity.laboratories l where l.id = any (labs)), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'entityId', u.entity_id, 'name', u.name, 'position', u.position, 'email', u.email, 'phone', u.phone, 'role', u.role,
        'state', u.state, 'receivesNotices', u.receives_notices, 'twoFactorRequired', u.two_factor_required) order by u.name)
      from identity.entity_users u where u.id = any (users)), '[]'::jsonb));
end $$;

revoke execute on function public.identity_round_parties(text, text, text) from public, anon, authenticated;
grant execute on function public.identity_round_parties(text, text, text) to service_role;

insert into public.app_migrations (name) values ('0038_round_parties') on conflict (name) do nothing;

commit;
