-- Part 1.2 (test environment, Реш. 130–133): the database says which portal it
-- belongs to — the real one ('production') or the test environment ('test').
--
-- The build on Vercel (scripts/check-migrations.mjs) compares this with the code's
-- own setting (PTS_ENVIRONMENT=test on the test deployment, nothing on the real one)
-- and refuses to deploy when they differ. So the test code can never be pointed at
-- the real data by a pasted key, nor the real portal at the test data.
--
-- One row. It starts as 'production' — the only database that exists today. In the
-- TEST project, after running every migration, run once:
--     update public.app_environment set name = 'test', set_at = now();
-- NEVER run that in the real project: it would let test code onto the real data.
-- If a deploy says «the database says it is production», check the keys first.
--
-- Safe to run more than once. Same access posture as the rest (RLS on, no policy,
-- no rights for anon/authenticated — 0018).

create table if not exists public.app_environment (
  only_row boolean primary key default true check (only_row),
  name text not null check (name in ('production', 'test')),
  set_at timestamptz not null default now()
);
alter table public.app_environment enable row level security;
revoke all on public.app_environment from anon, authenticated;

insert into public.app_environment (name) values ('production') on conflict (only_row) do nothing;

insert into public.app_migrations (name) values ('0019_environment') on conflict (name) do nothing;
