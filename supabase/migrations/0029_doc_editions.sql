-- Part 3.0 — the edition core (Реш. 50; Задание §3–4; lib/editions.ts). Every
-- document of a scheme has numbered editions: № 1, 2, 3 … each with its date, its
-- change note (why, and what it covers), who issued it, and the file it was at that
-- moment — an uploaded file kept by reference, or the document rendered once per
-- language into the private «doc-editions» bucket — with each file's SHA-256. A row
-- is never changed or removed: a change is the next edition. The participants are
-- served an edition; who received which, and every download, come in part 5.4.
--
-- The database keeps the rules itself, whatever the portal sends: the next number
-- and only the next (one at a time per document), a reason from edition 2 on, the
-- frozen file in exactly one form with its hash, no edition of the lists or the
-- certificate (they name laboratories — the identity store's alone, 2.3), and the
-- final report only as PTS's uploaded file (the portal's render carries its own
-- scores, Реш. 135).
--
-- 0027 is the identity store's contract — supabase/migrations-later/, applied only
-- after the upload (IDENTITY-STORE-BG.md); this one goes in before, with 0016–0028.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

create table if not exists public.doc_editions (
  id uuid primary key,
  scheme_id text not null,
  doc_key text not null,
  no integer not null check (no >= 1),
  issued_on date not null check (issued_on >= date '2000-01-01'),
  issued_at timestamptz not null default now(),
  issued_by text not null check (char_length(btrim(issued_by)) > 0),
  reason text not null check (char_length(reason) between 1 and 1000),
  scope text not null default '' check (char_length(scope) <= 1000),
  source text not null check (source in ('rendered', 'uploaded')),
  file jsonb,                 -- source 'uploaded': the uploaded file, by reference
  html_bg text, html_en text, -- source 'rendered': the frozen HTML, in the bucket
  sha_bg text, sha_en text, sha_file text,
  -- 'rendered': what the document was made from (its content, not this build's
  -- rendering of it) — so a new version of the portal is not a new edition
  fingerprint text check (fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'),
  unique (scheme_id, doc_key, no),
  check (
    (source = 'uploaded' and file is not null and sha_file ~ '^[0-9a-f]{64}$' and html_bg is null and html_en is null)
    or (source = 'rendered' and file is null and html_bg is not null and html_en is not null
        and sha_bg ~ '^[0-9a-f]{64}$' and sha_en ~ '^[0-9a-f]{64}$')
  ),
  check (doc_key not in ('registered', 'registered-coded', 'results-coded', 'certificate')),
  check (doc_key <> 'report' or source = 'uploaded')
);
create index if not exists doc_editions_scheme on public.doc_editions (scheme_id, doc_key, no);
alter table public.doc_editions enable row level security;
revoke all on public.doc_editions from anon, authenticated;

create or replace function public.doc_editions_guard() returns trigger
  language plpgsql set search_path = '' as $$
declare
  latest integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'doc_editions is a record: a changed document is the next edition, never a change to one';
  end if;
  -- one at a time per document: of two issued at once, the second waits, then is refused
  perform pg_advisory_xact_lock(hashtextextended('doc_editions:' || new.scheme_id || '/' || new.doc_key, 0));
  select max(e.no) into latest from public.doc_editions e where e.scheme_id = new.scheme_id and e.doc_key = new.doc_key;
  if new.no <> coalesce(latest, 0) + 1 then
    raise exception 'doc_editions: % is not the next edition of % (the latest is %)', new.no, new.doc_key, coalesce(latest, 0);
  end if;
  new.issued_at := now();
  new.reason := btrim(new.reason);
  new.scope := btrim(coalesce(new.scope, ''));
  -- from edition 2 on, a change is never silent: why, in words (5 characters at least)
  if new.no >= 2 and char_length(new.reason) < 5 then
    raise exception 'doc_editions: edition % of % needs the reason for the change', new.no, new.doc_key;
  end if;
  return new;
end $$;
revoke execute on function public.doc_editions_guard() from public, anon, authenticated;
drop trigger if exists doc_editions_guard on public.doc_editions;
create trigger doc_editions_guard before insert or update or delete on public.doc_editions
  for each row execute function public.doc_editions_guard();
drop trigger if exists doc_editions_no_truncate on public.doc_editions;
create trigger doc_editions_no_truncate before truncate on public.doc_editions
  for each statement execute function public.doc_editions_guard();
revoke update, delete, truncate on public.doc_editions from service_role;

insert into public.app_migrations (name) values ('0029_doc_editions') on conflict (name) do nothing;
