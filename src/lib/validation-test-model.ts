// The validation tests (plan parts 8.3–8.6; Реш. 134, 135; Manual 7.5.2; П 7.4.1 т. 4.6.2). Pure.
//
// A test of a level, on a day, judged against the criteria edition in force that day for that
// level (8.1 criteriaFor — none: no test, Реш. 134). The items a person compared, each «съвпада»,
// «не съвпада» or «неприложимо» with why; what the portal checked by itself, frozen at the
// recording; the result — passes only when everything matches; the conclusion; who recorded it
// (the checker: the head or the quality manager, never the software administrator).

import type { Level, CriteriaEdition } from "./validation-model";
import { criteriaFor } from "./validation-model";
import { sameSchemeNumber, readSchemeNumber, type SchemeNumberReading } from "./scheme-number";
import { SCENARIOS, SCENARIO_TEXT, type ScenarioRecords, type Scenario } from "./dry-run-model";

/** Level 1's reference round (PTS, 31.10, А17; Zadanie §13): closed, by the current system, with a
 *  full corrected set of records. Level 1 is a replay of THIS round — never another (8.3 review). */
export const LEVEL_ONE_REFERENCE = "PTS 26/03-T-1";
/** The kind of round a test is run on — level 1: PTS testing; level 2: calibration, ILC, sampling (8.4). */
export type RoundKind = "pts-t" | "calibration" | "ilc" | "sampling";
/** The day in Sofia of an instant — PTS's day, never UTC's (8.3 review). */
export const sofiaDayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });

export type ItemResult = "match" | "mismatch" | "na";
export interface TestItem { key: string; result: ItemResult; note: string }
/** What the portal checked by itself, frozen when the test was recorded. */
export interface AutoEvidence {
  /** the replay's re-export against its source file (8.2): unexpected differences; null — not compared */
  unexpected: number | null;
  /** the export to 2.0 relied on (7.1/7.10) */
  exportId?: string; exportSha?: string;
  /** 2.0's report relied on (7.2): the import, the module's version, the report's hash */
  importId?: string; analysisVersion?: string; reportSha?: string;
  /** the transfer check (7.3): «the same» or not */
  transferSame?: boolean;
  /** level 2: the original number read (today's or an old form) — not a simulation's (8.4 review) */
  numberRead?: boolean;
  /** level 3: what the round's own records show, scenario by scenario (8.5) */
  scenarios?: { records: ScenarioRecords; happened: Record<Scenario, boolean> };
}
export interface ValidationTest {
  id: string;
  level: Level;
  kind: RoundKind;
  testedOn: string; // yyyy-mm-dd — the day the test was made
  schemeId: string; // the round it was run on
  schemeNumber: string;
  replayOf?: string;
  criteriaId: string; criteriaEdition: number;
  /** the edition was recorded in the portal after the test's day (signed before it — but on record later) */
  criteriaRecordedAfter: boolean;
  scope: string;
  items: TestItem[];
  auto: AutoEvidence;
  result: "pass" | "fail";
  conclusion: string;
  file?: { path: string; name: string; mime: string; size: number; sha256: string };
  recordedBy: string; recordedAt: string;
  voided?: { reason: string; by: string; at: string };
}

