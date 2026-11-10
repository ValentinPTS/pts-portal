// PTS's review after the deadline (plan part 6.7; Реш. 88; the spec's «три проверки след крайния
// срок»). Pure. A STAFF review — never shown to a laboratory. It checks the values AS SUBMITTED
// (typed); it blocks nothing and changes nothing: the results are evaluated as declared, and the
// findings go into the report as an individual note PTS writes.
//
//   testing — the declared mean against the determinations (exactly; for comparison, here only);
//             the reporting resolution against the characteristic's step; (U against CMC: none);
//   calibration — the points (orphans; N/A as declared); the realised reference against the nominal
//             (the deviation, exactly; a finding beyond the scheme's tolerance); U to at most two
//             significant figures, as typed; U against the declared CMC; the reported temperature
//             range against the scheme's. The error is not re-checked (D1; validation 8.6).

import { decimalOf, readValue } from "./results-model";

export type FindingKind = "mean-dets" | "resolution" | "ref-nominal" | "u-sigfigs" | "u-cmc" | "env" | "na" | "orphan" | "no-step" | "missing";
export interface Finding {
  key: string; field: string; kind: FindingKind;
  /** «finding» — something for the note; «info» — shown, nothing found (a deviation within the
   *  tolerance, a point declared N/A, no step to check against) */
  level: "finding" | "info";
  values: Record<string, string>;
}

const TEN = BigInt(10);
type Dec = { int: bigint; scale: number };
const at = (d: Dec, scale: number) => d.int * TEN ** BigInt(scale - d.scale);
const abs = (x: bigint) => (x < BigInt(0) ? -x : x);
const dec = (s: unknown): Dec | null => (typeof s === "string" && s.trim() ? decimalOf(s) : null);
const decOfNumber = (n: number | undefined): Dec | null => (typeof n === "number" && Number.isFinite(n) && n > 0 ? decimalOf(String(n)) : null);

/** A decimal as text (a point), at its scale. */
function show(int: bigint, scale: number): string {
  const neg = int < BigInt(0), digits = abs(int).toString().padStart(scale + 1, "0");
  const s = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return neg ? `-${s}` : s;
}
/** sum / n at `scale` decimals, rounded half away from zero — «≈» in front when not exact. */
function divShow(sum: Dec, n: number, scale: number): string {
  const num = sum.int * TEN ** BigInt(scale), den = BigInt(n) * TEN ** BigInt(sum.scale);
  const q = num / den, r = num % den;
  const up = abs(r) * BigInt(2) >= den ? (num < BigInt(0) ? BigInt(-1) : BigInt(1)) : BigInt(0);
  return `${r === BigInt(0) ? "" : "≈"}${show(q + up, scale)}`;
}

/** The resolution a number was TYPED at — the power of ten of its last digit, exponent included
 *  («1,2E2» → 1, i.e. tens; «5,20» → −2): the half-unit tolerance follows what was typed (review). */
function typedExp(s: string): number | null {
  const m = /^[-+]?\d*(?:[.,](\d*))?(?:[eE]([-+]?\d+))?$/.exec(s.trim().replace(/\s/g, ""));
  if (!m) return null;
  return -((m[1] ?? "").length) + (m[2] ? Number(m[2]) : 0);
}

/** The significant figures of a number AS TYPED: leading zeros never count; trailing zeros count
 *  after a decimal separator, not at the end of an integer («120» → 2, «1,20» → 3). */
export function sigFigs(typed: string): number | null {
  const t = typed.trim().replace(/\s/g, "").replace(",", ".").replace(/^[-+]/, "");
  const m = /^(\d*)(?:\.(\d*))?(?:[eE][-+]?\d+)?$/.exec(t);
  if (!m || !(m[1] || m[2])) return null;
  const hasPoint = t.includes(".");
  let digits = (m[1] ?? "") + (m[2] ?? "");
  digits = digits.replace(/^0+/, "");
  if (!hasPoint) digits = digits.replace(/0+$/, "");
  return digits.length;
}

