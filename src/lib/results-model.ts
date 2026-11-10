// The results form — testing (plan part 6.1; Zadanie §5, §7, §12; К22; Реш. 88). Pure.
//
// One row per characteristic that RUNS for the participation (the final list's, 5.2 — else
// as applied): the characteristic's name WITH its method (the names repeat, and the method is
// part of what it is — Zadanie §5), its unit; up to three single determinations (3.6); the
// MEAN, typed by the participant — the portal never computes it for them (Реш. 88); the
// expanded uncertainty U; and k — required, prefilled with 2, passed on as reported (К22).
//
// A draft keeps what was typed, exactly: a half-typed number is kept, never «corrected». The
// checks of completeness and format are 6.3; the submission 6.4. Nothing here judges a value.

import { currentFinalList, finalSelectionsOf } from "./announcement-model";
import { selectionsOf } from "./application-model";
import { readNumber, pointKeys, pointsReady } from "./reference-values-model";
import type { Parameter } from "./types";

export const MAX_DETERMINATIONS = 3;
export const FIELD_MAX = 40; // characters a field keeps
export const DEFAULT_K = "2";

export interface ResultRow {
  /** the row's key: the characteristic's stable id (3.6), or «#i» for one from before it */
  key: string;
  /** its place in the scheme's list — the scoring's metric key (lib/scoring) */
  index: number;
  name: { bg: string; en: string };
  method: { bg: string; en: string };
  unit?: string;
  /** single determinations asked for, 1–3 */
  determinations: number;
  uRequired: boolean;
  step?: number;
  guardMin?: number;
  guardMax?: number;
}

export const rowKey = (p: Parameter, i: number): string => p.id ?? `#${i}`;

/** A row without a lasting id (from before 3.6) would lose what was typed the moment the scheme
 *  is saved and its ids given — such a form waits until it has them (as 5.7 does: review). */
export const rowsHaveIds = (rows: readonly ResultRow[]): boolean => rows.every((r) => !r.key.startsWith("#"));

/** The rows of a participation's form: the characteristics that run for it, in the scheme's order. */
export function resultRows(scheme: { status: string; lifecycle?: unknown; parameters: Parameter[] }, part: { id: string; selections?: Record<string, number>; characteristics?: number[] }): ResultRow[] {
  const n = scheme.parameters.length;
  const final = currentFinalList(scheme as Parameters<typeof currentFinalList>[0]);
  const sel = final?.runs ? finalSelectionsOf(part, { runs: final.runs }, n) : selectionsOf(part, n);
  return scheme.parameters.flatMap((p, i) => ((sel[String(i)] ?? 0) > 0 ? [{
    key: rowKey(p, i), index: i,
    name: { bg: p.characteristicBg, en: p.characteristicEn },
    method: { bg: p.standardBg, en: p.standardEn },
    unit: p.unit || undefined,
    determinations: Math.min(MAX_DETERMINATIONS, Math.max(1, Math.round(p.determinations ?? 1))),
    uRequired: !!p.uRequired,
    step: p.step, guardMin: p.guardMin, guardMax: p.guardMax,
  }] : []));
}

/** A row as typed: the determinations, the mean, U, k — strings, exactly as typed. */
export interface DraftRow { d: string[]; mean: string; U: string; k: string; /** declared not reported (N/R) for this characteristic — Реш. 19, 20 */ nr?: boolean }
/** The test period — when the participant tested (6.3: inside the scheme's dates). */
export interface TestPeriod { from: string; to: string }
export interface ResultDraft { v: 1; rows: Record<string, DraftRow>; period?: TestPeriod }

