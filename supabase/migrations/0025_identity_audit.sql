-- Part 2.3 — database-level evidence for Реш. 142: the software administrator has
-- owner access, so a read that bypasses the portal must leave a record too.
--
-- Postgres audit logging (pgaudit) in object mode: every statement — by the owner
-- in the SQL editor (role postgres) or through the API (role authenticator, which
-- the server key's service_role runs under) — that reads or changes the identity
-- tables is written to the database's log as an AUDIT line, whoever runs it. The
-- portal's own openings are recorded in identity.openings as well (0024).
--
-- The setting is per login role (Supabase allows pgaudit settings at the role level
-- only): it covers sessions that log in as postgres (the SQL editor) or
-- authenticator (the API). A login role created later needs the same setting. And
-- the owner can switch it off — so the postgres role also logs DDL and role changes
-- (session mode «ddl, role»): disabling a guard trigger, changing a role's audit
-- settings or the audit role itself leaves its own AUDIT line.
--
-- Supabase keeps the database log for a limited time (by plan: about 1 day on Free,
-- 7 on Pro, 28 on Team). PTS keeps the record by downloading it regularly, or by a
-- log drain — docs/participant-portal/IDENTITY-STORE-BG.md.
--
-- Safe to run more than once.

create extension if not exists pgaudit;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'identity_auditor') then
    create role identity_auditor nologin noinherit;
  end if;
end $$;

-- what pgaudit watches: the identity tables, and the tables that still hold names
-- without codes (the laboratory accounts, the account applications, the record of
-- what was sent) until Phase 4 moves them in
grant select, insert, update, delete on identity.participants to identity_auditor;
grant select, update, delete on identity.openings to identity_auditor;
grant select on public.labs, public.lab_applications, public.sent_messages to identity_auditor;

alter role postgres set pgaudit.role to 'identity_auditor';
alter role authenticator set pgaudit.role to 'identity_auditor';
-- …and tampering with any of it is logged too
alter role postgres set pgaudit.log to 'ddl, role';

-- for «Проверка на системата»: is the store in place, is the audit on
create or replace function public.identity_health()
  returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', exists (select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'participants'),
    'moved', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'participants' and column_name = 'lab_name'),
    'pgaudit', exists (select 1 from pg_extension where extname = 'pgaudit'),
    'audited', (select coalesce(array_agg(r.rolname order by r.rolname), '{}')
                from pg_roles r where exists (select 1 from unnest(r.rolconfig) c where c = 'pgaudit.role=identity_auditor')),
    -- what THIS session — the API's own — actually runs with (a pooled connection
    -- made before 0025 keeps the old value until it reconnects)
    'session', coalesce(current_setting('pgaudit.role', true), '')
  )
$$;
revoke execute on function public.identity_health() from public, anon, authenticated;
grant execute on function public.identity_health() to service_role;

insert into public.app_migrations (name) values ('0025_identity_audit') on conflict (name) do nothing;
