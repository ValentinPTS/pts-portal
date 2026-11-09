// Characteristics (plan part 3.6; Zadanie §5; D3; А3). Pure.
//
// A characteristic is what a participant measures. It has a STABLE id — never reused,
// never changed by a reorder — a name and a method shown together (the names repeat:
// «Граница на протичане» three times in one scheme, told apart by the method), a unit,
// a reporting step, absolute guard limits (PTS: «Защитните граници при този кръг са
// абсолютни»), whether U is required, a statistical group (the ones processed
// together), and the number of determinations — up to 3 while 2.0's contract has three
// columns (D3).
//
// The 2.0 configuration fields are stored exactly as entered and passed through, never
// read by the portal and NEVER shown to a laboratory (D3, the template's columns). The
// guard limits are 2.0's physical_min / physical_max — one place for one value — and
// the number of determinations its `specimens`.
//
// A calibration scheme's points are its rows: each point gets its own stable id, the
// characteristic_id 2.0 reads (D3: «Кодът на точката, когато схемата е калибровъчна»).
//
// Every change of the characteristics is a new CONFIGURATION VERSION, on record; what is
// computed from them later says which version it used.
//
// Not built (А3): an exact-half rounding rule shown to labs, or a reminder per
// characteristic — the rounding is the Instruction's; there is ONE static reminder
// text per scheme (Scheme.staticReminder).

import type { Parameter } from "./types";

/** The 2.0 template's characteristic columns the portal passes through untouched. */
export const ENGINE_FIELDS = [
  "precision_digits", "significant_digits", "rounding_source",
  "assigned_value_method", "xpt_from_reference", "u_xpt_from_reference",
  "sigma_pt_method", "sigma_pt_estimator", "sigma_pt_predefined",
  "sigma_pt_min", "sigma_pt_min_relative", "sigma_pt_max", "sigma_pt_max_relative",
  "homogeneity_mode", "homogeneity_justified_by", "sigma_homogeneity",
  "delta_factor", "scores", "min_participants", "justification",
] as const;
export type EngineField = (typeof ENGINE_FIELDS)[number];
export const isEngineField = (k: string): k is EngineField => (ENGINE_FIELDS as readonly string[]).includes(k);
export const MAX_ENGINE_VALUE = 300;
export const MAX_DETERMINATIONS = 3;