export const ITEM_TEXT: Record<string, { bg: string; en: string }> = {
  codes: { bg: "Кодовете на участниците и броят им", en: "The participants' codes and their number" },
  design: { bg: "Характеристиките, мерните единици, броят повторения", en: "The characteristics, units, number of replicates" },
  raw: { bg: "Суровите резултати, подадени към 2.0 (сравнени от портала)", en: "The raw results sent to 2.0 (compared by the portal)" },
  xpt: { bg: "x_pt, σ_pt, u(x_pt) по характеристика", en: "x_pt, σ_pt, u(x_pt) per characteristic" },
  z: { bg: "z (или ζ) по код и характеристика", en: "z (or ζ) per code and characteristic" },
  verdicts: { bg: "Оценките (удовлетворителна / съмнителна / неудовлетворителна)", en: "The verdicts (satisfactory / questionable / unsatisfactory)" },
  tables: { bg: "Таблиците на доклада", en: "The report's tables" },
  uxpt: { bg: "Проверката u(x_pt) ≤ 0,3·σ_pt", en: "The check u(x_pt) ≤ 0.3·σ_pt" },
  // level 2 (8.4)
  points: { bg: "Точките, мерната единица, номиналните стойности", en: "The points, the unit, the nominal values" },
  refvalues: { bg: "Референтните стойности и тяхната U", en: "The reference values and their U" },
  ustab: { bg: "u_stab", en: "u_stab" },
  en: { bg: "Eₙ по код и точка", en: "Eₙ per code and point" },
  ilcvalues: { bg: "Стойностите и изводите в доклада от сравнението", en: "The values and conclusions of the comparison report" },
  carried: { bg: "Суровите резултати, пренесени (сравнени от портала)", en: "The raw results, carried (compared by the portal)" },
  number: { bg: "Номерът — прочетен както е (и в старите форми)", en: "The number — read as it is (old forms too)" },
};
/** Each kind's items (PLAN 8.3, 8.4; the draft criteria) — in this order. */
export const KIND_ITEMS: Record<RoundKind, string[]> = {
  "pts-t": ["codes", "design", "raw", "xpt", "z", "verdicts", "tables", "uxpt"],
  calibration: ["codes", "points", "raw", "refvalues", "ustab", "en", "verdicts", "tables", "number"],
  ilc: ["codes", "design", "raw", "ilcvalues", "tables", "number"],
  // sampling: the data model and the number only (А9)
  sampling: ["codes", "design", "carried", "number"],
};
/** The items that MUST match — never «неприложимо». */
export const KIND_MUST: Record<RoundKind, string[]> = {
  "pts-t": ["codes", "raw", "xpt", "z", "verdicts", "tables"],
  // u_stab and the points too — П 7.4.1 т. 4.6.2 names u_stab (8.4 review)
  calibration: ["codes", "points", "raw", "refvalues", "ustab", "en", "verdicts", "tables", "number"],
  ilc: ["codes", "raw", "ilcvalues", "tables", "number"],
  sampling: ["codes", "carried", "number"],
};
export const KIND_TEXT: Record<RoundKind, { bg: string; en: string }> = {
  "pts-t": { bg: "изпитване за пригодност", en: "proficiency testing" },
  calibration: { bg: "калибриране", en: "calibration" },
  ilc: { bg: "междулабораторно сравнение (ILC)", en: "interlaboratory comparison (ILC)" },
  sampling: { bg: "пробовземане", en: "sampling" },
};
/** A replay round's kind — the scheme's own markers (8.2 keeps them from the number or the importer's word). */
export function roundKind(s: { type: string; kind?: string; activity?: string; replay?: { kind?: RoundKind } }): RoundKind {
  // a replay's kind is the one frozen at its load — never a later edit's (8.4 review)
  if (s.replay?.kind) return s.replay.kind;
  if (s.type === "C") return "calibration";
  if (s.kind === "ILC") return "ilc";
  if (s.activity === "S") return "sampling";
  return "pts-t";
}
/** Level 1: a replay of PTS testing (the reference round); level 2: calibration, ILC, sampling (8.4). */
export const levelOfKind = (k: RoundKind): Level => (k === "pts-t" ? 1 : 2);
/** Sampling is read for the data model and the number only (А9): no run of 2.0. */
export const needs20 = (k: RoundKind) => k !== "sampling";
/** How the portal reads an original number (Zadanie §13) — or null: not read (said, never guessed). */
export const numberReading = (number: string): SchemeNumberReading | null => readSchemeNumber(number);
// level 3's items are the dry run's scenarios — each must match AND have happened (8.5)
for (const sc of SCENARIOS) ITEM_TEXT[sc] = SCENARIO_TEXT[sc];
/** The items of a level and kind: level 3 — the scenarios; else the kind's. */
export const itemsFor = (level: Level, kind: RoundKind): readonly string[] => (level === 3 ? SCENARIOS : KIND_ITEMS[kind]);
export const mustFor = (level: Level, kind: RoundKind): readonly string[] => (level === 3 ? SCENARIOS : KIND_MUST[kind]);
/** Level 1's items — the PTS testing kind's (kept for the record's readers). */
export const LEVEL_ITEMS: Partial<Record<Level, string[]>> = { 1: KIND_ITEMS["pts-t"] };
/** What PLAN 8.3's «Done when» names: never «неприложимо» (8.3 review). */
export const MUST_MATCH: Partial<Record<Level, string[]>> = { 1: KIND_MUST["pts-t"] };

