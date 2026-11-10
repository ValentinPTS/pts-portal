// Plan part 6.5 — reported and used values (D3; К22; the 2.0 contract's reported_*): a correction
// is a record next to a submitted version, never a change to it; the used value typed by the coding
// expert (the portal computes nothing); a reason; withdrawn, never deleted; a later version clean.
import { readFileSync } from "node:fs";
import { correctableFields, activeCorrections, readCorrection, usedValues, kNotTwo, targetOf, FIELD_LABEL, CORRECTION_PROBLEM_TEXT, type ResultCorrection } from "../src/lib/corrections-model.ts";
import { submissionPayload } from "../src/lib/submission-model.ts";
import { readDraft, readCalDraft, fieldName, calField, type ResultRow, type CalRow } from "../src/lib/results-model.ts";
import { addSubmission, addCorrection, listCorrectionsFor, correctionExists } from "../src/lib/submissions.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// a testing version: A reported (2 determinations, k = 3), B N/R, C reported without determinations
const rows: ResultRow[] = [
  { key: "ch-a", index: 0, name: { bg: "A", en: "A" }, method: { bg: "m", en: "m" }, determinations: 2, uRequired: false },
  { key: "ch-b", index: 1, name: { bg: "B", en: "B" }, method: { bg: "m", en: "m" }, determinations: 1, uRequired: false },
  { key: "ch-c", index: 2, name: { bg: "C", en: "C" }, method: { bg: "m", en: "m" }, determinations: 1, uRequired: false },
];
const typed: Record<string, string> = { [fieldName("d", "ch-a", 0)]: "51,0", [fieldName("d", "ch-a", 1)]: "5,2", [fieldName("mean", "ch-a")]: "5,1", [fieldName("U", "ch-a")]: "0,3", [fieldName("k", "ch-a")]: "3", [fieldName("nr", "ch-b")]: "on", [fieldName("mean", "ch-c")]: "7", [fieldName("k", "ch-c")]: "2" };
const tPay = submissionPayload("T", readDraft((n) => typed[n], rows), rows, [], { truthful: true, subcontracted: false }, null);
eq("the fields a correction may name: those with a reported value, as typed — never an N/R characteristic, never a value not given", correctableFields(tPay).map((f) => `${f.key}.${f.field}=${f.reported}`), ["ch-a.d1=51,0", "ch-a.d2=5,2", "ch-a.mean=5,1", "ch-a.U=0,3", "ch-c.mean=7"]);
eq("…anything else: none", [correctableFields(null), correctableFields({}), correctableFields({ kind: "T", values: "x" })].map((x) => x.length), [0, 0, 0]);

// a calibration version: the error as computed and confirmed (D1); a point N/A
const cRows: CalRow[] = [{ key: "pt-1", nominal: "20" }, { key: "pt-2", nominal: "40" }];
const cTyped: Record<string, string> = { [calField("ref", "pt-1")]: "20,00", [calField("meas", "pt-1")]: "20,03", [calField("U", "pt-1")]: "0,02", [calField("na", "pt-2")]: "on" };
const cPay = submissionPayload("C", readCalDraft((n) => cTyped[n], cRows), cRows, [], { truthful: true, subcontracted: false, errorsConfirmed: true }, null);
eq("calibration: the error (as computed and confirmed — D1) and U; an N/A point none", correctableFields(cPay).map((f) => `${f.key}.${f.field}=${f.reported}`), ["pt-1.error=0.03", "pt-1.U=0,02"]);

// corrections in force: the latest per field; a withdrawal removes it; other versions never count
const P = "00000000-0000-4000-8000-0000000000c5";
const mk = (o: Partial<ResultCorrection>): ResultCorrection => ({ id: "c", participantId: P, schemeId: "S", version: 1, key: "ch-a", field: "d1", reported: "51,0", used: "5,10", reason: "грешка в десетичната запетая", at: "2026-11-21T09:00:00Z", by: "coder@ptsbg.eu", ...o });
const all = [
  mk({ id: "1" }),
  mk({ id: "2", field: "U", reported: "0,3", used: "0,2", reason: "k = 3 → U при k = 2 по изчисление на експерта", at: "2026-11-21T09:05:00Z" }),
  mk({ id: "3", used: "5,1", at: "2026-11-21T10:00:00Z" }),
  mk({ id: "4", field: "mean", reported: "5,1", used: "5,0", at: "2026-11-21T09:10:00Z" }),
  mk({ id: "5", field: "mean", reported: "5,1", used: null, reason: "оттеглено — подаденото е вярно", at: "2026-11-21T11:00:00Z" }),
  mk({ id: "6", version: 2, used: "9", at: "2026-11-22T09:00:00Z" }),
];
const act1 = activeCorrections(all, 1);
eq("in force on version 1: the latest per field (d1 → 5,1), U; the mean withdrawn — none; version 2's never", [...act1.entries()].map(([k, c]) => `${k}=${c.used}`).sort(), ["ch-a::U=0,2", "ch-a::d1=5,1"]);
t("…version 2: only its own", activeCorrections(all, 2).size === 1 && activeCorrections(all, 3).size === 0);

