// Safety rails (plan part 1.1): the migrations themselves, the build gate and the
// "no memory fallback on a deployment" rule.
//   - the code's list of migrations = the folder;
//   - every table created gets row-level security; nothing grants the browser-key
//     roles (anon, authenticated) anything; from 0018 on each migration records
//     itself in app_migrations and cascades nothing (ground rules 2 and 5);
//   - scripts/check-migrations.mjs fails a Vercel build when the database lacks a
//     migration — driven here against a small fake database server;
//   - on a deployment a store's database error throws instead of using memory.
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { MIGRATIONS, missingMigrations } from "../src/lib/migrations-list.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url)); // a real path — the folder has spaces
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const names = files.map((f) => f.replace(/\.sql$/, ""));
const sql = Object.fromEntries(files.map((f) => [f.replace(/\.sql$/, ""), readFileSync(new URL(f, dir), "utf8")]));
// SQL without its comments
const code = (s: string) => s.replace(/--[^\n]*/g, "");
const all = names.map((n) => code(sql[n])).join("\n").toLowerCase();

// ── the list and the folder ───────────────────────────────────────────────
t("the code's list = the folder", JSON.stringify([...MIGRATIONS]) === JSON.stringify(names), `${MIGRATIONS.length} vs ${names.length}`);
t("missingMigrations: none", missingMigrations([...names]).length === 0);
t("missingMigrations: names what is missing, in order", JSON.stringify(missingMigrations(names.filter((n) => n !== "0016_notification_release" && n !== "0018_app_migrations"))) === JSON.stringify(["0016_notification_release", "0018_app_migrations"]));

// ── row-level security on every table, no grants to the browser roles ────
const tables = [...all.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+(?:\.[a-z_]+)?)/g)].map((m) => m[1]);
t("there are tables", tables.length >= 14, String(tables.length));
for (const tb of tables) {
  t(`RLS on ${tb}`, new RegExp(`alter table (?:public\\.)?${tb.replace(".", "\\.")} enable row level security`).test(all));
}
t("no migration grants anything to anon, authenticated or public", !/grant [^;]* to [^;]*\b(anon|authenticated|public)\b/.test(all));
t("no migration grants by default either", !/alter default privileges[^;]*\bgrant\b/.test(all));
// since part 1.11 through scripts/prebuild.mjs, which runs this gate first
t("package.json runs the gate before every build", JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts?.prebuild === "node scripts/prebuild.mjs"
  && /step\("migration gate", process\.execPath, \["scripts\/check-migrations\.mjs"\]\)/.test(readFileSync(new URL("./prebuild.mjs", import.meta.url), "utf8")));
t("0018 revokes the browser roles, now and by default",
  /revoke all on all tables in schema public from anon, authenticated/.test(all)
  && /alter default privileges in schema public revoke all on tables from anon, authenticated/.test(all));

// ── from 0018 on: each records itself, none cascades ─────────────────────
for (const n of names.filter((x) => x >= "0018")) {
  // PUBLIC's EXECUTE on a new function cannot be revoked by default per schema: each
  // migration that makes a function takes it away itself
  for (const fn of [...code(sql[n]).toLowerCase().matchAll(/create (?:or replace )?function (?:public\.)?([a-z_]+)/g)].map((m) => m[1])) {
    t(`${n}: function ${fn} is not executable by public`, new RegExp(`revoke execute on function (?:public\\.)?${fn}[^;]* from public`).test(code(sql[n]).toLowerCase()));
  }
  t(`${n} records itself in app_migrations`, new RegExp(`insert into (?:public\\.)?app_migrations \\(name\\) values \\('${n}'\\)`).test(code(sql[n])));
  t(`${n} cascades nothing (ground rule 2)`, !/on delete cascade/i.test(code(sql[n])));
}
const backfill = [...code(sql["0018_app_migrations"]).matchAll(/\('(\d{4}_[a-z_]+)'\)/g)].map((m) => m[1]).filter((n) => n !== "0018_app_migrations");
t("0018 records exactly 0001–0017", JSON.stringify(backfill) === JSON.stringify(names.filter((n) => n < "0018")), backfill.join(","));
// 0019: one row, starting as the real portal, no rights for the browser roles
const e19 = code(sql["0019_environment"]).toLowerCase();
t("0019: one row only", /only_row boolean primary key default true check \(only_row\)/.test(e19));
t("0019: it starts as 'production'", /insert into public\.app_environment \(name\) values \('production'\)/.test(e19));
t("0019: name is production or test, nothing else", /check \(name in \('production', 'test'\)\)/.test(e19));
t("0019: no rights for anon/authenticated", /revoke all on public\.app_environment from anon, authenticated/.test(e19));
t("0019 warns never to relabel the real database", /never run that in the real project/i.test(sql["0019_environment"]));

