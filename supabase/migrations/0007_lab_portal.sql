-- Phase 2b — laboratory portal.
--
-- A `labs` row is a laboratory's PERMANENT account (one per lab, identified by
-- email). It owns many participations: the existing `participants` rows, now
-- carrying a `lab_id`. "All of a lab's schemes" is therefore one indexed query
-- (participants where lab_id = …) — no JSONB scanning, scales to many labs/schemes.
--
-- Access: the app reads/writes server-side with the secret key and scopes every
-- lab query to the authenticated lab's id (see lib/lab-auth.ts). RLS is enabled
-- with no public policies, so the anon/public role has no direct access.
--
-- Safe to run more than once.
create table if not exists labs (
  id uuid primary key,
  email text unique not null,
  name text not null default '',
  accreditation_cert text default '',
  contact_person text default '',
  phone text default '',
  registered_address text default '',
  eik text default '',
  vat text default '',
  mol text default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists labs_email_lower on labs (lower(email));
create index if not exists labs_status on labs (status);
alter table labs enable row level security;

-- Link each participation to its permanent lab account (nullable: owner-added or
-- pre-portal participants may have none until linked).
alter table participants add column if not exists lab_id uuid;
create index if not exists participants_lab_id on participants (lab_id);
