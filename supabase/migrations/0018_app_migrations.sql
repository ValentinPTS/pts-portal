-- Part 1.1 (safety rails): a forgotten migration cannot deploy.
--
-- app_migrations records each migration applied to this database. The build on
-- Vercel (scripts/check-migrations.mjs, run before `next build`) reads it and FAILS
-- when a migration in supabase/migrations/ is not recorded here — so the previous
-- deployment keeps serving instead of new code running against an old database.
-- From this file on, every migration ends by recording itself.
--
-- 0001–0017 are recorded below, but only after checking one thing each of them
-- made (a table, or the last column it adds) — the record never claims what is not
-- there. If this file stops with «Apply 00xx first», run that file, then this one.
--
-- Also (ground rule 5): the roles the browser's public key maps to — anon and
-- authenticated — get no rights on the portal's tables. The portal reads and writes
-- only on the server, with the secret key; row-level security (on, no policies)
-- already blocks those roles, and this takes away the grants as well, for every
-- existing table and every one created later by the role that runs migrations.
--
-- Safe to run more than once. Run it in the Supabase SQL editor, as before.

do $$
declare
  m record;
begin
  -- migration, table, column it adds (null = the table itself)
  for m in select * from (values
    ('0001_schemes', 'schemes', null),
    ('0002_participants', 'participants', null),
    ('0003_participant_fields', 'participants', 'participations'),
    ('0004_library', 'library_items', null),
    ('0005_doc_templates', 'doc_templates', null),
    ('0006_custom_skins', 'app_settings', null),
    ('0007_lab_portal', 'labs', null), -- (its participants.lab_id moves to the identity store, 2.3)
    ('0008_roles', 'staff_users', null),
    ('0009_activity_log', 'activity_log', null),
    ('0010_case_events', 'case_events', null),
    ('0011_doc_revisions', 'doc_revisions', null),
    ('0012_folders', 'schemes', 'folder_id'),
    ('0013_lab_applications', 'lab_applications', null),
    ('0014_traceability', 'case_events', 'doc_key'),
    ('0015_notifications', 'notifications', null),
    ('0016_notification_release', 'notifications', 'withheld_by'),
    ('0017_case_event_void', 'case_events', 'void_reason')
  ) as t(mig, tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = m.tbl and (m.col is null or column_name = m.col)
    ) then
      raise exception 'Apply %.sql first, then run this file again.', m.mig;
    end if;
  end loop;
end $$;

create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;

insert into public.app_migrations (name) values
  ('0001_schemes'),
  ('0002_participants'),
  ('0003_participant_fields'),
  ('0004_library'),
  ('0005_doc_templates'),
  ('0006_custom_skins'),
  ('0007_lab_portal'),
  ('0008_roles'),
  ('0009_activity_log'),
  ('0010_case_events'),
  ('0011_doc_revisions'),
  ('0012_folders'),
  ('0013_lab_applications'),
  ('0014_traceability'),
  ('0015_notifications'),
  ('0016_notification_release'),
  ('0017_case_event_void')
on conflict (name) do nothing;

-- no rights for the browser-key roles, on what exists …
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- … and on what later migrations create (objects created by the role running this)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- (PUBLIC's built-in EXECUTE on new functions cannot be taken away per schema: a
-- migration that creates a function revokes it from public itself — the test checks)

insert into public.app_migrations (name) values ('0018_app_migrations') on conflict (name) do nothing;
