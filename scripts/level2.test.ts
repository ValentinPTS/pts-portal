// Plan part 8.4 — level 2: one closed round each of calibration, ILC and sampling. The round's kind
// (never chosen), its level, its items and what must match; readiness — sampling without 2.0 (А9); the
// result rule per kind; the coverage; the importer's word on a kind the old number does not say (never
// against the number or the file); old numbers read as they are; an ILC and a sampling replay through the
// whole round trip.
import { readFileSync } from "node:fs";
import { xlsx, type Sheet } from "../src/lib/xlsx.ts";
import { readXlsx } from "../src/lib/xlsx-read.ts";
import { replayDiff } from "../src/lib/replay-model.ts";
import { importReplay, replayKind, compareReplay } from "../src/lib/replay-import.ts";
import { levelState } from "../src/lib/validation-level.ts";
import { getScheme } from "../src/lib/store.ts";
import { listParticipants } from "../src/lib/participants.ts";
import { listSubmissions, listCorrections } from "../src/lib/submissions.ts";
import { analysisSheets } from "../src/lib/analysis-export.ts";
import { roundKind, levelOfKind, needs20, levelReady, testResult, levelTwoCoverage, numberReading, KIND_ITEMS, KIND_MUST, type ValidationTest, type TestItem, type RoundKind } from "../src/lib/validation-test-model.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import { replaySheets } from "./replay-fixture.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// ── the kind and the level — the round's ──
t("the round's kind: calibration by its type; ILC and sampling by its markers; else PTS testing", roundKind({ type: "C" }) === "calibration" && roundKind({ type: "T", kind: "ILC" }) === "ilc" && roundKind({ type: "T", activity: "S" }) === "sampling" && roundKind({ type: "T", kind: "PTS", activity: "T" }) === "pts-t");
t("…the level: PTS testing 1; calibration, ILC, sampling 2", levelOfKind("pts-t") === 1 && (["calibration", "ilc", "sampling"] as RoundKind[]).every((k) => levelOfKind(k) === 2));
t("the items per kind — sampling: the data model and the number only (А9)", KIND_ITEMS.sampling.join() === "codes,design,carried,number" && KIND_ITEMS.calibration.includes("en") && KIND_ITEMS.calibration.includes("ustab") && KIND_ITEMS.ilc.includes("ilcvalues") && ["calibration", "ilc", "sampling"].every((k) => KIND_MUST[k as RoundKind].includes("number")));
const chain = { reference: false, exported: true, reportIn: true, reportAfterExport: true, checkedSame: true, compared: true };
t("readiness — calibration and ILC: the whole chain (no reference round asked); sampling: only the comparison, no 2.0", levelReady("calibration", chain).length === 0 && levelReady("ilc", { ...chain, checkedSame: false }).join() === "check" && levelReady("sampling", { ...chain, exported: false, reportIn: false, checkedSame: false }).length === 0 && levelReady("sampling", { ...chain, compared: false }).join() === "compared" && !needs20("sampling") && needs20("ilc"));
const items = (kind: RoundKind, r: Record<string, "mismatch" | "na"> = {}): TestItem[] => KIND_ITEMS[kind].map((key) => ({ key, result: r[key] ?? "match", note: r[key] ? "защо" : "" }));
t("the result — sampling passes on the comparison alone; calibration needs 2.0's report and «the same»", testResult(items("sampling"), { unexpected: 0, numberRead: true }, "sampling") === "pass" && testResult(items("calibration"), { unexpected: 0, numberRead: true }, "calibration") === "fail" && testResult(items("calibration"), { unexpected: 0, importId: "i", transferSame: true, numberRead: true }, "calibration") === "pass");
t("…the number must match on level 2; the design may be not applicable for sampling", testResult(items("sampling", { number: "na" }), { unexpected: 0, numberRead: true }, "sampling") === "fail" && testResult(items("sampling", { design: "na" }), { unexpected: 0, numberRead: true }, "sampling") === "pass");
t("review: level 2 never passes when the portal did not read the original number — a person's tick is not enough", testResult(items("sampling"), { unexpected: 0, numberRead: false }, "sampling") === "fail" && testResult(items("sampling"), { unexpected: 0 }, "sampling") === "fail" && levelReady("sampling", { ...chain, numberRead: false }).includes("number"));
t("review: calibration's u_stab and points must match (П 7.4.1 т. 4.6.2)", KIND_MUST.calibration.includes("ustab") && KIND_MUST.calibration.includes("points"));
const vt = (kind: RoundKind, result: "pass" | "fail", testedOn: string, voided = false) => ({ level: 2, kind, result, testedOn, ...(voided ? { voided: { reason: "x", by: "y", at: "z" } } : {}) }) as ValidationTest;
const cov = levelTwoCoverage([vt("sampling", "pass", "2027-03-01"), vt("sampling", "pass", "2027-03-05"), vt("ilc", "pass", "2027-03-01"), vt("ilc", "fail", "2027-03-02"), vt("calibration", "pass", "2027-03-03", true)]);
t("review: the coverage — per kind, the LATEST test not voided rules; a later failure is never hidden behind an earlier pass", cov.sampling?.testedOn === "2027-03-05" && cov.sampling.result === "pass" && cov.ilc?.result === "fail" && cov.calibration === null);

