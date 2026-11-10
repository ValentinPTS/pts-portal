import { getDb, dbMode } from "./supabase";
import { portalEnvironment, type PortalEnvironment } from "./environment";
import { MIGRATIONS, missingMigrations } from "./migrations-list";
import { EDITION_BUCKET } from "./editions";
import { SCHEME_DOC_BUCKET } from "./scheme-uploads";
import { providerHeadEmails, isSharedMailbox } from "./provider-people";
import { listStaff } from "./staff";
import { listLabs } from "./labs";
import { identityHealth, type IdentityHealth } from "./identity-store";
import { listSchemeRoles } from "./scheme-roles";
import { listDesignations, designationStatus } from "./processing-roles";
import { declarationsInForce, ofPts, DECLARATION_BUCKET } from "./staff-declarations";
import { ENTITY_PROOF_BUCKET } from "./entity-proofs";
import { ANALYSIS_EXPORT_BUCKET } from "./analysis-export-store";
import { listSchemeSummaries } from "./store";

// The manager-only system check (part 1.1): is the database there, does it have
// every migration this code expects, do the storage buckets exist, and which
// switches are on. Read-only; it never shows a secret, only whether one is set.

export interface SystemCheck {
  db: { configured: boolean; strict: boolean; production: boolean; error?: string };
  // which portal the code is, and which the database says it is (1.2, migration 0019)
  environment: { code: PortalEnvironment; database: string | null };
  migrations: { expected: number; applied: number | null; missing: string[]; error?: string };
  // …and whether one meant to be private has been made public (by hand, in Supabase)
  buckets: { name: string; exists: boolean | null; exposed?: boolean }[];
  flags: { authEnabled: boolean; require2fa: boolean; internalToken: boolean; onlineApplications: boolean };
  // who may reset a 2FA (Реш. 95), and whether a shared address is still among the
  // founders — ignored there, but a sign that the shared login is not retired (1.6)
  // …and team-member or laboratory rows made with a shared address before 1.6 —
  // inert now (no session for it), but to be deactivated; and a head who is also the
  // software administrator — one person proposing and authorising (2.1)
  people: { headsNamed: boolean; heads: string[]; sharedInOwners: string[]; sharedAccounts: string[]; headAdmins: string[]; schemesWithoutOrder: string[]; softwareAdmins: string[] | null;
    // who processes, reviews and approves (2.5): schemes with nobody designated, and
    // designations that no longer hold (a role ended since)
    schemesWithoutProcessing: string[]; processingStale: string[];
    // who holds a role (permanent or from an Order) with no Ф 4.2-1 on record (2.8)
    rolesWithoutDeclaration: string[] };
  // the identity store (2.3, migrations 0024–0025): in place, the names moved out of
  // the open table, and the database's own audit on for the owner and the API
  identity: IdentityHealth | null;
}

export function peopleCheck(env: Record<string, string | undefined> = process.env): SystemCheck["people"] {
  const owners = (env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    headsNamed: (env.PROVIDER_HEAD_EMAILS ?? "").split(",").some((s) => s.trim() && !isSharedMailbox(s, env)),
    heads: providerHeadEmails(env),
    sharedInOwners: owners.filter((e) => isSharedMailbox(e, env)),
    sharedAccounts: [],
    headAdmins: [],
    schemesWithoutOrder: [],
    softwareAdmins: null,
    schemesWithoutProcessing: [],
    processingStale: [],
    rolesWithoutDeclaration: [],
  };
}

// "lab-docs" (lab registration papers) and "skin-assets" (logos, covers) are made
// in actions.ts; the others by their own modules — the files handed out to 2.0 (7.10)
// at the first export in processing; watched, as the others, for being made public
const BUCKETS = [SCHEME_DOC_BUCKET, EDITION_BUCKET, "lab-docs", "skin-assets", DECLARATION_BUCKET, ENTITY_PROOF_BUCKET, ANALYSIS_EXPORT_BUCKET];

