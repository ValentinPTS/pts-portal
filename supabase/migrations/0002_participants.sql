-- PTS portal — participants of a scheme (the L-4.4-1 / L-4.4-2 lists).
-- Each participant has a random secret `code`; the lab identity is confidential.

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  scheme_id text not null references public.schemes(id) on delete cascade,
  code text not null,
  lab_name text not null,
  contact text default '',
  email text default '',
  phone text default '',
  country text default '',
  status text not null default 'applied',
  created_at timestamptz not null default now(),
  unique (scheme_id, code)
);

-- RLS ON, no public policies — server-side (secret key) only for now.
-- Phase 2: a participant may read ONLY its own row (auth-scoped), and the
-- code↔identity mapping stays owner-only. See ../SECURITY.md.
alter table public.participants enable row level security;
