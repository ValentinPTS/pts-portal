-- Part 1.8 (provider decision 138): send control.
--
-- sent_messages — every e-mail the portal hands to the transport for a LABORATORY,
-- with who approved it and how (a person's «Изпрати», an approved reminder
-- template, or a fixed text kept in the code), the exact subject and text, the
-- recipient, and what the transport answered. The row is written FIRST, as
-- 'pending' — no row, no e-mail — and its outcome is set once the transport has
-- answered. Beyond that one change a row is never changed or removed (the trigger
-- below): it is the evidence of what was said to whom. The retention purge of part
-- 1.12 will be its own migration.
--
-- reminder_templates — the texts of the automatic reminders, which PTS approves on
-- «Текстове на напомнянията». A template is approved when approved_version equals
-- version; editing it raises version, so an edited text sends nothing until it is
-- approved again. An unapproved reminder waits for a person like any other notice.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

-- re-run guard (the security sweep, 2026-11-11): a later migration (0037_retention) redefines what this
-- one makes — running this file again after a later one would silently undo it. Nothing is changed then.
do $$ begin
  if exists (select 1 from public.app_migrations where name > '0020_send_control') then
    raise exception '0020_send_control is superseded by a later migration — running it again would undo that. Nothing was changed.';
  end if;
end $$;

create table if not exists public.sent_messages (
  id uuid primary key,
  sent_at timestamptz not null default now(),
  class text not null check (class in ('provider', 'reminder', 'triggered', 'chain')),
  kind text not null,
  lab_id uuid,
  scheme_id text,
  code text,
  to_address text not null,
  subject text not null,
  body text not null,
  -- never empty: no message to a laboratory without an approval on record
  approved_by text not null check (length(approved_by) > 0),
  approval_ref text not null check (length(approval_ref) > 0),
  outcome text not null check (outcome in ('pending', 'sent', 'failed')),
  error text
);
create index if not exists sent_messages_sent_at on public.sent_messages (sent_at desc);
create index if not exists sent_messages_lab on public.sent_messages (lab_id, sent_at desc);
alter table public.sent_messages enable row level security;
revoke all on public.sent_messages from anon, authenticated;

-- a row starts 'pending'; only its outcome (and its error) may be set, once;
-- nothing is removed
create or replace function public.sent_messages_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.outcome <> 'pending' then
      raise exception 'sent_messages: a message is recorded pending, before it is sent';
    end if;
    return new;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'sent_messages is a record: its rows are never removed';
  end if;
  if old.outcome <> 'pending' or new.outcome = 'pending'
     or (new.id, new.sent_at, new.class, new.kind, new.lab_id, new.scheme_id, new.code,
         new.to_address, new.subject, new.body, new.approved_by, new.approval_ref)
        is distinct from
        (old.id, old.sent_at, old.class, old.kind, old.lab_id, old.scheme_id, old.code,
         old.to_address, old.subject, old.body, old.approved_by, old.approval_ref) then
    raise exception 'sent_messages is a record: only a pending row''s outcome may be set, once';
  end if;
  return new;
end $$;
revoke execute on function public.sent_messages_guard() from public, anon, authenticated;
drop trigger if exists sent_messages_guard on public.sent_messages;
create trigger sent_messages_guard before insert or update or delete on public.sent_messages
  for each row execute function public.sent_messages_guard();
-- a row trigger does not see TRUNCATE: a statement trigger does
drop trigger if exists sent_messages_no_truncate on public.sent_messages;
create trigger sent_messages_no_truncate before truncate on public.sent_messages
  for each statement execute function public.sent_messages_guard();
-- the portal's own key: insert, read, and the one outcome update the trigger allows
revoke delete, truncate on public.sent_messages from service_role;

create table if not exists public.reminder_templates (
  kind text primary key,
  bg text not null,
  en text not null,
  version integer not null default 1 check (version > 0),
  updated_by text,
  updated_at timestamptz,
  approved_version integer,
  approved_by text,
  approved_at timestamptz
);
alter table public.reminder_templates enable row level security;
revoke all on public.reminder_templates from anon, authenticated;

insert into public.app_migrations (name) values ('0020_send_control') on conflict (name) do nothing;
