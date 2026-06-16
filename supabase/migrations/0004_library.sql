-- The owner's reusable snippet library for the document builder ("+ Add your own").
-- Global (shared across all schemes) so an item saved once is available everywhere.
-- Safe to run more than once.
create table if not exists library_items (
  id uuid primary key,
  kind text not null default 'snippet',
  name text not null,
  category text,
  bg text not null default '',
  en text not null default '',
  created_at timestamptz not null default now()
);
alter table library_items enable row level security;
-- No public policies on purpose: the app reads/writes with the secret server key.
