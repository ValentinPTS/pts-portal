-- Real, nestable folders for the explorer. Two permanent roots (Testing T /
-- Calibration C) are implicit; everything below is a `folders` row. A scheme can
-- live in a folder (folder_id) or directly under a type root (folder_id null).
--
-- e.g.  Testing → "2026" (folder) → "Group A" (folder) → scheme (folder_id = Group A)
--
-- Access: server-side with the secret key; RLS on, no public policy. Safe to re-run.
create table if not exists folders (
  id uuid primary key,
  type text not null check (type in ('T', 'C')),
  name text not null default '',
  parent_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists folders_type_parent on folders (type, parent_id);
alter table folders enable row level security;

-- Where each scheme lives in the tree (null = directly under its type root).
alter table schemes add column if not exists folder_id uuid;
create index if not exists schemes_folder_id on schemes (folder_id);