export const SCOPE_MAX = 1000, NOTE_MAX = 500, CONCLUSION_MIN = 5, CONCLUSION_MAX = 2000;
const cut = (t: string, max: number) => Array.from(t).slice(0, max).join("");
const chars = (t: string) => Array.from(t).length;
const clean = (v: unknown, max: number) => cut((typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "").trim(), max);
const realDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;

export type TestProblem = "level" | "date" | "future" | "early" | "scope" | "items" | "item-note" | "conclusion" | "criteria" | "not-ready" | "file" | "type" | "size" | "not-file" | "failed" | "scheme" | "reference";

/** The form: the day tested (not after today, and not before what it rests on happened — the round
 *  loaded, the export, 2.0's report: `earliest`, 8.3 review), the scope, each item's result (a note
 *  where it is not «съвпада»), the conclusion. The level's items all answered. */
export function readTestForm(kind: RoundKind, input: { testedOn: unknown; scope: unknown; conclusion: unknown; item: (key: string) => { result: unknown; note: unknown } }, today: string, earliest = "2026-01-01", level?: Level):
  { ok: true; testedOn: string; scope: string; items: TestItem[]; conclusion: string } | { ok: false; problem: TestProblem; key?: string } {
  const keys = level === 3 ? SCENARIOS : KIND_ITEMS[kind];
  if (!keys) return { ok: false, problem: "level" };
  const testedOn = typeof input.testedOn === "string" ? input.testedOn.trim() : "";
  if (!realDay(testedOn) || testedOn < "2026-01-01") return { ok: false, problem: "date" };
  if (testedOn > today) return { ok: false, problem: "future" };
  if (testedOn < earliest) return { ok: false, problem: "early" };
  const rawScope = typeof input.scope === "string" ? input.scope : "";
  if (chars(rawScope.trim()) > SCOPE_MAX) return { ok: false, problem: "scope" };
  const items: TestItem[] = [];
  for (const key of keys) {
    const x = input.item(key);
    const result = x.result === "match" || x.result === "mismatch" || x.result === "na" ? x.result : null;
    if (!result) return { ok: false, problem: "items", key };
    const rawNote = typeof x.note === "string" ? x.note : "";
    if (chars(rawNote.trim()) > NOTE_MAX) return { ok: false, problem: "item-note", key };
    const note = clean(rawNote, NOTE_MAX);
    // anything but a match says why — a mismatch what differs, «неприложимо» why not
    if (result !== "match" && chars(note) < 5) return { ok: false, problem: "item-note", key };
    items.push({ key, result, note });
  }
  const rawC = typeof input.conclusion === "string" ? input.conclusion : "";
  const conclusion = clean(rawC, CONCLUSION_MAX + 1);
  if (chars(conclusion) < CONCLUSION_MIN || chars(conclusion) > CONCLUSION_MAX) return { ok: false, problem: "conclusion" };
  return { ok: true, testedOn, scope: clean(rawScope, SCOPE_MAX), items, conclusion };
}