// ── the importer's word on the kind; the old numbers ──
const rk = (type: "T" | "C", n: string, h: "" | "T" | "S" | "ILC") => { const r = replayKind(type, numberReading(n), h); return r ? `${r.kind}/${r.activity}${r.given ? `/${r.given}` : ""}` : null; };
t("the kind the number states wins — the importer's word only where an OLD number states nothing, never against it", rk("T", "PTS 20/10", "S") === "PTS/S/S" && rk("T", "PTS 26/03-T-1", "S") === null && rk("T", "PTS 25/08-NA-1", "") === "ILC/T" && rk("T", "PTS 20/10", "") === "PTS/T");
t("review: a number that says calibration takes no other kind; a calibration file numbered as testing — refused; a C number with a non-calibration file — refused", rk("T", "PTS 26/03-C-1", "S") === null && rk("T", "PTS 21/03-C1P", "S") === null && rk("T", "PTS 21/03-C1P", "ILC") === null && rk("T", "PTS 26/03-C-1", "") === null && rk("C", "PTS 26/03-T-1", "") === null && rk("C", "PTS 26/03-S-1", "") === null && rk("C", "PTS 21/03-C1P", "") === "PTS/C" && rk("C", "PTS 21/03-C1P", "S") === null);
t("review: an unreadable number, or a simulation's, takes no word; an ILC keeps its activity", rk("T", "Лаборатория", "S") === null && rk("T", "PTS 26/03", "S") === null && rk("T", "SIM 26/03-S-1", "S") === null && rk("T", "ILC 26/03-S-1", "") === "ILC/S");
t("old numbers read as they are (Zadanie §13); one not read is said, never guessed", numberReading("PTS 20/10")?.form === "old" && numberReading("PTS 21/03-C1P")?.activity === "C" && numberReading("PTS 25/08-NA-1")?.kind === "ILC" && numberReading("PTS 26/03-T-1")?.form === "current" && numberReading("Лаборатория") === null);

