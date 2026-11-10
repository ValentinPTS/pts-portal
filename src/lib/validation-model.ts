// The acceptance criteria and the rule they set (plan part 8.1; Реш. 134; Manual 7.5.2,
// Реш. 144; П 7.4.1 т. 4.6.2). Pure: no I/O.
//
// PTS writes the criteria — for each of the five levels, what must match and with what
// tolerance — and signs them on paper BEFORE any test. The portal keeps each signed edition
// and holds the rule: a level's test may be recorded only on or after the day criteria
// covering that level were signed — judged against the edition in force on the test's day.
// An edition is the WHOLE document: a new one replaces the previous entirely, and a level it
// leaves out has no criteria from the day it was signed (8.1 review). Its number is the one
// written on the paper — never one the portal counts (8.1 review).

export const LEVELS = [1, 2, 3, 4, 5] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_TEXT: Record<Level, { bg: string; en: string }> = {
  1: { bg: "Ниво 1 — повторение на PTS 26/03-T-1", en: "Level 1 — replay of PTS 26/03-T-1" },
  2: { bg: "Ниво 2 — приключил кръг калибриране, ILC и пробовземане", en: "Level 2 — a closed round of calibration, ILC and sampling" },
  3: { bg: "Ниво 3 — пробно изпълнение с вътрешни участници", en: "Level 3 — dry run with internal participants" },
  4: { bg: "Ниво 4 — пилот паралелно с e-mail", en: "Level 4 — pilot in parallel with e-mail" },
  5: { bg: "Ниво 5 — цяла схема през портала", en: "Level 5 — a full scheme through the portal" },
};

export interface CriteriaEdition {
  id: string;
  /** the edition's number, as written on the signed document */
  edition: number;
  signedOn: string; // yyyy-mm-dd — the day PTS signed it
  signedBy: string; // as written on it
  levels: Level[];
  note: string;     // what changed since the last edition
  filePath: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  fileSha256: string;
  recordedBy: string;
  recordedAt: string;
  voided?: { reason: string; by: string; at: string };
}

export const SIGNED_BY_MIN = 3, SIGNED_BY_MAX = 200, NOTE_MAX = 1000, VOID_MIN = 5, VOID_MAX = 500;
export const CRITERIA_EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
export const MAX_CRITERIA_BYTES = 15_000_000;
/** No acceptance test can predate the plan that asks for one. */
export const EARLIEST_DAY = "2026-01-01";

