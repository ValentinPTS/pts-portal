-- Part 6.6 — «Заключи подаването»: the database itself refuses a version once the scheme no longer
-- takes results.
--
-- The start of processing is the technical end of the submission (Реш. 21). The app checks the
-- scheme's state before it records a version, but a version whose check passed just before the
-- lock could still land just after it. So the versions' guard (0042) now reads the scheme's state
-- too, under a share lock on its row: the act that changes the state waits for a version being
-- recorded, or the version is refused once the state has changed. Never both: the lock reads the
-- versions AFTER the state has changed (6.6 review).
--
-- A testing scheme takes results while running; a calibration scheme while open or running (the
-- form's own rule, 6.4). Safe to run more than once. Apply after 0043.

begin;

create or replace function public.submissions_guard() returns trigger
  language plpgsql set search_path = '' as $$
declare
  latest integer;
  st text;
  ty text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'submissions is a record: a submitted version is never changed or removed — a correction is the next version';
  end if;
  -- the scheme still takes results (6.6): read under a share lock on its row
  select s.status, s.type into st, ty from public.schemes s where s.id = new.scheme_id for share;
  if st is null or not (st = 'running' or (ty = 'C' and st = 'open')) then
    raise exception 'submissions: the scheme takes no submission now (its state is %) — the submission is locked', coalesce(st, 'unknown');
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

insert into public.app_migrations (name) values ('0044_submissions_scheme_open') on conflict (name) do nothing;

commit;
