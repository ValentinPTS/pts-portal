// Plan part 7.3 — the transfer check and the processing record (Manual 7.5.2; D3; 2.5, Реш. 140).
import { readFileSync } from "node:fs";
import { transferState, reportInForce, schemeTransferState, lastCorrectionAt, manifestOf, stageEventOf, readCheck, processingRecord, CHECK_PROBLEM_TEXT, type TransferCheck, type AnalysisExportRecord } from "../src/lib/transfer-check-model.ts";
import { analysisSheets } from "../src/lib/analysis-export.ts";
import type { SubmissionLock } from "../src/lib/submission-lock-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the check in force ─────────────────────────────────────────────────────
const ex = (id: string, o: Partial<AnalysisExportRecord> = {}): AnalysisExportRecord => ({ id, at: "2026-11-21T08:00:00Z", by: "stat@ptsbg.eu", preliminary: false, lockId: "L1", sha256: "ab", codes: ["126301", "126302"], characteristics: ["ch-1"], results: 2, nr: 0, ...o });
const chk = (id: string, exportId: string, importId: string, reportSha: string, same = true, at = "2026-11-21T10:00:00Z"): TransferCheck => ({ id, at, by: "stat@ptsbg.eu", exportId, importId, reportSha, same, note: same ? "" : "липсва 126304" });
const rep = { importId: "i1", sha: "R1" };
const checks = [chk("c1", "e1", "i1", "R1", false), chk("c2", "e1", "i1", "R1", true, "2026-11-21T11:00:00Z"), chk("c3", "e1", "i2", "R2")];
eq("the check in force: the latest naming the latest export AND the report in force (its import and its hash)", [transferState({ exports: [ex("e1")], checks, lockId: "L1", report: rep }).check?.id, transferState({ exports: [ex("e1")], checks, lockId: "L1", report: { importId: "i2", sha: "R2" } }).check?.id], ["c2", "c3"]);
eq("…a new export, another report in force, the same import but another file: none in force", [
  transferState({ exports: [ex("e1"), ex("e2")], checks, lockId: "L1", report: rep }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L1", report: { importId: "i3", sha: "R3" } }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L1", report: { importId: "i1", sha: "R9" } }).state,
], ["none", "none", "none"]);
eq("…never a preliminary export, one made under another lock (reopened and locked again), one under no lock, one a correction came after; never without 2.0's report", [
  transferState({ exports: [ex("e1", { preliminary: true })], checks, lockId: "L1", report: rep }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L2", report: rep }).state,
  transferState({ exports: [ex("e1")], checks, lockId: null, report: rep }).state,
  transferState({ exports: [ex("e1", { lockId: undefined })], checks, lockId: "L1", report: rep }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L1", report: rep, lastCorrectionAt: "2026-11-21T09:00:00Z" }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L1", report: rep, lastCorrectionAt: "2026-11-21T07:00:00Z" }).state,
  transferState({ exports: [ex("e1")], checks, lockId: "L1", report: null }).state,
  transferState({ exports: [], checks, lockId: "L1", report: rep }).state,
], ["preliminary", "relocked", "relocked", "relocked", "corrected", "ok", "no-report", "no-export"]);
const imports = [{ id: "i1", files: [{ kind: "report-bg", path: "p/1", sha256: "R1" }, { kind: "chart", path: "p/2", sha256: "C1" }] }, { id: "i2", files: [{ kind: "chart", path: "p/3", sha256: "C2" }] }];
eq("the report in force: the imported file itself (its import, its path) — never a report uploaded by hand, the built one chosen, or an import gone", [
  reportInForce({ report: { importId: "i1", path: "p/1" }, active: "uploaded", imports }),
  reportInForce({ report: { importId: "i1", path: "p/1" }, active: undefined, imports }),
  reportInForce({ report: { path: "p/hand" }, active: "uploaded", imports }),
  reportInForce({ report: { importId: "i1", path: "p/1" }, active: "built", imports }),
  reportInForce({ report: { importId: "i1", path: "p/other" }, active: "uploaded", imports }),
  reportInForce({ report: { importId: "i9", path: "p/1" }, active: "uploaded", imports }),
], [{ importId: "i1", sha: "R1" }, { importId: "i1", sha: "R1" }, null, null, null, null]);
const lock = (id: string): SubmissionLock => ({ id, kind: "lock", at: "2026-11-20T08:00:00Z", roundAt: "2026-11-20T08:00:00Z", by: "m@ptsbg.eu", entries: [] });
const sch = { analysisExports: [ex("e1")], transferChecks: checks, submissionLocks: [lock("L1")], uploads: { report: { importId: "i1", path: "p/1" } }, docActive: { report: "uploaded" as const }, analysisImports: imports };
eq("…on a scheme as it is: an addition (charts only) leaves the check in force; a reopening takes it out", [
  schemeTransferState(sch, []).state,
  schemeTransferState({ ...sch, analysisImports: [...imports, { id: "i3", files: [{ kind: "chart", path: "p/4", sha256: "C3" }] }] }, []).state,
  schemeTransferState({ ...sch, submissionLocks: [lock("L1"), { id: "R", kind: "reopen", at: "2026-11-22T08:00:00Z", by: "m@ptsbg.eu", note: "отворено" }] }, []).state,
  schemeTransferState(sch, [{ at: "2026-11-22T08:00:00Z" }]).state,
], ["ok", "ok", "relocked", "corrected"]);
eq("the latest correction's time", lastCorrectionAt([{ at: "2026-11-21T09:00:00Z" }, { at: "2026-11-22T09:00:00Z" }, { at: "2026-11-20T09:00:00Z" }]), "2026-11-22T09:00:00Z");
eq("the answer: yes; no — with what differs (required)", [readCheck({ same: "yes", note: "" }), readCheck({ same: "no", note: "липсва 126304 в доклада" }), readCheck({ same: "no", note: "аб" }), readCheck({ same: "", note: "" })].map((r) => (r.ok ? `${r.same}` : r.problem)), ["true", "false", "note", "answer"]);
t("every refusal has its words, both languages", Object.values(CHECK_PROBLEM_TEXT).every((x) => !!x.bg && !!x.en) && ["preliminary", "relocked", "corrected", "no-report", "stale", "missing"].every((k) => k in CHECK_PROBLEM_TEXT));

