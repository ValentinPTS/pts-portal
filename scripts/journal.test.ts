// The journal (plan part 1.9): the actor by id and by name at the time, the
// subject, before → after; append-only in the database; a failed write visible;
// wired for what exists — sign-in and sign-out, every opening of the code ↔
// laboratory link, downloads, uploads and replacements, 2FA resets, sent messages.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { appendActivity, listActivity, logAs, journalHealth, failed } from "../src/lib/activity-store.ts";
import { addStaff } from "../src/lib/staff.ts";
import { addLab } from "../src/lib/labs.ts";
import { sendToLab } from "../src/lib/sent-messages.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// ── the entry ───────────────────────────────────────────────────────────────
const ok = await appendActivity({ action: "role.changed", actorEmail: "a@ptsbg.eu", actorRole: "manager", actorId: "uid-1", actorName: "Анна", summary: "x", subject: "staff:1", before: { role: "staff" }, after: { role: "manager" } });
let e = (await listActivity({ action: "role.changed" }))[0];
t("an entry keeps the actor's id and name, the subject, before → after", ok && e?.actorId === "uid-1" && e.actorName === "Анна" && e.subject === "staff:1"
  && JSON.stringify(e.before) === '{"role":"staff"}' && JSON.stringify(e.after) === '{"role":"manager"}', JSON.stringify(e));

// ── the actor ───────────────────────────────────────────────────────────────
await addStaff({ email: "dobreva@ptsbg.eu", name: "Мария Добрева", role: "staff" });
await logAs({ kind: "person", userId: "uid-2", email: "dobreva@ptsbg.eu", role: "staff" }, "auth.login", { summary: "Signed in (password + two-factor)" });
e = (await listActivity({ action: "auth.login" }))[0];
t("a team member: the name at the time, the address, the account", e?.actorName === "Мария Добрева" && e.actorEmail === "dobreva@ptsbg.eu" && e.actorId === "uid-2" && e.actorRole === "staff", JSON.stringify(e));
await logAs({ kind: "person", userId: "uid-3", email: "founder@ptsbg.eu", role: "manager" }, "auth.login");
t("…a founder with no team row: the address stands for the name", (await listActivity({ action: "auth.login" }))[0]?.actorName === "founder@ptsbg.eu");
await logAs({ kind: "lab", userId: "uid-lab" }, "auth.login", { summary: "Signed in (password)" });
e = (await listActivity({ action: "auth.login" }))[0];
t("a laboratory: only «laboratory» — never its name or address (§4.2)", e?.actorName === "laboratory" && e.actorEmail === "laboratory" && e.actorRole === "lab" && e.actorId === "uid-lab", JSON.stringify(e));
await logAs({ kind: "system" }, "notify.run");
t("the portal itself: «system»", (await listActivity({ action: "notify.run" }))[0]?.actorEmail === "system");

// ── what a non-manager reads ────────────────────────────────────────────────
const { redactActivityForStaff } = await import("../src/lib/redact.ts");
const base = { id: "1", at: "", action: "auth.logout", summary: "Signed out", schemeId: undefined, targetCode: undefined };
let r = redactActivityForStaff({ ...base, actorEmail: "office@lab.bg", actorRole: "none", actorName: "office@lab.bg", actorId: "uid-x" });
t("an unrecognised account (no role): its address is masked, its id dropped", r.actorEmail === "•••@•••" && r.actorName === "•••@•••" && r.actorId === undefined, JSON.stringify(r));
r = redactActivityForStaff({ ...base, actorEmail: "laboratory", actorRole: "lab", actorName: "laboratory", actorId: "uid-lab" });
t("a laboratory: «laboratory», and no account id next to its codes", r.actorEmail === "laboratory" && r.actorName === "laboratory" && r.actorId === undefined);
r = redactActivityForStaff({ ...base, actorEmail: "dobreva@ptsbg.eu", actorRole: "staff", actorName: "Мария Добрева", actorId: "uid-2" });
t("PTS's own people stay named, with their account", r.actorEmail === "dobreva@ptsbg.eu" && r.actorName === "Мария Добрева" && r.actorId === "uid-2");