/** What level 1 needs before a test can be recorded on a round — ONE CHAIN (8.3 review): the replay
 *  of the reference round; an export to 2.0 in force (final, under the lock in force, no correction
 *  after it); 2.0's report imported AFTER that export; the transfer check of that pair «the same»; the
 *  file that was sent compared with the source. Said, item by item. */
export function levelOneReady(x: { reference: boolean; exported: boolean; reportIn: boolean; reportAfterExport: boolean; checkedSame: boolean; compared: boolean }): string[] {
  return levelReady("pts-t", x);
}

/** What a kind's test needs (8.4): level 1 — the reference round and the whole chain; calibration and
 *  ILC — the chain (2.0 runs them); sampling — only the re-export compared with its source (no 2.0, А9). */
export function levelReady(kind: RoundKind, x: { reference: boolean; exported: boolean; reportIn: boolean; reportAfterExport: boolean; checkedSame: boolean; compared: boolean; numberRead?: boolean }): string[] {
  const number = levelOfKind(kind) === 2 && x.numberRead === false ? ["number"] : [];
  if (!needs20(kind)) return [...(x.compared ? [] : ["compared"]), ...number];
  const out: string[] = [...number];
  if (kind === "pts-t" && !x.reference) out.push("reference");
  if (!x.exported) out.push("export");
  if (!x.reportIn) out.push("report");
  else if (!x.reportAfterExport) out.push("report-after");
  if (!x.checkedSame) out.push("check");
  if (!x.compared) out.push("compared");
  return out;
}

/** Is this replay of level 1's reference round? */
export const isReference = (replayOf: string | undefined) => !!replayOf && sameSchemeNumber(replayOf, LEVEL_ONE_REFERENCE);

/** The result: passes only when every item the level must match matches, the others match or are not
 *  applicable (with why), the portal found no unexpected difference in what was SENT, 2.0's report is
 *  in and the transfer check says «the same». Never the checker's word alone. */
export function testResult(items: readonly TestItem[], auto: AutoEvidence, kind: RoundKind = "pts-t", level: Level = levelOfKind(kind)): "pass" | "fail" {
  // level 3 — the dry run: every scenario ticked AND its record in the round; a scenario ticked that
  // never happened is never a pass (8.5)
  if (level === 3) {
    const h = auto.scenarios?.happened;
    return !!h && SCENARIOS.every((sc) => items.some((i) => i.key === sc && i.result === "match") && h[sc] === true) ? "pass" : "fail";
  }
  const must = KIND_MUST[kind] ?? [];
  const itemsOk = items.length > 0 && items.every((i) => i.result === "match" || (i.result === "na" && !must.includes(i.key))) && must.every((k) => items.some((i) => i.key === k && i.result === "match"));
  // sampling: no 2.0 run (А9) — the comparison alone; the others: 2.0's report in and «the same»
  // level 2: the original number read by the portal — a person's tick alone never says old numbers are read (8.4 review)
  const numberOk = levelOfKind(kind) !== 2 || auto.numberRead === true;
  return itemsOk && numberOk && auto.unexpected === 0 && (!needs20(kind) || (!!auto.importId && auto.transferSame === true)) ? "pass" : "fail";
}

/** The coverage (8.4): per level and kind, the LATEST test not voided rules — a later failure is never
 *  hidden behind an earlier pass (8.4 review); null — none yet. */