// ── testing ──────────────────────────────────────────────────────────────────
type TRow = { d?: unknown; mean?: unknown; U?: unknown; k?: unknown; nr?: unknown };
/** A characteristic's checks. `step`: its reporting step (3.6), if set. */
export function reviewTesting(key: string, row: TRow | undefined, step?: number): Finding[] {
  if (!row) return [{ key, field: "", kind: "missing", level: "info", values: {} }];
  if (row.nr === true) return [];
  const out: Finding[] = [];
  const mean = typeof row.mean === "string" ? row.mean.trim() : "";
  // only what reads as an exact decimal — «1e-301» reads as a number but not as a decimal: left out,
  // never a crash of the whole page (6.7 review)
  const dets = (Array.isArray(row.d) ? row.d : []).map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x && dec(x) !== null);
  const m = dec(mean);
  // 1. the declared mean against the determinations — two or more given
  if (m && dets.length >= 2) {
    const ds = dets.map((x) => dec(x)!);
    const sc = Math.max(m.scale, ...ds.map((d) => d.scale), 1);
    const sum: Dec = { int: ds.reduce((a, d) => a + at(d, sc), BigInt(0)), scale: sc };
    const n = BigInt(ds.length);
    const st = decOfNumber(step);
    // the tolerance: half the step; no step — half a unit of the mean's last digit, as typed
    const te = typedExp(mean) ?? -m.scale;
    const tol: Dec = st ? { int: st.int * BigInt(5), scale: st.scale + 1 } : te >= 1 ? { int: BigInt(5) * TEN ** BigInt(te - 1), scale: 0 } : { int: BigInt(5), scale: -te + 1 };
    const S = Math.max(sc, tol.scale);
    const diffN = abs(at(m, S) * n - at(sum, S)); // |n·mean − Σd|, at scale S
    // shown exactly where it can be (two determinations: one more digit), else «≈» — the decision is exact
    const avg = divShow(sum, ds.length, Math.max(sc + 1, m.scale + 2, 2));
    const finding = diffN > at(tol, S) * n;
    out.push({ key, field: "mean", kind: "mean-dets", level: finding ? "finding" : "info", values: { declared: mean, determinationsMean: avg, determinations: dets.join(" · "), tolerance: show(tol.int, tol.scale) } });
  }
  // 2. the reporting resolution — the mean and each determination against the step
  const st = decOfNumber(step);
  if (!st) {
    if (mean || dets.length) out.push({ key, field: "mean", kind: "no-step", level: "info", values: {} });
  } else {
    const typedAll: [string, string][] = [["mean", mean], ...(Array.isArray(row.d) ? row.d : []).map((x, i) => [`d${i + 1}`, typeof x === "string" ? x.trim() : ""] as [string, string])];
    for (const [field, v] of typedAll) {
      const d = dec(v);
      if (!d) continue;
      const S = Math.max(d.scale, st.scale);
      if (at(d, S) % at(st, S) !== BigInt(0)) out.push({ key, field, kind: "resolution", level: "finding", values: { declared: v, step: show(st.int, st.scale) } });
    }
  }
  return out;
}

// ── calibration ──────────────────────────────────────────────────────────────
type CPoint = { ref?: unknown; meas?: unknown; U?: unknown; cmc?: unknown; na?: unknown };
/** A point's checks. `nominal`: the scheme's point; `tolerance`: the scheme's, if set. */
export function reviewPoint(key: string, nominal: string, p: CPoint | undefined, tolerance?: string): Finding[] {
  // no value in this version for a point of the scheme (added after it, say) — said, nothing checked
  if (!p) return [{ key, field: "", kind: "missing", level: "info", values: {} }];
  if (p.na === true) return [{ key, field: "na", kind: "na", level: "info", values: {} }];
  const out: Finding[] = [];
  const ref = typeof p.ref === "string" ? p.ref.trim() : "";
  const r = dec(ref), nm = dec(nominal), tol = dec(tolerance ?? "");
  // the realised reference against the nominal — the deviation always shown; beyond the tolerance a finding
  if (r && nm) {
    const S = Math.max(r.scale, nm.scale, tol?.scale ?? 0);
    const dev = at(r, S) - at(nm, S);
    const beyond = !!tol && abs(dev) > abs(at(tol, S));
    out.push({ key, field: "ref", kind: "ref-nominal", level: beyond ? "finding" : "info", values: { nominal, reference: ref, deviation: show(dev, S), ...(tol ? { tolerance: tolerance!.trim() } : {}) } });
  }
  const U = typeof p.U === "string" ? p.U.trim() : "";
  if (U && readValue(U) !== null) {
    const sf = sigFigs(U);
    if (sf !== null && sf > 2) out.push({ key, field: "U", kind: "u-sigfigs", level: "finding", values: { declared: U, figures: String(sf) } });
    const cmc = typeof p.cmc === "string" ? p.cmc.trim() : "";
    const u = readValue(U), c = cmc ? readValue(cmc) : null;
    if (typeof u === "number" && typeof c === "number" && u < c) out.push({ key, field: "U", kind: "u-cmc", level: "finding", values: { declared: U, cmc } });
  }
  return out;
}

