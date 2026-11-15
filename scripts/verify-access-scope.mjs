// Round 9 · T4 — the access rule, as a gate: «the object an action changes, or a route or page returns,
// belongs to the scheme, organisation or laboratory whose right was checked» — against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-access-scope.mjs
// It makes its own world each run: schemes A, B (and C, open for applications); staff-added participations;
// laboratory accounts L1, L2 in A and L3 in B; organisations E1, E2 in A and E3 only in B, each with its
// laboratory and administrator; in A and in B a timeline step, two plan revisions, an edition, a batch, a
// proforma, a protocol, a release, a delivery problem, a held notice. Then:
//   • a person with EVERY scheme role in A and none in B names B's object under A — refused (/denied or the
//     sign-in, 403/404 — a streamed page's in-page redirect or «not found» counts — or the action's own error);
//     laboratory L1 names L2's and L3's; organisation user U1 names E2's;
//   • the same act on the person's own object gets past that refusal (the control);
//   • B's journal and pages are as before all of it — and the snapshot is shown to see a real write to B.
// A server action is called as the browser's runtime calls it (Next 16): POST to a page with `Next-Action: <id>`,
// the page's Origin, the arguments encoded by React's encodeReply; a redirect is the `x-action-redirect` header.
// The ids are harvested from the pages (client bundles and $ACTION_ID_ fields) and named from the dev server's
// action manifest (exportedName only). The open question R5SB-5 (labs.manage is not per scheme) is printed as
// a note — STRICT_KNOWN=1 counts it. The full sweep (every action with B's ids) stays in the round-9 folder.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
const PORTAL = process.env.PORTAL ?? fileURLToPath(new URL("..", import.meta.url)); // the project: this script sits in its scripts/
const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("BASE must be http://localhost:<port> or http://127.0.0.1:<port> — refusing to run against anything else");
  process.exit(2);
}

const require = createRequire(import.meta.url);
// React's own reply encoder — exactly what the browser runtime uses to send a server
// action's arguments (strings, objects, undefined as "$undefined", a FormData as "$K1"…)
const { encodeReply } = require(join(PORTAL, "node_modules/next/dist/compiled/react-server-dom-webpack/client.edge.js"));

// ── a session: the cookies a browser would hold ─────────────────────────────
class Session {
  constructor(label) { this.label = label; this.jar = new Map(); }
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  take(res) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      const gone = !v || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a) || (/^\s*expires=/i.test(a) && Date.parse(a.split("=")[1]) < Date.now()));
      if (gone) this.jar.delete(k); else this.jar.set(k, v);
    }
  }
}

/** Switch a session to a dev persona (`role=manager`, `model=scheme_manager@A`, `role=lab&lab=…`,
 *  `role=participant&user=…`) and check the switch took. */
async function persona(s, q) {
  const r = await fetch(`${BASE}/dev/persona?${q}`, { headers: { Cookie: s.cookie() }, redirect: "manual" });
  s.take(r);
  await r.arrayBuffer().catch(() => {});
  if (r.status >= 400) throw new Error(`persona ${q}: ${r.status} ${await r.text().catch(() => "")}`);
  s.label = q;
  return s;
}

/** A GET as that session (no redirects followed: a refusal's 307 is the answer). */
async function get(s, path, { follow = false } = {}) {
  const r = await fetch(BASE + path, { headers: { Cookie: s.cookie() }, redirect: follow ? "follow" : "manual" });
  s.take(r);
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, location: r.headers.get("location") ?? "", type: r.headers.get("content-type") ?? "", body: buf, text: buf.toString("utf8") };
}

// ── server action ids, as the pages carry them ───────────────────────────────
// A page carries an action's id two ways: a client component's bundle holds
// `createServerReference("<id>", …, "<exportName>")`; a server-rendered <form action={fn}>
// holds `<input type="hidden" name="$ACTION_ID_<id>">`. The bundle gives id AND name; the
// hidden input gives only the id, so its name is read from the dev server's own action
// manifest (.next/dev/server/server-reference-manifest.json — only `node[id].workers[*]
// .exportedName` is read; the file's encryption key is never touched or printed).
const IDS = new Map(); // name → id
const SEEN_ON_PAGE = new Set(); // ids found in a page or its bundles
const chunkDone = new Set();
async function harvest(s, path) {
  const r = await get(s, path, { follow: true });
  for (const m of r.text.matchAll(/\$ACTION_ID_([0-9a-f]{40,44})/g)) SEEN_ON_PAGE.add(m[1]);
  const chunks = [...r.text.matchAll(/<script src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]);
  for (const c of chunks) {
    if (chunkDone.has(c) || /node_modules_next|turbopack|hmr-client|polyfill/.test(c)) continue;
    chunkDone.add(c);
    const js = (await get(s, c)).text;
    for (const m of js.matchAll(/\("([0-9a-f]{40,44})",[^;]{0,600}?,\s*"([A-Za-z0-9_]+)"\)/g)) { IDS.set(m[2], m[1]); SEEN_ON_PAGE.add(m[1]); }
  }
  return r;
}
function namesFromManifest() {
  const raw = JSON.parse(readFileSync(join(PORTAL, ".next/dev/server/server-reference-manifest.json"), "utf8"));
  let n = 0;
  for (const [id, x] of Object.entries(raw.node ?? {})) {
    const name = Object.values(x.workers ?? {})[0]?.exportedName;
    if (name && !IDS.has(name)) { IDS.set(name, id); n++; }
  }
  for (const k of Object.keys(raw)) delete raw[k]; // nothing of it kept
  return n;
}

/** Call a server action as the browser's runtime does: POST to a page with the
 *  `Next-Action` header, the arguments encoded by React's encodeReply, the page's own
 *  Origin. Returns the decoded result (`value`), a redirect (`redirect`, e.g. "/denied"), the
 *  HTTP status and the raw RSC text. */
async function act(s, name, args, { page = "/denied" } = {}) {
  const id = IDS.get(name);
  if (!id) throw new Error(`no action id for ${name}`);
  const body = await encodeReply(args);
  const headers = { "Next-Action": id, Origin: BASE, Cookie: s.cookie(), Accept: "text/x-component" };
  if (typeof body === "string") headers["Content-Type"] = "text/plain;charset=UTF-8";
  const r = await fetch(BASE + page, { method: "POST", headers, body, redirect: "manual" });
  s.take(r);
  const text = await r.text();
  const red = (r.headers.get("x-action-redirect") ?? "").replace(/;(push|replace)$/, "");
  let value;
  const ref = text.match(/^0:\{"a":"\$@([0-9a-f]+)"/m)?.[1];
  if (ref) {
    const rows = [...text.matchAll(new RegExp(`^${ref}:(?!D")(.*)$`, "gm"))];
    const last = rows.at(-1)?.[1];
    if (last !== undefined) { try { value = JSON.parse(last); } catch { value = last; } }
  }
  const thrown = /^[0-9a-f]+:E\{/m.test(text) ? text.match(/^[0-9a-f]+:E(\{.*\})$/m)?.[1] : undefined;
  return { status: r.status, redirect: red, value, thrown, text };
}

/** The same action submitted as a real <form> with JavaScript off (multipart, the
 *  `$ACTION_ID_<id>` field, no Next-Action header) — Next answers a redirect with 303. */
async function actNoJs(s, name, fields, { page = "/denied" } = {}) {
  const id = IDS.get(name);
  const fd = new FormData();
  fd.append(`$ACTION_ID_${id}`, "");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(BASE + page, { method: "POST", headers: { Cookie: s.cookie(), Origin: BASE }, body: fd, redirect: "manual" });
  s.take(r);
  const text = await r.text();
  return { status: r.status, location: r.headers.get("location") ?? "", text };
}

const form = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const x of v) fd.append(k, x);
    else if (v instanceof Blob) fd.append(k, v, v.name ?? "file.pdf");
    else fd.append(k, String(v));
  }
  return fd;
};