export function latestTest(tests: readonly ValidationTest[], level: Level, kind?: RoundKind): ValidationTest | null {
  return tests.filter((t) => !t.voided && t.level === level && (!kind || t.kind === kind)).sort((a, b) => b.testedOn.localeCompare(a.testedOn) || b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
}
export function levelTwoCoverage(tests: readonly ValidationTest[]): Record<"calibration" | "ilc" | "sampling", ValidationTest | null> {
  return { calibration: latestTest(tests, 2, "calibration"), ilc: latestTest(tests, 2, "ilc"), sampling: latestTest(tests, 2, "sampling") };
}

/** The criteria a test of this level on this day is judged against (8.1) — and whether that edition
 *  was recorded in the portal only after the test's day, in Sofia (said on the test, 8.1/8.3 review). */
export function criteriaOf(editions: readonly CriteriaEdition[], level: Level, testedOn: string): { edition: CriteriaEdition; recordedAfter: boolean } | null {
  const e = criteriaFor(editions, level, testedOn);
  return e ? { edition: e, recordedAfter: sofiaDayOf(e.recordedAt) > testedOn } : null;
}

/** A new edition of the criteria signed on or before the day of a test already on record would change
 *  what that test was judged against — refused (8.3 review). */
export const editionUnderTests = (tests: readonly ValidationTest[], signedOn: string) => tests.some((t) => !t.voided && t.testedOn >= signedOn);

/** An edition a test rests on (not voided) cannot be voided (8.1 review). */
export const restsOn = (tests: readonly ValidationTest[], criteriaId: string) => tests.some((t) => !t.voided && t.criteriaId === criteriaId);

export const TEST_PROBLEM_TEXT: Record<TestProblem | "missing" | "already" | "reason" | "rests", { bg: string; en: string }> = {
  level: { bg: "Това ниво още не се записва тук.", en: "This level is not recorded here yet." },
  date: { bg: "Датата на изпитването не е истинска (от 2026 г.).", en: "The test's date is not a real one (from 2026)." },
  early: { bg: "Изпитването не може да е преди това, на което се опира (внасянето, изнасянето, доклада на 2.0).", en: "The test cannot be before what it rests on (the load, the export, 2.0's report)." },
  reference: { bg: `Ниво 1 е повторение на еталонния кръг ${"PTS 26/03-T-1"} — този кръг не е негово повторение.`, en: "Level 1 is the replay of the reference round PTS 26/03-T-1 — this round is not one." },
  future: { bg: "Изпитването не може да е след днес.", en: "The test cannot be after today." },
  scope: { bg: "Обхватът е до 1000 знака.", en: "The scope is up to 1000 characters." },
  items: { bg: "Отговорете за всяка точка: съвпада, не съвпада или неприложимо.", en: "Answer every item: matches, does not match, or not applicable." },
  "item-note": { bg: "При «не съвпада» и «неприложимо» напишете защо (5–500 знака).", en: "For «does not match» and «not applicable», say why (5–500 characters)." },
  conclusion: { bg: "Напишете заключението (5–2000 знака).", en: "Write the conclusion (5–2000 characters)." },
  criteria: { bg: "Няма подписани критерии за това ниво към датата на изпитването — изпитване не може да се запише (Реш. 134).", en: "No signed criteria for this level on the test's date — no test can be recorded (Реш. 134)." },
  "not-ready": { bg: "Кръгът не е готов за изпитването — вижте какво липсва.", en: "The round is not ready for the test — see what is missing." },
  scheme: { bg: "Няма такъв кръг за повторение.", en: "No such replay round." },
  file: { bg: "Файлът е празен.", en: "The file is empty." },
  type: { bg: "Доказателството е PDF, PNG или JPG.", en: "The evidence is a PDF, PNG or JPG." },
  size: { bg: "Файлът е над 15 MB.", en: "The file is over 15 MB." },
  "not-file": { bg: "Това не е истински PDF, PNG или JPG.", en: "That file isn't a real PDF, PNG or JPG." },
  failed: { bg: "Не е записано — опитайте пак.", en: "Not recorded — try again." },
  missing: { bg: "Няма такова изпитване.", en: "No such test." },
  already: { bg: "Вече е анулирано.", en: "Already voided." },
  reason: { bg: "Напишете защо се анулира (5–500 знака).", en: "Say why it is voided (5–500 characters)." },
  rests: { bg: "На тази редакция се опира записано изпитване — не се анулира.", en: "A recorded test rests on this edition — it is not voided." },
};
