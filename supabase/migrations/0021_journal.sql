-- Part 1.9 (the journal; ISO/IEC 17043 §7.5, §8.4; PTS's checklist «the journal
-- names a person, not a shared account»).
--
-- activity_log gains:
--   actor_id    — the account that acted (its login's id), as it was then
--   actor_name  — the person's name AT THE TIME (a team member's name, or the
--                 founder's address); a laboratory is only «laboratory» — never its
--                 name (§4.2, Реш. 114)
--   subject     — what was acted on, as "kind:id" (e.g. "staff:<id>", "notice:<id>")
--   before/after — what changed, as data (never a laboratory's name)
--
-- And append-only is now enforced IN THE DATABASE, not only promised by the code: a
-- trigger refuses every UPDATE and DELETE. (The retention purge of part 1.12 will
-- be its own migration.)
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

alter table public.activity_log add column if not exists actor_id text;
alter table public.activity_log add column if not exists actor_name text;
alter table public.activity_log add column if not exists subject text;
alter table public.activity_log add column if not exists before jsonb;
alter table public.activity_log add column if not exists after jsonb;
create index if not exists activity_log_actor on public.activity_log (actor_id, at desc);
revoke all on public.activity_log from anon, authenticated;

create or replace function public.activity_log_append_only() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'activity_log is the journal: its entries are never changed or removed';
end $$;
revoke execute on function public.activity_log_append_only() from public, anon, authenticated;
drop trigger if exists activity_log_append_only on public.activity_log;
create trigger activity_log_append_only before update or delete on public.activity_log
  for each row execute function public.activity_log_append_only();
-- a row trigger does not see TRUNCATE: a statement trigger does
drop trigger if exists activity_log_no_truncate on public.activity_log;
create trigger activity_log_no_truncate before truncate on public.activity_log
  for each statement execute function public.activity_log_append_only();
-- and the portal's own key keeps only what it needs: insert and read
revoke update, delete, truncate on public.activity_log from service_role;

insert into public.app_migrations (name) values ('0021_journal') on conflict (name) do nothing;