// reading a correction from the form
const fields = correctableFields(tPay);
const r = (target: string, used: string, reason = "техническа грешка при въвеждане", active = new Map<string, ResultCorrection>()) => readCorrection({ target, used, reason }, fields, active);
t("a correction: a field of this version, a number (comma or point), a reason — the reported value carried as submitted", JSON.stringify(r(targetOf("ch-a", "d1"), " 5,10 ")) === JSON.stringify({ ok: true, key: "ch-a", field: "d1", reported: "51,0", used: "5,10", reason: "техническа грешка при въвеждане" }));
eq("…refused: a field not in the version (N/R, not given, made up); not a number; the value already used; no reason; a withdrawal with nothing to withdraw", [r(targetOf("ch-b", "mean"), "1"), r(targetOf("ch-a", "d3"), "1"), r("x::y", "1"), r(targetOf("ch-a", "d1"), "пет"), r(targetOf("ch-a", "d1"), "1e400"), r(targetOf("ch-a", "mean"), "5.1"), r(targetOf("ch-a", "d1"), "5", "аб"), r(targetOf("ch-a", "d1"), "")].map((x) => (x.ok ? "ok" : x.problem)), ["field", "field", "field", "value", "value", "same", "reason", "nothing"]);
t("…a withdrawal of one in force: used null, a reason still required", (() => { const x = r(targetOf("ch-a", "d1"), "", "оттеглено — подаденото е вярно", act1); const y = r(targetOf("ch-a", "d1"), "", "аб", act1); return x.ok && x.used === null && !y.ok && y.problem === "reason"; })());
t("…«the same» is the value in force: 5,1 in force refuses 5.1; the reported 51,0 is a change again", (() => { const x = r(targetOf("ch-a", "d1"), "5.1", "още веднъж", act1); const y = r(targetOf("ch-a", "d1"), "51", "обратно към подаденото", act1); return !x.ok && x.problem === "same" && y.ok; })());
t("every refusal has its words, both languages; every field its label", Object.values(CORRECTION_PROBLEM_TEXT).every((x) => !!x.bg && !!x.en) && ["d1", "d3", "mean", "U", "error"].every((f) => FIELD_LABEL(f).bg !== f));

// used values — what 7.1 writes (used → mean/u_k2/determination_*, reported → reported_*)
const uv = usedValues(tPay, all, 1);
eq("used values: the correction in force, else the reported — each with the reported kept", { d1: uv["ch-a"].d1.used, d1r: uv["ch-a"].d1.reported, d2: uv["ch-a"].d2.used, mean: uv["ch-a"].mean.used, U: uv["ch-a"].U.used, c: uv["ch-c"].mean.used, b: uv["ch-b"] }, { d1: "5,1", d1r: "51,0", d2: "5,2", mean: "5,1", U: "0,2", c: "7" });
t("…on version 2 nothing of version 1's carried", usedValues(tPay, all.filter((c) => c.id !== "6"), 2)["ch-a"].d1.used === "51,0");
eq("calibration: the error and U, used or reported", usedValues(cPay, [mk({ key: "pt-1", field: "error", reported: "0.03", used: "0,030" })], 1), { "pt-1": { error: { reported: "0.03", used: "0,030", correction: mk({ key: "pt-1", field: "error", reported: "0.03", used: "0,030" }) }, U: { reported: "0,02", used: "0,02" } } });

