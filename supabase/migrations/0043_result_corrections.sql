-- Part 6.5 — reported and used values: the coding expert's corrections.
--
--   public.result_corrections — a record NEXT TO a submitted version, never a change to it
--     (0042 keeps the versions as submitted). In version N, for this characteristic or point,
--     this field: used X (as typed by the coding expert — the portal computes nothing), because
--     «…», by whom, when. A withdrawal is a later row with no used value: the reported value is
--     used again; the history stays. Append-only: the database refuses any change or removal.
--     On the participation's latest version only, under the versions' own lock (0042).
--
-- RLS on, no public policy: server-side (secret key) only. Nothing is removed. In one
-- transaction; safe to run more than once. Apply after 0042.

begin;

create table if not exists public.result_corrections (
  id uuid primary key,
  participant_id uuid not null references public.participants(id),
  scheme_id text not null,
  version integer not null check (version >= 1),
  key text not null check (char_length(key) between 1 and 200),
  field text not null check (field ~ '^(d[1-9]|mean|U|error)$'),
  reported text not null check (char_length(reported) between 1 and 100),
  used text check (used is null or char_length(used) between 1 and 40),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  recorded_at timestamptz not null default now(),
  recorded_by text not null check (char_length(btrim(recorded_by)) between 3 and 300),
  -- on a version that was submitted
  foreign key (participant_id, version) references public.submissions (participant_id, version)
);
create index if not exists result_corrections_scheme on public.result_corrections (scheme_id, participant_id, version, recorded_at);
alter table public.result_corrections enable row level security;
revoke all on public.result_corrections from anon, authenticated;

create or replace function public.result_corrections_guard() returns trigger
  language plpgsql set search_path = '' as $$
declare
  latest integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'result_corrections is a record: a correction is never changed or removed — a later one supersedes or withdraws it';
  end if;
  -- on the participation's LATEST version only — under the versions' own lock (0042): a version
  -- submitted while a correction is being recorded is never overtaken by it (6.5 review)
  perform pg_advisory_xact_lock(hashtextextended('submissions:' || new.participant_id::text, 0));
  select max(x.version) into latest from public.submissions x where x.participant_id = new.participant_id;
  if latest is null or new.version <> latest then
    raise exception 'result_corrections: version % is not the latest version (the latest is %)', new.version, coalesce(latest, 0);
  end if;
  new.recorded_at := now();
  return new;
end $$;
revoke execute on function public.result_corrections_guard() from public, anon, authenticated;
drop trigger if exists result_corrections_guard on public.result_corrections;
create trigger result_corrections_guard before insert or update or delete on public.result_corrections
  for each row execute function public.result_corrections_guard();
drop trigger if exists result_corrections_no_truncate on public.result_corrections;
create trigger result_corrections_no_truncate before truncate on public.result_corrections
  for each statement execute function public.result_corrections_guard();
revoke update, delete, truncate on public.result_corrections from service_role;

insert into public.app_migrations (name) values ('0043_result_corrections') on conflict (name) do nothing;

commit;
