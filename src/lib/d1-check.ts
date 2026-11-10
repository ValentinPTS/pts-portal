// The D1 computation, verified (plan part 8.6; D1; П 7.4.1 т. 4.6.2). Pure.
//
// The calibration error is the one quantity the portal computes: measured − reference (D1, decided
// 01.11.2026; Ф 7.2.1-7 rev. 1). П 7.4.1 т. 4.6.2 asks the computation be verified by repeating it with
// an INDEPENDENT tool on a representative data set, recorded with the date, scope, checker, result and
// conclusion. The record carries:
//   • a fixed set chosen to cover what the form accepts — and what it refuses;
//   • the portal's own result (computeError — exact decimals from its own parser);
//   • the portal's SELF-CHECK by another method (floating point from the text, rounded to the pair's
//     decimals — sound within 15 significant digits, which the set keeps to);
//   • each value written plainly a THIRD way (the text rewritten by hand: no grouping, a point, no
//     exponent), so the checker's own tool (e.g. Excel) reads them unambiguously — never the comma that a
//     spreadsheet takes for a thousands separator (8.6 review);
//   • the set as a CSV with an empty column for the checker's own results.

import { computeError } from "./results-model";
import { csv } from "./round-export";

/** Representative pairs — signs, zero, decimals of different lengths, a comma or a point, an exponent
 *  (with «+» too), grouping by a space, «.5» and «5.», a leading «+», large and small magnitudes, crossing
 *  zero; and inputs the form REFUSES (a thousands separator with a decimal point, the «−» sign, words):
 *  for those both methods must refuse. */
export const D1_SET: readonly { ref: string; meas: string; refuse?: true }[] = [
  { ref: "20.000", meas: "20.003" },
  { ref: "20,000", meas: "19,998" },
  { ref: "100", meas: "100" },
  { ref: "0.5", meas: "1" },
  { ref: "1", meas: "0.5" },
  { ref: "-5.25", meas: "-5.3" },
  { ref: "1e2", meas: "100.1" },
  { ref: "1E+2", meas: "99.95" },
  { ref: "1.5e-3", meas: "0.0016" },
  { ref: "200.0000", meas: "200.0001" },
  { ref: "0", meas: "0" },
  { ref: "123456.789", meas: "123456.79" },
  { ref: "0.001", meas: "-0.001" },
  { ref: "50", meas: "49.99" },
  { ref: "5,5", meas: "5,50" },
  { ref: "1000", meas: "999.9995" },
  { ref: "-0.25", meas: "0.25" },
  { ref: "1 000", meas: "1 000,5" },
  { ref: "+2.5", meas: "2.75" },
  { ref: ".5", meas: "5." },
  { ref: "1,234.5", meas: "1234.6", refuse: true },
  { ref: "−5", meas: "-5", refuse: true },
  { ref: "abc", meas: "1", refuse: true },
];

/** A typed value as the other method reads it: spaces (a no-break one too) dropped, one comma a point. */
const cleanText = (t: string) => t.replace(/[\s  ]/g, "").replace(",", ".");
const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** The number of decimals a typed value carries (an exponent shifts them) — the other method's way. */
function decimalsOf(t: string): number {
  const [mant, exp = "0"] = cleanText(t).toLowerCase().split("e");
  const frac = mant.includes(".") ? mant.split(".")[1].length : 0;
  return Math.max(0, frac - Number(exp));
}

/** The error recomputed by another method — floating point from the text, rounded to the pair's
 *  decimals; never the portal's parser. Null when either is not a number as the form takes one. */
export function independentError(ref: string, meas: string): string | null {
  const a = cleanText(ref), b = cleanText(meas);
  if (!NUMBER_TEXT.test(a) || !NUMBER_TEXT.test(b)) return null;
  const r = Number(a), m = Number(b);
  if (!Number.isFinite(r) || !Number.isFinite(m)) return null;
  const d = Math.max(decimalsOf(ref), decimalsOf(meas));
  // beyond toFixed's 100 decimals the other method has nothing to say (8.6 review: never a 500)
  if (d > 100) return null;
  const out = (m - r).toFixed(d);
  // «-0.000» is zero
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}

/** The value written plainly — a THIRD way, by moving the point in the text: no grouping, a point, no
 *  exponent, no «+». What a spreadsheet reads without guessing. Null — not a number. */
export function plainText(t: string): string | null {
  const c = cleanText(t);
  if (!NUMBER_TEXT.test(c)) return null;
  const neg = c.startsWith("-");
  const [mant, expS = "0"] = c.replace(/^[+-]/, "").toLowerCase().split("e");
  const exp = Number(expS);
  if (!Number.isInteger(exp) || Math.abs(exp) > 300) return null;
  const [intPart, fracPart = ""] = mant.split(".");
  let digits = (intPart || "0") + fracPart, point = (intPart || "0").length + exp;
  if (point <= 0) { digits = "0".repeat(1 - point) + digits; point = 1; }
  if (point > digits.length) digits = digits + "0".repeat(point - digits.length);
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, ""), frac = digits.slice(point);
  const out = frac ? `${whole}.${frac}` : whole;
  return neg && /[1-9]/.test(out) ? `-${out}` : out;
}

export interface D1Row { ref: string; meas: string; refuse: boolean; portal: string | null; independent: string | null; refPlain: string | null; measPlain: string | null; agree: boolean }

/** The set, each pair's two results, and whether they agree — a pair the form refuses agrees only when
 *  BOTH refuse. `portal` is the portal's computation (a parameter only so a test can break it). */
export function d1Check(set: readonly { ref: string; meas: string; refuse?: true }[] = D1_SET, portal: (ref: string, meas: string) => string | null = computeError): { rows: D1Row[]; allAgree: boolean } {
  const rows = set.map(({ ref, meas, refuse }) => {
    const p = portal(ref, meas), i = independentError(ref, meas);
    return { ref, meas, refuse: !!refuse, portal: p, independent: i, refPlain: plainText(ref), measPlain: plainText(meas), agree: refuse ? p === null && i === null : p !== null && p === i };
  });
  return { rows, allAgree: rows.every((r) => r.agree) };
}

/** The set for the checker's own tool: the values as typed (text), the same written plainly, the portal's
 *  result, the self-check's, and an empty column for the checker's own result. */
export function d1Csv(): string {
  return csv(["reference_typed", "measured_typed", "reference_plain", "measured_plain", "portal_error", "self_check", "form_refuses", "checker_result"],
    d1Check().rows.map((r) => ({ reference_typed: r.ref, measured_typed: r.meas, reference_plain: r.refPlain ?? "", measured_plain: r.measPlain ?? "", portal_error: r.portal ?? "", self_check: r.independent ?? "", form_refuses: r.refuse ? "yes" : "", checker_result: "" })));
}