// a string only — anything else posted is nothing (a crafted object never reaches String(): 6.1 review)
const typed = (v: unknown) => (typeof v === "string" ? v : "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, FIELD_MAX);

/** The fields a form names: `d_<key>_<j>`, `mean_<key>`, `U_<key>`, `k_<key>` — only the rows'. */
export const fieldName = (kind: "d" | "mean" | "U" | "k" | "nr", key: string, j?: number) => (kind === "d" ? `d_${key}_${j}` : `${kind}_${key}`);

/** The draft as typed, from the form — only the fields the rows have; k prefilled with 2 when never typed. */
export function readDraft(get: (name: string) => unknown, rows: readonly ResultRow[]): ResultDraft {
  const out: Record<string, DraftRow> = {};
  for (const r of rows) {
    const kRaw = get(fieldName("k", r.key));
    const nr = get(fieldName("nr", r.key));
    out[r.key] = {
      d: Array.from({ length: r.determinations }, (_, j) => typed(get(fieldName("d", r.key, j)))),
      mean: typed(get(fieldName("mean", r.key))),
      U: typed(get(fieldName("U", r.key))),
      k: kRaw === undefined || kRaw === null ? DEFAULT_K : typed(kRaw),
      nr: nr === "on" || nr === true || nr === "1",
    };
  }
  const day = (v: unknown) => typed(v).slice(0, 10);
  return { v: 1, rows: out, period: { from: day(get("p_from")), to: day(get("p_to")) } };
}

/** A stored draft read back safely — whatever its shape, only the rows the form has now. */
export function draftFor(stored: unknown, rows: readonly ResultRow[]): ResultDraft {
  const src = (stored && typeof stored === "object" && (stored as ResultDraft).rows && typeof (stored as ResultDraft).rows === "object") ? (stored as ResultDraft).rows : {};
  const period = stored && typeof stored === "object" && (stored as ResultDraft).period && typeof (stored as ResultDraft).period === "object" ? (stored as ResultDraft).period! : { from: "", to: "" };
  return readDraft((name) => {
    if (name === "p_from") return period.from;
    if (name === "p_to") return period.to;
    const m = /^(d|mean|U|k|nr)_(.+?)(?:_(\d))?$/.exec(name);
    if (!m) return undefined;
    const row = (src as Record<string, Partial<DraftRow>>)[m[2]];
    if (m[1] === "nr") return row?.nr ? "on" : "";
    if (!row) return m[1] === "k" ? undefined : "";
    if (m[1] === "d") return Array.isArray(row.d) ? row.d[Number(m[3])] ?? "" : "";
    return (row as Record<string, unknown>)[m[1]];
  }, rows);
}

/** 5.7's rule: one decimal comma or point, a minus, an exponent — a mix like «1,234.5» refused. */
export const readValue = readNumber;

/** The fields typed that are not numbers — said neutrally, never about the value (Реш. 88). */
export function notNumbers(draft: ResultDraft, rows: readonly ResultRow[]): { key: string; field: string }[] {
  const out: { key: string; field: string }[] = [];
  for (const r of rows) {
    const x = draft.rows[r.key];
    if (!x || x.nr) continue;
    x.d.forEach((v, j) => { if (v && readValue(v) === null) out.push({ key: r.key, field: `d${j + 1}` }); });
    for (const f of ["mean", "U", "k"] as const) if (x[f] && readValue(x[f]) === null) out.push({ key: r.key, field: f });
  }
  return out;
}

/** Is anything typed at all? (an untouched form is no draft) */
export const draftHasContent = (d: ResultDraft): boolean =>
  Object.values(d.rows).some((r) => r.mean || r.U || r.d.some(Boolean) || (r.k && r.k !== DEFAULT_K));

// ── calibration, per M2 (plan part 6.2; Zadanie §11; D1) ─────────────────────────────────────
// GENERAL INFO, then one row per calibration point × direction (5.7's keys — the point's lasting
// id): the reference value (the participant's reference equipment), the measured value (the PT
// item), the ERROR — measured minus reference, computed and shown, never typed (D1) — U at k = 2,
// CMC (information only), and N/A for a point outside the lab's scope: a declared choice, never
// an arithmetic error.


export interface CalRow { key: string; nominal: string; direction?: { bg: string; en: string } }

/** The calibration's rows — the points × the directions, by the points' lasting ids. */
export const calRows = (cal: Parameters<typeof pointKeys>[0]): CalRow[] => pointKeys(cal).map((k) => ({ key: k.key, nominal: k.nominal, direction: k.direction }));
export const calRowsReady = (cal: Parameters<typeof pointsReady>[0]): boolean => !!cal && pointsReady(cal);

export const GENERAL_FIELDS = ["labName", "manufacturer", "model", "serial", "dateFrom", "dateTo", "tempMin", "tempMax", "otherConditions", "method", "signedOn", "signedBy"] as const;
export type GeneralField = (typeof GENERAL_FIELDS)[number];
/** The general info's fields that name a laboratory or a person — identity in the round export (rule 3). */
export const GENERAL_IDENTITY: readonly GeneralField[] = ["labName", "signedBy"];
const GENERAL_MAX: Partial<Record<GeneralField, number>> = { otherConditions: 300, method: 500, labName: 160, signedBy: 120 };

export interface CalPointDraft { ref: string; meas: string; U: string; cmc: string; na: boolean }
export interface CalDraft { v: 1; kind: "C"; general: Record<GeneralField, string>; points: Record<string, CalPointDraft> }

export const calField = (kind: "ref" | "meas" | "U" | "cmc" | "na", key: string) => `${kind}_${key}`;
export const genField = (f: GeneralField) => `g_${f}`;

const typedTo = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max);

