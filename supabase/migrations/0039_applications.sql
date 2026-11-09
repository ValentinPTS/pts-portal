-- Part 5.1 — applications entered by PTS (Zadanie §7 «Заявяване»; Реш. 123, 14).
--
--   public.participants + selections — the application's number of participations per
--     characteristic (key: the characteristic's index in the scheme, value 1–10); the
--     objects needed are computed from it (lib/application-model).
--   public.participants + standing — a participation out of the round: REFUSED by PTS
--     (with a category and a reason, Реш. 14), ANNULLED (entered wrongly — with its
--     source), or WITHDRAWN by the laboratory (with its source). Set once, never changed
--     or cleared (a trigger): the participation and its code stay, never reused.
--   No approval act: entering the application makes the laboratory a participant
--     (Реш. 123) — PTS may only refuse it.
--
-- Nothing is removed. All in one transaction; safe to run more than once. Apply after 0038.

begin;

alter table public.participants add column if not exists selections jsonb;
alter table public.participants add column if not exists standing jsonb;
alter table public.participants drop constraint if exists participants_standing_shape;
-- every test is coalesced: a missing key never makes the CHECK NULL (which would pass)
alter table public.participants add constraint participants_standing_shape check (
  standing is null or (
    jsonb_typeof(standing) = 'object'
    and coalesce(standing->>'state', '') in ('refused', 'annulled', 'withdrawn')
    and char_length(coalesce(standing->>'at', '')) > 0 and char_length(btrim(coalesce(standing->>'by', ''))) > 0
    and (coalesce(standing->>'state', '') <> 'refused' or (coalesce(standing->>'category', '') in ('incomplete', 'conditions', 'capacity', 'late', 'other') and char_length(btrim(coalesce(standing->>'reason', ''))) >= 3))
    and (coalesce(standing->>'state', '') = 'refused' or char_length(btrim(coalesce(standing->>'source', ''))) >= 3)));

-- out of the round once — never changed, never cleared, by any writer
create or replace function public.participants_standing_kept() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if old.standing is not null and new.standing is distinct from old.standing then
    raise exception 'participants: a participation out of the round stays so — its refusal, annulment or withdrawal is never changed';
  end if;
  return new;
end $$;
revoke execute on function public.participants_standing_kept() from public, anon, authenticated;
drop trigger if exists participants_standing_kept on public.participants;
create trigger participants_standing_kept before update of standing on public.participants
  for each row execute function public.participants_standing_kept();

-- add (0024): the coded row with its selections, and its identity — together, or neither
create or replace function public.identity_add_participant(p_actor text, p_row jsonb, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participants (id, scheme_id, code, participations, status, courier, sample_code, characteristics, selections)
  values ((p_row->>'id')::uuid, p_row->>'scheme_id', p_row->>'code', coalesce((p_row->>'participations')::integer, 1),
          coalesce(p_row->>'status', 'applied'), p_row->>'courier', p_row->>'sample_code', nullif(p_row->'characteristics', 'null'::jsonb),
          nullif(p_row->'selections', 'null'::jsonb));
  perform public.identity_put(p_actor, (p_row->>'id')::uuid, p_fields);
end $$;

-- update (0024): with the selections and the standing; what it returns changes, so it
-- is made again, with its rights
drop function if exists public.identity_update_participant(text, uuid, jsonb, jsonb);
create function public.identity_update_participant(p_actor text, p_participant uuid, p_coded jsonb, p_fields jsonb)
  returns table (id uuid, scheme_id text, code text, participations integer, status text, courier text, sample_code text, characteristics jsonb,
                 selections jsonb, standing jsonb)
  language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_coded is not null and p_coded <> '{}'::jsonb then
    update public.participants p set
      participations = case when p_coded ? 'participations' then (p_coded->>'participations')::integer else p.participations end,
      status = case when p_coded ? 'status' then p_coded->>'status' else p.status end,
      courier = case when p_coded ? 'courier' then p_coded->>'courier' else p.courier end,
      sample_code = case when p_coded ? 'sample_code' then p_coded->>'sample_code' else p.sample_code end,
      characteristics = case when p_coded ? 'characteristics' then nullif(p_coded->'characteristics', 'null'::jsonb) else p.characteristics end,
      selections = case when p_coded ? 'selections' then nullif(p_coded->'selections', 'null'::jsonb) else p.selections end,
      standing = case when p_coded ? 'standing' then nullif(p_coded->'standing', 'null'::jsonb) else p.standing end
    where p.id = p_participant;
  end if;
  if p_fields is not null and p_fields <> '{}'::jsonb then
    perform public.identity_put(p_actor, p_participant, p_fields);
  end if;
  return query select p.id, p.scheme_id, p.code, p.participations, p.status, p.courier, p.sample_code, p.characteristics, p.selections, p.standing
    from public.participants p where p.id = p_participant;
end $$;

revoke execute on function public.identity_add_participant(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.identity_update_participant(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.identity_add_participant(text, jsonb, jsonb) to service_role;
grant execute on function public.identity_update_participant(text, uuid, jsonb, jsonb) to service_role;

insert into public.app_migrations (name) values ('0039_applications') on conflict (name) do nothing;

commit;
