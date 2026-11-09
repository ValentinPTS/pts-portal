-- Part 0.8 (provider decision 138): nothing reaches a participant unless a person
-- pressed a button and saw the exact text.
--
-- Every notice addressed to a laboratory is now RECORDED held: it is neither shown
-- in the laboratory's portal nor e-mailed until a member of PTS releases it from
-- the list of held notices (released_at / released_by), or decides it is not to be
-- sent (withheld_at / withheld_by). Nothing is deleted — a withheld notice stays as
-- the record of what was not said. Notices to PTS itself are not held.
--
-- Notices that laboratories could already see in their portal before this change
-- count as released — for the portal only. They are marked released_by =
-- 'migration-0016', and a transport never e-mails a notice released that way: no
-- person saw that backlog, so it must not go out by e-mail the day mail is switched
-- on. The backfill runs exactly once — when the column is first added — so running
-- this file again can never release a notice a person has not released.
--
-- Safe to run more than once. Same access posture as 0015 (RLS on, no policy).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'released_at'
  ) then
    alter table notifications add column released_at timestamptz;
    alter table notifications add column if not exists released_by text;
    update notifications set released_at = created_at, released_by = 'migration-0016' where audience = 'lab';
  end if;
end $$;

alter table notifications add column if not exists released_by text;
alter table notifications add column if not exists withheld_at timestamptz;
alter table notifications add column if not exists withheld_by text;

-- the list of held notices
create index if not exists notifications_held on notifications (audience, released_at, withheld_at, created_at);
