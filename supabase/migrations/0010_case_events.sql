-- Phase RT3 — per-participant case file timeline (ISO/IEC 17043:2023 §7.3.4/§7.3.5
-- dispatch & instructions, §7.4 evaluation & reporting, §7.5.1 technical records).
--
-- One row = one dated milestone in a participant's journey, identified by the
-- participant CODE only (never a name — §4.2). Mix of:
--   • auto   — stamped by the portal (code assigned, report issued)
--   • manual — recorded by staff for offline steps (items dispatched + waybill,
--              documents sent, receipt confirmed, results returned, scored)
-- This is the auditor's "show me code X — when sent, when received, the dates" view.
--
-- Corrections: rows may be deleted by a manager (a removal is itself written to
-- activity_log), so the trail stays honest. Access: server-side secret key, RLS on,
-- no public policy. Safe to run more than once.
create table if not exists case_events (
  id uuid primary key,
  scheme_id text not null,
  code text not null,
  kind text not null,
  at date,                 -- the day the event happened
  ref text,                -- waybill no. / document name / reference
  note text,
  recorded_by text not null default '',
  recorded_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('auto', 'manual'))
);
create index if not exists case_events_scheme_code on case_events (scheme_id, code);
create index if not exists case_events_scheme on case_events (scheme_id);
alter table case_events enable row level security;
