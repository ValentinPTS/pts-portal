-- Part 10.3 — anonymous feedback (Реш. 92, 122; К21; lib/feedback-model.ts, lib/feedback.ts).
-- The ONE act in the portal outside the journal: a participation's feedback (the sheet F 8.6-2) is kept
-- as nothing that says who or when — ONE row per scheme (10.3 review: separate rows written in one
-- transaction share its id, `xmin`, and their physical order is the order of arrival — a database reader
-- could join a participation to its words and date it):
--   counts: a counter per answer («total», «q1:5», «q3:yes»…);
--   words:  the words given (the «other», the suggestions, the comments) — RESHUFFLED at every give;
--   given:  the participations that gave — SORTED — only so each gives once; never exported.
-- Every give rewrites the whole row, under its lock: nothing in it carries a give's own transaction or
-- order. No time anywhere. What still remains outside the portal's reach is said in the brief (old row
-- versions until vacuum, backups, someone watching live).
--
-- Round data: the counts and the words go in the round export (coded/, once shown); who gave stays out.
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy, no rights
-- for anon/authenticated — 0018).

create table if not exists public.scheme_feedback (
  scheme_id text primary key check (char_length(scheme_id) between 1 and 100),
  counts jsonb not null default '{}'::jsonb,
  words jsonb not null default '[]'::jsonb,
  given text[] not null default '{}'
);
alter table public.scheme_feedback enable row level security;
revoke all on public.scheme_feedback from anon, authenticated;

-- One feedback, whole or not at all; a second for the participation changes nothing.
create or replace function public.feedback_give(p_scheme text, p_participant text, p_keys text[], p_words jsonb)
  returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r public.scheme_feedback%rowtype;
  k text;
  w jsonb;
  c jsonb;
begin
  if coalesce(btrim(p_participant), '') = '' then raise exception 'feedback: whose participation'; end if;
  foreach k in array coalesce(p_keys, '{}') loop
    if k !~ '^(total|q[12]:[1-5]|q3:(yes|no|other))$' then raise exception 'feedback: an unknown answer'; end if;
  end loop;
  for w in select * from jsonb_array_elements(coalesce(p_words, '[]'::jsonb)) loop
    if coalesce(w->>'q', '') not in ('q3', 'q4', 'q5') or char_length(coalesce(w->>'text', '')) not between 1 and 2000 then
      raise exception 'feedback: words not as the sheet asks';
    end if;
  end loop;
  insert into public.scheme_feedback (scheme_id) values (p_scheme) on conflict do nothing;
  select * into r from public.scheme_feedback where scheme_id = p_scheme for update;
  if p_participant = any(r.given) then
    return false;
  end if;
  c := r.counts;
  foreach k in array coalesce(p_keys, '{}') loop
    c := jsonb_set(c, array[k], to_jsonb(coalesce((c->>k)::integer, 0) + 1));
  end loop;
  update public.scheme_feedback set
    counts = c,
    -- reshuffled: never the order they came in
    words = coalesce((select jsonb_agg(x order by random()) from jsonb_array_elements(r.words || coalesce(p_words, '[]'::jsonb)) as x), '[]'::jsonb),
    -- sorted: never the order they gave in
    given = array(select g from unnest(r.given || p_participant) as g order by g)
  where scheme_id = p_scheme;
  return true;
end $$;

-- Has this participation given? — the participation in the body of a call, never in a logged address.
create or replace function public.feedback_is_given(p_scheme text, p_participant text)
  returns boolean language sql security definer set search_path = '' as $$
  select coalesce((select p_participant = any(given) from public.scheme_feedback where scheme_id = p_scheme), false);
$$;

revoke execute on function public.feedback_give(text, text, text[], jsonb) from public, anon, authenticated;
revoke execute on function public.feedback_is_given(text, text) from public, anon, authenticated;
grant execute on function public.feedback_give(text, text, text[], jsonb) to service_role;
grant execute on function public.feedback_is_given(text, text) to service_role;

insert into public.app_migrations (name) values ('0053_feedback') on conflict (name) do nothing;
