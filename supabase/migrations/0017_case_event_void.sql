-- Part 0.9 (finding N23): a case-file entry is never deleted. A step recorded by
-- mistake is VOIDED — stamped with who, when and why — and stays in the file, shown
-- struck through; it no longer counts toward the traceability matrix or the lab's
-- timeline. Ground rule 2: records are superseded or voided with a reason, never
-- deleted.
--
-- Safe to run more than once. Same access posture as 0010 (RLS on, no policy).
alter table case_events add column if not exists voided_at timestamptz;
alter table case_events add column if not exists voided_by text;
alter table case_events add column if not exists void_reason text;
