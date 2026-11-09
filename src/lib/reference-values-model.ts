// The calibration chain inside the round — the reference values per point (plan part 5.7;
// Zadanie «Приписана и референтна стойност»; D3; PTS's 2.1 template, sheet «Calibration»).
// Pure.
//
// A calibration scheme's object is calibrated by the reference laboratory BEFORE the first
// participant and AGAIN after the last (the closing reference calibration ends the
// measurements — 3.2). For each calibration point PTS records what 2.0's «Calibration» sheet
// asks (D3): x_ref_before and x_ref_after — the reference laboratory's ERROR at the point
// (the instrument's indication minus the reference value), the same quantity a participant
// reports as its `mean` —, u_calibration, u_other and the coverage factor. PTS_Analysis 2.0
// computes from them; the portal shows, for PTS only, what the Zadanie defines, in errors:
//     X_ref = (X_ref1 + X_ref2) / 2        u_stab = |X_ref1 − X_ref2| / (2·√3)
// What u_other holds is asked of PTS (REPLY-3-BG.md, г) — it is kept as typed, never derived.
// k is 2 unless justified otherwise (Zadanie) — a k other than 2 carries its reason.
//
// Every save is a version — who, when, the whole table — appended; the latest counts. A row
// is keyed by the point's stable id (3.6) and, when the scheme has directions, the
// direction's own words (as scoring reads them, from the English list): a reordered point or
// direction keeps its values; a removed or renamed one leaves them as «no longer in the
// scheme» — kept, shown, never moved onto another (5.7 review).

export interface ReferenceRow {
  xBefore?: number;
  xAfter?: number;
  uCal?: number;
  uOther?: number;
  k?: number;
}
export interface ReferenceVersion { at: string; by: string; rows: Record<string, ReferenceRow>; /** why a k other than 2 */ kReason?: string }
export interface ReferenceValues { versions: ReferenceVersion[] }

export interface PointKey { key: string; nominal: string; direction?: { bg: string; en: string }; pointIdx: number; dirIdx?: number }

const slug = (t: string) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "dir";

/** The calibration's points, each with its key — × the directions, when it has some (the
 *  English list, as scoring reads it — scoring.ts metricsForScheme, param-remap
 *  effectiveDirections). `dirIdx`/`pointIdx` are the scoring's metric key `${dirIdx}:${pointIdx}`. */
export function pointKeys(cal: { points: string[]; pointIds?: string[]; directionsBg?: string[]; directionsEn?: string[] } | undefined): PointKey[] {
  if (!cal) return [];
  const ids = cal.points.map((_, i) => cal.pointIds?.[i] || `pt-${i + 1}`);
  const en = cal.directionsEn ?? [];
  if (!en.length) return cal.points.map((nominal, i) => ({ key: ids[i], nominal, pointIdx: i }));
  return en.flatMap((dEn, d) => cal.points.map((nominal, i) => ({ key: `${ids[i]}|${slug(dEn)}`, nominal, pointIdx: i, dirIdx: d, direction: { bg: cal.directionsBg?.[d] || dEn, en: dEn } })));
}

/** Points with their stable ids (3.6) — a scheme saved before 3.6 has none, and a key by place
 *  would move values when points move: save the scheme's editor once first (review). */
export const pointsReady = (cal: { points: string[]; pointIds?: string[] } | undefined): boolean =>
  !!cal && cal.points.length > 0 && (cal.pointIds?.length ?? 0) === cal.points.length && cal.pointIds!.every((x) => !!x);

/** What the form was drawn for — the points and directions, by key; a form drawn before they
 *  changed is refused (review). */
export const fingerprint = (keys: readonly PointKey[]): string => keys.map((k) => k.key).join(",");

/** Values kept under keys the scheme no longer has (a point or direction removed or renamed). */
export const orphans = (rows: Record<string, ReferenceRow>, keys: readonly PointKey[]): string[] => {
  const live = new Set(keys.map((k) => k.key));
  return Object.keys(rows).filter((k) => !live.has(k));
};

/** k as 2.0 reads it: 2 unless given (Zadanie). */
export const kOf = (row: ReferenceRow | undefined): number => row?.k ?? 2;

/** The latest version's rows — or none. */
export const currentRows = (v: ReferenceValues | undefined): Record<string, ReferenceRow> => v?.versions?.[v.versions.length - 1]?.rows ?? {};

const FIELDS = ["xBefore", "xAfter", "uCal", "uOther", "k"] as const;
export type ReferenceField = (typeof FIELDS)[number];
export const REFERENCE_FIELDS: readonly ReferenceField[] = FIELDS;

