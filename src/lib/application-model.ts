// An application entered by PTS (plan part 5.1; Zadanie §7 «Заявяване»; Реш. 123, 14).
// Pure.
//
// The application holds the number of participations PER CHARACTERISTIC («Заявката
// съдържа брой участия по характеристика»); the objects are computed from it («Броят на
// обектите се изчислява автоматично от това»). Here, by default (to be confirmed by
// PTS): one object serves every characteristic of one participation set, so a
// participation needs as many objects as its largest count; a calibration scheme
// sends no objects — its device travels.
//
// No approval act: entering it makes the laboratory a participant (Реш. 123). PTS may
// only REFUSE it — with a category and a reason (Реш. 14). An application entered
// wrongly is ANNULLED, with its source; one the laboratory takes back is WITHDRAWN,
// with its source. Each is set once and takes the participation out of the round; it
// and its code stay (nothing deleted, a code never reused).

export const MAX_PER_CHARACTERISTIC = 10;
export const REASON_MAX = 300;

export type Selections = Record<string, number>;
export type StandingState = "refused" | "annulled" | "withdrawn";
export interface Standing {
  state: StandingState;
  at: string;
  by: string;
  /** a refusal's category (REFUSAL_CATEGORIES) */
  category?: string;
  /** a refusal's reason */
  reason?: string;
  /** an annulment's or a withdrawal's source — the letter, the e-mail, PTS's own error */
  source?: string;
}

export const REFUSAL_CATEGORIES = [
  { key: "incomplete", bg: "непълна заявка", en: "the application is incomplete" },
  { key: "conditions", bg: "не отговаря на условията на схемата", en: "it does not meet the scheme's conditions" },
  { key: "capacity", bg: "няма капацитет за още участници", en: "there is no capacity for more participants" },
  { key: "late", bg: "подадена след срока за заявяване", en: "submitted after the application deadline" },
  { key: "other", bg: "друго", en: "other" },
] as const;
export type RefusalCategory = (typeof REFUSAL_CATEGORIES)[number]["key"];

export const STANDING_LABEL: Record<StandingState, { bg: string; en: string }> = {
  refused: { bg: "отказана", en: "refused" },
  annulled: { bg: "анулирана", en: "annulled" },
  withdrawn: { bg: "оттеглена", en: "withdrawn" },
};

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F​-‏﻿�]/g, " ").replace(/\s+/g, " ").trim();

/** The counts per characteristic, as typed (`sel_<index>`): whole numbers 0–10, at least
 *  one characteristic; only the scheme's own characteristics. */
export function readSelections(input: Record<string, unknown>, characteristicCount: number):
  { ok: true; selections: Selections } | { ok: false; problem: "count" | "none" } {
  const out: Selections = {};
  for (let i = 0; i < characteristicCount; i++) {
    const raw = clean(input[`sel_${i}`]);
    if (raw === "") continue;
    if (!/^\d{1,2}$/.test(raw)) return { ok: false, problem: "count" };
    const n = parseInt(raw, 10);
    if (n > MAX_PER_CHARACTERISTIC) return { ok: false, problem: "count" };
    if (n > 0) out[String(i)] = n;
  }
  return Object.keys(out).length ? { ok: true, selections: out } : { ok: false, problem: "none" };
}

/** The selections of a participation — its own, or (an older one, before 5.1) one of
 *  each of its characteristics; none recorded means every characteristic, once. */
export function selectionsOf(p: { selections?: Selections; characteristics?: number[] }, characteristicCount: number): Selections {
  // its counts by characteristic — an online calibration application's «cal» key names
  // no characteristic, so it reads as an older participation does (5.2 review)
  if (p.selections && Object.entries(p.selections).some(([k, v]) => /^\d+$/.test(k) && v > 0)) return Object.fromEntries(Object.entries(p.selections).filter(([k]) => /^\d+$/.test(k)));
  const idx = p.characteristics?.length ? p.characteristics : Array.from({ length: characteristicCount }, (_, i) => i);
  return Object.fromEntries(idx.map((i) => [String(i), 1]));
}