// ── a failed write is visible ───────────────────────────────────────────────
const before = journalHealth().failures;
failed("doc.sent", new Error("connection refused"));
const h = journalHealth();
t("a failed write is counted, with what and why", h.failures === before + 1 && h.lastAction === "doc.sent" && /connection refused/.test(h.lastError ?? ""));

// …and on a deployment, the real path: a database that refuses → not written, counted
const portal = fileURLToPath(new URL("..", import.meta.url));
const probe = `const a = await import("./src/lib/activity-store.ts");
  const ok = await a.appendActivity({ action: "doc.sent", actorEmail: "x@ptsbg.eu", actorRole: "staff", summary: "s" });
  console.log(JSON.stringify({ ok, failures: a.journalHealth().failures, last: a.journalHealth().lastAction }));`;
const out = await promisify(execFile)("node", ["--import", "./scripts/ts-ext-hook.mjs", "--input-type=module", "-e", probe], {
  cwd: portal, env: { PATH: process.env.PATH ?? "", PTS_STRICT_DB: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_KEY: "x" },
}).then((r) => r.stdout.trim().split("\n").pop() ?? "", (e) => String((e as { stdout?: string }).stdout ?? "crashed"));
const pr = JSON.parse(out.startsWith("{") ? out : "{}");
t("on a deployment a refused write is NOT written and IS counted (never memory)", pr.ok === false && pr.failures === 1 && pr.last === "doc.sent", out);

// ── a message to a laboratory: in the journal, never its address ────────────
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("rejected: lab-journal@example.com is suppressed", { status: 422 })) as typeof fetch;
Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "portal@ptsbg.eu" });
try {
  const lab = await addLab({ email: "lab-journal@example.com", name: "Journal lab" });
  await sendToLab({ class: "provider", kind: "docs.sent", labId: lab.id, schemeId: "26-01-T-1", code: "123456", to: "lab-journal@example.com", subject: "s", body: "b" }, { by: "manager@ptsbg.eu", ref: "notice:1" });
  e = (await listActivity({ action: "message.failed" }))[0];
  t("a message's outcome is in the journal, by code, with who approved it", e?.targetCode === "123456" && /approved by manager@ptsbg\.eu/.test(e.summary) && e.actorEmail === "system", JSON.stringify(e));
  t("…and never the address — not even inside the provider's error", !!e && !e.summary.includes("lab-journal@example.com") && e.summary.includes("‹address›"), e?.summary);
} finally {
  globalThis.fetch = realFetch;
  for (const k of ["MAIL_PROVIDER", "MAIL_API_KEY", "MAIL_FROM"]) delete process.env[k];
}