/** The calibration draft as typed — only the rows' and the general info's fields. */
export function readCalDraft(get: (name: string) => unknown, rows: readonly CalRow[]): CalDraft {
  const general = Object.fromEntries(GENERAL_FIELDS.map((f) => [f, typedTo(get(genField(f)), GENERAL_MAX[f] ?? FIELD_MAX)])) as Record<GeneralField, string>;
  const points: Record<string, CalPointDraft> = {};
  for (const r of rows) {
    const na = get(calField("na", r.key));
    points[r.key] = { ref: typedTo(get(calField("ref", r.key)), FIELD_MAX), meas: typedTo(get(calField("meas", r.key)), FIELD_MAX), U: typedTo(get(calField("U", r.key)), FIELD_MAX), cmc: typedTo(get(calField("cmc", r.key)), FIELD_MAX), na: na === true || na === "on" || na === "1" };
  }
  return { v: 1, kind: "C", general, points };
}

/** A stored calibration draft read back safely — only the form's fields now. */
export function calDraftFor(stored: unknown, rows: readonly CalRow[]): CalDraft {
  const src = stored && typeof stored === "object" ? (stored as Partial<CalDraft>) : {};
  const g = src.general && typeof src.general === "object" ? (src.general as Record<string, unknown>) : {};
  const pts = src.points && typeof src.points === "object" ? (src.points as Record<string, Partial<CalPointDraft>>) : {};
  return readCalDraft((name) => {
    if (name.startsWith("g_")) return g[name.slice(2)];
    const m = /^(ref|meas|U|cmc|na)_(.+)$/.exec(name);
    if (!m) return undefined;
    const p = pts[m[2]];
    return p ? (m[1] === "na" ? (p.na ? "on" : "") : p[m[1] as "ref" | "meas" | "U" | "cmc"]) : undefined;
  }, rows);
}

// exact decimal arithmetic for the error — never a float's noise (0.3 − 0.1 is 0.2, not 0.19999…),
// an exponent included: «1.5e-3» is 15 × 10^−4 (6.2 review)
const TEN = BigInt(10), ZERO = BigInt(0); // (no BigInt literals: the build targets below ES2020)
function decimalOf(s: string): { int: bigint; scale: number } | null {
  if (!s.trim() || readValue(s) === null) return null;
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  const m = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/.exec(t);
  if (!m) return null;
  const exp = m[4] ? Number(m[4]) : 0;
  if (!Number.isFinite(exp) || Math.abs(exp) > 300) return null;
  const frac = m[3] ?? "";
  let int = BigInt(((m[2] || "0") + frac) || "0");
  let scale = frac.length - exp;
  if (scale < 0) { int *= TEN ** BigInt(-scale); scale = 0; }
  return { int: m[1] === "-" ? -int : int, scale };
}
/** The error, measured minus reference (D1), as a string — exact; null when either is missing or
 *  not a number. */