const num = (v: string): number | null => { const t = v.replace(/\s/g, "").replace(",", "."); if (!/^[-+]?\d+(?:\.\d+)?$/.test(t)) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();

export type FieldProblem = "unit" | "step" | "guard" | "guards-order" | "determinations" | "group" | "engine";

/** The 3.6 fields of one characteristic, as posted — `get(name)` reads one field,
 *  null when the form did not carry it (the characteristic keeps what it had). */
export function readCharacteristicFields(get: (name: string) => string | null, base: Parameter):
  { ok: true; fields: Pick<Parameter, "unit" | "step" | "guardMin" | "guardMax" | "uRequired" | "group" | "groupEn" | "determinations" | "engine"> } | { ok: false; problem: FieldProblem } {
  const has = (n: string) => get(n) !== null;
  const val = (n: string) => clean(get(n));
  const unit = has("unit") ? val("unit") : base.unit ?? "";
  if ([...unit].length > 30) return { ok: false, problem: "unit" };
  const group = has("group") ? val("group") : base.group ?? "";
  const groupEn = has("groupEn") ? val("groupEn") : base.groupEn ?? "";
  if ([...group].length > 80 || [...groupEn].length > 80) return { ok: false, problem: "group" };
  const parseNum = (n: string, prev: number | undefined): number | undefined | false => {
    if (!has(n)) return prev;
    const s = val(n);
    if (!s) return undefined;
    const x = num(s);
    return x === null ? false : x;
  };
  const step = parseNum("step", base.step);
  if (step === false || (step !== undefined && !(step > 0))) return { ok: false, problem: "step" };
  const guardMin = parseNum("gmin", base.guardMin);
  const guardMax = parseNum("gmax", base.guardMax);
  if (guardMin === false || guardMax === false) return { ok: false, problem: "guard" };
  if (guardMin !== undefined && guardMax !== undefined && !(guardMin < guardMax)) return { ok: false, problem: "guards-order" };
  const detRaw = has("det") ? val("det") : base.determinations !== undefined ? String(base.determinations) : "";
  const determinations = detRaw ? Number(detRaw) : undefined;
  if (determinations !== undefined && !(Number.isInteger(determinations) && determinations >= 1 && determinations <= MAX_DETERMINATIONS)) return { ok: false, problem: "determinations" };
  const uRequired = has("ureq") ? val("ureq") === "on" || val("ureq") === "1" : base.uRequired;
  const engine: Partial<Record<EngineField, string>> = { ...(base.engine ?? {}) };
  for (const k of ENGINE_FIELDS) {
    if (!has(`eng_${k}`)) continue;
    // as entered: kept untouched (D3) — only bounded and stripped of invisible junk
    const v = val(`eng_${k}`);
    if ([...v].length > MAX_ENGINE_VALUE) return { ok: false, problem: "engine" };
    if (v) engine[k] = v; else delete engine[k];
  }
  return {
    ok: true,
    fields: {
      unit: unit || undefined, step, guardMin, guardMax, uRequired: uRequired || undefined,
      group: group || undefined, groupEn: groupEn || undefined, determinations,
      engine: Object.keys(engine).length ? engine : undefined,
    },
  };
}

export const FIELD_PROBLEM_TEXT: Record<FieldProblem, { bg: string; en: string }> = {
  unit: { bg: "мерната единица е до 30 знака", en: "the unit is 30 characters at most" },
  step: { bg: "стъпката на докладване е положително число", en: "the reporting step is a positive number" },
  guard: { bg: "защитната граница е число", en: "a guard limit is a number" },
  "guards-order": { bg: "долната защитна граница е под горната", en: "the lower guard limit is below the upper" },
  determinations: { bg: `броят определяния е от 1 до ${MAX_DETERMINATIONS} (толкова колони има договорът с 2.0)`, en: `the number of determinations is 1 to ${MAX_DETERMINATIONS} (the columns 2.0's contract has)` },
  group: { bg: "статистическата група е до 80 знака", en: "the statistical group is 80 characters at most" },
  engine: { bg: `поле за 2.0 е до ${MAX_ENGINE_VALUE} знака`, en: `a 2.0 field is ${MAX_ENGINE_VALUE} characters at most` },
};

/** Ids for the characteristics that have none — «ch-N», N above every id the scheme has
 *  ever given (`seq`), so an id is never given twice. Returns the new counter. */
export function ensureIds(params: Parameter[], seq: number | undefined): { params: Parameter[]; seq: number } {
  const used = params.map((p) => /^ch-(\d+)$/.exec(p.id ?? "")?.[1]).filter(Boolean).map(Number);
  let next = Math.max(seq ?? 0, ...used, 0);
  const seen = new Set<string>();
  const out = params.map((p) => {
    if (p.id && !seen.has(p.id)) { seen.add(p.id); return p; }
    next += 1;
    const id = `ch-${next}`;
    seen.add(id);
    return { ...p, id };
  });
  return { params: out, seq: next };
}

/** The stable ids of calibration points: a point keeps its id while its value stays in
 *  the list (whatever its place); a new value gets the next «pt-N». */
export function ensurePointIds(points: string[], oldPoints: string[] | undefined, oldIds: string[] | undefined, seq: number | undefined): { ids: string[]; seq: number } {
  // a value that repeats (an up-and-down series) keeps an id for each time it appears,
  // in order (3.6 review)
  const byValue = new Map<string, string[]>();
  (oldPoints ?? []).forEach((v, i) => { const id = oldIds?.[i]; if (id) byValue.set(v.trim(), [...(byValue.get(v.trim()) ?? []), id]); });
  const used = (oldIds ?? []).map((id) => /^pt-(\d+)$/.exec(id)?.[1]).filter(Boolean).map(Number);
  let next = Math.max(seq ?? 0, ...used, 0);
  const taken = new Set<string>();
  const ids = points.map((v) => {
    const queue = byValue.get(v.trim()) ?? [];
    while (queue.length && taken.has(queue[0])) queue.shift();
    const keep = queue.shift();
    if (keep) { taken.add(keep); return keep; }
    next += 1;
    const id = `pt-${next}`;
    taken.add(id);
    return id;
  });
  return { ids, seq: next };
}

/** «Граница на протичане — БДС EN ISO 17892-12 (падащ конус)»: the name and the method
 *  together, as every screen shows a characteristic (the names repeat). */
export function characteristicLabel(p: Pick<Parameter, "characteristicBg" | "characteristicEn" | "standardBg" | "standardEn">, lang: "bg" | "en"): string {
  const name = (lang === "bg" ? p.characteristicBg || p.characteristicEn : p.characteristicEn || p.characteristicBg) || "—";
  const method = lang === "bg" ? p.standardBg || p.standardEn : p.standardEn || p.standardBg;
  return method ? `${name} — ${method}` : name;
}

/** What a laboratory may be shown of a characteristic — never the 2.0 fields, never
 *  the guard limits or the group (they are the processing's). */
export function labView(p: Parameter, lang: "bg" | "en"): { label: string; unit?: string; determinations?: number; uRequired: boolean } {
  return { label: characteristicLabel(p, lang), unit: p.unit, determinations: p.determinations, uRequired: !!p.uRequired };
}

/** The configuration as it is versioned: the characteristics' content (their place in
 *  the list included — the references by place follow it). */
// keys sorted, undefined dropped: the database (jsonb) gives a stored object back with
// its keys in its own order — the same configuration must compare the same (3.6 review)
const sortedJson = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortedJson)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => [k, sortedJson((v as Record<string, unknown>)[k])]))
  : v;
export const configOf = (params: readonly Parameter[], points?: { values: string[]; ids?: string[] }) =>
  JSON.stringify(sortedJson({ params, points: points ?? null }));

export interface CharacteristicVersion { no: number; at: string; by: string; day: string; characteristics: Parameter[]; points?: { values: string[]; ids?: string[] } }
export const nextVersionNo = (list: CharacteristicVersion[] | undefined) => Math.max(0, ...(list ?? []).map((v) => v.no)) + 1;
