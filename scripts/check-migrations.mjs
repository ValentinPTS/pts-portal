// The migration gate (plan part 1.1, ground rule 1): a forgotten migration cannot
// deploy. Runs before `next build` (npm "prebuild"). On Vercel it reads the
// database's app_migrations table (migration 0018) and FAILS the build when a file
// in supabase/migrations/ is not recorded there — the previous deployment keeps
// serving instead of new code running against an old database.
//
// It also checks WHICH portal the database belongs to (part 1.2, migration 0019):
// the code says PTS_ENVIRONMENT=test on the test deployment, nothing on the real
// one; the database's app_environment row must say the same, or the build stops —
// test code never reaches the real data, nor the real portal the test data.
//
// Locally (no VERCEL_ENV) it only reports and never fails, so builds without a
// database keep working. It reads two tables with the server key; it writes nothing.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(join(here, "..", "supabase", "migrations")).filter((f) => /^\d{4}_.+\.sql$/.test(f));
// VERCEL is always set on Vercel; VERCEL_ENV only when system variables are exposed
const onVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const production = process.env.VERCEL_ENV === "production" || (!!process.env.VERCEL && !process.env.VERCEL_ENV);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

// the repo's migrations the database has not recorded (same rule as lib/migrations-list.ts)
const missingMigrations = (names, applied) => {
  const have = new Set(applied);
  return names.map((f) => f.replace(/\.sql$/, "")).filter((n) => !have.has(n)).sort();
};

const stop = (msg) => {
  console.error(`\n✗ migration gate: ${msg}\n`);
  process.exit(1);
};

const expectedEnv = process.env.PTS_ENVIRONMENT === "test" ? "test" : "production";
// the real portal is never the test environment
if (production && expectedEnv === "test") stop("a production deployment has PTS_ENVIRONMENT=test — remove it there; it belongs on the test (preview) deployment only.");

// a preview with a database must be the marked test environment: an unmarked one
// would run on whatever keys it was given — likely the real ones — with no banner and
// no mail guard (a preview without a database runs on memory, which is harmless)
if (process.env.VERCEL_ENV === "preview" && url && key && expectedEnv !== "test") {
  stop("this preview has a database but not PTS_ENVIRONMENT=test — set PTS_ENVIRONMENT=test and the TEST project's keys for Preview only (docs/participant-portal/TEST-ENV-SETUP-BG.md), or give Preview no database.");
}

if (!url || !key) {
  if (production) stop("production has no database configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_KEY).");
  console.log(`migration gate: no database configured — skipped (${files.length} migrations in the repo).`);
  process.exit(0);
}

const read = (table) => fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=name`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(15000), // a hung database never stalls the build
});

let applied;
try {
  const res = await read("app_migrations");
  if (res.status === 404) {
    // the table itself is missing (PGRST205 / 42P01): 0018 was never applied
    applied = null;
  } else if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}${body?.code ? ` ${body.code}` : ""}${body?.message ? `: ${body.message}` : ""}`);
  } else {
    applied = (await res.json()).map((r) => r.name);
  }
} catch (e) {
  if (onVercel) stop(`cannot read app_migrations (${e.message}) — the database must be reachable to deploy.`);
  console.warn(`migration gate: cannot read app_migrations (${e.message}) — skipped locally.`);
  process.exit(0);
}

const missing = applied === null ? files.map((f) => f.replace(/\.sql$/, "")).filter((n) => n >= "0018") : missingMigrations(files, applied);
if (missing.length) {
  const list = missing.map((m) => `  - supabase/migrations/${m}.sql`).join("\n");
  const msg = `the database is missing ${missing.length} migration(s):\n${list}\nApply them in the Supabase SQL editor, in this order, then deploy again.`;
  if (onVercel) stop(msg);
  console.warn(`migration gate (local, not failing): ${msg}`);
  process.exit(0);
}
console.log(`migration gate: the database has all ${files.length} migrations.`);

// which portal the database belongs to
let dbEnv;
try {
  const res = await read("app_environment");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dbEnv = (await res.json())[0]?.name;
} catch (e) {
  if (onVercel) stop(`cannot read app_environment (${e.message}) — the database must say which portal it is.`);
  console.warn(`migration gate: cannot read app_environment (${e.message}) — skipped locally.`);
  process.exit(0);
}
if (dbEnv !== expectedEnv) {
  // most likely the keys are wrong — never invite relabelling the real database
  const msg = `this code is the ${expectedEnv === "test" ? "TEST environment" : "real portal"}, but the database says it is ${dbEnv ? `«${dbEnv}»` : "nothing"} — check the keys of this deployment first.` +
    (expectedEnv === "test" && dbEnv === "production"
      ? " If these ARE the real project's keys, fix the keys and do NOT change the database. Only in a NEW test project, after its migrations: update public.app_environment set name = 'test';"
      : "");
  if (onVercel) stop(msg);
  console.warn(`migration gate (local, not failing): ${msg}`);
  process.exit(0);
}
console.log(`migration gate: the database is the ${dbEnv === "test" ? "test environment" : "real portal"}, as this code expects.`);