// ── the manifest, from the sheets the file is made of ──────────────────────
const sheets = [
  { name: "Participants", rows: [["laboratory_code", "country", "participates_in_ch-1"], ["126301", "", "Да"], ["126302", "", "Да"], ["126303", "", "Не"]] },
  { name: "Characteristics", rows: [["characteristic_id", "name"], ["ch-1", "Плътност"], ["ch-2", "Вискозитет"]] },
  { name: "Results", rows: [["laboratory_code", "characteristic_id", "determination_i", "determination_ii", "determination_iii", "mean", "u_k2", "status"], ["126301", "ch-1", 1, 2, 3, 2, 0.1, "reported"], ["126302", "ch-1", null, null, null, null, null, "N/R"], ["126302", "ch-2", null, null, null, null, null, "N/R"]] },
];
eq("the manifest: the codes, the characteristics (their lasting ids), N/R-only codes, the outside codes, the counts", manifestOf(sheets, ["126399"]), { codes: ["126301", "126302", "126303"], characteristics: ["ch-1", "ch-2"], outside: ["126399"], nrOnly: ["126302"], results: 3, nr: 2 });
eq("…columns found by their header, not by place", manifestOf([{ name: "Results", rows: [["status", "laboratory_code"], ["N/R", "126301"]] }, { name: "Participants", rows: [["country", "laboratory_code"], ["", "126301"]] }], []).nrOnly, ["126301"]);
// a real file's sheets — testing and calibration (7.1's builder)
const T = { id: "s1", number: "26/03-T-1", type: "T", status: "processing", parameters: [{ key: "dens", name: "Плътност", unit: "kg/m³", determinations: 2 }], lifecycle: { acts: [{ act: "second", from: "running", to: "running", at: "2026-11-01T08:00:00Z", by: "m", day: "2026-11-01", final: { runs: ["dens"], participants: ["p1", "p2"] } }] } };
try {
  const out = analysisSheets(T as never, [{ id: "p1", code: "126301", schemeId: "s1", selections: ["dens"] }, { id: "p2", code: "126302", schemeId: "s1", selections: ["dens"] }] as never, [], [], []);
  const m = manifestOf(out.sheets as never, out.counts.outside);
  t("…from 7.1's own sheets (testing): every code on the final list, the characteristics in the file", m.codes.length === 2 && m.characteristics.length === 1 && m.codes.length === out.counts.participants && m.characteristics.length === out.sheets.find((x) => x.name === "Characteristics")!.rows.length - 1 && m.results === out.counts.results && m.nr === out.counts.nr, JSON.stringify(m));
} catch (e) { t("…from 7.1's own sheets (testing)", false, String(e)); }

