-- User-created (custom) document skins + small key/value app settings.
--
-- A custom skin is pure DATA (colours, fonts, logo, ordered cover elements) that
-- the app compiles into a document look at render time (src/skins/custom.ts). The
-- whole skin is stored as JSONB in `data`; `name` and `scope` are mirrored as
-- columns for listing/filtering (scope: testing 'T' / calibration 'C' / 'both').
--
-- app_settings holds the persisted per-type default skin under keys
-- 'default_skin_T' / 'default_skin_C'.
--
-- Safe to run more than once.
create table if not exists custom_skins (
  id uuid primary key,
  name text not null,
  scope text not null default 'both' check (scope in ('T', 'C', 'both')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_skins_scope on custom_skins (scope);
alter table custom_skins enable row level security;

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

-- No public policies on purpose: the app reads/writes with the secret server key,
-- which bypasses RLS. With RLS enabled and no policies, the anon/public role has
-- no access at all.
