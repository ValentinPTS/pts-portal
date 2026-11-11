-- Part 10.1 — «Уведоми ме при следваща» (К25; lib/catalogue-model.ts, lib/catalogue-wishes.ts).
-- A signed-in user of an organisation asks to be told when the NEXT scheme of a subject starts —
-- the same activity and the same object (the subject, folded). One standing wish per organisation
-- and subject. At a scheme's start (draft → open) the standing wishes of its subject are told by a
-- notice to the organisation, HELD for a person to release (1.8), and are then used — the next one
-- only. Cancelled by the same button. Never deleted but with the organisation's erasure (Phase 4):
-- a wish is the organisation's, not a round's.
--
-- Not round data: an organisation's wish across rounds, no participation in it.
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy, no rights
-- for anon/authenticated — 0018).

create table if not exists public.catalogue_wishes (
  id uuid primary key,
  entity_id text not null check (char_length(entity_id) between 1 and 100),
  scheme_id text not null check (char_length(scheme_id) between 1 and 100),   -- the scheme it was made on
  subject text not null check (char_length(subject) between 3 and 300),        -- activity|object, folded
  object_bg text not null default '' check (char_length(object_bg) <= 300),
  object_en text not null default '' check (char_length(object_en) <= 300),
  asked_by text not null check (char_length(asked_by) between 1 and 200),
  asked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text,
  notified_scheme_id text,
  notified_notice_id text,
  notified_at timestamptz
);
-- one standing wish per organisation and subject
create unique index if not exists catalogue_wishes_standing on public.catalogue_wishes (entity_id, subject)
  where cancelled_at is null and notified_at is null;
create index if not exists catalogue_wishes_subject on public.catalogue_wishes (subject) where cancelled_at is null and notified_at is null;
alter table public.catalogue_wishes enable row level security;
revoke all on public.catalogue_wishes from anon, authenticated;

-- A wish is a record: what was asked never changes; it is cancelled or used ONCE, never brought back.
create or replace function public.catalogue_wishes_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.asked_at := now();
    if new.cancelled_at is not null or new.notified_at is not null then
      raise exception 'catalogue_wishes: a new wish is standing';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    return old; -- the organisation's erasure (Phase 4)
  end if;
  if new.id <> old.id or new.entity_id <> old.entity_id or new.scheme_id <> old.scheme_id or new.subject <> old.subject
     or new.object_bg <> old.object_bg or new.object_en <> old.object_en or new.asked_by <> old.asked_by or new.asked_at <> old.asked_at then
    raise exception 'catalogue_wishes: what was asked never changes';
  end if;
  if old.cancelled_at is not null or old.notified_at is not null then
    raise exception 'catalogue_wishes: a cancelled or used wish stays as it is';
  end if;
  if (new.cancelled_at is not null) = (new.notified_at is not null) then
    raise exception 'catalogue_wishes: a wish is either cancelled or used';
  end if;
  if new.cancelled_at is not null and coalesce(btrim(new.cancelled_by), '') = '' then
    raise exception 'catalogue_wishes: who cancelled it';
  end if;
  if new.notified_at is not null and coalesce(btrim(new.notified_scheme_id), '') = '' then
    raise exception 'catalogue_wishes: which scheme it was told of';
  end if;
  return new;
end $$;
revoke execute on function public.catalogue_wishes_guard() from public, anon, authenticated;
drop trigger if exists catalogue_wishes_guard on public.catalogue_wishes;
create trigger catalogue_wishes_guard before insert or update or delete on public.catalogue_wishes
  for each row execute function public.catalogue_wishes_guard();

insert into public.app_migrations (name) values ('0051_catalogue_wishes') on conflict (name) do nothing;