// a deterministic PRNG (mulberry32) — the run's seed decides every made-up name
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
// the shared dev server restarts itself when its memory grows, wiping everything: said so — rerun
process.on("uncaughtException", (e) => {
  if (/terminated|fetch failed|ECONNRESET|ECONNREFUSED|other side closed/.test(`${e?.message} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`)) {
    console.error(`\nthe dev server went away mid-run (${e.message}) — it restarts when its memory grows; rerun`);
    process.exit(3);
  }
  console.error(e);
  process.exit(1);
});
const SEED = Number(process.env.SEED ?? (Date.now() % 1_000_000_000));
const R = rng(SEED);
const STRICT_KNOWN = process.env.STRICT_KNOWN === "1";
const T0 = Date.now();
const tag = `${SEED.toString(36)}${Math.floor(R() * 1e6).toString(36)}`;
const M = (k) => `T4M${tag}${k}`; // a unique mark per object, ASCII
const today = new Date().toISOString().slice(0, 10);
const pdf = (mark) => new File([`%PDF-1.4\n% ${mark}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`], "t4.pdf", { type: "application/pdf" });
// neg / pos (and a control that could not run) count; KNOWN and LATENT are notes
const usedEntries = new Set();
const check = (kind, entry, name, ok, detail = "") => {
  usedEntries.add(entry.split(" ")[0]);
  if (kind === "known" || kind === "latent" || kind === "side") { console.log(`note: [${kind}] ${entry} — ${name}${ok ? "" : ` :: ${String(detail).slice(0, 200)}`}`); return; }
  t(`[${kind}] ${entry} — ${name}`, ok, String(detail).slice(0, 300));
};
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const val = (r) => r.value ?? {};
const errOf = (r) => (r.redirect ? `redirect ${r.redirect}` : JSON.stringify(r.value ?? r.thrown ?? r.status));
// A page refused while it streams answers 200 with the redirect or the «not found» inside it
// (`NEXT_REDIRECT;replace;/denied;307;`, `NEXT_HTTP_ERROR_FALLBACK;404`); before it streams, 307 / 404.
const refusedGate = (x) => x.status === 403 || x.status === 401 || /\/denied|\/login/.test(x.location ?? x.redirect ?? "") || /NEXT_REDIRECT;(replace|push);\/(denied|login)/.test(x.text ?? "");
const notFoundPage = (x) => x.status === 404 || /NEXT_HTTP_ERROR_FALLBACK;404/.test(x.text ?? "");
const okPage = (x) => x.status === 200 && !/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_REDIRECT;/.test(x.text ?? "");
const between = (html, from, to = "</tr>") => { const i = html.indexOf(from); if (i < 0) return ""; const j = html.indexOf(to, i); return html.slice(Math.max(0, html.lastIndexOf("<tr", i)), j < 0 ? undefined : j); };

