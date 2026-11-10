-- Part 9.2 — the online application by the laboratory (Zadanie §7; Реш. 12, 108, 123). A participation
-- the laboratory applied for in its own portal is marked so: «portal» (entered by PTS from the PDF —
-- «pts», as every participation before). Coded data only — WHO applied is the frozen copy's contact
-- (4.5), in the identity store. When — the row's created_at (9.3 and 9.4 read the order). Safe to run
-- more than once.

alter table public.participants add column if not exists source text not null default 'pts';
alter table public.participants drop constraint if exists participants_source;
alter table public.participants add constraint participants_source check (source in ('pts', 'portal'));

-- add (0024, 0039): the coded row with its selections — and now its source — and its identity, together
create or replace function public.identity_add_participant(p_actor text, p_row jsonb, p_fields jsonb)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participants (id, scheme_id, code, participations, status, courier, sample_code, characteristics, selections, source)
  values ((p_row->>'id')::uuid, p_row->>'scheme_id', p_row->>'code', coalesce((p_row->>'participations')::integer, 1),
          coalesce(p_row->>'status', 'applied'), p_row->>'courier', p_row->>'sample_code', nullif(p_row->'characteristics', 'null'::jsonb),
          nullif(p_row->'selections', 'null'::jsonb), coalesce(p_row->>'source', 'pts'));
  perform public.identity_put(p_actor, (p_row->>'id')::uuid, p_fields);
end $$;
revoke execute on function public.identity_add_participant(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.identity_add_participant(text, jsonb, jsonb) to service_role;

-- the laboratory's own application, in ONE transaction (9.2 review): one at a time per laboratory and
-- scheme (a second submission — two tabs, two users of the entity, a replayed request — waits, then finds
-- the first); refused when the laboratory has a participation in the scheme that is not annulled; the
-- participant added and the copy of the entity's and the laboratory's data taken (4.5) together — a copy
-- that cannot be taken leaves nothing behind. Returns the copy's version.
create or replace function public.identity_apply_online(p_actor text, p_row jsonb, p_fields jsonb, p_laboratory uuid, p_contact uuid)
  returns integer
  language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'identity: who writes it?'; end if;
  if coalesce(p_row->>'source', '') <> 'portal' then raise exception 'apply: an online application is from the portal'; end if;
  perform pg_advisory_xact_lock(hashtextextended('apply-online:' || (p_row->>'scheme_id') || ':' || p_laboratory::text, 0));
  if exists (
    select 1 from identity.participation_snapshots s join public.participants p on p.id = s.participant_id
     where p.scheme_id = p_row->>'scheme_id' and s.laboratory_id = p_laboratory
       and s.version = (select max(s2.version) from identity.participation_snapshots s2 where s2.participant_id = s.participant_id)
       and coalesce(p.standing->>'state', '') <> 'annulled') then
    raise exception 'apply: the laboratory has applied for the scheme already';
  end if;
  perform public.identity_add_participant(p_actor, p_row, p_fields);
  v := public.identity_participation_freeze(p_actor, (p_row->>'id')::uuid, p_laboratory, p_contact, null);
  return v;
end $$;
revoke execute on function public.identity_apply_online(text, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.identity_apply_online(text, jsonb, jsonb, uuid, uuid) to service_role;

insert into public.app_migrations (name) values ('0050_online_applications') on conflict (name) do nothing;
