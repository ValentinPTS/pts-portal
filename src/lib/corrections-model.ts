// Reported and used values (plan part 6.5; D3; К22; the 2.0 contract's `reported_*`). Pure.
//
// A submitted version is never changed (0042). A CORRECTION is a record next to it: in version N,
// for this characteristic (or calibration point), this field — used: X, because «…», by whom, when.
// The used value is TYPED by the coding expert; the portal computes nothing — not the k ≠ 2
// conversion (К22: «where it is calculated, not in the field»), not a mean (Реш. 88). It is read
// for its format only. Withdrawn, never deleted: a later record with no used value. Corrections
// belong to the version they were made on — a later version starts clean.

import { readValue } from "./results-model";

export interface ResultCorrection {
  id: string; participantId: string; schemeId: string;
  /** the submitted version it is made on */
  version: number;
  /** the characteristic's or the point's key */
  key: string;
  /** testing: d1…d3, mean, U (used = U at k = 2, the contract's u_k2); calibration: error, U */
  field: string;
  /** as reported in that version (as typed; calibration's error as computed and confirmed, D1) */
  reported: string;
  /** as typed by the coding expert; null = withdrawn (the reported value used again) */
  used: string | null;
  reason: string; at: string; by: string;
}

export interface CorrectableField { key: string; field: string; reported: string; /** testing U: the k it was reported with (К22) */ k?: string }

/** Testing U reported with a k other than 2: it is NOT the U at k = 2 the contract's u_k2 holds —
 *  the coding expert records that one (D3); until then there is no used U (6.5 review). */
export const kOff = (f: { field: string; k?: string }) => f.field === "U" && !!f.k && readValue(f.k) !== 2;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Payload = { kind?: unknown; draft?: { rows?: Record<string, { d?: unknown; mean?: unknown; U?: unknown; k?: unknown; nr?: unknown }>; points?: Record<string, { U?: unknown; na?: unknown }> }; values?: Record<string, { nr?: unknown; na?: unknown; error?: unknown } | undefined> };
const payloadOf = (data: unknown): Payload | null => (data && typeof data === "object" && !Array.isArray(data) && (data as Payload).values && typeof (data as Payload).values === "object" ? (data as Payload) : null);

/** The fields of a submitted version that carry a reported value — the only ones a correction may
 *  name. N/R characteristics, N/A points and values not given carry none (Реш. 111: a result
 *  that was not submitted comes in through an unlock and a new version, never a correction). */
export function correctableFields(data: unknown): CorrectableField[] {
  const d = payloadOf(data);
  if (!d) return [];
  const out: CorrectableField[] = [];
  for (const key of Object.keys(d.values ?? {})) {
    const v = d.values?.[key];
    if (!v || v.nr === true || v.na === true) continue;
    if (d.kind === "T") {
      const r = d.draft?.rows?.[key];
      if (!r || r.nr === true) continue;
      (Array.isArray(r.d) ? r.d : []).forEach((x, i) => { if (str(x)) out.push({ key, field: `d${i + 1}`, reported: str(x) }); });
      if (str(r.mean)) out.push({ key, field: "mean", reported: str(r.mean) });
      if (str(r.U)) out.push({ key, field: "U", reported: str(r.U), ...(str(r.k) ? { k: str(r.k) } : {}) });
    } else if (d.kind === "C") {
      if (str(v.error)) out.push({ key, field: "error", reported: str(v.error) });
      const u = str(d.draft?.points?.[key]?.U);
      if (u) out.push({ key, field: "U", reported: u });
    }
  }
  return out;
}

export const targetOf = (key: string, field: string) => `${key}::${field}`;

/** The corrections in force on a version: per field, the latest record — if it is a withdrawal,
 *  none. Records on other versions never count (a later version starts clean). */
export function activeCorrections(all: readonly ResultCorrection[], version: number): Map<string, ResultCorrection> {
  const latest = new Map<string, ResultCorrection>();
  // by the instant, not the string (a stamp on the second sorts after one with a fraction as text);
  // ties keep the store's order (sort is stable) — 6.5 review
  for (const c of [...all].filter((x) => x.version === version).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) latest.set(targetOf(c.key, c.field), c);
  for (const [t, c] of [...latest]) if (c.used === null) latest.delete(t);
  return latest;
}

export const CORRECTION_REASON_MIN = 5;
export type CorrectionProblem = "field" | "value" | "positive" | "same" | "reason" | "nothing";
/** Read a correction from the form: a field of THIS version that has a reported value; the used
 *  value a number (format only — never judged); a reason. An empty used value withdraws the
 *  correction in force (there must be one). */