export function computeError(ref: string, meas: string): string | null {
  const a = decimalOf(meas), b = decimalOf(ref);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const d = a.int * TEN ** BigInt(scale - a.scale) - b.int * TEN ** BigInt(scale - b.scale);
  const neg = d < ZERO, abs = (neg ? -d : d).toString().padStart(scale + 1, "0");
  const out = scale ? `${abs.slice(0, -scale)}.${abs.slice(-scale)}` : abs;
  return `${neg ? "-" : ""}${out}`;
}
/** The error as a person reads it — a decimal comma in Bulgarian, as the form is typed (review). */
export const showError = (e: string | null, lang: "bg" | "en"): string | null => (e === null || lang === "en" ? e : e.replace(".", ","));

/** The calibration fields typed that are not numbers yet — a point declared N/A is not asked. */
export function notNumbersCal(draft: CalDraft, rows: readonly CalRow[]): { key: string; field: string }[] {
  const out: { key: string; field: string }[] = [];
  for (const r of rows) {
    const p = draft.points[r.key];
    if (!p || p.na) continue;
    for (const f of ["ref", "meas", "U", "cmc"] as const) if (p[f] && readValue(p[f]) === null) out.push({ key: r.key, field: f });
  }
  for (const f of ["tempMin", "tempMax"] as const) if (draft.general[f] && readValue(draft.general[f]) === null) out.push({ key: "general", field: f });
  return out;
}

/** A submission's data as the round export's CODED part holds it: the laboratory's name and the
 *  name of who filled it removed (rule 3 allows them on the lab's own form; they are identity). */
export function codedSubmissionData(data: unknown): unknown {
  if (!data || typeof data !== "object" || (data as CalDraft).kind !== "C") return data;
  const d = data as CalDraft;
  const general = Object.fromEntries(Object.entries(d.general ?? {}).filter(([k]) => !GENERAL_IDENTITY.includes(k as GeneralField)));
  return { ...d, general };
}

/** What a stored draft holds for points or characteristics no longer in the scheme — kept through
 *  every save and shown as «no longer in the scheme», never dropped (as 5.7's values: review). */
export function orphansOf(stored: unknown, keys: readonly string[]): Record<string, unknown> {
  const src = stored && typeof stored === "object" ? stored as { rows?: unknown; points?: unknown } : {};
  const bag = (src.points && typeof src.points === "object" ? src.points : src.rows && typeof src.rows === "object" ? src.rows : {}) as Record<string, unknown>;
  const keep = new Set(keys);
  return Object.fromEntries(Object.entries(bag).filter(([k, v]) => !keep.has(k) && v && typeof v === "object").slice(0, 200));
}

// ── the checks before submission (plan part 6.3; Zadanie §7, §12; rule 12; Реш. 88) ─────────
// COMPLETENESS AND FORMAT ONLY: the fields required, numbers that are numbers, the physical
// limits the design sets (2.0's physical_min / physical_max — plausibility, said neutrally), U
// not zero, k given with U, the dates inside the scheme's, at least one point in scope. Never a
// word about whether a value is high, low or unusual; never a mean computed for the lab.

export type CheckWhy = "required" | "number" | "guard" | "positive" | "k" | "date" | "order" | "range" | "period" | "window" | "none-in-scope" | "none-reported" | "nr-value" | "no-u";
/** A problem blocks the submission (6.4); a notice is said and the lab goes on — a value it does
 *  not report is N/R for that value (Реш. 19, 20), never a reason it cannot submit (6.3 review). */
export interface CheckProblem { key: string; field: string; why: CheckWhy; level?: "notice"; limits?: { min?: number; max?: number; from?: string; to?: string } }