// cut by characters (code points), never inside one (8.1 review)
const cut = (t: string, max: number) => Array.from(t).slice(0, max).join("");
const chars = (t: string) => Array.from(t).length;
/** Text of several lines: control characters out, but the line breaks. */
const clean = (v: unknown, max: number) => cut((typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim(), max);
/** Text of one line, as written on a paper: no line break, no tab, no invisible or direction-
 *  changing character (a name that reads one way and is stored another — 8.1 review). */
export const oneLine = (v: unknown, max: number) => cut((typeof v === "string" ? v : "").replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ").replace(/\s+/g, " ").trim(), max);
const realDay = (day: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
};

export type CriteriaProblem = "date" | "future" | "edition" | "signed-by" | "levels" | "note" | "file" | "type" | "size" | "not-file" | "taken" | "order" | "same-file" | "failed";
export const MAX_EDITION = 999;

/** The form's words: the edition's number and the day signed, as on the paper (not after today,
 *  not before 2026), who signed (as on the paper), the levels it covers (at least one), what
 *  changed. The file is checked apart. */
export function readCriteriaForm(input: { edition: unknown; signedOn: unknown; signedBy: unknown; levels: unknown[]; note: unknown }, today: string):
  { ok: true; edition: number; signedOn: string; signedBy: string; levels: Level[]; note: string } | { ok: false; problem: CriteriaProblem } {
  const ed = typeof input.edition === "string" ? input.edition.trim() : "";
  if (!/^\d{1,3}$/.test(ed) || Number(ed) < 1 || Number(ed) > MAX_EDITION) return { ok: false, problem: "edition" };
  // the whole value checked — «2027-03-01junk» is not a day (8.1 review)
  const signedOn = typeof input.signedOn === "string" ? input.signedOn.trim() : "";
  if (!realDay(signedOn) || signedOn < EARLIEST_DAY) return { ok: false, problem: "date" };
  if (signedOn > today) return { ok: false, problem: "future" };
  const signedBy = oneLine(input.signedBy, SIGNED_BY_MAX + 1);
  if (chars(signedBy) < SIGNED_BY_MIN || chars(signedBy) > SIGNED_BY_MAX) return { ok: false, problem: "signed-by" };
  const levels = [...new Set(input.levels.map((x) => Number(x)))].filter((n): n is Level => (LEVELS as readonly number[]).includes(n)).sort();
  if (!levels.length || levels.length !== new Set(input.levels.map(String)).size) return { ok: false, problem: "levels" };
  const raw = typeof input.note === "string" ? input.note : "";
  if (chars(raw.trim()) > NOTE_MAX) return { ok: false, problem: "note" };
  return { ok: true, edition: Number(ed), signedOn, signedBy, levels, note: clean(raw, NOTE_MAX) };
}

/** Where a new edition stands among those recorded (voided ones aside): its number not taken; and
 *  the numbers follow the days signed — a higher number never signed before a lower one; the same
 *  file not recorded twice (a double press, or the scan of an edition already on record). */
export function editionProblem(editions: readonly CriteriaEdition[], e: { edition: number; signedOn: string; fileSha256: string }): "taken" | "order" | "same-file" | null {
  const live = editions.filter((x) => !x.voided);
  if (live.some((x) => x.fileSha256 === e.fileSha256)) return "same-file";
  if (live.some((x) => x.edition === e.edition)) return "taken";
  if (live.some((x) => (x.edition < e.edition && x.signedOn > e.signedOn) || (x.edition > e.edition && x.signedOn < e.signedOn))) return "order";
  return null;
}

/** The type a file IS, by its first bytes — a real PDF sent as «application/octet-stream» is still
 *  one (8.1 review); null — none of the three. */
export function sniffMime(bytes: Uint8Array): string | null {
  for (const m of Object.keys(CRITERIA_EXT)) if (looksLike(bytes, m)) return m;
  return null;
}

/** The signed scan is what it says it is — by its first bytes, not its name. */
export function looksLike(bytes: Uint8Array, mime: string): boolean {
  const b = (i: number) => bytes[i];
  if (mime === "application/pdf") return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46; // %PDF
  if (mime === "image/png") return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (mime === "image/jpeg") return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  return false;
}

/** The file's problem, if any (empty, a type not taken, too large, not what it says). */
export function fileProblem(f: { bytes: Uint8Array; mime: string }): CriteriaProblem | null {
  if (!f.bytes.byteLength) return "file";
  if (!CRITERIA_EXT[f.mime]) return "type";
  if (f.bytes.byteLength > MAX_CRITERIA_BYTES) return "size";
  if (!looksLike(f.bytes, f.mime)) return "not-file";
  return null;
}

// the one in force first: the latest signed, then the higher number on the paper
const newestFirst = (a: CriteriaEdition, b: CriteriaEdition) => b.signedOn.localeCompare(a.signedOn) || b.edition - a.edition;

/** The edition in force on a day: the latest signed on or before it, not voided — the whole
 *  document; it replaces every earlier one. */
export function criteriaInForce(editions: readonly CriteriaEdition[], day: string): CriteriaEdition | null {
  return [...editions].filter((e) => !e.voided && e.signedOn <= day).sort(newestFirst)[0] ?? null;
}

/** The edition a level's test on that day is judged against: the edition in force then, if it
 *  covers the level — or null: then no test of that level can be recorded for that day (Реш. 134).
 *  An earlier edition never answers for a level the edition in force leaves out (8.1 review). */
export function criteriaFor(editions: readonly CriteriaEdition[], level: Level, day: string): CriteriaEdition | null {
  const e = criteriaInForce(editions, day);
  return e && e.levels.includes(level) ? e : null;
}

/** Per level, on a day: the edition it would be judged against (or none). */
export function levelStatus(editions: readonly CriteriaEdition[], day: string): { level: Level; edition: CriteriaEdition | null }[] {
  return LEVELS.map((level) => ({ level, edition: criteriaFor(editions, level, day) }));
}

/** The number the form suggests — after every one in force on record (the paper's is what counts). */
export const nextEdition = (editions: readonly CriteriaEdition[]) => Math.max(0, ...editions.filter((e) => !e.voided).map((e) => e.edition)) + 1;

/** Why a void is refused, if it is. */
export function voidProblem(e: CriteriaEdition | null, reason: unknown): "missing" | "already" | "reason" | null {
  if (!e) return "missing";
  if (e.voided) return "already";
  const r = oneLine(reason, VOID_MAX + 1);
  if (chars(r) < VOID_MIN || chars(r) > VOID_MAX) return "reason";
  return null;
}

export const CRITERIA_PROBLEM_TEXT: Record<CriteriaProblem | "missing" | "already" | "reason" | "rests" | "under-tests", { bg: string; en: string }> = {
  date: { bg: "Датата на подписа не е истинска (дд.мм.гггг, от 2026 г.).", en: "The date it was signed is not a real one (from 2026 on)." },
  future: { bg: "Критериите не може да са подписани след днес.", en: "The criteria cannot have been signed after today." },
  edition: { bg: "Номерът на редакцията — както е на документа (1–999).", en: "The edition's number — as on the document (1–999)." },
  taken: { bg: "Редакция с този номер вече е записана — анулирайте я, ако е записана по грешка.", en: "An edition with this number is already recorded — void it if it was recorded by mistake." },
  order: { bg: "Номерата следват датите: по-висок номер не може да е подписан преди по-нисък.", en: "The numbers follow the days: a higher number cannot be signed before a lower one." },
  "same-file": { bg: "Този файл вече е записан като редакция.", en: "This file is already recorded as an edition." },
  "signed-by": { bg: "Кой е подписал — както е изписано на документа (3–200 знака).", en: "Who signed — as written on the document (3–200 characters)." },
  levels: { bg: "Изберете поне едно ниво, което критериите покриват.", en: "Choose at least one level the criteria cover." },
  note: { bg: "Бележката е до 1000 знака.", en: "The note is up to 1000 characters." },
  file: { bg: "Приложете подписания документ.", en: "Attach the signed document." },
  type: { bg: "Подписаният документ е PDF, PNG или JPG.", en: "The signed document is a PDF, PNG or JPG." },
  size: { bg: "Файлът е над 15 MB.", en: "The file is over 15 MB." },
  "not-file": { bg: "Това не е истински PDF, PNG или JPG.", en: "That file isn't a real PDF, PNG or JPG." },
  failed: { bg: "Не е записано — опитайте пак.", en: "Not recorded — try again." },
  missing: { bg: "Няма такава редакция.", en: "No such edition." },
  already: { bg: "Редакцията вече е анулирана.", en: "The edition is already voided." },
  reason: { bg: "Напишете защо се анулира (5–500 знака).", en: "Say why it is voided (5–500 characters)." },
  rests: { bg: "На тази редакция се опира записано изпитване — не се анулира.", en: "A recorded test rests on this edition — it is not voided." },
  "under-tests": { bg: "Вече има записано изпитване в деня на подписа или след него — нова редакция с тази дата би сменила това, на което се опира.", en: "A test is already recorded on or after the day signed — a new edition of that date would change what it rests on." },
};
