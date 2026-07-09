-- Traceability milestone (2026-07): new-standard participant forms + doc-linked events.
--
-- participants:
--   courier          — F 7.2.1-4 "Вид на куриера" (Спиди БГ / Спиди EN / Поща/Fedex)
--   sample_code      — F 7.2.1-5/-6 "Код на пробата" (coded PT item sent to this lab)
--   characteristics  — F 7.2.1-5: indexes into the scheme's parameters this lab
--                      registered for (jsonb int array; null = all characteristics)
-- case_events:
--   doc_key          — links a timeline event to the portal document it refers to
--                      (e.g. 'instruction', 'results'), so "docs sent 12.06" can
--                      prove WHICH document was sent. Null for non-doc events.

alter table public.participants
  add column if not exists courier text,
  add column if not exists sample_code text,
  add column if not exists characteristics jsonb;

alter table public.case_events
  add column if not exists doc_key text;
