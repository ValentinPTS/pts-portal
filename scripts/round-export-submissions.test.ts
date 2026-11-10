// Plan part 6.9 — the round export's submissions as tables (Реш. 136: «so the round can continue on
// the current forms»): every value flat; the values in force per participation (the lock's version,
// else the latest; reported and used); codes and the scheme's labels only.
import { readFileSync } from "node:fs";
import { versionValueRows, inForceRows, plainNumber, inSchemeOrder, VALUE_COLUMNS, IN_FORCE_COLUMNS } from "../src/lib/round-export-submissions.ts";
import { submissionPayload } from "../src/lib/submission-model.ts";
import { readDraft, readCalDraft, fieldName, calField, genField, type ResultRow, type CalRow } from "../src/lib/results-model.ts";
import type { Submission } from "../src/lib/submissions.ts";
import type { ResultCorrection } from "../src/lib/corrections-model.ts";
import type { SubmissionLock } from "../src/lib/submission-lock-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// a testing version: A — two determinations (the second not given), mean, U at k = 3; B — N/R
const rows: ResultRow[] = [
  { key: "ch-a", index: 0, name: { bg: "A", en: "A" }, method: { bg: "m", en: "m" }, determinations: 2, uRequired: false },
  { key: "ch-b", index: 1, name: { bg: "B", en: "B" }, method: { bg: "m", en: "m" }, determinations: 1, uRequired: false },
];
const typed: Record<string, string> = { [fieldName("d", "ch-a", 0)]: "51,0", [fieldName("mean", "ch-a")]: "5,1", [fieldName("U", "ch-a")]: "0,3", [fieldName("k", "ch-a")]: "3", [fieldName("nr", "ch-b")]: "on" };
const tData = submissionPayload("T", readDraft((n) => typed[n], rows), rows, [], { truthful: true, subcontracted: false }, null);
const sub = (o: Partial<Submission>): Submission => ({ id: "s", participantId: "pA", schemeId: "S", version: 1, data: tData, submittedAt: "2026-11-20T10:00:00.000Z", submittedBy: "lab:x", ...o });
const label = (k: string) => ({ "ch-a": "1. A (m)", "ch-b": "2. B (m)", "pt-1": "20 kN" } as Record<string, string>)[k] ?? k;

const v = versionValueRows(sub({}), "126301", label);
eq("every value flat — as typed and as a number (a point); a determination not given: N/R for it; a characteristic N/R: one row", v.map((r) => `${r.key}.${r.field}=${r.typed}|${r.number}`), ["ch-a.d1=51,0|51", "ch-a.d2=N/R|", "ch-a.mean=5,1|5.1", "ch-a.U=0,3|0.3", "ch-a.k=3|3", "ch-b.nr=N/R|"]);
t("…by code, version, when; the scheme's labels", v.every((r) => r.code === "126301" && r.version === 1 && r.submittedAt === "2026-11-20T10:00:00.000Z") && v[0].label === "1. A (m)" && JSON.stringify(Object.keys(v[0])) === JSON.stringify(VALUE_COLUMNS));

// calibration: the readings, the error as computed (D1), U, CMC; a point N/A; the typed lab never here
const cRows: CalRow[] = [{ key: "pt-1", nominal: "20" }, { key: "pt-2", nominal: "40" }];
const cTyped: Record<string, string> = { [genField("labName")]: "ТАЙНА ЛАБ", [genField("signedBy")]: "ТАЙНО ЛИЦЕ", [calField("ref", "pt-1")]: "20,00", [calField("meas", "pt-1")]: "20,03", [calField("U", "pt-1")]: "0,02", [calField("na", "pt-2")]: "on" };
const cData = submissionPayload("C", readCalDraft((n) => cTyped[n], cRows), cRows, [], { truthful: true, subcontracted: false, errorsConfirmed: true }, null);
const cv = versionValueRows(sub({ data: cData }), "126302", label);
eq("calibration: the reference, the measured, the error as computed (exact), U; a point N/A — one row", cv.map((r) => `${r.key}.${r.field}=${r.typed}|${r.number}`), ["pt-1.ref=20,00|20", "pt-1.meas=20,03|20.03", "pt-1.error=0.03|0.03", "pt-1.U=0,02|0.02", "pt-2.na=N/A|"]);
t("…the typed laboratory and person: never in either table", !JSON.stringify([...cv, ...inForceRows([{ id: "pA", code: "126302" }], [sub({ data: cData })], [], undefined, label)]).match(/ТАЙН/));

