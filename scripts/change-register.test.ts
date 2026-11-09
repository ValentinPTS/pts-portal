// Change control (plan part 1.11; ISO/IEC 17043 §7.5.2, Реш. 67, ground rule 7): the
// release register, used from the first release, covering settings and updates too;
// CI runs the four gates, and only a green build deploys.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { proposeChange, decideChange, recordSettingChange, markDeployed, listChanges, releaseFor, nextStatus, proposalProblem, isCommit, namesCommit, registerHealth } from "../src/lib/change-register.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const src = (rel: string) => readFileSync(here(`../src/${rel}`), "utf8");
const SHA = "0123456789abcdef0123456789abcdef01234567";

// ── the rules ───────────────────────────────────────────────────────────────
t("a release names its WHOLE commit — a short prefix a crafted commit could share", isCommit(SHA) && !isCommit(SHA.slice(0, 7)) && !isCommit(SHA.slice(0, 39)) && !isCommit("X".repeat(40)) && !isCommit(undefined));
t("…matched exactly", namesCommit(SHA, SHA) && namesCommit(SHA, SHA.toUpperCase()) && !namesCommit(SHA.slice(0, 7), SHA));
t("the status only moves forward", nextStatus("proposed", "authorised") && nextStatus("proposed", "rejected") && nextStatus("authorised", "deployed")
  && !nextStatus("authorised", "proposed") && !nextStatus("deployed", "authorised") && !nextStatus("rejected", "authorised") && !nextStatus("proposed", "deployed"));
t("a proposal needs what changed, how it was validated, and a release its whole commit",
  proposalProblem({ kind: "release", title: "x", what: "y", validation: "z", ref: SHA }) === null
  && proposalProblem({ kind: "release", title: "x", what: "y", validation: "z", ref: SHA.slice(0, 7) }) === "commit"
  && proposalProblem({ kind: "update", title: "x", what: "y", validation: "" }) === "validation"
  && proposalProblem({ kind: "setting", title: "x", what: "y", validation: "z" }) === "kind");

// ── the register: two people ────────────────────────────────────────────────
const e = await proposeChange({ kind: "release", title: "Портал 1.11", what: "Регистърът на промените", validation: "tsc, lint, 40 набора, build", ref: SHA, by: "ivaylo@ptsbg.eu" });
t("proposed", e.status === "proposed" && e.ref === SHA);
t("…not yet a release the site may run", (await releaseFor(SHA)) === null);
t("…and not marked in use before it is authorised", (await markDeployed(SHA)) === false);
t("the one who proposed it cannot authorise it", (await decideChange(e.id, "authorised", "ivaylo@ptsbg.eu")) === null);
t("…a crafted id is no entry", (await decideChange("not-a-uuid", "authorised", "head@ptsbg.eu")) === null);
const a = await decideChange(e.id, "authorised", "head@ptsbg.eu");
t("authorised by another person, with when", a?.status === "authorised" && a.authorisedBy === "head@ptsbg.eu" && !!a.authorisedAt);
t("…once: a second decision changes nothing", (await decideChange(e.id, "rejected", "x@ptsbg.eu")) === null);
t("…now the site may run it", (await releaseFor(SHA))?.id === e.id);
t("it starts in production → «in use»", (await markDeployed(SHA)) === true && (await listChanges()).find((x) => x.id === e.id)?.status === "deployed");
const r = await proposeChange({ kind: "update", title: "next 16.2.10", what: "a dependency", validation: "the gates", by: "ivaylo@ptsbg.eu" });
const rj = await decideChange(r.id, "rejected", "head@ptsbg.eu", "not now");
t("rejected, with a reason", rj?.status === "rejected" && rj.reason === "not now" && rj.rejectedBy === "head@ptsbg.eu");
const local = await proposeChange({ kind: "update", title: "local", what: "x", validation: "y", by: "build" });
t("…locally (login off, everyone «build»): the one exception, asked for explicitly", (await decideChange(local.id, "authorised", "build")) === null && (await decideChange(local.id, "authorised", "build", undefined, { localSelf: true }))?.status === "authorised");
const s = await recordSettingChange({ title: "Текст на напомнянето results.due v2 одобрен", what: "БГ «…»", validation: "seen before approving", ref: "template:results.due@v2", by: "head@ptsbg.eu" });
t("a setting changed in the portal: recorded as made, its maker its authorisation", s?.status === "deployed" && s.authorisedBy === "head@ptsbg.eu" && s.kind === "setting");
t("…and a setting that could not be recorded is counted for the system check", registerHealth().failures === 0 && /registerHealth/.test(src("app/system/page.tsx")));

