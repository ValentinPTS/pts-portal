-- Phase RT1 — staff roles & access control (ISO/IEC 17043:2023 §5 structural, §6.2 personnel).
--
-- A `staff_users` row grants an internal user a role in the provider portal:
--   • manager  — highest; can reveal the real name behind a participant code,
--                manages users & roles, issues/signs reports (§6.2)
--   • staff    — full scheme & document work, but by CODE only (never sees names)
--   • auditor  — read-only (incl. the activity log), by code only
-- Laboratory accounts live in `labs` (a separate role; lib/labs.ts). The
-- confidential name↔code mapping — PTS-L 4.4-2 «Coordinated List» — is visible
-- only to managers (§4.2 confidentiality).
--
-- Bootstrap: emails in OWNER_EMAILS are ALWAYS treated as managers in code (see
-- lib/roles.ts), so the founders can never be locked out even if this table is
-- empty. This table only adds *additional* internal users and lets a manager
-- change their role from the "Users & roles" screen.
--
-- Access: read/written server-side with the secret key; the app scopes every
-- view by role. RLS is enabled with no public policy, so the anon/public role
-- has no direct access. Safe to run more than once.
create table if not exists staff_users (
  id uuid primary key,
  email text unique not null,
  name text not null default '',
  role text not null default 'staff' check (role in ('manager', 'staff', 'auditor')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_users_email_lower on staff_users (lower(email));
create index if not exists staff_users_role on staff_users (role);
alter table staff_users enable row level security;
