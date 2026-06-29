-- Phase RT2 — activity log (ISO/IEC 17043:2023 §7.5.1 technical records, §7.5.2
-- control of data, §8.4 control of records).
--
-- An append-only "who · what · when" trail. The application only INSERTs here —
-- never updates or deletes — so the record is tamper-evident for the annual audit.
-- Confidentiality (§4.2): rows store the participant CODE only, never a real lab
-- name; the summary text is written code-only by lib/activity.ts.
--
-- Access: written server-side with the secret key; read by managers & auditors via
-- /activity. RLS enabled, no public policy. Safe to run more than once.
create table if not exists activity_log (
  id uuid primary key,
  at timestamptz not null default now(),
  actor_email text not null default '',
  actor_role text not null default '',
  action text not null,
  scheme_id text,
  target_code text,
  summary text not null default ''
);
create index if not exists activity_log_at on activity_log (at desc);
create index if not exists activity_log_scheme on activity_log (scheme_id);
create index if not exists activity_log_action on activity_log (action);
alter table activity_log enable row level security;
