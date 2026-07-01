-- Public "Apply for a laboratory account" requests (lab onboarding). A lab fills
-- the public /register form; nothing here is a login yet. PTS staff review each
-- request in Users & roles and Approve (which then creates the actual account) or
-- Reject. No Supabase Auth user exists for a pending/rejected application — so there
-- are never dormant credentials sitting around (the account is minted only on
-- approval). See src/lib/actions.ts (submit/approve/reject) and src/lib/lab-applications.ts.
--
-- Two regional paths:
--   • EU  — the applicant enters an ЕИК/company id (+ VAT). We validate the EIK
--           checksum instantly (eik_valid) and, if a VAT is given, check it against
--           the EU VIES service (vat_status / vat_name). These are sanity checks;
--           the real gate is a human approving the accreditation.
--   • non-EU — the applicant uploads documents (accreditation scope, registration).
--           Files live in the PRIVATE `lab-docs` storage bucket; staff view them via
--           short-lived signed URLs generated server-side. doc_paths holds the keys.
--
-- Access: server-side with the secret key only; RLS on, no public policy. The public
-- form writes through the service-role client in a Server Action (never the browser).
-- Safe to re-run.
create table if not exists lab_applications (
  id uuid primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  region text not null default 'eu' check (region in ('eu', 'non_eu')),
  org_name text not null default '',
  country text not null default '',
  contact_person text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  accreditation_body text not null default '',
  accreditation_no text not null default '',
  eik text not null default '',
  vat text not null default '',
  eik_valid boolean,                 -- null = not applicable/not provided
  vat_status text,                   -- 'valid' | 'invalid' | 'unavailable' | null (not provided)
  vat_name text,                     -- company name returned by VIES (staff cross-check)
  doc_paths text[] not null default '{}',  -- storage keys in the private lab-docs bucket
  reject_reason text,
  reviewed_by text,                  -- actor e-mail who approved/rejected
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lab_applications_status on lab_applications (status, created_at);
alter table lab_applications enable row level security;

-- Private bucket for non-EU supporting documents. `public = false` → no anonymous
-- access; staff read via createSignedUrl(). Created here so the app never has to
-- create it at request time. (Storage RLS: with no policies, only the service-role
-- key can read/write — which is exactly how the server accesses it.)
insert into storage.buckets (id, name, public)
values ('lab-docs', 'lab-docs', false)
on conflict (id) do nothing;