export function readCorrection(input: { target: unknown; used: unknown; reason: unknown }, fields: readonly CorrectableField[], active: ReadonlyMap<string, ResultCorrection>):
  { ok: true; key: string; field: string; reported: string; used: string | null; reason: string } | { ok: false; problem: CorrectionProblem } {
  const target = str(input.target);
  const f = fields.find((x) => targetOf(x.key, x.field) === target);
  if (!f) return { ok: false, problem: "field" };
  const used = (typeof input.used === "string" ? input.used : "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 40);
  const reason = (typeof input.reason === "string" ? input.reason : "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 500);
  if (!used) {
    if (!active.has(target)) return { ok: false, problem: "nothing" };
  } else {
    const n = readValue(used);
    if (typeof n !== "number") return { ok: false, problem: "value" };
    // U is positive — the form's own rule (6.3), the contract's u_k2 never 0 or less (review)
    if (f.field === "U" && n <= 0) return { ok: false, problem: "positive" };
    const cur = active.get(target);
    // «the value already used» — but a U reported with k ≠ 2 has no used U until one is recorded:
    // the right one may well be the number typed (k = 3 by mistake) — 6.5 review
    if (cur ? n === readValue(cur.used ?? f.reported) : !kOff(f) && n === readValue(f.reported)) return { ok: false, problem: "same" };
  }
  if ([...reason].length < CORRECTION_REASON_MIN) return { ok: false, problem: "reason" };
  return { ok: true, key: f.key, field: f.field, reported: f.reported, used: used || null, reason };
}

export const CORRECTION_PROBLEM_TEXT: Record<CorrectionProblem | "state" | "version" | "failed" | "reach", { bg: string; en: string }> = {
  field: { bg: "Изберете поле с подадена стойност.", en: "Choose a field with a submitted value." },
  value: { bg: "Използваната стойност трябва да е число (запетая или точка).", en: "The used value must be a number (comma or point)." },
  positive: { bg: "U трябва да е положително число.", en: "U must be a positive number." },
  reach: { bg: "Не може да се установи на кого да се съобщи — нищо не е записано. Опитайте пак.", en: "Who to tell could not be established — nothing recorded. Try again." },
  same: { bg: "Това е стойността, която вече се използва.", en: "That is the value already used." },
  reason: { bg: "Посочете основание (поне 5 знака).", en: "Give the reason (5 characters at least)." },
  nothing: { bg: "За това поле няма корекция за оттегляне.", en: "There is no correction to withdraw for that field." },
  state: { bg: "Корекция се записва, докато схемата е в процес или в обработка.", en: "A correction is recorded while the scheme is in progress or in processing." },
  version: { bg: "Подадена е по-нова версия — презаредете страницата.", en: "A newer version was submitted — reload the page." },
  failed: { bg: "Корекцията НЕ е записана — опитайте пак.", en: "The correction was NOT recorded — try again." },
};

/** A field's name; testing U with the k it was reported with — «U (k = 3 по доклада)» is never
 *  called the U at k = 2 (6.5 review). */
export const FIELD_LABEL = (field: string, k?: string): { bg: string; en: string } =>
  /^d[1-9]$/.test(field) ? { bg: `определяне ${field.slice(1)}`, en: `determination ${field.slice(1)}` }
  : field === "mean" ? { bg: "средна стойност", en: "mean" }
  : field === "U" && k && readValue(k) !== 2 ? { bg: `U (k = ${k} по доклада; използва се U при k = 2)`, en: `U (k = ${k} as reported; the U used is at k = 2)` }
  : field === "U" ? { bg: "U (k = 2)", en: "U (k = 2)" }
  : field === "error" ? { bg: "грешка", en: "error" }
  : { bg: field, en: field };

/** Each field of a version: the reported value and the value used (the correction in force, else
 *  the reported one) — what 7.1 writes as `mean`/`u_k2`/`determination_*` and `reported_*`. */
/** Each field of a version: the reported value and the value used (the correction in force, else
 *  the reported one) — what 7.1 writes as `mean`/`u_k2`/`determination_*` and `reported_*`.
 *  A testing U reported with k ≠ 2 and no used U recorded: used is NULL (and its k said) — the
 *  contract's u_k2 is never a U at another k (D3, К22; 6.5 review). */
export type UsedValue = { reported: string; used: string | null; k?: string; correction?: ResultCorrection };
export function usedValues(data: unknown, all: readonly ResultCorrection[], version: number): Record<string, Record<string, UsedValue>> {
  const active = activeCorrections(all, version);
  const out: Record<string, Record<string, UsedValue>> = {};
  for (const f of correctableFields(data)) {
    const c = active.get(targetOf(f.key, f.field));
    const k = f.k ? { k: f.k } : {};
    (out[f.key] ??= {})[f.field] = c && c.used !== null ? { reported: f.reported, used: c.used, ...k, correction: c } : { reported: f.reported, used: kOff(f) ? null : f.reported, ...k };
  }
  return out;
}

/** Testing: the characteristics reported with k ≠ 2 whose used U (at k = 2) is not recorded on this
 *  version — information for the coding expert (D3), never a block. */
export function kNotTwo(data: unknown, all: readonly ResultCorrection[], version: number): { key: string; k: string }[] {
  const d = payloadOf(data);
  if (!d || d.kind !== "T") return [];
  const active = activeCorrections(all, version);
  const out: { key: string; k: string }[] = [];
  for (const key of Object.keys(d.values ?? {})) {
    const r = d.draft?.rows?.[key];
    if (!r || r.nr === true || !str(r.U)) continue;
    const k = readValue(str(r.k));
    if (typeof k === "number" && k !== 2 && !active.has(targetOf(key, "U"))) out.push({ key, k: str(r.k) });
  }
  return out;
}
