// The validation tests (plan parts 8.3–8.6; Реш. 134, 135; Manual 7.5.2; П 7.4.1 т. 4.6.2). Pure.
//
// A test of a level, on a day, judged against the criteria edition in force that day for that
// level (8.1 criteriaFor — none: no test, Реш. 134). The items a person compared, each «съвпада»,
// «не съвпада» or «неприложимо» with why; what the portal checked by itself, frozen at the
// recording; the result — passes only when everything matches; the conclusion; who recorded it
// (the checker: the head or the quality manager, never the software administrator).

import type { Level, CriteriaEdition } from "./validation-model";
import { criteriaFor } from "./validation-model";
import { sameSchemeNumber } from "./scheme-number";

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
};
/** Level 1's items (PLAN 8.3; the draft criteria) — in this order. */
export const LEVEL_ITEMS: Partial<Record<Level, string[]>> = {
  1: ["codes", "design", "raw", "xpt", "z", "verdicts", "tables", "uxpt"],
};
/** The items that MUST match — what PLAN 8.3's «Done when» names: never «неприложимо» (8.3 review). */
export const MUST_MATCH: Partial<Record<Level, string[]>> = {
  1: ["codes", "raw", "xpt", "z", "verdicts", "tables"],
};

export const SCOPE_MAX = 1000, NOTE_MAX = 500, CONCLUSION_MIN = 5, CONCLUSION_MAX = 2000;
const cut = (t: string, max: number) => Array.from(t).slice(0, max).join("");
const chars = (t: string) => Array.from(t).length;
const clean = (v: unknown, max: number) => cut((typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "").trim(), max);
const realDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;

export type TestProblem = "level" | "date" | "future" | "early" | "scope" | "items" | "item-note" | "conclusion" | "criteria" | "not-ready" | "file" | "type" | "size" | "not-file" | "failed" | "scheme" | "reference";

/** The form: the day tested (not after today, and not before what it rests on happened — the round
 *  loaded, the export, 2.0's report: `earliest`, 8.3 review), the scope, each item's result (a note
 *  where it is not «съвпада»), the conclusion. The level's items all answered. */
export function readTestForm(level: Level, input: { testedOn: unknown; scope: unknown; conclusion: unknown; item: (key: string) => { result: unknown; note: unknown } }, today: string, earliest = "2026-01-01"):
  { ok: true; testedOn: string; scope: string; items: TestItem[]; conclusion: string } | { ok: false; problem: TestProblem; key?: string } {
  const keys = LEVEL_ITEMS[level];
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
  const out: string[] = [];
  if (!x.reference) out.push("reference");
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
export function testResult(items: readonly TestItem[], auto: AutoEvidence, level: Level = 1): "pass" | "fail" {
  const must = MUST_MATCH[level] ?? [];
  const itemsOk = items.length > 0 && items.every((i) => i.result === "match" || (i.result === "na" && !must.includes(i.key))) && must.every((k) => items.some((i) => i.key === k && i.result === "match"));
  return itemsOk && auto.unexpected === 0 && !!auto.importId && auto.transferSame === true ? "pass" : "fail";
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