// ── wired: who may do what, and the settings ────────────────────────────────
const actions = src("lib/actions.ts");
t("the software administrator proposes (the role model, 2.4)", /export async function proposeChangeAction[\s\S]{0,80}await requireCap\("register\.propose"\);/.test(actions));
t("the head of the PT provider decides (with login on)", /export async function decideChangeAction[\s\S]{0,80}await requireCap\("register\.authorise"\);[\s\S]{0,400}if \(ctx\.authEnabled && !\(await isEffectiveHead\(ctx\.email\)\)\) redirect/.test(actions));
t("…never the one who proposed it (only a local server with no database is the exception)", /const localSelf = !ctx\.authEnabled && !getDb\(\);\s*if \(!localSelf && [^\n]*requestedBy === by\) redirect\(`\$\{CHANGES_PAGE\}\?error=self`\)/.test(actions));
t("…and on a deployment, nothing with login off («build» authorises nothing)", (actions.match(/if \(!\(await registerOpen\(\)\)\) redirect\(`\$\{CHANGES_PAGE\}\?error=login`\);/g) ?? []).length === 2 && /return !\(dbMode\(\)\.strict && !\(await getRoleContext\(\)\)\.authEnabled\);/.test(actions));
t("…journalled", /logActivity\("change\.proposed"/.test(actions) && /logActivity\("change\.authorised"/.test(actions) && /logActivity\("change\.rejected"/.test(actions));
t("settings in the register by themselves: message templates, people, laboratory accounts, 2FA resets",
  ["template.approved", "role.changed", "staff.added", "staff.status", "lab.added", "lab_application.approved", "lab.status", "cover.default"].every((x) => new RegExp(`logActivity\\("${x.replace(".", "\\.")}"[\\s\\S]{0,400}(recordSettingChange|settingChanged)\\(`).test(actions))
  && /Двуфакторен вход нулиран/.test(actions));
t("…and the portal's own settings: default skins, custom skins, document templates", ["setDefaultSkinAction", "createCustomSkinAction", "updateCustomSkinAction", "deleteCustomSkinAction", "saveDocTemplateAction", "deleteDocTemplateAction"].every((f) => {
  const body = actions.slice(actions.indexOf(`export async function ${f}`)); return /await settingChanged\(/.test(body.slice(0, body.indexOf("\n}\n")));
}));
t("the page: read by everyone at PTS, propose by the software administrator, decide by the head", /await requireStaff\(\);/.test(src("app/changes/page.tsx")) && /const isManager = await mayNow\("register\.propose"\);/.test(src("app/changes/page.tsx")) && /canDecide = \(await mayNow\("register\.authorise"\)\) && \(!ctx\.authEnabled \|\| \(await isEffectiveHead\(ctx\.email\)\)\)/.test(src("app/changes/page.tsx")));
t("production marks its authorised release in use at start, and says so loudly when there is none", /markDeployed\(sha\)/.test(src("instrumentation.ts")) && /running WITHOUT an authorised entry/.test(src("instrumentation.ts")));

// ── the database keeps the rules ────────────────────────────────────────────
const sql = readFileSync(here("../supabase/migrations/0022_change_register.sql"), "utf8");
t("0022: never removed (rows or the whole table)", /tg_op in \('DELETE', 'TRUNCATE'\)/.test(sql) && /before truncate on public\.change_register/.test(sql) && /revoke delete, truncate on public\.change_register from service_role/.test(sql));
t("…the words never change", /an entry''s words never change/.test(sql));
t("…a release names its whole commit", /new\.ref !~ '\^\[0-9a-f\]\{40\}\$'/.test(sql));
t("…authorised or rejected by someone other than who proposed it", /new\.authorised_by = old\.requested_by/.test(sql) && /new\.rejected_by = old\.requested_by/.test(sql));
t("…each step keeps what came before (who authorised, and when)", /«in use» changes nothing else/.test(sql) && /new\.authorised_by is distinct from old\.authorised_by or new\.authorised_at is distinct from old\.authorised_at/.test(sql));
t("…a release or an update starts with nothing decided", /new\.status <> 'proposed' or new\.authorised_by is not null or new\.authorised_at is not null/.test(sql));
t("…and the times are the database's own", ["new.created_at := now()", "new.authorised_at := now()", "new.rejected_at := now()", "new.deployed_at := now()"].every((x) => sql.includes(x)));

// ── the release gate ────────────────────────────────────────────────────────
let reply: { status: number; body: unknown } = { status: 200, body: [] };
let asked = "";
const server = createServer((q, res) => { asked = q.url ?? ""; res.writeHead(reply.status, { "content-type": "application/json" }); res.end(JSON.stringify(reply.body)); });
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
const port = (server.address() as { port: number }).port;
const gate = (env: Record<string, string>) => new Promise<{ code: number; out: string }>((ok) => {
  execFile(process.execPath, [here("check-release.mjs")], { env: { PATH: process.env.PATH ?? "", ...env } }, (err, stdout, stderr) =>
    ok({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}` }));
});
const prod = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_KEY: "k", PROVIDER_HEAD_EMAILS: "head@ptsbg.eu" };
const row = (o: object) => ({ ref: SHA, status: "authorised", title: "Портал 1.11", requested_by: "ivaylo@ptsbg.eu", authorised_by: "head@ptsbg.eu", ...o });
let g = await gate({});
t("gate: a local build — not gated", g.code === 0 && /not a production build/.test(g.out), g.out);
g = await gate({ ...prod, VERCEL_ENV: "preview" });
t("gate: a preview — not gated (that is where a release is validated)", g.code === 0, g.out);
g = await gate({ ...prod, VERCEL_GIT_COMMIT_SHA: "" });
t("gate: production with no commit to check → fails", g.code === 1 && /no commit to check/.test(g.out), g.out);
g = await gate({ ...prod, PROVIDER_HEAD_EMAILS: "office@ptsbg.eu", OWNER_EMAILS: "" });
t("gate: no head of the provider named → fails", g.code === 1 && /no head of the PT provider is named/.test(g.out), g.out);
reply = { status: 200, body: [] };
g = await gate(prod);
t("gate: a commit with no authorised release → fails, saying what to do", g.code === 1 && /no authorised release in the change register/.test(g.out) && /Регистър на промените/.test(g.out), g.out);
t("…it asked for exactly this commit", asked.includes(`ref=eq.${SHA}`), asked);
reply = { status: 200, body: [row({})] };
g = await gate(prod);
t("gate: authorised by the head, proposed by another → deploys", g.code === 0 && /is authorised by head@ptsbg\.eu/.test(g.out), g.out);
reply = { status: 200, body: [row({ authorised_by: "ivaylo@ptsbg.eu" })] };
g = await gate({ ...prod, PROVIDER_HEAD_EMAILS: "head@ptsbg.eu,ivaylo@ptsbg.eu" });
t("gate: authorised by the one who proposed it → fails", g.code === 1 && /other than the person who proposed it/.test(g.out), g.out);
reply = { status: 200, body: [row({ authorised_by: "build" })] };
g = await gate(prod);
t("gate: authorised by «build» (login off) → fails", g.code === 1, g.out);
reply = { status: 200, body: [row({ authorised_by: "manager@ptsbg.eu" })] };
g = await gate(prod);
t("gate: authorised by someone who is not a head → fails", g.code === 1, g.out);
reply = { status: 200, body: [row({ ref: SHA.slice(0, 7) })] };
g = await gate(prod);
t("gate: a short commit in the register does not count", g.code === 1, g.out);
reply = { status: 500, body: { message: "down" } };
g = await gate(prod);
t("gate: the register unreadable → fails (never waves through)", g.code === 1 && /cannot read the change register/.test(g.out), g.out);
server.close();

// ── only a green build deploys ──────────────────────────────────────────────
const pre = readFileSync(here("prebuild.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8"));
t("every build runs the migration gate, then the release gate", pkg.scripts.prebuild === "node scripts/prebuild.mjs" && /step\("migration gate"[\s\S]*step\("release gate"/.test(pre));
t("…and on Vercel the four gates themselves: types, lint, the tests (then the build)", /if \(onVercel\) \{[\s\S]*step\("types \(tsc\)"[\s\S]*step\("lint \(eslint\)"[\s\S]*step\("tests/.test(pre));
t("…a failed step stops the build", /if \(r\.status !== 0\) \{[\s\S]{0,160}process\.exit/.test(pre));
t("…on a Node that runs the tests (TypeScript stripped natively: 22.18+), the same as CI", pkg.engines?.node === "22.x");
const runner = readFileSync(here("run-tests.mjs"), "utf8");
t("the tests run with no secrets: no database key, no mail key, no Vercel variable", /const env = \{ PATH: [^}]*\};/.test(runner) && !/SUPABASE|MAIL_|VERCEL/.test(runner.match(/const env = \{[^}]*\}/)?.[0] ?? "X") && pkg.scripts.test === "node scripts/run-tests.mjs");
const ci = readFileSync(here("../.github/workflows/ci.yml"), "utf8");
t("CI on every push and pull request: the four gates", /on:\s*\n\s*push:\s*\n\s*pull_request:/.test(ci) && ["npx tsc --noEmit", "npm run lint", "npm test", "npm run build"].every((c) => ci.includes(`run: ${c}`)));
t("…on Node 22, with no secrets", /node-version: 22\b/.test(ci) && !/secrets\./.test(ci));

console.log(`change-register.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
