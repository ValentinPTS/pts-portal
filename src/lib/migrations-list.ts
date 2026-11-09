// The migrations this code expects the database to have (part 1.1). The build gate
// (scripts/check-migrations.mjs) reads the folder itself; the running app cannot see
// supabase/migrations/ on Vercel, so the system check uses this list.
// scripts/migrations.test.ts fails when it and the folder disagree — add each new
// migration here in the same commit.
export const MIGRATIONS = [
  "0001_schemes",
  "0002_participants",
  "0003_participant_fields",
  "0004_library",
  "0005_doc_templates",
  "0006_custom_skins",
  "0007_lab_portal",
  "0008_roles",
  "0009_activity_log",
  "0010_case_events",
  "0011_doc_revisions",
  "0012_folders",
  "0013_lab_applications",
  "0014_traceability",
  "0015_notifications",
  "0016_notification_release",
  "0017_case_event_void",
  "0018_app_migrations",
  "0019_environment",
  "0020_send_control",
  "0021_journal",
  "0022_change_register",
  "0023_role_model",
  "0024_identity_store",
  "0025_identity_audit",
  "0026_processing_roles",
  // 0027 is the identity contract, applied after the upload (supabase/migrations-later/)
  "0028_staff_declarations",
  "0029_doc_editions",
  "0030_holidays",
  "0031_legal_entities",
  "0032_laboratories",
  "0033_entity_users",
  "0034_profile_confirmation",
  "0035_participation_snapshots",
  "0036_notice_recipients",
  "0037_retention",
  "0038_round_parties",
  "0039_applications",
  "0040_coding",
] as const;

/** The expected migrations the database has not recorded, in order. */
export function missingMigrations(applied: readonly string[], expected: readonly string[] = MIGRATIONS): string[] {
  const have = new Set(applied);
  return expected.filter((m) => !have.has(m)).sort();
}