// ── the processing record ───────────────────────────────────────────────────
eq("a tick and its withdrawal, from the journal — stages 14–16 only", [
  stageEventOf({ at: "a", actorEmail: "x", summary: "Stage ticked: 14. Statistical processing" }),
  stageEventOf({ at: "b", actorEmail: "y", summary: "Tick withdrawn: 15. Independent review" }),
  stageEventOf({ at: "c", actorEmail: "z", summary: "Stage ticked: 9. Dispatch" }),
  stageEventOf({ at: "d", actorEmail: "z", summary: "Something else: 14." }),
], [{ at: "a", by: "x", stage: "14", done: true }, { at: "b", by: "y", stage: "15", done: false }, null, null]);
const rec = processingRecord({
  designations: [
    { processor: "stat@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "head@ptsbg.eu", setBy: "head@ptsbg.eu", setAt: "2026-11-01T09:00:00Z", endedAt: "2026-11-05T09:00:00Z", endedBy: "head@ptsbg.eu" },
    { processor: "stat2@ptsbg.eu", reviewer: "qm@ptsbg.eu", approver: "head@ptsbg.eu", setBy: "head@ptsbg.eu", setAt: "2026-11-05T09:00:00Z" },
  ],
  stageEvents: [{ at: "2026-11-21T12:00:00Z", by: "stat@ptsbg.eu", stage: "14", done: true }, { at: "2026-11-21T13:00:00Z", by: "stat@ptsbg.eu", stage: "14", done: false }, { at: "2026-11-22T09:00:00Z", by: "stat@ptsbg.eu", stage: "14", done: true }],
  exports: [ex("e1")], imports: [{ id: "i1", at: "2026-11-21T09:00:00Z", by: "stat@ptsbg.eu", version: "2.0.3", files: [1, 2] }], checks: [checks[1]],
});
eq("the processing record, in the order things happened: every designation and its end, the export, the import, the check, the ticks and the withdrawal", rec.map((e) => e.kind), ["designation", "designation-ended", "designation", "export", "import", "check", "stage", "unstage", "stage"]);
t("…who and what — the module's version, the counts; the check's answer", rec[4].text.en.includes("2.0.3") && rec[3].text.en.includes("2 codes") && rec[5].text.en.includes("the same codes") && rec[0].text.bg.includes("преглежда qm@ptsbg.eu") && rec[2].text.bg.includes("stat2@ptsbg.eu"));
eq("…the journal unread: the ticks in force", processingRecord({ stageEvents: null, stages: { "14": { at: "2026-11-21T12:00:00Z", by: "s" }, "16": { at: "2026-11-23T12:00:00Z", by: "h" } } }).map((e) => e.text.en), ["Stage 14 — Statistical processing", "Stage 16 — Approval"]);

// ── the wiring ──────────────────────────────────────────────────────────────
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function recordTransferCheckAction"), act.indexOf("\n}\n", act.indexOf("export async function recordTransferCheckAction")));
t("the check: the statistics expert or the scheme manager; in processing; the state in force (final export, the lock, the corrections, 2.0's report) — refused otherwise", /await requireOneOf\(\["results\.process", "scheme\.edit"\], schemeId\);/.test(fn) && /const now = schemeTransferState\(scheme!, corrections!\);/.test(fn) && /now\.state === "preliminary" \|\| now\.state === "relocked" \|\| now\.state === "corrected" \|\| now\.state === "no-report"\) redirect\(back\(`tc=\$\{now\.state\}`\)\)/.test(fn));
t("…drawn for the export AND the report in force (import, hash) — checked again inside the lock", /now\.export!\.id !== exportId \|\| now\.importId !== importId \|\| now\.reportSha !== reportSha\) redirect\(back\("tc=stale"\)\)/.test(fn) && /const again = schemeTransferState\(cur, corrections!\);/.test(fn) && /again\.reportSha !== reportSha\) \{ outcome = "stale"; return \{\}; \}/.test(fn));
t("…journalled without the note; a check whose journal line failed is taken back", /after: \{ same: value\.same, exportId, importId, reportSha \}/.test(fn) && !/after: \{[^}]*note/.test(fn) && /if \(!logged\) \{[\s\S]*?transferChecks: \(cur\.transferChecks \?\? \[\]\)\.filter\(\(x\) => x\.id !== entry\.id\)[\s\S]*?redirect\(back\("tc=failed"\)\);/.test(fn));
const route = readFileSync(new URL("../src/app/schemes/[id]/export/analysis/route.ts", import.meta.url), "utf8");
t("each export's manifest recorded BEFORE the file is handed out — the lock, the hash, the manifest from the sheets; only in processing; a record that cannot be written — no file", /analysisExports: \[\.\.\.\(cur\.analysisExports \?\? \[\]\), manifest\]/.test(route) && /lockId: lock\.id/.test(route) && /sha256: sha256\(bytes\), \.\.\.manifestOf\(out\.sheets, out\.counts\.outside\)/.test(route) && /if \(s!\.status === "processing"\)/.test(route) && /if \(cur\.status !== "processing"\) return \{\};/.test(route) && route.indexOf("analysisExports: [") < route.indexOf("const logged = await logActivity(") && /what it sends could not be recorded — so it is not handed out/.test(route));
t("…the journal line not written: the record taken back; a HEAD never runs the export", /if \(!logged\) \{\s*\/\/[^\n]*\n\s*if \(recorded\) \{ try \{ await updateSchemeWith\(id, \(cur\) => \(\{ analysisExports: \(cur\.analysisExports \?\? \[\]\)\.filter\(\(x\) => x\.id !== manifest\.id\) \}\)\); \}/.test(route) && /export const HEAD = \(\) => new Response\(null, \{ status: 405/.test(route));
const page = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the card on the scheme's page (who reads the results or edits the scheme): every designation, the ticks from the journal, the corrections read; the records in the round export", /<ProcessingRecordCard schemeId=\{id\}/.test(page) && /if \(\(mayReview \|\| canAct\) && \["processing", "report", "closed"\]\.includes\(s\.status\)\)/.test(page) && /processingRecord\(\{ designations, stageEvents: ticksFromJournal \? ticks : null/.test(page) && /listCorrections\(id\)\.then\(\(c\) => schemeTransferState\(s, c\)\)\.catch\(\(\) => null\)/.test(page) && /analysisExports: "coded", transferChecks: "coded",/.test(exp));
const card = readFileSync(new URL("../src/components/ProcessingRecordCard.tsx", import.meta.url), "utf8");
t("…the form only when a check can be recorded; it carries the export, the import and the report's hash", /canCheck && \(transfer\.state === "none" \|\| transfer\.state === "ok"\) && im &&/.test(card) && /name="reportSha"/.test(card) && /data-transfer-outside/.test(card) && /data-transfer-nr-only/.test(card));

console.log(`transfer-check.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