// 0018's marker for each earlier migration is really what that migration makes
const markers = [...code(sql["0018_app_migrations"]).matchAll(/\('(\d{4}_[a-z_]+)', '([a-z_]+)', (null|'([a-z_]+)')\)/g)]
  .map((m) => ({ mig: m[1], tbl: m[2], col: m[4] ?? null }));
t("0018 checks a marker of every earlier migration", JSON.stringify(markers.map((m) => m.mig)) === JSON.stringify(names.filter((n) => n < "0018")), markers.map((m) => m.mig).join(","));
for (const m of markers) {
  const own = code(sql[m.mig]).toLowerCase();
  const ok = m.col
    ? new RegExp(`add column (?:if not exists )?${m.col}\\b`).test(own) && own.includes(m.tbl)
    : new RegExp(`create table (?:if not exists )?(?:public\\.)?${m.tbl}\\b`).test(own);
  t(`0018's marker for ${m.mig} (${m.tbl}${m.col ? "." + m.col : ""}) is made by it`, ok);
}

// ── the build gate, against a fake database ───────────────────────────────
let reply: { status: number; body: unknown } = { status: 200, body: [] };
let envReply: { status: number; body: unknown } = { status: 200, body: [{ name: "production" }] };
const server = createServer((req, res) => {
  const keyed = req.headers.apikey === "test-key";
  const r = !keyed ? { status: 401, body: { message: "no key" } }
    : req.url?.startsWith("/rest/v1/app_migrations") ? reply
    : req.url?.startsWith("/rest/v1/app_environment") ? envReply
    : { status: 404, body: { message: "not here" } };
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(JSON.stringify(r.body));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const port = (server.address() as { port: number }).port;
const gate = async (env: Record<string, string>) => {
  try {
    const r = await run("node", ["scripts/check-migrations.mjs"], { cwd: root, env: { PATH: process.env.PATH ?? "", ...env } });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { code: x.code ?? 1, out: (x.stdout ?? "") + (x.stderr ?? "") };
  }
};
const db = { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_KEY: "test-key" };
// a module run on its own, in a clean environment
const probe = async (env: Record<string, string>, js: string) => {
  try {
    const r = await run("node", ["--import", "./scripts/ts-ext-hook.mjs", "--input-type=module", "-e", js], { cwd: root, env: { PATH: process.env.PATH ?? "", ...env } });
    return r.stdout.trim();
  } catch (e) {
    return ((e as { stdout?: string }).stdout ?? "").trim() || "crashed";
  }
};

let g = await gate({});
t("gate: no database, local → skipped, passes", g.code === 0 && /skipped/.test(g.out), g.out);
g = await gate({ VERCEL_ENV: "production" });
t("gate: production without a database → fails", g.code === 1 && /no database configured/.test(g.out), g.out);
reply = { status: 200, body: names.map((name) => ({ name })) };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: every migration recorded → passes", g.code === 0 && /has all/.test(g.out) && /the real portal, as this code expects/.test(g.out), g.out);

// which portal the database is (1.2, migration 0019)
g = await gate({ ...db, VERCEL_ENV: "preview", PTS_ENVIRONMENT: "test" });
t("gate: test code on the REAL database → fails, says how to mark the test one", g.code === 1 && /database says it is «production»/.test(g.out) && /set name = 'test'/.test(g.out), g.out);
envReply = { status: 200, body: [{ name: "test" }] };
g = await gate({ ...db, VERCEL_ENV: "preview", PTS_ENVIRONMENT: "test" });
t("gate: test code on the test database → passes", g.code === 0 && /the test environment, as this code expects/.test(g.out), g.out);
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: the real portal on the TEST database → fails", g.code === 1 && /real portal, but the database says it is «test»/.test(g.out), g.out);
g = await gate({ ...db, VERCEL_ENV: "production", PTS_ENVIRONMENT: "test" });
t("gate: a production deployment marked test → fails at once", g.code === 1 && /production deployment has PTS_ENVIRONMENT=test/.test(g.out), g.out);
envReply = { status: 200, body: [] };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: a database that says nothing → fails", g.code === 1 && /says it is nothing/.test(g.out), g.out);
g = await gate({ ...db, VERCEL_ENV: "preview" });
t("gate: a preview WITH a database but unmarked → fails", g.code === 1 && /preview has a database but not PTS_ENVIRONMENT=test/.test(g.out), g.out);
g = await gate({ VERCEL_ENV: "preview" });
t("gate: a preview without a database (memory) → passes", g.code === 0, g.out);
envReply = { status: 500, body: { message: "down" } };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: app_environment unreadable on Vercel → fails", g.code === 1 && /cannot read app_environment/.test(g.out), g.out);
envReply = { status: 200, body: [{ name: "test" }] };
g = await gate({ ...db });
t("gate: a local mismatch only warns", g.code === 0 && /local, not failing/.test(g.out), g.out);
envReply = { status: 200, body: [{ name: "production" }] };
reply = { status: 200, body: names.filter((n) => n !== "0017_case_event_void").map((name) => ({ name })) };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: one missing → fails and names it", g.code === 1 && /0017_case_event_void\.sql/.test(g.out), g.out);
g = await gate({ ...db });
t("gate: one missing, local → warns, does not fail", g.code === 0 && /0017_case_event_void/.test(g.out), g.out);
reply = { status: 404, body: { code: "PGRST205", message: "relation app_migrations does not exist" } };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: app_migrations itself missing → fails, says 0018", g.code === 1 && /0018_app_migrations\.sql/.test(g.out), g.out);
reply = { status: 500, body: { message: "down" } };
g = await gate({ ...db, VERCEL_ENV: "production" });
t("gate: database unreachable on Vercel → fails", g.code === 1 && /cannot read app_migrations/.test(g.out), g.out);
// the system check against the same fake database, before 0018
const sysJs = `const m = await import("./src/lib/system-check.ts");
  const c = await m.systemCheck({ authEnabled: true, require2fa: true, internalToken: false, onlineApplications: false });
  console.log(JSON.stringify({ missing: c.migrations.missing, error: c.migrations.error ?? null, env: c.environment }));`;
reply = { status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.app_migrations' in the schema cache" } };
const sys = JSON.parse((await probe(db, sysJs)) || "{}");
t("system check: the code's and the database's environment", sys.env?.code === "production" && sys.env?.database === "production", JSON.stringify(sys.env));
t("system check before 0018: names 0018 and later, not 0001–0017", JSON.stringify(sys.missing) === JSON.stringify(names.filter((n) => n >= "0018")) && /0018/.test(sys.error ?? ""), JSON.stringify(sys));
server.close();

// ── no memory fallback on a deployment ────────────────────────────────────

const fallbackJs = `const m = await import("./src/lib/supabase.ts"); try { m.noMemoryFallback("x", new Error("boom")); console.log("memory"); } catch (e) { console.log("threw: " + e.message); }`;
t("locally a database error may fall back to memory", (await probe({}, fallbackJs)) === "memory");
t("on a Vercel preview it throws", /^threw: \[x\] database error/.test(await probe({ VERCEL_ENV: "preview" }, fallbackJs)));
t("in production it throws", /^threw:/.test(await probe({ VERCEL_ENV: "production" }, fallbackJs)));
t("on Vercel with no VERCEL_ENV it is strict too", /^threw:/.test(await probe({ VERCEL: "1" }, fallbackJs)));
const getDbJs = `const m = await import("./src/lib/supabase.ts"); try { console.log(m.getDb() === null ? "null" : "client"); } catch (e) { console.log("threw: " + e.message); }`;
t("locally without a database getDb() is null (memory mode)", (await probe({}, getDbJs)) === "null");
t("production without a database refuses to run", /^threw: \[db\] production has no database/.test(await probe({ VERCEL_ENV: "production" }, getDbJs)));
t("…and so does a Vercel run without VERCEL_ENV", /^threw: \[db\] production/.test(await probe({ VERCEL: "1" }, getDbJs)));

// the writes that must never fail the work around them, against a dead database
const dead = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_KEY: "x", VERCEL_ENV: "preview" };
const notifyJs = `const m = await import("./src/lib/notifications.ts");
  try { const r = await m.notify({ kind: "doc.released", audience: "lab", bg: "б", en: "e", labId: "L" }); console.log(r === null ? "dropped" : "kept"); }
  catch (e) { console.log("threw: " + e.message); }`;
t("notify(): a notice that cannot be stored is dropped, never thrown", (await probe(dead, notifyJs)) === "dropped");
const readJs = `const m = await import("./src/lib/notifications.ts"); try { await m.markRead("staff:a@ptsbg.eu", ["00000000-0000-4000-8000-000000000001"]); console.log("quiet"); } catch (e) { console.log("threw"); }`;
t("markRead(): never an error (4.6 — each person's read)", (await probe(dead, readJs)) === "quiet");
const strictJs = `const m = await import("./src/lib/notifications.ts");
  try { await m.notifyOrThrow({ kind: "results.due", audience: "lab", bg: "б", en: "e", labId: "L" }); console.log("quiet"); } catch (e) { console.log("threw"); }`;
t("notifyOrThrow(): the reminder job hears about it", (await probe(dead, strictJs)) === "threw");

// every store's fallback goes through the rule
const lib = new URL("../src/lib/", import.meta.url);
const stores = readdirSync(lib).filter((f) => f.endsWith(".ts") && /function warn\(e: unknown\)/.test(readFileSync(new URL(f, lib), "utf8")));
t("14 stores with a memory fallback (2.3: the identity store)", stores.length === 14, stores.join(","));
for (const f of stores) {
  const s = readFileSync(new URL(f, lib), "utf8");
  t(`${f}: warn() refuses memory on a deployment first`, /function warn\(e: unknown\) \{\n\s+noMemoryFallback\(/.test(s));
}

console.log(`migrations.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
