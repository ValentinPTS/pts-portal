-- Part 10.2 — the website's feed (lib/website-feed-model.ts, lib/website-feed.ts). The portal is the
-- data source; the website gets a subset BY A BUTTON: each press of «Публикувай за сайта» stores the
-- feed as it was built then — a new version, never changed — and the public address serves the latest
-- (less any scheme no longer started, Реш. 147). Who published, when, how many schemes.
--
-- Not round data: what PTS published to its website — started schemes' public facts, no participant.
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy, no rights
-- for anon/authenticated — 0018).

create table if not exists public.website_feed (
  version integer primary key check (version between 1 and 1000000),
  published_at timestamptz not null default now(),
  published_by text not null check (char_length(published_by) between 1 and 200),
  schemes integer not null check (schemes >= 0),
  -- the feed's fingerprint as built and seen (sha256 of its JSON) — compared, never the jsonb read back,
  -- whose keys the database reorders (10.2 review)
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  data jsonb not null
);
alter table public.website_feed enable row level security;
revoke all on public.website_feed from anon, authenticated;

create or replace function public.website_feed_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'website_feed is a record: a new publication is a new version, never a change';
  end if;
  new.published_at := now();
  return new;
end $$;
revoke execute on function public.website_feed_guard() from public, anon, authenticated;
drop trigger if exists website_feed_guard on public.website_feed;
create trigger website_feed_guard before insert or update or delete on public.website_feed
  for each row execute function public.website_feed_guard();
drop trigger if exists website_feed_no_truncate on public.website_feed;
create trigger website_feed_no_truncate before truncate on public.website_feed
  for each statement execute function public.website_feed_guard();
revoke update, delete, truncate on public.website_feed from service_role;

insert into public.app_migrations (name) values ('0052_website_feed') on conflict (name) do nothing;
