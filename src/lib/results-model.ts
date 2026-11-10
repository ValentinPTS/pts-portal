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
import { readNumber } from "./reference-values-model";
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
export interface DraftRow { d: string[]; mean: string; U: string; k: string }
export interface ResultDraft { v: 1; rows: Record<string, DraftRow> }

// a string only — anything else posted is nothing (a crafted object never reaches String(): 6.1 review)
const typed = (v: unknown) => (typeof v === "string" ? v : "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, FIELD_MAX);

/** The fields a form names: `d_<key>_<j>`, `mean_<key>`, `U_<key>`, `k_<key>` — only the rows'. */
export const fieldName = (kind: "d" | "mean" | "U" | "k", key: string, j?: number) => (kind === "d" ? `d_${key}_${j}` : `${kind}_${key}`);

/** The draft as typed, from the form — only the fields the rows have; k prefilled with 2 when never typed. */
export function readDraft(get: (name: string) => unknown, rows: readonly ResultRow[]): ResultDraft {
  const out: Record<string, DraftRow> = {};
  for (const r of rows) {
    const kRaw = get(fieldName("k", r.key));
    out[r.key] = {
      d: Array.from({ length: r.determinations }, (_, j) => typed(get(fieldName("d", r.key, j)))),
      mean: typed(get(fieldName("mean", r.key))),
      U: typed(get(fieldName("U", r.key))),
      k: kRaw === undefined || kRaw === null ? DEFAULT_K : typed(kRaw),
    };
  }
  return { v: 1, rows: out };
}

/** A stored draft read back safely — whatever its shape, only the rows the form has now. */
export function draftFor(stored: unknown, rows: readonly ResultRow[]): ResultDraft {
  const src = (stored && typeof stored === "object" && (stored as ResultDraft).rows && typeof (stored as ResultDraft).rows === "object") ? (stored as ResultDraft).rows : {};
  return readDraft((name) => {
    const m = /^(d|mean|U|k)_(.+?)(?:_(\d))?$/.exec(name);
    if (!m) return undefined;
    const row = (src as Record<string, Partial<DraftRow>>)[m[2]];
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
    if (!x) continue;
    x.d.forEach((v, j) => { if (v && readValue(v) === null) out.push({ key: r.key, field: `d${j + 1}` }); });
    for (const f of ["mean", "U", "k"] as const) if (x[f] && readValue(x[f]) === null) out.push({ key: r.key, field: f });
  }
  return out;
}

/** Is anything typed at all? (an untouched form is no draft) */
export const draftHasContent = (d: ResultDraft): boolean =>
  Object.values(d.rows).some((r) => r.mean || r.U || r.d.some(Boolean) || (r.k && r.k !== DEFAULT_K));