// The switches come from the page (lib/auth reads the request's cookies, so this
// module stays loadable on its own — and testable).
export async function systemCheck(flags: SystemCheck["flags"]): Promise<SystemCheck> {
  const out: SystemCheck = {
    db: dbMode(),
    environment: { code: portalEnvironment(), database: null },
    migrations: { expected: MIGRATIONS.length, applied: null, missing: [...MIGRATIONS] },
    buckets: BUCKETS.map((name) => ({ name, exists: null })),
    flags,
    people: peopleCheck(),
    identity: null,
  };
  try {
    const [staff, labs] = await Promise.all([listStaff(), listLabs()]);
    out.people.sharedAccounts = [
      ...staff.filter((s) => s.status === "active" && isSharedMailbox(s.email)).map((s) => s.email),
      ...labs.filter((l) => l.status === "active" && isSharedMailbox(l.email)).map((l) => l.email),
    ];
    const heads = new Set(out.people.heads.map((h) => h.toLowerCase()));
    // proposing a release is the software administrator's (1.11, 2.4): with none,
    // nobody can, and the release gate refuses every production build
    out.people.softwareAdmins = staff.filter((s) => s.status === "active" && s.permanentRole === "software_admin" && !heads.has(s.email.toLowerCase())).map((s) => s.email);
    out.people.headAdmins = staff.filter((s) => s.status === "active" && s.permanentRole === "software_admin" && heads.has(s.email.toLowerCase())).map((s) => s.email);
    // since 2.4 a scheme is worked on by the roles of its Order: one with no scheme
    // manager yet is one nobody can edit, release or approve
    const [summaries, held] = await Promise.all([listSchemeSummaries(), listSchemeRoles()]);
    const managed = new Set(held.filter((r) => r.role === "scheme_manager").map((r) => r.schemeId));
    out.people.schemesWithoutOrder = summaries.filter((s) => !managed.has(s.id)).map((s) => s.number);
    const designated = new Set((await listDesignations()).map((d) => d.schemeId));
    out.people.schemesWithoutProcessing = summaries.filter((s) => !designated.has(s.id)).map((s) => s.number);
    const stale = await Promise.all(summaries.filter((s) => designated.has(s.id)).map(async (s) => ((await designationStatus(s.id)).problems.length ? s.number : null)));
    out.people.processingStale = stale.filter((n): n is string => !!n);
    // a role is work with PTS's data: its holder has signed Ф 4.2-1 (§4.2, E17, 2.8)
    const signed = await declarationsInForce();
    const holders = new Set([
      ...staff.filter((s) => s.status === "active" && s.permanentRole).map((s) => s.email.toLowerCase()),
      ...held.map((r) => r.personEmail.toLowerCase()),
      ...out.people.heads.map((h) => h.toLowerCase()),
    ]);
    // …only those who CAN be recorded (one of PTS's people, not the auditor): a role held
    // by a deactivated person is for ending, not for a declaration
    const missing = [...holders].filter((e) => !signed.has(e));
    out.people.rolesWithoutDeclaration = (await Promise.all(missing.map(async (e) => ((await ofPts(e)) ? e : null)))).filter((e): e is string => !!e).sort();
  } catch { /* no database: its section says why */ }
  let db;
  try {
    db = getDb();
  } catch (e) {
    out.db.error = (e as Error).message;
    return out;
  }
  if (!db) return out; // local, in memory: nothing to read

  const { data, error } = await db.from("app_migrations").select("name");
  if (error) {
    const noTable = /app_migrations/.test(error.message) || error.code === "42P01" || error.code === "PGRST205";
    out.migrations.error = noTable ? "app_migrations is missing — apply 0018_app_migrations.sql" : error.message;
    // without the table nothing is known of 0001–0017: name only what 0018 starts
    out.migrations.missing = noTable ? MIGRATIONS.filter((n) => n >= "0018") : [];
  } else {
    const applied = (data ?? []).map((r: { name: string }) => r.name);
    out.migrations.applied = applied.length;
    out.migrations.missing = missingMigrations(applied);
  }
  const { data: envRow } = await db.from("app_environment").select("name").maybeSingle();
  out.environment.database = (envRow as { name?: string } | null)?.name ?? null;
  const { data: buckets } = await db.storage.listBuckets();
  const names = new Set((buckets ?? []).map((b) => b.name));
  // the skins' logos and covers are public by design; the others hold confidential files
  out.buckets = BUCKETS.map((name) => ({ name, exists: buckets ? names.has(name) : null, exposed: name !== "skin-assets" && !!buckets?.find((b) => b.name === name)?.public }));
  out.identity = await identityHealth().catch(() => null);
  return out;
}