// k ≠ 2 (6.5 review): a U reported at k = 3 is NOT the U at k = 2 — no used U until one is recorded
const raw = usedValues(tPay, [], 1);
t("k ≠ 2 and no used U recorded: used is NULL, its k said — 7.1 never writes a U at k = 3 as u_k2; the label says «k = 3 по доклада»", raw["ch-a"].U.used === null && raw["ch-a"].U.k === "3" && raw["ch-a"].U.reported === "0,3" && raw["ch-a"].mean.used === "5,1" && FIELD_LABEL("U", "3").bg.includes("k = 3 по доклада") && FIELD_LABEL("U", "2").bg === "U (k = 2)" && FIELD_LABEL("U").en === "U (k = 2)");
t("…the right used U may be the number typed (k = 3 by mistake): «same» does not refuse it; U ≤ 0 refused (the form's own rule)", r(targetOf("ch-a", "U"), "0,3").ok && (() => { const a = r(targetOf("ch-a", "U"), "0"), b = r(targetOf("ch-a", "U"), "-0,1"); return !a.ok && a.problem === "positive" && !b.ok && b.problem === "positive"; })() && (() => { const x = r(targetOf("ch-a", "U"), "0,2", "още веднъж", act1); return !x.ok && x.problem === "same"; })());
t("records in force by the instant, not the text: a stamp on the second before one with a fraction; equal ones in the store's order", activeCorrections([mk({ id: "p", used: "1", at: "2026-11-21T09:00:05.1+00:00" }), mk({ id: "q", used: "2", at: "2026-11-21T09:00:05+00:00" })], 1).get(targetOf("ch-a", "d1"))?.id === "p" && activeCorrections([mk({ id: "e1", used: "1" }), mk({ id: "e2", used: "2" })], 1).get(targetOf("ch-a", "d1"))?.id === "e2");

// k ≠ 2 (D3): flagged while its used U is not recorded on the version — information, not a block
eq("k ≠ 2: A (k = 3) flagged; C (k = 2) not; B (N/R) not", kNotTwo(tPay, [], 1), [{ key: "ch-a", k: "3" }]);
t("…its used U recorded: the flag gone; withdrawn: back", kNotTwo(tPay, all, 1).length === 0 && kNotTwo(tPay, [...all, mk({ id: "7", field: "U", reported: "0,3", used: null, at: "2026-11-21T12:00:00Z" })], 1).length === 1 && kNotTwo(cPay, [], 1).length === 0);

// the store: on a version that was submitted; listed in order
await addSubmission({ id: "s1", participantId: P, schemeId: "S", version: 1, data: tPay, submittedBy: "lab:x" });
const notLatest = await addCorrection({ ...mk({ id: "n1", version: 2 }) });
await addCorrection(mk({ id: "a1" }));
await addCorrection(mk({ id: "a2", field: "U", reported: "0,3", used: "0,2" }));
const dup = await addCorrection(mk({ id: "a1", used: "9" }));
t("the store: on the latest version only («not-latest» otherwise); the same id twice — «duplicate», nothing new; recorded in order, with when", notLatest === "not-latest" && dup === "duplicate" && (await listCorrectionsFor(P, "S")).map((c) => c.id).join() === "a1,a2" && (await listCorrectionsFor(P, "S"))[0].used === "5,10" && !!(await listCorrectionsFor(P, "S"))[0].at && await correctionExists("a1") && !(await correctionExists("zz")));
await addSubmission({ id: "s2", participantId: P, schemeId: "S", version: 2, data: tPay, submittedBy: "lab:x" });
t("…a version submitted meanwhile: the old version refused («not-latest»), the new one taken", (await addCorrection(mk({ id: "a3" }))) === "not-latest" && typeof (await addCorrection(mk({ id: "a4", version: 2 }))) === "object");