// the values in force
const subs = [sub({ id: "v1", version: 1 }), sub({ id: "v2", version: 2, data: submissionPayload("T", readDraft((n) => ({ ...typed, [fieldName("mean", "ch-a")]: "5,4" } as Record<string, string>)[n], rows), rows, [], { truthful: true, subcontracted: false }, null) })];
const corr: ResultCorrection[] = [
  { id: "c1", participantId: "pA", schemeId: "S", version: 1, key: "ch-a", field: "mean", reported: "5,1", used: "5,10", reason: "запетая", at: "2026-11-21T09:00:00Z", by: "c@ptsbg.eu" },
  { id: "c2", participantId: "pA", schemeId: "S", version: 1, key: "ch-a", field: "d1", reported: "51,0", used: "5,10", reason: "запетая", at: "2026-11-21T09:01:00Z", by: "c@ptsbg.eu" },
  { id: "c3", participantId: "pA", schemeId: "S", version: 1, key: "ch-a", field: "d1", reported: "51,0", used: null, reason: "оттеглено", at: "2026-11-21T09:02:00Z", by: "c@ptsbg.eu" },
];
const parts = [{ id: "pA", code: "126301" }, { id: "pB", code: "126303" }, { id: "pC", code: "126304" }, { id: "pD", code: "126305" }];
const before = inForceRows(parts, subs, corr, undefined, label);
t("before a lock: each participation's LATEST version (A: v2), its source «latest»; none submitted — one row «none»", before.filter((r) => r.code === "126301").every((r) => r.version === 2 && r.source === "latest") && before.some((r) => r.code === "126303" && r.source === "none" && r.field === ""));
const lock: SubmissionLock[] = [{ id: "l1", kind: "lock", at: "2026-11-21T08:00:00Z", roundAt: "2026-11-21T08:00:00Z", by: "m@ptsbg.eu", entries: [{ participantId: "pA", code: "126301", version: 1 }, { participantId: "pB", code: "126303", version: null }, { participantId: "pC", code: "126304", version: null, via: "outside" }] }];
const after = inForceRows(parts, subs, corr, lock, label);
const a = (field: string) => after.find((r) => r.code === "126301" && r.key === "ch-a" && r.field === field)!;
t("after the lock: the version it TOOK (A: v1, not the later v2), source «lock»", after.filter((r) => r.code === "126301").every((r) => r.version === 1 && r.source === "lock"));
eq("…EVERY field, reported and used: the correction in force used (mean 5,10); a withdrawn one not (d1 back to 51,0); a determination not given N/R; U at k = 3 with no used U — none, and no k used (never a U at k = 3 read as u_k2)", [a("mean").reported, a("mean").used, a("mean").used_number, a("mean").corrected, a("d1").used, a("d2").reported, a("d2").used, a("U").reported, a("U").used, a("k").reported, a("k").used], ["5,1", "5,10", "5.1", "yes", "51,0", "N/R", "N/R", "0,3", "", "3", ""]);
const withU = inForceRows(parts, subs, [...corr, { id: "c4", participantId: "pA", schemeId: "S", version: 1, key: "ch-a", field: "U", reported: "0,3", used: "0,2", reason: "k = 3 → k = 2", at: "2026-11-21T09:03:00Z", by: "c@ptsbg.eu" }], lock, label);
const au = (field: string) => withU.find((r) => r.code === "126301" && r.key === "ch-a" && r.field === field)!;
t("…the used U recorded (at k = 2): U used 0,2 and k used 2 — the two agree (D3)", au("U").used === "0,2" && au("U").used_number === "0.2" && au("k").used === "2" && au("U").corrected === "yes");
t("…N/R said as a row; «outside» (a sheet) and N/R at the lock each one row; one not in the lock — none", after.some((r) => r.code === "126301" && r.key === "ch-b" && r.field === "nr" && r.used === "N/R") && after.some((r) => r.code === "126303" && r.source === "nr") && after.some((r) => r.code === "126304" && r.source === "outside") && after.some((r) => r.code === "126305" && r.source === "none") && JSON.stringify(Object.keys(after[0])) === JSON.stringify(IN_FORCE_COLUMNS));
t("before a lock, a sheet sent outside the form: «outside» — not «none» (the lock's own rule; review)", inForceRows([{ id: "pE", code: "126306", status: "submitted" }, { id: "pF", code: "126307" }, { id: "pG", code: "126308" }], [], [], undefined, label, () => 0, { "126307": { results: {} } }).map((r) => r.source).join() === "outside,outside,none");
t("a version the lock took but not read: the export is not made (whole, or nothing)", (() => { try { inForceRows(parts, [sub({ id: "v2", version: 2 })], [], lock, label); return false; } catch { return true; } })());
// calibration — every field in force, a correction on the error
const cAfter = inForceRows([{ id: "pA", code: "126302" }], [sub({ data: cData })], [{ id: "e1", participantId: "pA", schemeId: "S", version: 1, key: "pt-1", field: "error", reported: "0.03", used: "0,030", reason: "x", at: "2026-11-21T09:00:00Z", by: "c@ptsbg.eu" }], undefined, label);
eq("calibration in force: the readings, the error (used — corrected), U, a point N/A", cAfter.map((r) => `${r.key}.${r.field}=${r.reported}>${r.used}`), ["pt-1.ref=20,00>20,00", "pt-1.meas=20,03>20,03", "pt-1.error=0.03>0,030", "pt-1.U=0,02>0,02", "pt-2.na=N/A>N/A"]);
// the scheme's order — the database keeps a version's keys in its own (jsonb: by length, then bytes)
eq("rows in the scheme's order, whatever the stored order; a key no longer in it after", inSchemeOrder(["pt-10|up", "pt-1|down", "old", "pt-1|up"], (k) => ({ "pt-1|up": 0, "pt-1|down": 1, "pt-10|up": 2 } as Record<string, number>)[k] ?? 99), ["pt-1|up", "pt-1|down", "pt-10|up", "old"]);
eq("a number exactly, with a point — never an exponent", ["0,0000005", "5,10", "-0,5", "1e-3", "120", "пет", ""].map(plainNumber), ["0.0000005", "5.1", "-0.5", "0.001", "120", "", ""]);

// the wiring
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the round export: both tables coded — the final list, the locks, the corrections; listed with the submissions (the coverage test); the README says which to go on from", /submissions: \["coded\/submissions\.csv", "identity\/submissions_by\.csv", "coded\/submitted_values\.csv", "coded\/results_in_force\.csv"\]/.test(exp) && /addCoded\("coded\/results_in_force\.csv", inForceRows\(coded\.filter\(\(p\) => inFinalRound\(s, p\)\), submitted, corrected, s\.submissionLocks, labelOf, rank, s\.labUploads\), IN_FORCE_COLUMNS\);/.test(exp) && /оттук кръгът продължава по действащите формуляри/.test(exp));

console.log(`round-export-submissions.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