// ── append-only, in the database ────────────────────────────────────────────
const sql = readFileSync(new URL("../supabase/migrations/0021_journal.sql", import.meta.url), "utf8");
t("0021: a trigger refuses every UPDATE and DELETE on the journal", /create trigger activity_log_append_only before update or delete on public\.activity_log/.test(sql) && /raise exception/.test(sql));
t("…and the new columns", ["actor_id", "actor_name", "subject", "before", "after"].every((c) => new RegExp(`add column if not exists ${c} `).test(sql)));
const root = fileURLToPath(new URL("../src/", import.meta.url));
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(root);
const all = files.map((f) => ({ f: f.slice(root.length), s: readFileSync(f, "utf8") }));
t("the code never updates or deletes a journal entry", !all.some(({ s }) => /from\("activity_log"\)\s*\.(update|delete|upsert)\(/.test(s)));

t("0021 and 0020: TRUNCATE refused too, and the portal's key cannot update or delete the journal",
  /before truncate on public\.activity_log\s*for each statement/.test(sql) && /revoke update, delete, truncate on public\.activity_log from service_role/.test(sql)
  && /before truncate on public\.sent_messages\s*for each statement/.test(readFileSync(new URL("../supabase/migrations/0020_send_control.sql", import.meta.url), "utf8")));

// ── wired for what exists ───────────────────────────────────────────────────
const src = (rel: string) => all.find((x) => x.f === rel)?.s ?? "";
const aa = src("lib/auth-actions.ts");
t("a completed sign-in: every way in (password, two-factor, must enrol, an e-mail link)", (aa.match(/await journalSignIn\(/g) ?? []).length === 6 && (aa.match(/await journalLinkSignIn\(/g) ?? []).length === 2);
t("…not before the second factor is passed", /if \(aal\?\.nextLevel === "aal2"\) return \{ needsTotp: true \}; \/\/ has a factor → must verify\s*await journalSignIn\(uid, email, role, "password; must enrol/.test(aa));
t("sign-out, on both doors, while the session still names who", (aa.match(/await logActivity\("auth\.logout", \{ summary: "Signed out" \}\);[^\n]*\n\s*const supabase = await createServerSupabase\(\);\s*await supabase\.auth\.signOut\(\);/g) ?? []).length === 2);
const reveals: [string, RegExp][] = [
  ["app/schemes/[id]/participants/page.tsx", /if \(reveal && participants\.length\) await logActivity\("names\.viewed"/],
  ["app/schemes/[id]/participants/[code]/page.tsx", /if \(revealed\) await logActivity\("names\.viewed"/],
  ["app/schemes/[id]/traceability/page.tsx", /if \(reveal && participants\.length\) await logActivity\("names\.viewed"/],
  ["app/schemes/[id]/build/[doc]/page.tsx", /if \(reveal && pairsNamesWithCodes\(doc\) && participants\.length\) await logActivity\("names\.viewed"/],
  ["app/schemes/[id]/audit-pack/route.ts", /if \(showNames\) await logActivity\("names\.viewed"/],
];
t("every opening of the code ↔ laboratory link (the five places names are shown)", reveals.every(([f, re]) => re.test(src(f))), reveals.filter(([f, re]) => !re.test(src(f))).map(([f]) => f).join());
// every file that decides to reveal names AND renders a laboratory's name pairs it
// with names.viewed (both checks: canRevealNames and canRevealNamesNow)
// (since 2.4 the decision is the role model's: mayNow("names.view", …))
const shows = all.filter(({ f, s }) => /mayNow\("names\.view"/.test(s) && /\blabName\b/.test(s) && f.startsWith("app/") && f !== "app/activity/page.tsx");
t("…and nowhere a name is shown without it", shows.length >= 8 && shows.every(({ s }) => /names\.viewed/.test(s)),
  `${shows.length} files; without: ${shows.filter(({ s }) => !/names\.viewed/.test(s)).map(({ f }) => f).join()}`);
t("…F 7.2.1-6 and the certificate in every place they open (viewer, print routes, fill, PDF, results)",
  ["app/schemes/[id]/doc/[doc]/page.tsx", "app/schemes/[id]/doc/[doc]/print/route.ts", "app/schemes/[id]/build/[doc]/print/route.ts", "app/schemes/[id]/fill/[doc]/route.ts", "app/api/pdf/route.ts", "app/schemes/[id]/results/page.tsx"].every((f) => /logActivity\("names\.viewed"/.test(src(f))));
t("…and not where no names are shown (a list of codes only, an empty scheme)", /if \(reveal && pairsNamesWithCodes\(doc\) && participants\.length\)/.test(src("app/schemes/[id]/build/[doc]/page.tsx")) && /if \(reveal && participants\.length\) await logActivity\("names\.viewed"/.test(src("app/schemes/[id]/participants/page.tsx")));
const downloads = ["app/lab/doc/[scheme]/[doc]/route.ts", "app/lab/labdoc/[scheme]/[slot]/route.ts", "app/lab/upload/[scheme]/[slot]/route.ts",
  "app/schemes/[id]/lab-docs/[code]/[slot]/route.ts", "app/schemes/[id]/lab-uploads/[code]/[slot]/route.ts", "app/schemes/[id]/released/[doc]/route.ts",
  "app/schemes/[id]/uploaded/[doc]/route.ts", "app/schemes/[id]/audit-pack/route.ts"];
t("every download gate journals a delivered file", downloads.every((f) => /export async function GET[\s\S]*const (res|\{ res, log \}) = await serve\(req, ctx\);\s*if \(\(?res\.status === 200 \|\| res\.status === 206\)?[\s\S]*(logActivity|logAs)\((\{ kind: "lab", userId: log\.actor \}, )?"file\.downloaded"/.test(src(f))), downloads.filter((f) => !/(logActivity|logAs)\([^"]*"file\.downloaded"/.test(src(f))).join());
t("…and the PDF", /logActivity\("file\.downloaded", \{ schemeId: id, subject: `pdf:/.test(src("app/api/pdf/route.ts")));
t("…and a laboratory's application documents: through a gate, no signed links", /logActivity\("file\.downloaded", \{ subject: `lab-application:/.test(src("app/users/applications/[id]/[n]/route.ts")) && !/createSignedUrl/.test(src("app/users/page.tsx")));
t("…a laboratory's own downloads carry its code", ["app/lab/labdoc/[scheme]/[slot]/route.ts", "app/lab/upload/[scheme]/[slot]/route.ts"].every((f) => /logActivity\("file\.downloaded", \{ schemeId: p\.scheme, targetCode: code,/.test(src(f))) && /logAs\(\{ kind: "lab", userId: log\.actor \}, "file\.downloaded", \{ schemeId: p\.scheme, targetCode: log\.code,/.test(src("app/lab/doc/[scheme]/[doc]/route.ts")));
const actions = src("lib/actions.ts");
const block = (a: string) => actions.slice(actions.indexOf(`logActivity("${a}"`), actions.indexOf("});", actions.indexOf(`logActivity("${a}"`)));
t("no uploaded file name in an upload's journal line", ["doc.uploaded", "labdoc.uploaded", "lab.uploaded"].every((a) => block(a).length > 0 && !/\$\{(name|f\.name|file\.name|upload\.name)\}/.test(block(a))));
t("uploads and replacements: before → after, never a file name", ["doc.uploaded", "labdoc.uploaded", "lab.uploaded"].every((a) => new RegExp(`logActivity\\("${a.replace(".", "\\.")}", \\{[\\s\\S]{0,400}before: [a-zA-Z]+ \\? \\{ size: [a-zA-Z]+\\.size, mime: [a-zA-Z]+\\.mime, at: [a-zA-Z]+\\.uploadedAt \\} : null,\\s*after: \\{ size: upload\\.size`).test(actions)));
t("2FA resets carry their subject", (actions.match(/logActivity\("auth\.2fa_reset", \{ subject: `\$\{kind\}:/g) ?? []).length === 2);
t("sent messages: journalled with their outcome", /await logAs\(\{ kind: "system" \}, ok \? "message\.sent" : "message\.failed"/.test(src("lib/sent-messages.ts")));
t("role, status, template, scheme changes: before → after", ["role.changed", "staff.status", "lab.status", "scheme.renamed", "scheme.dates", "template.saved"].every((a) => new RegExp(`logActivity\\("${a.replace(".", "\\.")}", \\{[\\s\\S]{0,200}before:`).test(actions)));
t("no laboratory name in a before/after", !/before: \{[^}]*labName|after: \{[^}]*labName/.test(actions));
t("the daily job is the portal itself", /logAs\(\{ kind: "system" \}, "notify\.run"/.test(src("app/api/cron/notify/route.ts")));
const act = src("lib/activity.ts");
t("a session with no role is never written by its address", /const who = isLab \? LAB_ACTOR : isTeam && ctx\.email \? ctx\.email : ctx\.email \? UNRECOGNISED/.test(act) && /actorName: isTeam && ctx\.email \? await nameOf\(ctx\.email\) : who/.test(act));
t("the page shows the name, the subject, the change, and failed writes", /data-journal-failures/.test(src("app/activity/page.tsx")) && /e\.actorName/.test(src("app/activity/page.tsx")) && /data-change/.test(src("app/activity/page.tsx")));

console.log(`journal.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