// migration 0043
const sql = readFileSync(new URL("../supabase/migrations/0043_result_corrections.sql", import.meta.url), "utf8");
t("0043: append-only — no update, delete or truncate (service_role too); on a submitted version; the fields named; a reason; server key only", /raise exception 'result_corrections is a record/.test(sql) && /revoke update, delete, truncate on public\.result_corrections from service_role/.test(sql) && /references public\.submissions \(participant_id, version\)/.test(sql) && /field ~ '\^\(d\[1-9\]\|mean\|U\|error\)\$'/.test(sql) && /char_length\(btrim\(reason\)\) between 5 and 500/.test(sql) && /revoke all on public\.result_corrections from anon, authenticated/.test(sql) && /before truncate/.test(sql));
t("0043: on the LATEST version only, under the versions' own lock (0042's) — a version submitted meanwhile is never overtaken (6.5 review)", /perform pg_advisory_xact_lock\(hashtextextended\('submissions:' \|\| new\.participant_id::text, 0\)\);/.test(sql) && /if latest is null or new\.version <> latest then\s+raise exception 'result_corrections: version % is not the latest version/.test(sql));
t("…recorded and listed; nothing dropped", /'0043_result_corrections'/.test(sql) && MIGRATIONS.includes("0043_result_corrections") && !/\bdrop table\b/i.test(sql));

// the wiring
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function recordCorrectionAction"), act.indexOf("\n}\n", act.indexOf("export async function recordCorrectionAction")));
t("the action: who enters the results in the scheme (the coding expert); while the results are with PTS; the LATEST version only; the fields of that version and the corrections in force", /await requireCap\("results\.enter", schemeId\);/.test(fn) && /scheme\.status === "running" \|\| scheme\.status === "processing"/.test(fn) && /if \(!latest \|\| latest\.version !== version\) redirect\(back\("corr=version"\)\);/.test(fn) && /readCorrection\(\{ target: formData\.get\("target"\), used: formData\.get\("used"\), reason: formData\.get\("reason"\) \}, correctableFields\(latest!\.data\), activeCorrections\(recorded!, version\)\)/.test(fn));
t("…recorded (appended), then journalled WITHOUT the value or the reason; the lab told; a read or a write that fails: said, nothing claimed", /await addCorrection\(\{ id, participantId: part!\.id, schemeId, version,/.test(fn) && /logActivity\("results\.corrected"/.test(fn) && /after: \{ version, key: value\.key, field: value\.field, withdrawn: value\.used === null \}/.test(fn) && !/after: \{[^}]*(reason|used:|reported)/.test(fn) && /notifyResultsCorrected\(/.test(fn) && /redirect\(back\("corr=failed"\)\)/.test(fn));
t("…the form's own id: on record already — «recorded», nothing new (a second press, the same request twice); who to tell looked up BEFORE the record (2.3); the store's answers: a version meanwhile — «version», the same id — «recorded»", /const id = \/\^\[0-9a-f\]\{8\}/.test(fn) && /if \(seen\) redirect\(back\("corr=ok"\)\);/.test(fn) && fn.indexOf("labToTell(schemeId, code)") < fn.indexOf("await addCorrection(") && /if \(!tell\) redirect\(back\("corr=reach"\)\);/.test(fn) && /if \(saved === "not-latest"\) redirect\(back\("corr=version"\)\);/.test(fn) && /if \(saved === "duplicate"\) redirect\(back\("corr=ok"\)\);/.test(fn) && /notifyResultsCorrected\(tell!\.labId,/.test(fn));
const notice = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
const nf = notice.slice(notice.indexOf("export async function notifyResultsCorrected"));
t("the lab's notice: the version, never a value", /kind: "results\.corrected"/.test(nf) && !/reported|used\b|\$\{.*value/.test(nf.slice(0, nf.indexOf("href"))));
const staff = readFileSync(new URL("../src/app/schemes/[id]/participants/[code]/page.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/CorrectionsPanel.tsx", import.meta.url), "utf8");
t("PTS's page: the latest version's fields — reported, used, the reason; the k ≠ 2 flags; the form to who enters the results while open; a read that fails said", /<CorrectionsPanel schemeId=\{id\} code=\{code\}[^>]*version=\{submissions\.at\(-1\)!\.version\}/.test(staff) && /canEnter=\{canEnterResults\}/.test(staff) && /data-corrections-table/.test(panel) && /data-k-flags/.test(panel) && /\{canEnter && open && fields\.length > 0 && \(/.test(panel) && /data-corrections-unread/.test(panel));
t("…the form carries its own id; the answer said even when the form is not shown; the earlier versions' records listed", /<input type="hidden" name="nonce" value=\{randomUUID\(\)\} \/>/.test(panel) && /\{answer && !\(canEnter && open && fields\.length > 0\) \?/.test(panel) && /earlier\.map\(\(c\) =>/.test(panel));
const store = readFileSync(new URL("../src/lib/submissions.ts", import.meta.url), "utf8");
t("the reads paged past the database's 1000 rows — the versions and the corrections; by participation in the database", (store.match(/for \(let from = 0; ; from \+= 1000\)/g) ?? []).length >= 2 && /if \(participantId\) q = q\.eq\("participant_id", participantId\);/.test(store) && /\.order\("recorded_at", \{ ascending: true \}\)\.order\("id", \{ ascending: true \}\)\.range\(from, from \+ 999\)/.test(store));
const lab = readFileSync(new URL("../src/app/lab/p/[id]/results/page.tsx", import.meta.url), "utf8");
t("the lab's page: both — submitted and used, with the reason — for its latest version; a read that fails said", /usedValues\(latestV\.data, corr, latestV\.version\)/.test(lab) && /data-lab-correction=/.test(lab) && /data-lab-corrections-unread/.test(lab));

console.log(`corrections.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