export const CHECK_TEXT: Record<CheckWhy, { bg: string; en: string }> = {
  required: { bg: "не е попълнено", en: "not filled in" },
  number: { bg: "не е число (една десетична запетая или точка)", en: "not a number (one decimal comma or point)" },
  guard: { bg: "извън физически възможните граници, зададени в плана", en: "outside the physically possible limits set in the plan" },
  positive: { bg: "разширената неопределеност трябва да е положително число", en: "the expanded uncertainty must be a positive number" },
  k: { bg: "коефициентът на покритие трябва да е положително число", en: "the coverage factor must be a positive number" },
  date: { bg: "не е дата", en: "not a date" },
  order: { bg: "началото е след края", en: "the start is after the end" },
  range: { bg: "минимумът е над максимума", en: "the minimum is above the maximum" },
  period: { bg: "извън датите на схемата", en: "outside the scheme's dates" },
  window: { bg: "извън срока, в който уредът е при вас", en: "outside the window in which the device is with you" },
  "none-in-scope": { bg: "поне една точка трябва да е в обхвата ви (не N/A)", en: "at least one point must be within your scope (not N/A)" },
  "none-reported": { bg: "поне една характеристика трябва да е докладвана", en: "at least one characteristic must be reported" },
  "nr-value": { bg: "не е докладвано — за тази стойност участието ще е N/R", en: "not reported — the participation is N/R for this value" },
  "no-u": { bg: "без U тази точка не се оценява с Eₙ", en: "without U this point is not evaluated by Eₙ" },
};

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const num = (s: string) => { const v = readValue(s); return typeof v === "number" ? v : null; };
/** A date range inside ANY of these windows — a laboratory a chain visits twice has two (review). */
const insideAny = (from: string, to: string, windows: readonly { from?: string; to?: string }[]) => !windows.length || windows.some((w) => (!w.from || from >= w.from) && (!w.to || to <= w.to));

/** Testing: a characteristic is reported or declared not reported (N/R, Реш. 19, 20) — at least one
 *  reported. A reported one: its mean, U where the design requires it, k wherever U is given (К22) —
 *  each a number; a single determination not given is a NOTICE (N/R for that value), never a block;
 *  the mean and the determinations inside the plan's physical limits (neutrally); U and k positive;
 *  the test period a real date range (one day: «до» may stay empty) inside the scheme's dates — from
 *  the participation's first shipment (else the planned dispatch) to the results deadline in force. */
export function checkTesting(draft: ResultDraft, rows: readonly ResultRow[], limits: { from?: string; to?: string } = {}): CheckProblem[] {
  const out: CheckProblem[] = [];
  let reported = 0;
  for (const r of rows) {
    const x = draft.rows[r.key] ?? { d: [], mean: "", U: "", k: "" };
    if (x.nr) continue;
    reported++;
    const guard = (field: string, v: string) => {
      const n = num(v);
      if (n === null) return;
      if ((r.guardMin !== undefined && n < r.guardMin) || (r.guardMax !== undefined && n > r.guardMax)) out.push({ key: r.key, field, why: "guard", limits: { min: r.guardMin, max: r.guardMax } });
    };
    for (let j = 0; j < r.determinations; j++) {
      const v = x.d[j] ?? "";
      if (!v) out.push({ key: r.key, field: `d${j + 1}`, why: "nr-value", level: "notice" });
      else if (num(v) === null) out.push({ key: r.key, field: `d${j + 1}`, why: "number" });
      else guard(`d${j + 1}`, v);
    }
    if (!x.mean) out.push({ key: r.key, field: "mean", why: "required" });
    else if (num(x.mean) === null) out.push({ key: r.key, field: "mean", why: "number" });
    else guard("mean", x.mean);
    if (!x.U) { if (r.uRequired) out.push({ key: r.key, field: "U", why: "required" }); }
    else if (num(x.U) === null) out.push({ key: r.key, field: "U", why: "number" });
    else if (num(x.U)! <= 0) out.push({ key: r.key, field: "U", why: "positive" });
    // k with U (К22): required wherever U is given; a positive number
    if (!x.k) { if (x.U || r.uRequired) out.push({ key: r.key, field: "k", why: "required" }); }
    else if (num(x.k) === null) out.push({ key: r.key, field: "k", why: "number" });
    else if (num(x.k)! <= 0) out.push({ key: r.key, field: "k", why: "k" });
  }
  if (rows.length && reported === 0) out.push({ key: "rows", field: "nr", why: "none-reported" });
  const p = draft.period ?? { from: "", to: "" };
  const to = p.to || p.from; // one day: «до» may stay empty (the Results Sheet's «дата/период»)
  if (!p.from) out.push({ key: "period", field: "from", why: "required" });
  else if (!isDay(p.from)) out.push({ key: "period", field: "from", why: "date" });
  if (p.to && !isDay(p.to)) out.push({ key: "period", field: "to", why: "date" });
  if (p.from && isDay(p.from) && isDay(to)) {
    if (p.from > to) out.push({ key: "period", field: "to", why: "order" });
    else {
      if (limits.from && p.from < limits.from) out.push({ key: "period", field: "from", why: "period", limits: { from: limits.from, to: limits.to } });
      if (limits.to && to > limits.to) out.push({ key: "period", field: "to", why: "period", limits: { from: limits.from, to: limits.to } });
    }
  }
  return out;
}