/** The reported temperature range (general info) against the scheme's declared one, if set. */
export function reviewEnvironment(general: { tempMin?: unknown; tempMax?: unknown } | undefined, scheme: { tempMin?: string; tempMax?: string }): Finding[] {
  const a0 = readValue(scheme.tempMin ?? ""), b0 = readValue(scheme.tempMax ?? "");
  // a range saved the wrong way round is read the right way (the editor refuses one now — review)
  const [lo, hi] = typeof a0 === "number" && typeof b0 === "number" && a0 > b0 ? [b0, a0] : [a0, b0];
  const rmin = typeof general?.tempMin === "string" ? general.tempMin.trim() : "", rmax = typeof general?.tempMax === "string" ? general.tempMax.trim() : "";
  const a = readValue(rmin), b = readValue(rmax);
  if (typeof a !== "number" && typeof b !== "number") return [];
  const outside = (typeof lo === "number" && ((typeof a === "number" && a < lo) || (typeof b === "number" && b < lo))) || (typeof hi === "number" && ((typeof a === "number" && a > hi) || (typeof b === "number" && b > hi)));
  return [{ key: "general", field: "temp", kind: "env", level: outside ? "finding" : "info", values: { reported: `${rmin || "—"} – ${rmax || "—"}`, declared: typeof lo === "number" || typeof hi === "number" ? `${scheme.tempMin ?? "—"} – ${scheme.tempMax ?? "—"}` : "" } }];
}

// what a draft holds for a row no longer in the scheme — shown, as on the lab's form (6.2)
const held = (v: unknown): string => Object.entries(v && typeof v === "object" ? v as Record<string, unknown> : {}).filter(([, x]) => (typeof x === "string" && x) || (Array.isArray(x) && x.some(Boolean)) || x === true).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.filter(Boolean).join(" / ") : x === true ? (k === "nr" ? "N/R" : "N/A") : x}`).join(" · ");

// ── a submitted version, whole ───────────────────────────────────────────────
/** All the findings of a version. `rows` — testing: each characteristic's key and step;
 *  calibration: each point's key and nominal. */
export function reviewVersion(data: unknown, kind: "T" | "C", rows: readonly { key: string; step?: number; nominal?: string }[], cal?: { refTolerance?: string; tempMin?: string; tempMax?: string }): Finding[] {
  const d = data && typeof data === "object" ? data as { draft?: { rows?: Record<string, TRow>; points?: Record<string, CPoint>; general?: { tempMin?: unknown; tempMax?: unknown } } } : {};
  const draft = d.draft ?? {};
  const out: Finding[] = [];
  const keys = new Set(rows.map((r) => r.key));
  if (kind === "T") {
    for (const r of rows) out.push(...reviewTesting(r.key, draft.rows?.[r.key], r.step));
    for (const [k, v] of Object.entries(draft.rows ?? {})) if (!keys.has(k)) out.push({ key: k, field: "", kind: "orphan", level: "info", values: { held: held(v) } });
  } else {
    for (const r of rows) out.push(...reviewPoint(r.key, r.nominal ?? "", draft.points?.[r.key], cal?.refTolerance));
    for (const [k, v] of Object.entries(draft.points ?? {})) if (!keys.has(k)) out.push({ key: k, field: "", kind: "orphan", level: "info", values: { held: held(v) } });
    out.push(...reviewEnvironment(draft.general, { tempMin: cal?.tempMin, tempMax: cal?.tempMax }));
  }
  return out;
}

export const FINDING_TEXT: Record<FindingKind, { bg: string; en: string }> = {
  "mean-dets": { bg: "Декларираната средна стойност спрямо определянията", en: "The declared mean against the determinations" },
  resolution: { bg: "Извън изискваната резолюция на представяне (стъпката)", en: "Outside the required reporting resolution (the step)" },
  "no-step": { bg: "Стъпката на докладване не е зададена — резолюцията не се проверява", en: "No reporting step set — the resolution is not checked" },
  "ref-nominal": { bg: "Реализираната референтна стойност спрямо номиналната", en: "The realised reference value against the nominal" },
  "u-sigfigs": { bg: "U с повече от две значещи цифри (както е въведена)", en: "U with more than two significant figures (as typed)" },
  "u-cmc": { bg: "Декларираната U е по-малка от декларираното CMC", en: "The declared U is smaller than the declared CMC" },
  env: { bg: "Температурата спрямо обявения от схемата диапазон", en: "The temperature against the range the scheme declares" },
  na: { bg: "Точка, обявена като неприложима (извън обхвата на лабораторията)", en: "A point declared not applicable (outside the laboratory's range)" },
  orphan: { bg: "Стойност за точка или характеристика, която вече не е в схемата", en: "A value for a point or characteristic no longer in the scheme" },
  missing: { bg: "Няма стойност в тази версия (добавена в схемата след нея?)", en: "No value in this version (added to the scheme after it?)" },
};

export const NOTE_MAX = 2000;
export interface ReviewNote { id: string; participantId: string; code: string; text: string; at: string; by: string }
/** The note in force for a participation — the latest; an empty one withdraws it. */
export const noteInForce = (notes: readonly ReviewNote[] | undefined, participantId: string): ReviewNote | null => {
  const last = [...(notes ?? [])].filter((n) => n.participantId === participantId).at(-1);
  return last && last.text.trim() ? last : null;
};
// by characters, never inside one; a browser's CRLF counted as one line break (review)
export const readNote = (v: unknown): string => Array.from((typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()).slice(0, NOTE_MAX).join("");
