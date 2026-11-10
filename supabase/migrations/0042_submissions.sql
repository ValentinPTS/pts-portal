-- Part 6.1 — the results form: its drafts, and the table the submitted versions go into (6.4).
--
--   public.submission_drafts — a participation's draft of its results, as typed: one row per
--     participation, changed as it is typed (a draft is a draft). The participation's own: any
--     of its users continues it. PTS does not read drafts — only what is submitted (6.4).
--   public.submissions — each SUBMITTED version of a participation's results (written from
--     6.4): append-only — the database refuses any change or removal («the database forbids
--     edits», PLAN 6.4); a correction is a new version, the reported value kept (6.5).
--
-- Both carry the configuration's version they were drawn for (3.6) — what the participant saw.
-- RLS on, no public policy: server-side (secret key) only. Nothing is removed. In one
-- transaction; safe to run more than once. Apply after 0041.

begin;

create table if not exists public.submission_drafts (
  participant_id uuid primary key references public.participants(id),
  scheme_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  config_version integer check (config_version is null or config_version >= 1),
  -- the draft's revision: a save names the one it was typed over — a tab, a user or a Back
  -- button holding an older draft never overwrites a newer one (6.1 review)
  rev integer not null default 1 check (rev >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null check (char_length(btrim(updated_by)) between 3 and 300)
);
create index if not exists submission_drafts_scheme on public.submission_drafts (scheme_id);
alter table public.submission_drafts enable row level security;
revoke all on public.submission_drafts from anon, authenticated;

create table if not exists public.submissions (
  id uuid primary key,
  participant_id uuid not null references public.participants(id),
  scheme_id text not null,
  version integer not null check (version >= 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  config_version integer check (config_version is null or config_version >= 1),
  submitted_at timestamptz not null default now(),
  round_at timestamptz,
  submitted_by text not null check (char_length(btrim(submitted_by)) between 3 and 300),
  unique (participant_id, version)
);
create index if not exists submissions_scheme on public.submissions (scheme_id, participant_id, version);
alter table public.submissions enable row level security;
revoke all on public.submissions from anon, authenticated;

create or replace function public.submissions_guard() returns trigger
  language plpgsql set search_path = '' as $$
declare
  latest integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'submissions is a record: a submitted version is never changed or removed — a correction is the next version';
  end if;
  -- one at a time per participation: of two submitted at once, the second waits, then is refused
  perform pg_advisory_xact_lock(hashtextextended('submissions:' || new.participant_id::text, 0));
  select max(x.version) into latest from public.submissions x where x.participant_id = new.participant_id;
  if new.version <> coalesce(latest, 0) + 1 then
    raise exception 'submissions: % is not the next version (the latest is %)', new.version, coalesce(latest, 0);
  end if;
  new.submitted_at := now();
  return new;
end $$;
revoke execute on function public.submissions_guard() from public, anon, authenticated;
drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before insert or update or delete on public.submissions
  for each row execute function public.submissions_guard();
drop trigger if exists submissions_no_truncate on public.submissions;
create trigger submissions_no_truncate before truncate on public.submissions
  for each statement execute function public.submissions_guard();
revoke update, delete, truncate on public.submissions from service_role;

insert into public.app_migrations (name) values ('0042_submissions') on conflict (name) do nothing;

commit;