/** A number as typed — the decimals after a comma or a point (one of them, once); a minus; an
 *  exponent; empty is «not yet». «1,234.5» or «1.234,5» (thousands and decimals mixed) is
 *  refused, never guessed (review). */
export function readNumber(v: unknown): number | undefined | null {
  const raw = String(v ?? "").trim().replace(/\s/g, "");
  if (!raw) return undefined;
  const commas = (raw.match(/,/g) ?? []).length, points = (raw.match(/\./g) ?? []).length;
  if (commas + points > 1) return null;
  const t = raw.replace(",", ".");
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ReferenceProblem = { key: string; field: ReferenceField; why: "number" | "negative" | "zero" | "k" };
/** The table as typed: every value a number (or empty); u (calibration) above 0, u (other)
 *  not negative, k from 1 to 10. Only the points of the scheme are read. */
export function readReferenceTable(get: (name: string) => unknown, keys: readonly PointKey[]): { ok: true; rows: Record<string, ReferenceRow> } | { ok: false; problem: ReferenceProblem } {
  const rows: Record<string, ReferenceRow> = {};
  for (const { key } of keys) {
    const row: ReferenceRow = {};
    for (const f of FIELDS) {
      const n = readNumber(get(`${f}__${key}`));
      if (n === null) return { ok: false, problem: { key, field: f, why: "number" } };
      if (n === undefined) continue;
      if ((f === "uCal" || f === "uOther") && n < 0) return { ok: false, problem: { key, field: f, why: "negative" } };
      if (f === "uCal" && n === 0) return { ok: false, problem: { key, field: f, why: "zero" } };
      if (f === "k" && (n < 1 || n > 10)) return { ok: false, problem: { key, field: f, why: "k" } };
      row[f] = n;
    }
    if (Object.keys(row).length) rows[key] = row;
  }
  return { ok: true, rows };
}

/** Is a reason needed — a k other than 2 anywhere in the table? */
export const kNeedsReason = (rows: Record<string, ReferenceRow>): boolean => Object.values(rows).some((r) => r.k !== undefined && r.k !== 2);

/** One row the same as another — field by field, never by its JSON (the database re-sorts a
 *  row's keys — 3.6, review). */
export const sameRow = (a: ReferenceRow | undefined, b: ReferenceRow | undefined): boolean => FIELDS.every((f) => a?.[f] === b?.[f]);
/** Did anything change? (A save that changes nothing is no new version.) */
export const sameRows = (a: Record<string, ReferenceRow>, b: Record<string, ReferenceRow>): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => sameRow(a[k], b[k]));

/** The Zadanie's two quantities for one point (in errors), when both are in — for PTS's eye;
 *  2.0 computes the official ones. */
export function derived(row: ReferenceRow | undefined): { xRef: number; uStab: number } | null {
  if (row?.xBefore === undefined || row?.xAfter === undefined) return null;
  return { xRef: (row.xBefore + row.xAfter) / 2, uStab: Math.abs(row.xBefore - row.xAfter) / (2 * Math.sqrt(3)) };
}

/** Which reference stop a stop of the chain is: before every laboratory, after every one — or neither. */
export function referenceRole(stops: readonly { id: string; kind: string }[], stopId: string): "before" | "after" | null {
  const i = stops.findIndex((s) => s.id === stopId);
  if (i === -1 || stops[i].kind !== "ref") return null;
  const labs = stops.flatMap((s, j) => (s.kind === "lab" ? [j] : []));
  if (!labs.length) return null;
  if (i < Math.min(...labs)) return "before";
  if (i > Math.max(...labs)) return "after";
  return null;
}

/** What is still missing for 2.0: per point, the readings before and after and u_calibration —
 *  the coverage factor defaults to 2 (Zadanie), u_other may be empty. */
export function missingFor2(keys: readonly PointKey[], rows: Record<string, ReferenceRow>): { before: number; after: number; uCal: number } {
  let before = 0, after = 0, uCal = 0;
  for (const { key } of keys) {
    const r = rows[key];
    if (r?.xBefore === undefined) before++;
    if (r?.xAfter === undefined) after++;
    if (r?.uCal === undefined) uCal++;
  }
  return { before, after, uCal };
}

export const REFERENCE_FIELD_LABEL: Record<ReferenceField, { bg: string; en: string }> = {
  xBefore: { bg: "Грешка преди (X_ref1)", en: "Error before (X_ref1)" },
  xAfter: { bg: "Грешка след (X_ref2)", en: "Error after (X_ref2)" },
  uCal: { bg: "u (калибриране)", en: "u (calibration)" },
  uOther: { bg: "u (друго)", en: "u (other)" },
  k: { bg: "k", en: "k" },
};