/** The same counts per characteristic, whatever the order (a 0 is no count). */
export function sameSelections(a: Selections, b: Selections): boolean {
  const norm = (x: Selections) => JSON.stringify(Object.entries(x).filter(([, v]) => v > 0).sort(([p], [q]) => Number(p) - Number(q)));
  return norm(a) === norm(b);
}

/** The characteristics a set of selections takes (their indexes, in order). */
export const characteristicsOf = (sel: Selections): number[] => Object.keys(sel).map(Number).filter((n) => sel[String(n)] > 0).sort((a, b) => a - b);

/** The objects a participation needs (default, to be confirmed by PTS): its largest
 *  count — one object serves every characteristic of a set; none for calibration. */
export function objectsNeeded(sel: Selections, schemeType: "T" | "C"): number {
  if (schemeType === "C") return 0;
  return Math.max(0, ...Object.values(sel));
}

/** The participations (sets) an application makes (default, to be confirmed by PTS —
 *  the same rule as the objects): its largest count — one participation takes a set of
 *  its characteristics; a calibration application's count is its own. */
export const participationSets = (sel: Selections): number => Math.max(1, ...Object.values(sel).filter((n) => Number.isFinite(n) && n > 0));

/** Is the participation in the round — not refused, annulled or withdrawn? */
export const inRound = (p: { standing?: Standing | null }): boolean => !p.standing;

/** A refusal as typed: its category and its reason (3–300 characters). */
export function readRefusal(category: unknown, reason: unknown): { ok: true; category: RefusalCategory; reason: string } | { ok: false; problem: "category" | "reason" } {
  const c = clean(category);
  if (!REFUSAL_CATEGORIES.some((x) => x.key === c)) return { ok: false, problem: "category" };
  const r = clean(reason);
  if ([...r].length < 3 || [...r].length > REASON_MAX) return { ok: false, problem: "reason" };
  return { ok: true, category: c as RefusalCategory, reason: r };
}

/** An annulment's or a withdrawal's source (3–300 characters). */
export function readSource(v: unknown): string | null {
  const s = clean(v);
  return [...s].length >= 3 && [...s].length <= REASON_MAX ? s : null;
}

/** The database's shape of a standing (0039 participants_standing_shape), for the
 *  in-memory store to refuse what the database refuses. */
export function standingShapeOk(st: unknown): boolean {
  if (st === null || st === undefined) return true;
  if (typeof st !== "object" || Array.isArray(st)) return false;
  const x = st as Record<string, unknown>;
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const state = str(x.state);
  if (!["refused", "annulled", "withdrawn"].includes(state)) return false;
  if (!str(x.at).length || !str(x.by).trim().length) return false;
  if (state === "refused") return REFUSAL_CATEGORIES.some((c) => c.key === str(x.category)) && [...str(x.reason).trim()].length >= 3;
  return [...str(x.source).trim()].length >= 3;
}

/** Two standings the same, whatever the order of their keys (as jsonb compares). */
export function sameStanding(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
    : v ?? null);
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

export const STANDING_PROBLEM_TEXT = {
  count: { bg: "броят участия по характеристика е цяло число от 0 до 10", en: "the number of participations per characteristic is a whole number from 0 to 10" },
  none: { bg: "заявката трябва да има поне една характеристика", en: "the application needs at least one characteristic" },
  category: { bg: "изберете категорията на отказа", en: "choose the refusal's category" },
  reason: { bg: "напишете основанието на отказа (3–300 знака)", en: "write the refusal's reason (3–300 characters)" },
  source: { bg: "посочете основанието — писмото, имейла или грешката (3–300 знака)", en: "name the source — the letter, the e-mail or the error (3–300 characters)" },
  already: { bg: "участието вече е извън кръга — това не се променя", en: "the participation is out of the round already — that is never changed" },
};
