-- Phase RT5 — document version history (ISO/IEC 17043:2023 §8.3 control of documents).
--
-- Each save of a Word-editor document snapshots a revision here (both languages),
-- with who saved it and when. A manager can mark a revision approved. The highest
-- version is "current"; older ones are "superseded". Nothing is overwritten, so the
-- document's history is auditable. Confidentiality is unaffected (the body HTML is
-- the document content; participant lists still render by code).
--
-- Access: written server-side with the secret key; read by internal staff via the
-- document History page. RLS enabled, no public policy. Safe to run more than once.
create table if not exists doc_revisions (
  id uuid primary key,
  scheme_id text not null,
  doc_key text not null,
  version int not null,
  bg text not null default '',
  en text not null default '',
  note text,
  saved_by text not null default '',
  saved_at timestamptz not null default now(),
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz
);
create index if not exists doc_revisions_scheme_doc on doc_revisions (scheme_id, doc_key, version desc);
alter table doc_revisions enable row level security;