try {
// ── sessions ─────────────────────────────────────────────────────────────────
const S = { build: new Session("build") };
await persona(S.build, "role=manager");
const sys = await get(S.build, "/system", { follow: true });
if (!/running entirely in memory|работи изцяло в паметта/.test(sys.text)) { console.error("not a memory-only server — refusing to plant anything"); process.exit(2); }
log(`seed ${SEED}, tag ${tag}, ${BASE}`);

// ── 1. the world ─────────────────────────────────────────────────────────────
// action ids: the pages that carry them are visited first (compiled, harvested), then named
await harvest(S.build, "/");
for (const p of ["/files/testing", "/users", "/organizations", "/registrations", "/notices", "/deliveries", "/invoices", "/batches"]) await harvest(S.build, p);
namesFromManifest();

const mkScheme = async (label) => {
  const r = await act(S.build, "createProjectAction", [form({ type: "T", name: `T4 ${label} ${tag}`, sample: "aggregates", kind: "PTS", activity: "T" })]);
  const id = r.redirect.match(/^\/schemes\/([^/?]+)$/)?.[1];
  if (!id) throw new Error(`scheme ${label} not made: ${errOf(r)}`);
  return id;
};
const A = await mkScheme("A"), B = await mkScheme("B"), C = await mkScheme("C");
log("schemes", { A, B, C });
for (const id of [A, B]) {
  for (const p of [`/schemes/${id}`, `/schemes/${id}/participants`, `/schemes/${id}/build/plan`, `/schemes/${id}/build/plan/history`, `/schemes/${id}/edit`, `/schemes/${id}/results`, `/schemes/${id}/review`, `/schemes/${id}/batches`, `/schemes/${id}/editions`]) await harvest(S.build, p);
  break; // one scheme compiles the pages
}
namesFromManifest();

// laboratory accounts
const labIdByEmail = async (email) => {
  const t = (await get(S.build, "/users")).text.replace(/\\"/g, '"');
  return t.match(new RegExp(`"kind":"lab","id":"([0-9a-f-]{36})","name":"[^"]*","email":"${email.replace(/[.+]/g, "\\$&")}"`))?.[1];
};
const LAB = {};
for (const k of ["L1", "L2", "L3"]) {
  const email = `t4-${k.toLowerCase()}-${tag}@example.test`;
  const name = `Фиктивна лаборатория ${k} ${M(k + "name")}`;
  const r = await act(S.build, "addLabAction", [form({ email, name })]);
  if (!val(r).ok) throw new Error(`lab ${k}: ${errOf(r)}`);
  LAB[k] = { id: await labIdByEmail(email), name, email };
  if (!LAB[k].id) throw new Error(`lab ${k}: id not found on /users`);
}

// organisations, their laboratories and administrators
const ORG = {};
for (const k of ["E1", "E2", "E3"]) {
  const e = await act(S.build, "saveEntityAction", [{ name: `Фиктивно ООД ${k} ${M(k)}`, country: "RO", eik: `T4${k}${tag}`.slice(0, 20), vat: "", correspondenceAddress: `ул. Измислена ${k}`, officialEmail: `t4-${k.toLowerCase()}-${tag}@example.test`, mol: "", language: "bg" }]);
  if (!val(e).ok) throw new Error(`entity ${k}: ${errOf(e)}`);
  const labName = `Фиктивна лаб на ${k} ${M(k + "lab")}`;
  const l = await act(S.build, "saveLaboratoryAction", [{ entityId: e.value.id, name: labName, deliveryAddress: `ул. Доставка ${k}`, mobileOffice: false, accreditationNo: "" }]);
  const u = await act(S.build, "saveEntityUserAction", [{ entityId: e.value.id, email: `t4-u-${k.toLowerCase()}-${tag}@example.test`, name: `Потребител ${k}`, position: "", phone: "", role: "admin", twoFactorRequired: false }]);
  if (!val(l).ok || !val(u).ok) throw new Error(`entity ${k} lab/user: ${errOf(l)} ${errOf(u)}`);
  // checked and active (a document + PTS's tick), so its user may apply
  await act(S.build, "attachEntityProofAction", [form({ entityId: e.value.id, file: pdf(M(k + "proof")) })]);
  await act(S.build, "setEntityManualCheckAction", [e.value.id, true, "T4 test check"]);
  const st = await act(S.build, "setEntityStateAction", [e.value.id, "active"]);
  ORG[k] = { id: e.value.id, lab: l.value.id, labName, user: u.value.id, active: !!val(st).ok, activeErr: errOf(st) };
}

// participations
const addPart = async (scheme, labName) => {
  const r = await act(S.build, "addParticipantAction", [form({ schemeId: scheme, labName, email: `t4-${randomUUID().slice(0, 8)}@example.test`, contact: "Тест Тестов", sel_0: "1" })]);
  if (!r.redirect.startsWith(`/schemes/${scheme}/participants`) || /err=/.test(r.redirect)) throw new Error(`participant in ${scheme}: ${errOf(r)}`);
};
const rows = async (scheme) => {
  const t = (await get(S.build, `/schemes/${scheme}/participants`)).text;
  const out = [];
  for (const chunk of t.split('data-participant-row="').slice(1)) {
    const code = chunk.slice(0, chunk.indexOf('"'));
    const name = chunk.match(/<td class="p-2">([^<]*)</)?.[1] ?? "";
    const pid = chunk.match(/data-standing-row="([^"]+)"/)?.[1];
    out.push({ code, name: name.replace(/&quot;/g, '"').replace(/&amp;/g, "&"), pid });
  }
  return out;
};
const P = {};
await addPart(A, `Фиктивна лаб pA ${M("pA")}`);
await addPart(A, `Фиктивна лаб pA2 ${M("pA2")}`);
await addPart(A, `Фиктивна лаб pE1 ${M("pE1")}`);
await addPart(A, `Фиктивна лаб pE2 ${M("pE2")}`);
await addPart(B, `Фиктивна лаб pB ${M("pB")}`);
await addPart(B, `Фиктивна лаб pE3 ${M("pE3")}`);
for (const [k, s] of [["L1", A], ["L2", A], ["L3", B]]) {
  S[k] = new Session(k);
  await persona(S[k], `role=lab&lab=${LAB[k].id}&join=${s}`);
}
await get(S.build, `/dev/code?scheme=${A}`);
await get(S.build, `/dev/code?scheme=${B}`);
for (const [s, keys] of [[A, ["pA", "pA2", "pE1", "pE2"]], [B, ["pB", "pE3"]]]) {
  const rs = await rows(s);
  for (const k of keys) P[k] = rs.find((r) => r.name.includes(M(k)));
  for (const k of ["L1", "L2", "L3"]) { const r = rs.find((x) => x.name.includes(M(k + "name"))); if (r) P[k] = r; }
}
for (const k of ["pA", "pA2", "pE1", "pE2", "pB", "pE3", "L1", "L2", "L3"]) if (!P[k]?.pid || !/^\d+$/.test(P[k]?.code ?? "")) throw new Error(`participation ${k} not found/coded: ${JSON.stringify(P[k])}`);

// personas
const ALL_ROLES = (s) => ["scheme_manager", "coding_expert", "statistics_expert", "technical_expert", "reviewer"].map((r) => `${r}@${s}`).join(",");
S.PA = await persona(new Session("PA"), `model=${ALL_ROLES(A)}`);
S.PB = await persona(new Session("PB"), `model=${ALL_ROLES(B)}`);
S.CEA = await persona(new Session("CEA"), `model=coding_expert@${A}`);

// organisation participations: the copy of E1 by PA (a positive control of freezeParticipationAction), E2/E3 by PTS
const fz1 = await act(S.PA, "freezeParticipationAction", [{ schemeId: A, participantId: P.pE1.pid, laboratoryId: ORG.E1.lab, contactUserId: ORG.E1.user }]);
check("pos", "freezeParticipationAction", "PA links its own A participation to E1's laboratory", val(fz1).ok, errOf(fz1));
const fz2 = await act(S.build, "freezeParticipationAction", [{ schemeId: A, participantId: P.pE2.pid, laboratoryId: ORG.E2.lab, contactUserId: ORG.E2.user }]);
const fz3 = await act(S.build, "freezeParticipationAction", [{ schemeId: B, participantId: P.pE3.pid, laboratoryId: ORG.E3.lab, contactUserId: ORG.E3.user }]);
if (!val(fz2).ok || !val(fz3).ok) throw new Error(`freeze: ${errOf(fz2)} ${errOf(fz3)}`);
for (const k of ["E1", "E2", "E3"]) { S[`U${k[1]}`] = await persona(new Session(`U${k[1]}`), `role=participant&user=${ORG[k].user}`); }

// both schemes run, with their final lists (the round's acts)
for (const s of [A, B]) {
  const a = await act(S.build, "lifecycleActAction", [s, "announce", ""]);
  const b = await act(S.build, "secondAnnouncementAction", [s, { runs: [0], note: "" }]);
  if (!val(a).ok || !val(b).ok) throw new Error(`acts in ${s}: ${errOf(a)} ${errOf(b)}`);
}

// objects in A and in B
const OBJ = {};
const caseEvent = async (who, s, code, mark) => {
  const r = await act(who, "addCaseEventAction", [form({ schemeId: s, code, kind: "other", at: today, note: mark, returnTo: "" })]);
  return r;
};
const voidIds = async (s, code) => [...(await get(S.build, `/schemes/${s}/participants/${code}`)).text.matchAll(/name="id" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
for (const [s, k] of [[A, "A"], [B, "B"]]) {
  const before = await voidIds(s, P[`p${k}`].code);
  await caseEvent(S.build, s, P[`p${k}`].code, M(`ev${k}`));
  OBJ[`ev${k}`] = (await voidIds(s, P[`p${k}`].code)).find((x) => !before.includes(x));
  // two revisions of the plan
  for (const n of [1, 2]) {
    const r = await act(S.build, "saveDocHtmlAction", [s, "plan", { bg: `<p>${M(`rev${k}${n}`)}</p>`, en: `<p>${M(`rev${k}${n}`)}</p>` }]);
    if (!val(r).ok) throw new Error(`plan in ${s}: ${errOf(r)}`);
  }
  const hist = (await get(S.build, `/schemes/${s}/build/plan/history`)).text;
  const revs = [...new Set([...hist.matchAll(/rev=([0-9a-f-]{36})/g)].map((m) => m[1]))]; // newest first
  OBJ[`rev${k}2`] = revs[0]; OBJ[`rev${k}1`] = revs[1];
  const ed = await act(S.build, "issueEditionAction", [s, "plan", { reason: "T4 edition" }]);
  OBJ[`ed${k}`] = [...(await get(S.build, `/schemes/${s}/editions`)).text.matchAll(new RegExp(`/schemes/${s}/editions/([0-9a-f-]{36})`, "g"))].map((m) => m[1])[0];
  if (!OBJ[`ed${k}`]) log(`(no edition in ${s}: ${errOf(ed)})`);
  const bt = await act(S.build, "createBatchAction", [s, { label: `T4-${k}`, material: "T4 material", preparedOn: today, storage: "T4", count: 3, prefix: `T4${k}` }]);
  OBJ[`batch${k}`] = val(bt).id;
  if (!OBJ[`batch${k}`]) throw new Error(`batch in ${s}: ${errOf(bt)}`);
}
{ const r = await act(S.build, "saveDocHtmlAction", [A, "instruction", { bg: `<p>${M("instrA")}</p>`, en: `<p>${M("instrA")}</p>` }]); if (!val(r).ok) throw new Error(`instruction in A: ${errOf(r)}`); }
// proformas: L2's in A and L3's in B by PTS; L1's in A by PA (a positive control)
const proforma = async (who, s, code, mark) => act(who, "uploadLabDocAction", [form({ schemeId: s, code, slot: "proforma", number: `PF-${mark.slice(-6)}`, file: pdf(mark) })]);
for (const [s, k] of [[A, "L2"], [B, "L3"]]) { const r = await proforma(S.build, s, P[k].code, M(`pf${k}`)); if (!val(r).ok) throw new Error(`proforma ${k}: ${errOf(r)}`); }
const pf1 = await proforma(S.PA, A, P.L1.code, M("pfL1"));
check("pos", "uploadLabDocAction", "PA uploads a proforma for its own A participation (L1)", val(pf1).ok, errOf(pf1));
// protocols: each laboratory its own (L1's is a positive control of labUploadDocAction)
const protocol = async (k, s) => act(S[k], "labUploadDocAction", [form({ schemeId: s, participantId: P[k].pid, slot: "protocol", back: `/lab/p/${P[k].pid}`, file: pdf(M(`pr${k}`)) })]);
for (const [k, s] of [["L1", A], ["L2", A], ["L3", B]]) {
  const r = await protocol(k, s);
  if (k === "L1") check("pos", "labUploadDocAction", "L1 uploads its own protocol", r.redirect.startsWith(`/lab/p/${P.L1.pid}`) && !/e=/.test(r.redirect), errOf(r));
}
// a release to one participation in B (L3), its id from B's page
const releaseIds = async (s) => [...new Set([...(await get(S.build, `/schemes/${s}/editions`)).text.replace(/\\"/g, '"').matchAll(/"releaseId":"([0-9a-f-]{36})"/g)].map((m) => m[1]))];
{
  const r0 = await act(S.build, "saveDocHtmlAction", [B, "instruction", { bg: `<p>${M("instrB")}</p>`, en: `<p>${M("instrB")}</p>` }]);
  const r1 = await act(S.build, "releaseDocToAction", [B, "instruction", { level: "participation", participantId: P.L3.pid }, { reason: "T4" }]);
  OBJ.releaseB = (await releaseIds(B))[0];
  if (!OBJ.releaseB) log(`(no release in B: ${errOf(r0)} ${errOf(r1)})`);
}
// a shipment and a delivery problem — L3's in B, L1's in A
const problemIds = async (s) => [...(await get(S.build, `/deliveries?scheme=${s}`)).text.matchAll(/data-problem="([0-9a-f-]{36})" data-problem-open="(\d)"/g)].map((m) => ({ id: m[1], open: m[2] === "1" }));
for (const [s, k] of [[B, "L3"], [A, "L1"]]) {
  const d = await act(S.build, "dispatchAction", [form({ schemeId: s, participantId: P[k].pid, kind: "dispatch", day: today, waybill: `T4WB${k}`, carrier: "T4 Куриер" })]);
  const pr = await act(S[k], "reportDeliveryProblemAction", [form({ schemeId: s, participantId: P[k].pid, text: `T4 problem ${k}` })]);
  OBJ[`problem${k}`] = (await problemIds(s))[0]?.id;
  if (!OBJ[`problem${k}`]) log(`(no delivery problem of ${k}: ${errOf(d)} ${errOf(pr)})`);
}
// held notices (the final lists told the laboratories): one of A's, one of B's
const heldIds = async (who) => [...new Set([...(await get(who, "/notices")).text.matchAll(/name="id" value="([0-9a-f-]{36})"/g)].map((m) => m[1]))];
const heldB0 = await heldIds(S.PB), heldA0 = await heldIds(S.PA);
OBJ.noticeB = heldB0.find((x) => !heldA0.includes(x));
OBJ.noticeA = heldA0.find((x) => !heldB0.includes(x));
log("world ready", JSON.stringify({ P: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.code])), OBJ }));

// the rest of the pages that carry actions — the lab's and the organisation's
for (const [who, p] of [[S.L1, "/lab"], [S.L1, `/lab/p/${P.L1.pid}`], [S.L1, `/lab/p/${P.L1.pid}/results`], [S.U1, "/lab/confirm"], [S.U1, "/lab/apply"], [S.U1, "/lab/catalogue"], [S.build, `/schemes/${A}/participants/${P.pA.code}`]]) await harvest(who, p);
namesFromManifest();

// ── 2. B as it is, before anything is tried ─────────────────────────────────
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const B_PAGES = [`/schemes/${B}/participants/${P.pB.code}`, `/schemes/${B}/batches`, `/schemes/${B}/build/plan/history`, `/schemes/${B}/participants`];
const snapshotB = async () => {
  const out = {};
  const j = await get(S.build, `/activity?scheme=${encodeURIComponent(B)}`);
  // B's journal: the acts' badges, except the reads the snapshot itself makes (a file opened, names
  // shown) — counted by badge, since the page streams and a row's cells may arrive apart
  const badges = [...j.text.matchAll(/background:var\(--green-light\);border-radius:999px;padding:2px 8px;margin-right:8px">([^<]+)<\/span>/g)].map((m) => m[1]);
  out.journal = JSON.stringify(Object.entries(badges.filter((b) => !/Изтеглен файл|Показани имена|File downloaded|Names shown/i.test(b)).reduce((a, b) => ({ ...a, [b]: (a[b] ?? 0) + 1 }), {})).sort());
  for (const p of B_PAGES) out[p] = createHash("sha1").update(strip((await get(S.build, p)).text)).digest("hex");
  for (const p of [`/schemes/${B}/lab-docs/${P.L3.code}/proforma`, `/schemes/${B}/lab-uploads/${P.L3.code}/protocol`]) out[p] = createHash("sha1").update((await get(S.build, p)).body).digest("hex");
  return out;
};
const snap0 = await snapshotB();
const snap1 = await snapshotB();
const stableKeys = Object.keys(snap0).filter((k) => snap0[k] === snap1[k]);
log("B snapshot taken; stable:", stableKeys.length, "of", Object.keys(snap0).length, Object.keys(snap0).filter((k) => !stableKeys.includes(k)).join(" "));

// ── 3. NEGATIVES: B's objects, from a person whose rights are all in A ──────
const PA = S.PA;
const neg = async (entry, name, fn, refused) => {
  try { const r = await fn(); const ok = refused(r); check("neg", entry, name, ok, r.redirect !== undefined ? errOf(r) : `${r.status} ${r.location ?? ""}`); return r; }
  catch (e) { check("neg", entry, name, false, `threw: ${e.message}`); }
};
const fd = form;
const notOk = (r) => !val(r).ok;

// gates first: B by its own id (the static test checks they exist; this checks they answer)
for (const path of [`/schemes/${B}`, `/schemes/${B}/participants/${P.pB.code}`, `/schemes/${B}/build/plan/print?lang=bg`, `/schemes/${B}/lab-docs/${P.L3.code}/proforma`, `/schemes/${B}/export`, ...(OBJ.edB ? [`/schemes/${B}/editions/${OBJ.edB}`] : []), `/invoices/export?scheme=${B}`]) {
  await neg("gate", `GET ${path.replace(B, "B")}`, () => get(PA, path), refusedGate);
}
await neg("api/pdf", "POST /api/pdf for B", async () => { const r = await fetch(`${BASE}/api/pdf`, { method: "POST", headers: { Cookie: PA.cookie(), "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ id: B, doc: "plan", lang: "bg" }), redirect: "manual" }); await r.arrayBuffer(); return { status: r.status, location: r.headers.get("location") ?? "" }; }, refusedGate);
await neg("addCaseEventAction", "scheme B named outright", () => act(PA, "addCaseEventAction", [fd({ schemeId: B, code: P.pB.code, kind: "other", at: today, note: M("n0") })]), (r) => r.redirect === "/denied");

// object ids of B under scheme A
await neg("addCaseEventAction (fetch)", "A + B's code", () => act(PA, "addCaseEventAction", [fd({ schemeId: A, code: P.pB.code, kind: "other", at: today, note: M("n1") })]), (r) => r.redirect === `/schemes/${A}/participants`);
await neg("addCaseEventAction (no-JS form)", "A + B's code", () => actNoJs(PA, "addCaseEventAction", { schemeId: A, code: P.pB.code, kind: "other", at: today, note: M("n1b") }, { page: `/schemes/${A}/participants/${P.pA.code}` }), (r) => r.status === 303 && r.location === `/schemes/${A}/participants`);
await neg("voidCaseEventAction", "B's step, A + B's code", () => act(PA, "voidCaseEventAction", [fd({ id: OBJ.evB, schemeId: A, code: P.pB.code, reason: "T4 void" })]), (r) => !!r.redirect && !/void=/.test(r.redirect));
await neg("voidCaseEventAction", "B's step, A + A's code", () => act(PA, "voidCaseEventAction", [fd({ id: OBJ.evB, schemeId: A, code: P.pA.code, reason: "T4 void" })]), (r) => !!r.redirect && !/void=/.test(r.redirect));
await neg("updateParticipantAction", "B's participation", () => act(PA, "updateParticipantAction", [fd({ schemeId: A, id: P.pB.pid, labName: M("n3"), sel_0: "1" })]), (r) => r.redirect === `/schemes/${A}/participants`);
await neg("setParticipantPaidAction", "B's code", () => act(PA, "setParticipantPaidAction", [A, P.pB.code, true]), (r) => notOk(r));
await neg("setParticipationStandingAction", "B's participation", () => act(PA, "setParticipationStandingAction", [{ schemeId: A, participantId: P.pB.pid, state: "withdrawn", reason: "T4 reason text", source: "T4 source text" }]), (r) => /Не е намерено/.test(val(r).error ?? ""));
await neg("approveDocRevisionAction", "B's revision", () => act(PA, "approveDocRevisionAction", [fd({ id: OBJ.revB1, schemeId: A, docKey: "plan" })]), (r) => r.redirect === `/schemes/${A}/build/plan/history`);
await neg("restoreDocRevisionAction", "B's revision", () => act(PA, "restoreDocRevisionAction", [fd({ id: OBJ.revB1, schemeId: A, docKey: "plan" })]), (r) => r.redirect === `/schemes/${A}/build/plan/history`);
for (const sid of [undefined, null]) {
  await neg("saveDocHtmlAction", `scheme ${sid} (requireDocWriter's library branch)`, () => act(PA, "saveDocHtmlAction", [sid, "plan", { bg: `<p>${M("n8")}</p>`, en: "" }]), (r) => !val(r).ok);
  await neg("setDocReadyAction", `scheme ${sid}`, () => act(PA, "setDocReadyAction", [sid, "plan", true]), (r) => !val(r).ok);
  await neg("setDocSourceAction", `scheme ${sid}`, () => act(PA, "setDocSourceAction", [sid, "plan", "built"]), (r) => !val(r).ok);
}
await neg("saveDocHtmlAction", "scheme B", () => act(PA, "saveDocHtmlAction", [B, "plan", { bg: `<p>${M("n8")}</p>`, en: "" }]), (r) => r.redirect === "/denied");
await neg("sendParticipationMessageAction", "B's code", () => act(PA, "sendParticipationMessageAction", [fd({ schemeId: A, code: P.pB.code, bg: "T4 съобщение", en: "T4 message", nonce: randomUUID() })]), (r) => /msg=who/.test(r.redirect));
await neg("unlockResultsAction", "B's code", () => act(PA, "unlockResultsAction", [fd({ schemeId: A, code: P.pB.code, until: today, reason: "T4 unlock reason" })]), (r) => /unlock=(who|state)/.test(r.redirect));
await neg("recordReviewNoteAction", "B's code", () => act(PA, "recordReviewNoteAction", [fd({ schemeId: A, code: P.pB.code, text: M("n11") })]), (r) => /note=state/.test(r.redirect));
await neg("recordCorrectionAction", "B's code", () => act(PA, "recordCorrectionAction", [fd({ schemeId: A, code: P.pB.code, nonce: randomUUID(), version: "1", reason: "T4" })]), (r) => /corr=(state|failed)/.test(r.redirect));
await neg("dispatchAction", "B's participation", () => act(PA, "dispatchAction", [fd({ schemeId: A, participantId: P.pB.pid, kind: "dispatch", day: today, waybill: "T4" })]), (r) => /err=participation/.test(r.redirect));
for (const [fn, args] of [["drawBatchAction", [A, OBJ.batchB, { reference: 1 }]], ["updateBatchAction", [A, OBJ.batchB, { label: "T4-X", material: M("n14"), preparedOn: today, storage: "x", count: 3, prefix: "T4X" }]], ["setBatchRecordAction", [A, OBJ.batchB, M("n14")]], ["addHomogeneityAction", [A, OBJ.batchB, "T4B-1 1.0"]]]) {
  await neg(fn, "B's batch", () => act(PA, fn, args), (r) => /Не е намерено/.test(val(r).error ?? ""));
}
await neg("addCarrierOfferAction", "B's participation", () => act(PA, "addCarrierOfferAction", [A, P.pB.pid, { carrier: "T4 Куриер", price: "10" }]), (r) => /Не е намерено/.test(val(r).error ?? ""));
await neg("admitFromWaitlistAction", "B's participation", () => act(PA, "admitFromWaitlistAction", [A, P.pB.pid]), (r) => notOk(r));
await neg("releaseDocToAction", "B's participation", () => act(PA, "releaseDocToAction", [A, "instruction", { level: "participation", participantId: P.pB.pid }, { reason: "T4" }]), (r) => /не е в кръга на схемата/.test(val(r).error ?? ""));
await neg("releaseDocToAction", "B's organisation user (E3, active)", () => act(PA, "releaseDocToAction", [A, "instruction", { level: "user", userId: ORG.E3.user }, { reason: "T4" }]), (r) => /потребителят не е от юридическо лице/.test(val(r).error ?? ""));
await neg("freezeParticipationAction", "B's participation", () => act(PA, "freezeParticipationAction", [{ schemeId: A, participantId: P.pB.pid, laboratoryId: ORG.E1.lab }]), (r) => notOk(r));
await neg("uploadLabDocAction", "B's code", () => proforma(PA, A, P.L3.code, M("n19")), (r) => /Няма такъв участник/.test(val(r).error ?? ""));
await neg("removeLabDocAction", "B's code — refused before anything is written (A2)", () => act(PA, "removeLabDocAction", [fd({ schemeId: A, code: P.L3.code, slot: "proforma" })]), (r) => /Няма такъв участник/.test(val(r).error ?? ""));
const CERT = (code) => ({ schemeId: A, code, bg_name: M("n21"), en_name: M("n21"), scope: "x", typedAt: new Date().toISOString(), date: today, lang: "bg" });
for (const fn of ["recordCertContentAction", "checkCertContentAction", "releaseCertificateAction"]) {
  await neg(fn, "B's code", () => act(PA, fn, [fd(CERT(P.pB.code))]), (r) => /cert=code/.test(r.redirect));
}
await neg("issueCertificateAction", "B's code", () => act(PA, "issueCertificateAction", [fd({ schemeId: A, code: P.pB.code, no: "T4-1", date: "13.11.2026", inRegister: "on" })]), (r) => val(r).error === "no-participant");
if (OBJ.releaseB) await neg("withdrawReleaseAction", "B's release", () => act(PA, "withdrawReleaseAction", [A, OBJ.releaseB]), (r) => notOk(r));
else check("inconclusive", "withdrawReleaseAction", "no release of B to try", false, "");
if (OBJ.problemL3) await neg("resolveDeliveryProblemAction", "B's delivery problem", () => act(PA, "resolveDeliveryProblemAction", [fd({ schemeId: A, participantId: P.L3.pid, problemId: OBJ.problemL3, note: "T4 resolved" })]), (r) => /err=problem/.test(r.redirect));
else check("inconclusive", "resolveDeliveryProblemAction", "no delivery problem of B to try", false, "");
S.HEAD = await persona(new Session("HEAD"), "model=head");
const EXT = { key: "results", until: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), orderNo: "T4-1", orderDate: today, reason: "T4 extension reason" };
await neg("grantExtensionAction", "the head: A + B's code (the right is everywhere; the object must still be A's)", () => act(S.HEAD, "grantExtensionAction", [A, P.pB.code, EXT]), (r) => /Няма такъв участник/.test(val(r).error ?? ""));
if (OBJ.noticeB) await neg("decideNoticeAction", "B's held notice", () => act(PA, "decideNoticeAction", [fd({ id: OBJ.noticeB, decision: "withhold" })]), (r) => r.redirect === "/notices");
else check("inconclusive", "decideNoticeAction", "no held notice of B found to try", false, "");

// routes and pages: A in the path, B's object in the id
if (OBJ.edB) await neg("editions/[edition]", "A + B's edition", () => get(PA, `/schemes/${A}/editions/${OBJ.edB}`), (x) => x.status === 404);
await neg("build/[doc]/print?rev", "A + B's revision", () => get(PA, `/schemes/${A}/build/plan/print?lang=bg&rev=${OBJ.revB1}`), (x) => x.status === 200 && !x.text.includes(M("revB1")));
await neg("doc/[doc]/print?p", "A's certificate + B's code", () => get(PA, `/schemes/${A}/doc/certificate/print?lang=bg&p=${P.L3.code}`), (x) => !x.text.includes(LAB.L3.name) && !x.text.includes(M("L3name")));
await neg("lab-docs/[code]/[slot]", "A + B's code", () => get(PA, `/schemes/${A}/lab-docs/${P.L3.code}/proforma`), (x) => x.status === 404);
await neg("lab-uploads/[code]/[slot]", "A + B's code", () => get(PA, `/schemes/${A}/lab-uploads/${P.L3.code}/protocol`), (x) => x.status === 404);
await neg("participants/[code] page", "A + B's code", () => get(PA, `/schemes/${A}/participants/${P.pB.code}`), notFoundPage);
await neg("participants/[code]/v/[n] page", "A + B's code", () => get(PA, `/schemes/${A}/participants/${P.pB.code}/v/1`), notFoundPage);
await neg("deliveries page", "?scheme=B&p=B's participation", () => get(PA, `/deliveries?scheme=${B}&p=${P.pB.pid}`), (x) => !x.text.includes(`data-deliveries-scheme="${B}"`) && !x.text.includes(`data-delivery-row="${P.pB.pid}"`));
await neg("activity page", "?scheme=B", () => get(PA, `/activity?scheme=${B}`), (x) => x.status === 200 && !x.text.includes(`href="/schemes/${B}"`));
await neg("invoices page", "?scheme=B", () => get(PA, `/invoices?scheme=${B}`), (x) => !x.text.includes(M("pB")) && !x.text.includes(LAB.L3.name));

// a laboratory: L1, on L2's participation (same scheme) and L3's (scheme B)
const L1 = S.L1;
for (const [k, s] of [["L2", A], ["L3", B]]) {
  await neg("lab/p/[id] page", `L1 opens ${k}'s participation`, () => get(L1, `/lab/p/${P[k].pid}`), notFoundPage);
  await neg("lab/p/[id]/results page", `L1 opens ${k}'s results`, () => get(L1, `/lab/p/${P[k].pid}/results`), notFoundPage);
  await neg("saveResultDraftAction", `L1 on ${k}'s participation`, () => act(L1, "saveResultDraftAction", [s, P[k].pid, {}, 0]), (r) => val(r).error === "not-yours");
  await neg("submitResultsAction", `L1 on ${k}'s participation`, () => act(L1, "submitResultsAction", [s, P[k].pid, 1, {}]), (r) => val(r).error === "not-yours");
  await neg("giveFeedbackAction", `L1 on ${k}'s participation`, () => act(L1, "giveFeedbackAction", [P[k].pid, fd({ q1: "5" })]), (r) => /Не е намерено/.test(val(r).error ?? ""));
  await neg("chooseCarrierAction", `L1 on ${k}'s participation`, () => act(L1, "chooseCarrierAction", [P[k].pid, randomUUID()]), (r) => /Не е намерено/.test(val(r).error ?? ""));
  for (const fn of ["submitReceiptAction", "reportDeliveryProblemAction", "acknowledgeDocAction"]) {
    await neg(fn, `L1 on ${k}'s participation`, () => act(L1, fn, [fd({ schemeId: s, participantId: P[k].pid, shipmentId: "", docKey: "plan", editionId: "", text: "T4" })]), (r) => r.redirect === "/lab");
  }
  await neg("labUploadDocAction", `L1 uploads into ${k}'s participation`, () => act(L1, "labUploadDocAction", [fd({ schemeId: s, participantId: P[k].pid, slot: "protocol", back: `/lab/p/${P[k].pid}`, file: pdf(M("n-up")) })]), (r) => r.redirect === "/lab");
}
await neg("lab/labdoc route", "L1 asks for L2's proforma (?p)", () => get(L1, `/lab/labdoc/${A}/proforma?p=${P.L2.pid}`), (x) => !x.text.includes(M("pfL2")));
await neg("lab/upload route", "L1 asks for L2's protocol (?p)", () => get(L1, `/lab/upload/${A}/protocol?p=${P.L2.pid}`), (x) => !x.text.includes(M("prL2")));
await neg("lab/labdoc route", "L1 asks in scheme B", () => get(L1, `/lab/labdoc/${B}/proforma?p=${P.L3.pid}`), (x) => x.status >= 400 && !x.text.includes(M("pfL3")));
await neg("lab/upload route", "L1 asks in scheme B", () => get(L1, `/lab/upload/${B}/protocol?p=${P.L3.pid}`), (x) => x.status >= 400 && !x.text.includes(M("prL3")));
await neg("lab/doc route", "L1 asks for B's plan", () => get(L1, `/lab/doc/${B}/plan?p=${P.L3.pid}`), (x) => x.status >= 400);

// an organisation's user: U1 (admin of E1) on E2's participation and laboratory
const U1 = S.U1;
await neg("lab/p/[id] page", "U1 opens E2's participation", () => get(U1, `/lab/p/${P.pE2.pid}`), notFoundPage);
await neg("saveResultDraftAction", "U1 on E2's participation", () => act(U1, "saveResultDraftAction", [A, P.pE2.pid, {}, 0]), (r) => val(r).error === "not-yours");
await neg("chooseCarrierAction", "U1 on E2's participation", () => act(U1, "chooseCarrierAction", [P.pE2.pid, randomUUID()]), (r) => /Не е намерено/.test(val(r).error ?? ""));
await neg("lab/overview page", "U1 asks ?lab=E2's laboratory", () => get(U1, `/lab/overview?lab=${ORG.E2.lab}`), (x) => !x.text.includes(ORG.E2.labName));
await neg("lab/labdoc route", "U1 asks for E2's (?p)", () => get(U1, `/lab/labdoc/${A}/proforma?p=${P.pE2.pid}`), (x) => !x.text.includes(M("pE2")));
const applyPage = (await get(U1, `/lab/apply/${C}`)).text.replace(/\\"/g, '"');
const paramSig = applyPage.match(/"signature":"([^"]*)"/)?.[1] ?? "";
await neg("labApplyAction", "U1 applies with E2's laboratory", () => act(U1, "labApplyAction", [fd({ schemeId: C, laboratoryId: ORG.E2.lab, sel_0: "1", paramSig })]), (r) => /изберете една от активните лаборатории/.test(val(r).error ?? ""));
const prof = await act(U1, "saveProfileAction", [{ correspondenceAddress: "ул. Измислена E1", mol: "", language: "bg", [`lab_${ORG.E1.lab}_name`]: M("o3pos"), [`lab_${ORG.E1.lab}_deliveryAddress`]: "ул. Доставка E1", [`lab_${ORG.E2.lab}_name`]: M("o3neg"), [`lab_${ORG.E2.lab}_deliveryAddress`]: "x", ownName: "Потребител E1" }, false]);
const orgsAfter = (await get(S.build, "/organizations")).text;
check("neg", "saveProfileAction", "U1's save names E2's laboratory — E2's laboratory unchanged", !orgsAfter.includes(M("o3neg")), errOf(prof));
check("pos", "saveProfileAction", "…while its own laboratory is renamed", val(prof).ok && orgsAfter.includes(M("o3pos")), errOf(prof));

// the HOLE runRemindersNowAction: scheme.edit anywhere → every scheme's reminders
{
  const r = await act(PA, "runRemindersNowAction", []);
  if (val(r).error === "not-test") check("latent", "runRemindersNowAction", "not the test environment here — the run by hand's scope is checked by clock.test (A1)", false, "returned not-test");
  else check("neg", "runRemindersNowAction", "PA (scheme.edit in A only) must not raise reminders for every scheme", !val(r).ok, errOf(r));
}

// ── 4. B unchanged after all of it ───────────────────────────────────────────
const snap2 = await snapshotB();
for (const k of stableKeys) check("neg", "B unchanged", `B after the negatives: ${k.replace(B, "B")}`, snap2[k] === snap0[k], `${snap0[k]} → ${snap2[k]}`);
// …and the specific marks
const bIntact = async (when) => {
  const bCase = (await get(S.build, `/schemes/${B}/participants/${P.pB.code}`)).text;
  check("neg", "B unchanged", "B's timeline: no mark from A, its step still voidable", !bCase.includes(M("n1")) && !bCase.includes(M("n1b")) && bCase.includes(`value="${OBJ.evB}"`));
  const bParts = (await get(S.build, `/schemes/${B}/participants`)).text;
  check("neg", "B unchanged", "B's participation: not renamed, not withdrawn", !bParts.includes(M("n3")) && bParts.includes(M("pB")));
  const bHist = (await get(S.build, `/schemes/${B}/build/plan/history`)).text;
  check("neg", "B unchanged", "B's revision not approved by A", !between(bHist, `rev=${OBJ.revB1}`).includes("✓"));
  const bPlan = (await get(S.build, `/schemes/${B}/build/plan/print?lang=bg`)).text;
  check("neg", "B unchanged", "B's plan: none of A's saves", !bPlan.includes(M("n8")) && bPlan.includes(M("revB2")));
  const bBatch = (await get(S.build, `/schemes/${B}/batches`)).text;
  check("neg", "B unchanged", "B's batch: record not written from A", !bBatch.includes(M("n14")));
  const bPf = await get(S.build, `/schemes/${B}/lab-docs/${P.L3.code}/proforma`);
  check("neg", "B unchanged", "B's proforma still there after removeLabDocAction(A, B's code)", bPf.status === 200 && bPf.text.includes(M("pfL3")), bPf.status);
  const l2pr = await get(S.build, `/schemes/${A}/lab-uploads/${P.L2.code}/protocol`);
  check("neg", "L2 unchanged", "L2's protocol is still L2's after L1's attempts", l2pr.status === 200 && l2pr.text.includes(M("prL2")), l2pr.status);
  if (OBJ.noticeB) check("neg", "B unchanged", "B's held notice still held after A's decision", (await heldIds(S.PB)).includes(OBJ.noticeB));
  if (OBJ.releaseB) check("neg", "B unchanged", "B's release still in force after A's withdrawal", (await releaseIds(B)).includes(OBJ.releaseB));
  if (OBJ.problemL3) check("neg", "B unchanged", "B's delivery problem still open after A's resolution", (await problemIds(B)).find((x) => x.id === OBJ.problemL3)?.open === true);
  const journalA = (await get(S.build, `/activity?scheme=${A}`)).text;
  if (when === "negatives") check("neg", "removeLabDocAction", "A's journal says nothing was removed for B's code (A2)", !journalA.includes(`removed for ${P.L3.code}`), "journal line written for B's code");
};
await bIntact("negatives");

// the detector itself: a real write to B (by B's own people) shows in the snapshot
{
  await act(S.PB, "setBatchRecordAction", [B, OBJ.batchB, M("selftest")]);
  const snap3 = await snapshotB();
  check("pos", "B snapshot (self-test)", "a write to B by B's own manager changes the snapshot", Object.keys(snap0).some((k) => snap3[k] !== snap2[k]), "no change seen");
}

// ── 5. POSITIVES: the same acts on the person's own objects get past the refusal ──
const pos = async (entry, name, fn, passed) => {
  try { const r = await fn(); check("pos", entry, name, passed(r), r.redirect !== undefined ? errOf(r) : `${r.status} ${r.location ?? ""}`); return r; }
  catch (e) { check("pos", entry, name, false, `threw: ${e.message}`); }
};
await pos("addCaseEventAction (fetch)", "A + A's code", () => act(PA, "addCaseEventAction", [fd({ schemeId: A, code: P.pA.code, kind: "other", at: today, note: M("p1") })]), (r) => r.redirect === `/schemes/${A}/participants/${P.pA.code}`);
await pos("addCaseEventAction (no-JS form)", "A + A's code", () => actNoJs(PA, "addCaseEventAction", { schemeId: A, code: P.pA.code, kind: "other", at: today, note: M("p1b") }, { page: `/schemes/${A}/participants/${P.pA.code}` }), (r) => r.status === 303 && r.location === `/schemes/${A}/participants/${P.pA.code}`);
await pos("voidCaseEventAction", "A's step", () => act(PA, "voidCaseEventAction", [fd({ id: OBJ.evA, schemeId: A, code: P.pA.code, reason: "T4 void" })]), (r) => !!r.redirect && !/void=/.test(r.redirect));
{
  const aCase = (await get(S.build, `/schemes/${A}/participants/${P.pA.code}`)).text;
  check("pos", "addCaseEventAction", "A's timeline shows both A steps", aCase.includes(M("p1")) && aCase.includes(M("p1b")));
  check("pos", "voidCaseEventAction", "A's step is no longer voidable (voided)", !aCase.includes(`value="${OBJ.evA}"`));
}
await pos("updateParticipantAction", "A's participation", () => act(PA, "updateParticipantAction", [fd({ schemeId: A, id: P.pA.pid, labName: M("p3"), sel_0: "1" })]), (r) => r.redirect === `/schemes/${A}/participants`);
check("pos", "updateParticipantAction", "A's participation renamed", (await get(S.build, `/schemes/${A}/participants`)).text.includes(M("p3")));
await pos("setParticipantPaidAction", "A's code", () => act(PA, "setParticipantPaidAction", [A, P.L1.code, true]), (r) => val(r).ok);
await pos("setParticipationStandingAction", "A's participation", () => act(PA, "setParticipationStandingAction", [{ schemeId: A, participantId: P.pA2.pid, state: "withdrawn", reason: "T4 reason text", source: "T4 source text" }]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
await pos("approveDocRevisionAction", "A's revision", () => act(PA, "approveDocRevisionAction", [fd({ id: OBJ.revA1, schemeId: A, docKey: "plan" })]), (r) => r.redirect === `/schemes/${A}/build/plan/history`);
check("pos", "approveDocRevisionAction", "A's revision approved", between((await get(S.build, `/schemes/${A}/build/plan/history`)).text, `rev=${OBJ.revA1}`).includes("✓"));
await pos("build/[doc]/print?rev", "A + A's earlier revision", () => get(PA, `/schemes/${A}/build/plan/print?lang=bg&rev=${OBJ.revA1}`), (x) => x.status === 200 && x.text.includes(M("revA1")));
await pos("restoreDocRevisionAction", "A's revision", () => act(PA, "restoreDocRevisionAction", [fd({ id: OBJ.revA1, schemeId: A, docKey: "plan" })]), (r) => r.redirect === `/schemes/${A}/build/plan/history`);
check("pos", "restoreDocRevisionAction", "A's plan is the restored revision", (await get(S.build, `/schemes/${A}/build/plan/print?lang=bg`)).text.includes(M("revA1")));
await pos("saveDocHtmlAction", "scheme A", () => act(PA, "saveDocHtmlAction", [A, "plan", { bg: `<p>${M("p8")}</p>`, en: "" }]), (r) => val(r).ok);
await pos("sendParticipationMessageAction", "A's code", () => act(PA, "sendParticipationMessageAction", [fd({ schemeId: A, code: P.L1.code, bg: "T4 съобщение", en: "T4 message", nonce: randomUUID() })]), (r) => !!r.redirect && !/msg=who/.test(r.redirect));
const pUnlock = await pos("unlockResultsAction", "A's code", () => act(PA, "unlockResultsAction", [fd({ schemeId: A, code: P.L1.code, until: today, reason: "T4 unlock reason" })]), (r) => !/unlock=who/.test(r.redirect));
const pNote = await pos("recordReviewNoteAction", "A's code", () => act(PA, "recordReviewNoteAction", [fd({ schemeId: A, code: P.L1.code, text: M("p11") })]), (r) => !/note=state/.test(r.redirect));
const pCorr = await act(PA, "recordCorrectionAction", [fd({ schemeId: A, code: P.L1.code, nonce: randomUUID(), version: "1", reason: "T4" })]);
for (const fn of ["recordCertContentAction", "checkCertContentAction", "releaseCertificateAction"]) {
  await pos(fn, "A's code", () => act(PA, fn, [fd(CERT(P.L1.code))]), (r) => !!r.redirect && !/cert=code/.test(r.redirect));
}
await pos("issueCertificateAction", "A's code", () => act(PA, "issueCertificateAction", [fd({ schemeId: A, code: P.L1.code, no: "T4-1", date: "13.11.2026", inRegister: "on" })]), (r) => val(r).error !== "no-participant");
await pos("dispatchAction", "A's participation", () => act(PA, "dispatchAction", [fd({ schemeId: A, participantId: P.pA.pid, kind: "dispatch", day: today, waybill: "T4" })]), (r) => !/err=participation/.test(r.redirect));
await pos("setBatchRecordAction", "A's batch", () => act(PA, "setBatchRecordAction", [A, OBJ.batchA, M("p14")]), (r) => val(r).ok);
check("pos", "setBatchRecordAction", "A's batch record shown", (await get(S.build, `/schemes/${A}/batches`)).text.includes(M("p14")));
await pos("drawBatchAction", "A's batch", () => act(PA, "drawBatchAction", [A, OBJ.batchA, { reference: 1 }]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
await pos("addCarrierOfferAction", "A's participation", () => act(PA, "addCarrierOfferAction", [A, P.L1.pid, { carrier: "T4 Куриер", price: "10" }]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
await pos("releaseDocToAction", "A's participation", () => act(PA, "releaseDocToAction", [A, "instruction", { level: "participation", participantId: P.L1.pid }, { reason: "T4" }]), (r) => !/не е в кръга на схемата|потребителят не е от/.test(val(r).error ?? "") && (val(r).ok || !!val(r).needsNote || !!val(r).error));
await pos("releaseDocToAction", "A's organisation user (E1)", () => act(PA, "releaseDocToAction", [A, "instruction", { level: "user", userId: ORG.E1.user }, { reason: "T4" }]), (r) => !/не е в кръга на схемата|потребителят не е от/.test(val(r).error ?? "") && (val(r).ok || !!val(r).needsNote || !!val(r).error));
{
  const relA = (await releaseIds(A))[0];
  if (relA) await pos("withdrawReleaseAction", "A's release", () => act(PA, "withdrawReleaseAction", [A, relA]), (r) => val(r).ok);
  else check("pos", "withdrawReleaseAction", "a release of A to withdraw (made by the releaseDocToAction control)", false, "none found");
}
if (OBJ.problemL1) {
  await pos("resolveDeliveryProblemAction", "A's delivery problem", () => act(PA, "resolveDeliveryProblemAction", [fd({ schemeId: A, participantId: P.L1.pid, problemId: OBJ.problemL1, note: "T4 resolved" })]), (r) => /ok=resolved/.test(r.redirect));
  check("pos", "resolveDeliveryProblemAction", "A's problem resolved", (await problemIds(A)).find((x) => x.id === OBJ.problemL1)?.open === false);
}
await pos("grantExtensionAction", "the head: A + A's code", () => act(S.HEAD, "grantExtensionAction", [A, P.L1.code, EXT]), (r) => !/Няма такъв участник/.test(val(r).error ?? ""));
if (OBJ.noticeA) {
  await pos("decideNoticeAction", "A's held notice", () => act(PA, "decideNoticeAction", [fd({ id: OBJ.noticeA, decision: "withhold" })]), (r) => r.redirect === "/notices");
  check("pos", "decideNoticeAction", "A's notice decided (no longer held)", !(await heldIds(PA)).includes(OBJ.noticeA));
}
if (OBJ.edA) await pos("editions/[edition]", "A + A's edition", () => get(PA, `/schemes/${A}/editions/${OBJ.edA}`), (x) => x.status === 200);
await pos("doc/[doc]/print?p", "A's certificate + A's code", () => get(PA, `/schemes/${A}/doc/certificate/print?lang=bg&p=${P.L1.code}`), (x) => x.status === 200 && (x.text.includes(M("L1name")) || x.text.includes(P.L1.code)));
await pos("lab-docs/[code]/[slot]", "A + A's code", () => get(PA, `/schemes/${A}/lab-docs/${P.L1.code}/proforma`), (x) => x.status === 200 && x.text.includes(M("pfL1")));
await pos("lab-uploads/[code]/[slot]", "A + A's code", () => get(PA, `/schemes/${A}/lab-uploads/${P.L1.code}/protocol`), (x) => x.status === 200 && x.text.includes(M("prL1")));
await pos("participants/[code] page", "A + A's code", () => get(PA, `/schemes/${A}/participants/${P.pA.code}`), okPage);
await pos("deliveries page", "?scheme=A", () => get(PA, `/deliveries?scheme=${A}`), (x) => x.text.includes(`data-deliveries-scheme="${A}"`));
await pos("activity page", "?scheme=A", () => get(PA, `/activity?scheme=${A}`), (x) => x.text.includes(`href="/schemes/${A}"`));
// the laboratory on its own participation
await pos("lab/p/[id] page", "L1 opens its own", () => get(L1, `/lab/p/${P.L1.pid}`), okPage);
await pos("lab/p/[id]/results page", "L1 opens its own results", () => get(L1, `/lab/p/${P.L1.pid}/results`), okPage);
await pos("saveResultDraftAction", "L1 on its own", () => act(L1, "saveResultDraftAction", [A, P.L1.pid, {}, 0]), (r) => val(r).error !== "not-yours");
await pos("submitResultsAction", "L1 on its own", () => act(L1, "submitResultsAction", [A, P.L1.pid, 1, {}]), (r) => val(r).error !== "not-yours");
await pos("giveFeedbackAction", "L1 on its own", () => act(L1, "giveFeedbackAction", [P.L1.pid, fd({ q1: "5" })]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
await pos("chooseCarrierAction", "L1 on its own", () => act(L1, "chooseCarrierAction", [P.L1.pid, randomUUID()]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
for (const fn of ["submitReceiptAction", "reportDeliveryProblemAction", "acknowledgeDocAction"]) {
  await pos(fn, "L1 on its own", () => act(L1, fn, [fd({ schemeId: A, participantId: P.L1.pid, shipmentId: "", docKey: "plan", editionId: "", text: "T4" })]), (r) => r.redirect.startsWith(`/lab/p/${P.L1.pid}`));
}
await pos("lab/labdoc route", "L1 its own proforma", () => get(L1, `/lab/labdoc/${A}/proforma?p=${P.L1.pid}`), (x) => x.status === 200 && x.text.includes(M("pfL1")));
await pos("lab/upload route", "L1 its own protocol", () => get(L1, `/lab/upload/${A}/protocol?p=${P.L1.pid}`), (x) => x.status === 200 && x.text.includes(M("prL1")));
// the organisation's user on its own
await pos("lab/p/[id] page", "U1 opens E1's own", () => get(U1, `/lab/p/${P.pE1.pid}`), okPage);
await pos("saveResultDraftAction", "U1 on E1's own", () => act(U1, "saveResultDraftAction", [A, P.pE1.pid, {}, 0]), (r) => val(r).error !== "not-yours");
await pos("chooseCarrierAction", "U1 on E1's own", () => act(U1, "chooseCarrierAction", [P.pE1.pid, randomUUID()]), (r) => !/Не е намерено/.test(val(r).error ?? ""));
await pos("lab/overview page", "U1 asks ?lab=E1's own laboratory", () => get(U1, `/lab/overview?lab=${ORG.E1.lab}`), (x) => x.text.includes(M("o3pos")) || x.text.includes(ORG.E1.labName));
if (ORG.E1.active) await pos("labApplyAction", "U1 applies with E1's laboratory", () => act(U1, "labApplyAction", [fd({ schemeId: C, laboratoryId: ORG.E1.lab, sel_0: "1", paramSig })]), (r) => val(r).ok);
else check("inconclusive", "labApplyAction", "E1 could not be made active — the positive control was not run", false, ORG.E1.activeErr);

// pairs whose refusal is a state refusal for the person's own object too: no proof either way here
const sameRefusal = (n, p, re) => re.test(n ?? "") && re.test(p ?? "");
if (sameRefusal("unlock=state", pUnlock?.redirect, /unlock=state/)) check("inconclusive", "unlockResultsAction", "the round's state refuses before the ownership check (own code too)", false, pUnlock?.redirect);
if (sameRefusal("corr=state", pCorr?.redirect, /corr=(state|failed)/)) check("inconclusive", "recordCorrectionAction", "the round's state refuses before the ownership check (own code too)", false, pCorr?.redirect);
void pNote;

// ── 6. KNOWN: labs.manage is not per scheme (R5SB-5 / UR Q2) ─────────────────
const CEA = S.CEA;
{
  const r = await act(CEA, "saveEntityAction", [{ id: ORG.E3.id, name: `Фиктивно ООД E3 ${M("k1")}`, country: "RO", eik: `T4E3${tag}`.slice(0, 20), vat: "", correspondenceAddress: "ул. Измислена E3", officialEmail: `t4-e3-${tag}@example.test`, mol: "", language: "bg" }]);
  check(STRICT_KNOWN ? "neg" : "known", "saveEntityAction", "a coding expert of A edits E3, an organisation only in B", !val(r).ok, `today: ${errOf(r)}`);
  const o = await get(CEA, "/organizations");
  check(STRICT_KNOWN ? "neg" : "known", "organizations page", "a coding expert of A reads E3 (only in B)", !o.text.includes(M("E3")) && !o.text.includes(M("k1")), `status ${o.status}`);
  const pr = await get(CEA, `/organizations/proof/${ORG.E3.id}`);
  check(STRICT_KNOWN ? "neg" : "known", "organizations/proof/[id]", "a coding expert of A opens E3's proof", pr.status !== 200, `status ${pr.status}`);
  const fo = await act(CEA, "freezeOptionsAction", [A]);
  check(STRICT_KNOWN ? "neg" : "known", "freezeOptionsAction", "participants.manage in A lists E3's laboratory (only in B)", !JSON.stringify(fo.value ?? "").includes(M("E3lab")), "listed");
}

// ── the audit's other findings, as fixed (round 9, T4 A2, A4, A5) ────────────
{
  const act0 = (await get(PA, "/activity")).text;
  const bOption = act0.match(new RegExp(`<option value="${B}">([^<]+)</option>`))?.[1];
  check("neg", "activity page", "the journal's scheme filter offers no scheme the person cannot read (A4)", !bOption, `listed: ${bOption}`);
  await act(S.build, "uploadSchemeDocAction", [form({ schemeId: A, docKey: "instruction", file: pdf(M("upA")) })]);
  const ctor = await get(PA, `/schemes/${A}/uploaded/constructor`);
  check("neg", "uploaded/[doc] route", "doc=constructor on a scheme with uploads: not found, never a 500 (A5)", ctor.status !== 500, `status ${ctor.status}`);
}

// ── 7. the action ids: taken from the pages ─────────────────────────────────
for (const [who, p] of [[S.build, `/schemes/${A}/build/plan/history`], [S.build, `/schemes/${A}/participants`], [S.build, `/schemes/${A}/participants/${P.L1.code}`], [S.build, `/schemes/${A}/results`], [S.build, `/schemes/${A}/review`], [S.build, `/schemes/${A}/doc/certificate`], [S.build, "/notices"], [S.build, `/deliveries?scheme=${A}`], [S.L1, `/lab/p/${P.L1.pid}`], [S.U1, `/lab/apply/${C}`]]) await harvest(who, p).catch(() => {});
const used = [...usedEntries].filter((n) => IDS.has(n));
const fromPage = used.filter((n) => SEEN_ON_PAGE.has(IDS.get(n)));
check("side", "action ids", `${fromPage.length} of ${used.length} actions used here were found on a page the persona opened`, true, used.filter((n) => !fromPage.includes(n)).join(", "));
} catch (e) {
  if (/terminated|fetch failed|ECONNRESET|ECONNREFUSED/.test(`${e?.message} ${e?.cause?.code ?? ""}`)) { console.error(`\nthe dev server went away mid-run (${e.message}) — rerun`); process.exit(3); }
  fail++;
  console.error("FAIL: crashed:", e?.stack ?? e?.message ?? e);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