/** Does the submission stand? Only the blocking problems count — notices are said, never block. */
export const blocking = (problems: readonly CheckProblem[]) => problems.filter((p) => p.level !== "notice");

const GENERAL_REQUIRED: readonly GeneralField[] = ["manufacturer", "model", "serial", "dateFrom", "dateTo", "tempMin", "tempMax", "method", "signedOn", "signedBy"];

/** Calibration (M2): the general info whole (the lab's name and the other conditions optional), the
 *  temperatures numbers in order, the measurement dates in order and inside the lab's window (from
 *  the device's arrival to its window's end, an extension included); every point in scope with its
 *  reference value, measured value and U, numbers, U not 0, CMC a number when given; at least one
 *  point in scope. */
export function checkCalibration(draft: CalDraft, rows: readonly CalRow[], windows: readonly { from?: string; to?: string }[] = []): CheckProblem[] {
  const out: CheckProblem[] = [];
  const g = draft.general;
  for (const f of GENERAL_REQUIRED) if (!g[f]) out.push({ key: "general", field: f, why: "required" });
  for (const f of ["tempMin", "tempMax"] as const) if (g[f] && num(g[f]) === null) out.push({ key: "general", field: f, why: "number" });
  if (num(g.tempMin) !== null && num(g.tempMax) !== null && num(g.tempMin)! > num(g.tempMax)!) out.push({ key: "general", field: "tempMax", why: "range" });
  for (const f of ["dateFrom", "dateTo", "signedOn"] as const) if (g[f] && !isDay(g[f])) out.push({ key: "general", field: f, why: "date" });
  if (isDay(g.dateFrom) && isDay(g.dateTo)) {
    if (g.dateFrom > g.dateTo) out.push({ key: "general", field: "dateTo", why: "order" });
    // inside the lab's window with the device — any of them, a chain visiting it twice (review)
    else if (!insideAny(g.dateFrom, g.dateTo, windows)) out.push({ key: "general", field: "dateFrom", why: "window", limits: windows.length === 1 ? { from: windows[0].from, to: windows[0].to } : undefined });
  }
  let inScope = 0;
  for (const r of rows) {
    const p = draft.points[r.key];
    if (!p || p.na) continue;
    inScope++;
    for (const f of ["ref", "meas"] as const) {
      if (!p[f]) out.push({ key: r.key, field: f, why: "required" });
      else if (num(p[f]) === null) out.push({ key: r.key, field: f, why: "number" });
    }
    // a point without U is not evaluated by Eₙ (docs/results-c) — said, never a block (review)
    if (!p.U) out.push({ key: r.key, field: "U", why: "no-u", level: "notice" });
    else if (num(p.U) === null) out.push({ key: r.key, field: "U", why: "number" });
    else if (num(p.U)! <= 0) out.push({ key: r.key, field: "U", why: "positive" });
    if (p.cmc && num(p.cmc) === null) out.push({ key: r.key, field: "cmc", why: "number" });
  }
  if (rows.length && inScope === 0) out.push({ key: "points", field: "na", why: "none-in-scope" });
  return out;
}
