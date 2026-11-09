-- Part 5.10 — one-way messages to an ORGANISATION (Реш. 116).
--
-- A message from PTS goes to one participation (scheme + code), to everyone in a scheme
-- (one notice per participation going on), or to one organisation — a legal entity, with
-- no scheme and no code. For the last, a notice names the entity it is for:
--
--   public.notifications.entity_id — the legal entity (identity.legal_entities.id) a
--     notice to an organisation is for; null for every other notice. The id only: the
--     organisation's name stays in the identity store (2.3), and such a notice carries
--     no code, so no code is linked to anyone by it.
--
-- Its recipients are the entity's active users who receive the notices (4.6), opened from
-- the identity store at delivery, each with the approval of the person who wrote it (1.8).
--
-- Nothing is removed. Safe to run more than once. Apply after 0040.

begin;

alter table public.notifications add column if not exists entity_id uuid;

-- the organisation's feed on «Начало», newest first
create index if not exists notifications_entity on public.notifications (entity_id, created_at desc) where entity_id is not null;

insert into public.app_migrations (name) values ('0041_notification_entity') on conflict (name) do nothing;

commit;
