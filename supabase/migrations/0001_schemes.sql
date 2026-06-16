-- PTS portal — schema for the schemes store.
-- Run this in your PTS Supabase project: Dashboard → SQL Editor → paste → Run.
-- (Or it is applied for you by the setup script.)

create table if not exists public.schemes (
  id text primary key,
  number text not null,
  type text not null,
  status text not null default 'draft',
  year text,
  data jsonb not null,          -- the full Scheme record
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-Level Security ON, with NO public policies. The app reaches this table
-- server-side with the SECRET key (service role), which bypasses RLS; the public
-- (anon / publishable) keys therefore get NOTHING from this table. Phase 2 adds
-- authenticated, per-owner policies for the lab portal. See ../SECURITY.md.
alter table public.schemes enable row level security;
