-- Phase 1 — the notification outbox.
--
-- Every notice the app raises is RECORDED here first and DELIVERED second. The
-- app has no mail transport yet (the provider does not control DNS for the
-- sending domain), so this table lets the whole exchange loop be built, used and
-- audited now: the owner and the laboratories see their notices in the portal,
-- and when a transport is switched on it simply reads the rows that have no
-- emailed_at and sends them. Nothing raised before mail worked is lost.
--
-- The message is stored as finished text in BOTH languages rather than as a key,
-- so a row is an honest record of what was actually said — rewording the app
-- later cannot retroactively change what a laboratory was told.
--
-- §4.2: a row may carry the participant CODE. It must never carry a laboratory
-- name; the code is the only identifier that travels.
--
-- Access: server-side secret key only, RLS on with no public policy — same
-- posture as every other table here. Safe to run more than once.
create table if not exists notifications (
  id uuid primary key,
  kind text not null,
  audience text not null check (audience in ('provider', 'lab')),
  lab_id uuid,             -- which laboratory, when audience = 'lab'
  scheme_id text,
  code text,               -- participant code, never a name
  bg text not null default '',
  en text not null default '',
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz,     -- in-app read state
  emailed_at timestamptz   -- set once a transport has actually delivered it
);

-- the two reads the app makes: the provider's feed, and one lab's feed
create index if not exists notifications_provider on notifications (audience, created_at desc);
create index if not exists notifications_lab on notifications (lab_id, created_at desc);
-- the transport's read: everything not yet delivered, oldest first
create index if not exists notifications_undelivered on notifications (emailed_at, created_at);

alter table notifications enable row level security;