// ── a sampling and an ILC replay, through the round trip ──
const roundTrip = async (sheets: Sheet[], hint: "" | "S" | "ILC") => {
  const imp = await importReplay({ bytes: xlsx(sheets), by: "admin@ptsbg.eu", kindHint: hint });
  if (!imp.ok) return { ok: false as const, why: JSON.stringify(imp) };
  const s = (await getScheme(imp.schemeId))!;
  const parts = await listParticipants(s.id);
  const diffs = replayDiff(readXlsx(xlsx(sheets)), readXlsx(xlsx(analysisSheets(s, parts, await listSubmissions(s.id), await listCorrections(s.id), s.submissionLocks).sheets)), s.replay!);
  return { ok: true as const, s, unexpected: diffs.filter((d) => !d.expected) };
};
const sam = await roundTrip(replaySheets("PTS 20/10"), "S");
t("a sampling round by an old number («PTS 20/10» — the kind given at the load): a SIM replay of activity S, level 2; the round trip has no unexpected difference", sam.ok && sam.s.activity === "S" && /^SIM \d{2}\/\d{2}-S-\d+$/.test(sam.s.number) && roundKind(sam.s) === "sampling" && sam.unexpected.length === 0, sam.ok ? `${sam.s.number} ${JSON.stringify(sam.unexpected.slice(0, 4))}` : sam.why);
const ilc = await roundTrip(replaySheets("PTS 25/08-NA-1"), "");
t("an old ILC number («PTS 25/08-NA-1»): an ILC replay, level 2; no unexpected difference", ilc.ok && ilc.s.kind === "ILC" && roundKind(ilc.s) === "ilc" && ilc.unexpected.length === 0, ilc.ok ? JSON.stringify(ilc.unexpected.slice(0, 4)) : ilc.why);
const against = await importReplay({ bytes: xlsx(replaySheets("PTS 26/03-T-1")), by: "admin@ptsbg.eu", kindHint: "S" });
t("the importer's word against the number: refused, nothing made", !against.ok && against.problem === "kind");
const simOrig = await importReplay({ bytes: xlsx(replaySheets("SIM 26/03-S-1")), by: "admin@ptsbg.eu" });
t("review: a simulation's own number is not a closed round — refused", !simOrig.ok && simOrig.problem === "simulation");
t("review: the kind frozen with the replay — a later edit of the markers changes nothing; the importer's word on record", sam.ok && sam.s.replay?.kind === "sampling" && sam.s.replay.kindGiven === "S" && roundKind({ ...sam.s, activity: "T" }) === "sampling" && ilc.ok && ilc.s.replay?.kind === "ilc" && !ilc.s.replay.kindGiven);
// a calibration file through the import: its kind and level
const calSheets: Sheet[] = replaySheets("PTS 21/03-C1P").map((sh) => sh.name !== "Characteristics" ? sh : { ...sh, rows: sh.rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (sh.rows[0][j] === "assigned_value_method" ? "calibration" : c)))) });
const cal = await importReplay({ bytes: xlsx(calSheets), by: "admin@ptsbg.eu" });
const calS = cal.ok ? (await getScheme(cal.schemeId))! : null;
t("review: a calibration file («PTS 21/03-C1P») through the import — calibration, level 2, its number read", !!calS && calS.type === "C" && roundKind(calS) === "calibration" && levelOfKind(roundKind(calS)) === 2 && numberReading(calS.replay!.of)?.activity === "C", cal.ok ? "" : JSON.stringify(cal));
// the round trip by the card's own path (the final round's filter included)
const viaCard = sam.ok ? await compareReplay(sam.s) : null;
const st = sam.ok ? await levelState(sam.s) : null;
t("review: by the card's own path — the sampling replay compared (no unexpected difference), level 2, its number read, ready", !!viaCard && viaCard.filter((d) => !d.expected).length === 0 && st?.level === 2 && st.kind === "sampling" && st.auto.numberRead === true && st.missing.length === 0, JSON.stringify(st));

// ── the wiring ──
const lvl = readFileSync(new URL("../src/lib/validation-level.ts", import.meta.url), "utf8");
t("the state: the round's kind decides — sampling compares the re-export with its source, no 2.0", /if \(!needs20\(kind\)\) \{\s*const diffs = await compareReplay\(s\);/.test(lvl) && /const kind = roundKind\(s\), level = levelOfKind\(kind\);/.test(lvl));
const act = readFileSync(new URL("../src/lib/validation-actions.ts", import.meta.url), "utf8");
const upd = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("review: a replay round's number and markers are never edited", /if \(current\.replay && \(number !== current\.number \|\| JSON\.stringify\(markers\) !== JSON\.stringify\(kept\)\)\) \{\s*markersLockedRefused = true;/.test(upd));
const m47 = readFileSync(new URL("../supabase/migrations/0047_validation_levels.sql", import.meta.url), "utf8");
t("review: migration 0047 — the level paired with the kind; a pass never without 2.0 where it runs, never on level 2 without the number read", MIGRATIONS.includes("0047_validation_levels") && /drop constraint if exists validation_tests_result_check/.test(m47) && /\(level = 1 and kind = 'pts-t'\)/.test(m47) && /\(level >= 3 or kind = 'sampling' or \(\(auto \? 'importId'\) and \(auto->>'transferSame'\) = 'true'\)\)/.test(m47) && /\(level <> 2 or \(auto->>'numberRead'\) = 'true'\)/.test(m47));
t("the action: the level and the kind the round's — never the form's", /const level = st\.level;/.test(act) && /kind: st\.kind,/.test(act) && !/formData\.get\("level"\)/.test(act) && /kindHint: hint === "T" \|\| hint === "S" \|\| hint === "ILC" \? hint : ""/.test(act));

console.log(`level2.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
