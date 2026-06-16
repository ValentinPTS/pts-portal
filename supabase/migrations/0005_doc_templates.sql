-- Saved whole-document templates for the builder. The owner can save a finished
-- document (both languages) as a reusable starting point for the SAME document in
-- other schemes. Tagged by document key + scheme type (testing 'T' / calibration
-- 'C') so a calibration Plan template is never offered for a testing scheme.
-- Safe to run more than once.
create table if not exists doc_templates (
  id uuid primary key,
  doc_key text not null,
  scheme_type text not null default 'T',
  name text not null,
  bg text not null default '',
  en text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists doc_templates_lookup on doc_templates (doc_key, scheme_type);
alter table doc_templates enable row level security;
-- No public policies on purpose: the app reads/writes with the secret server key.
