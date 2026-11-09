-- Part 2.3, step 2 — CONTRACT (numbered 0027 since 2.5 took 0026). Apply ONLY AFTER the version with the identity store
-- (0024–0025) is live and will not be rolled back: the previous version reads these
-- columns, so it stops working once they are gone.
--
-- Kept in supabase/migrations-later/ until then: the build gate expects every file in
-- supabase/migrations/, and this one must come AFTER the deployment, not before it.
-- With the release after this one, it moves into supabase/migrations/ (and into
-- src/lib/migrations-list.ts).
--
-- What it does: copies once more anything the previous version added that is not in
-- the store yet, checks that every participant has its identity there, and only
-- then drops the open columns from public.participants — which from then on keeps
-- the coded data only. All in one transaction: nothing is dropped if a row is
-- missing. Take a backup first (docs/participant-portal/IDENTITY-STORE-BG.md).
-- Safe to run more than once.

begin;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'participants' and column_name = 'lab_name') then
    execute $m$
      insert into identity.participants (participant_id, lab_name, contact, email, phone, country, delivery_address, lab_id)
      select id, coalesce(lab_name, ''), coalesce(contact, ''), coalesce(email, ''), coalesce(phone, ''),
             coalesce(country, ''), coalesce(delivery_address, ''), lab_id
      from public.participants
      on conflict (participant_id) do nothing
    $m$;
    if exists (select 1 from public.participants p where not exists (select 1 from identity.participants i where i.participant_id = p.id)) then
      raise exception 'identity: not every participant is in the store — nothing was removed';
    end if;
    drop trigger if exists mirror_old_columns_insert on public.participants;
    drop trigger if exists mirror_old_columns_update on public.participants;
    alter table public.participants
      drop column lab_name, drop column contact, drop column email, drop column phone,
      drop column country, drop column delivery_address, drop column lab_id;
  end if;
end $$;
drop function if exists identity.mirror_old_columns();

insert into public.app_migrations (name) values ('0027_identity_contract') on conflict (name) do nothing;

commit;
