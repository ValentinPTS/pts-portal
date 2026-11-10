// The export to PTS_Analysis 2.0's input contract (plan part 7.1; schema_version 2.1, Реш. 148; D3).
// Pure: the scheme and its round's records in, the template's eight sheets out — codes only.
//
//   Scheme_meta — key–value (3.13); Characteristics — the template's 31 columns: testing, each
//   characteristic that runs, its 2.0 fields as entered (3.6); calibration, a row per point (D3);
//   Participants — the code and participates_in_<id> Да/Не; Results — the values IN FORCE (6.9: the
//   version the lock took, else the latest; used, U at k = 2) with `reported_*` kept apart;
//   calibration: mean = the lab's error, u_k2 = its U (the two readings stay in the portal);
//   Homogeneity (3.5); Calibration (5.7); External_providers (3.13); Указания, word for word.
// A participation whose results came outside the form (a sheet) has no Results rows — named to
// the expert before the export, typed into the file by hand as today.

import type { Scheme } from "./types";
import type { Sheet, Cell } from "./xlsx";
import type { Submission } from "./submissions";
import { ANALYSIS_GUIDE, ANALYSIS_HEADERS } from "./analysis-guide";
import { schemeMeta, providerRows } from "./scheme-meta";
import { currentFinalList, finalSelectionsOf } from "./announcement-model";
import { selectionsOf } from "./application-model";
import { currentHomogeneity } from "./batches-model";
import { pointKeys, currentRows } from "./reference-values-model";
import { usedValues, type ResultCorrection } from "./corrections-model";
import { plainNumber, versionInForce } from "./round-export-submissions";
import type { SubmissionLock } from "./submission-lock-model";
import { ENGINE_FIELDS } from "./characteristics-model";
import { isProvisional } from "./coding-model";

/** The 2.0 fields that hold a number (the rest are words or lists — written as typed). */
const NUMERIC_ENGINE: ReadonlySet<string> = new Set(["precision_digits", "significant_digits", "xpt_from_reference", "u_xpt_from_reference", "sigma_pt_predefined", "sigma_pt_min", "sigma_pt_max", "sigma_homogeneity", "delta_factor", "min_participants"]);

type Part = { id: string; code: string; status?: string; selections?: Record<string, number>; characteristics?: number[] };
type Payload = { kind?: string; draft?: { rows?: Record<string, { d?: unknown; mean?: unknown; U?: unknown; nr?: unknown }>; points?: Record<string, { U?: unknown; na?: unknown }> }; values?: Record<string, { nr?: unknown; na?: unknown; error?: unknown } | undefined> };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** A value for a numeric column: a number when it reads as one (with a point), else the text as is. */
const numOrText = (v: string | undefined): Cell => { if (!v) return ""; const p = plainNumber(v); return p ? Number(p) : v; };

/** The characteristics that run (the final list's), as 2.0 sees them: id, place. */
function runningCharacteristics(s: Scheme): { id: string; i: number }[] {
  const final = currentFinalList(s);
  const idx = final?.runs ?? s.parameters.map((_, i) => i);
  return idx.filter((i) => !!s.parameters[i]).map((i) => ({ id: s.parameters[i].id ?? `#${i}`, i }));
}

export interface AnalysisExport { sheets: Sheet[]; counts: { participants: number; results: number; outside: string[]; nr: number; homogeneityDropped: number } }

export function analysisSheets(s: Scheme, parts: readonly Part[], subs: readonly Submission[], corrections: readonly ResultCorrection[], locks: readonly SubmissionLock[] | undefined): AnalysisExport {
  const H = ANALYSIS_HEADERS;
  const meta: Cell[][] = [[...H.Scheme_meta], ...Object.entries(schemeMeta(s)).map(([k, v]) => [k, v] as Cell[])];
  const isC = s.type === "C";
  const points = isC ? pointKeys(s.calibration) : [];
  const runs = isC ? [] : runningCharacteristics(s);
  const ids = isC ? points.map((p) => p.key) : runs.map((r) => r.id);

  // Characteristics — the template's 31 columns
  const charRows: Cell[][] = isC
    ? points.map((p) => {
      const c = s.calibration!, unit = c.unit ?? "";
      const dir = (l: "bg" | "en") => (p.direction ? ` · ${p.direction[l]}` : "");
      const row: Record<string, Cell> = { characteristic_id: p.key, name: `${c.quantityBg} ${p.nominal} ${unit}`.trim() + dir("bg"), name_en: `${c.quantityEn} ${p.nominal} ${unit}`.trim() + dir("en"), standard_full: c.methodBg, standard_full_en: c.methodEn, unit, specimens: 1, assigned_value_method: "calibration" };
      return H.Characteristics.map((h) => row[h] ?? "");
    })
    : runs.map(({ id, i }) => {
      const p = s.parameters[i];
      const row: Record<string, Cell> = { characteristic_id: id, name: p.characteristicBg, name_en: p.characteristicEn, standard_full: p.standardBg, standard_full_en: p.standardEn, group: p.group ?? "", group_en: p.groupEn ?? "", unit: p.unit ?? "", specimens: p.determinations ?? 1, physical_min: p.guardMin ?? "", physical_max: p.guardMax ?? "" };
      // the 2.0 fields as entered (3.6): the NUMERIC ones a number when they read as one; lists and
      // words as text — «1,2» in homogeneity_justified_by is a list, never 1.2 (7.1 review)
      for (const f of ENGINE_FIELDS) { const v = p.engine?.[f]; if (v !== undefined && v !== "") row[f] = NUMERIC_ENGINE.has(f) && /^[-+]?\d+([.,]\d+)?$/.test(v.trim()) ? numOrText(v.trim()) : v; }
      // σpt,min: the 2.0 field, else the statistical project's own (Parameter.sigmaMin) — never a floor lost (review)
      if (row.sigma_pt_min === undefined && typeof p.sigmaMin === "number" && Number.isFinite(p.sigmaMin)) row.sigma_pt_min = p.sigmaMin;
      return H.Characteristics.map((h) => row[h] ?? "");
    });

  // Participants — the code; participates_in_<id> Да / Не by its final selections
  const final = currentFinalList(s);
  const partRows: Cell[][] = parts.map((p) => {
    const sel = isC ? null : final?.runs ? finalSelectionsOf(p, { runs: final.runs }, s.parameters.length) : selectionsOf(p, s.parameters.length);
    return [p.code, "", ...(isC ? ids.map(() => "Да") : runs.map(({ i }) => ((sel?.[String(i)] ?? 0) > 0 ? "Да" : "Не")))];
  });

  // Results — the values in force; reported_* apart
  const resRows: Cell[][] = [];
  const outside: string[] = [];
  let nrCount = 0;
  for (const p of parts) {
    const { sub, source } = versionInForce(p, subs, locks, s.labUploads);
    if (source === "outside") { outside.push(p.code); continue; }
    const sel = isC ? null : final?.runs ? finalSelectionsOf(p, { runs: final.runs }, s.parameters.length) : selectionsOf(p, s.parameters.length);
    const mine = isC ? points.map((x) => x.key) : runs.filter(({ i }) => (sel?.[String(i)] ?? 0) > 0).map((r) => r.id);
    const nr = (key: string, note: string) => { nrCount++; resRows.push([p.code, key, "", "", "", "", "", "N/R", note, "", "", ""]); };
    if (!sub) { for (const key of mine) nr(key, source === "nr" ? "без резултати при заключването на подаването" : "няма подадена версия"); continue; }
    const d = (sub.data ?? {}) as Payload;
    const used = usedValues(sub.data, corrections.filter((c) => c.participantId === p.id), sub.version);
    for (const key of mine) {
      const v = d.values?.[key];
      if (!v) { nr(key, "не е в подадената версия"); continue; }
      if (v.nr === true) { nr(key, ""); continue; }
      if (v.na === true) { nr(key, "обявена като неприложима (извън обхвата на лабораторията)"); continue; }
      const u = used[key] ?? {};
      if (isC) {
        const U = u.U;
        resRows.push([p.code, key, "", "", "", numOrText(u.error?.used ?? undefined), numOrText(U?.used ?? undefined), "reported", "", "", str(v.error), str(d.draft?.points?.[key]?.U)]);
      } else {
        const r = d.draft?.rows?.[key];
        const dets = (Array.isArray(r?.d) ? r!.d as unknown[] : []).map(str);
        const det = (n: number) => numOrText(u[`d${n}`]?.used ?? undefined);
        const U = u.U;
        const kNote = U && U.used === null ? `U е докладвана при k = ${U.k ?? "?"} — U при k = 2 не е записана (D3)` : "";
        resRows.push([p.code, key, det(1), det(2), det(3), numOrText(u.mean?.used ?? undefined), numOrText(U?.used ?? undefined), "reported", kNote, dets.map((x) => x || "N/R").join("; "), str(r?.mean), str(r?.U)]);
      }
    }
  }

  // Homogeneity (3.5) — the values in force, by the characteristic's id
  // …only for the characteristics in the file: one removed, or dropped from the final list, would
  // name a characteristic_id the file does not have (review) — counted, said on the page
  const idSet = new Set(ids);
  const homAll = (s.batches ?? []).flatMap((b) => currentHomogeneity(b.homogeneity).map((h) => [h.series, h.sampleCode, h.characteristicId ?? (h.characteristic !== null ? s.parameters[h.characteristic]?.id ?? `#${h.characteristic}` : ""), h.replicate, h.value] as Cell[]));
  const homRows = homAll.filter((r) => idSet.has(String(r[2])));
  const homDropped = homAll.length - homRows.length;
  // Calibration (5.7) — per point, the current reference values
  const ref = currentRows(s.referenceValues);
  const calRowsOut: Cell[][] = points.map((p) => { const r = ref[p.key] ?? {}; return [p.key, numOrText(p.nominal), r.xBefore ?? "", r.xAfter ?? "", r.uCal ?? "", r.uOther ?? "", r.k ?? ""]; });
  const provRows: Cell[][] = providerRows(s).map((x) => [x.name, x.address, x.services]);

  const sheets: Sheet[] = [
    { name: "Scheme_meta", rows: meta },
    { name: "Characteristics", rows: [[...H.Characteristics], ...charRows] },
    { name: "Participants", rows: [[...H.Participants, ...ids.map((id) => `participates_in_${id}`)], ...partRows] },
    { name: "Results", rows: [[...H.Results], ...resRows] },
    { name: "Homogeneity", rows: [[...H.Homogeneity], ...homRows] },
    { name: "Calibration", rows: [[...H.Calibration], ...calRowsOut] },
    { name: "External_providers", rows: [[...H.External_providers], ...provRows] },
    { name: "Указания", rows: ANALYSIS_GUIDE.map((r) => [...r]) },
  ];
  return { sheets, counts: { participants: parts.length, results: resRows.length, outside, nr: nrCount, homogeneityDropped: homDropped } };
}

/** What the file will lack or carry that 2.0 should not take as final — said on the scheme's page
 *  and refused where it would mislead (7.1 review): provisional references instead of codes (before
 *  the coding act — refused); σpt,min differing between the statistical project and the 2.0 field. */
export function analysisGaps(s: Scheme, parts: readonly { code: string }[]): { provisional: string[]; sigmaMismatch: string[]; homogeneityDropped: number } {
  const provisional = parts.map((p) => p.code).filter((c) => isProvisional(c));
  const ids = new Set(s.type === "C" ? pointKeys(s.calibration).map((p) => p.key) : runningCharacteristics(s).map((r) => r.id));
  const homogeneityDropped = (s.batches ?? []).flatMap((b) => currentHomogeneity(b.homogeneity)).filter((h) => !ids.has(h.characteristicId ?? (h.characteristic !== null ? s.parameters[h.characteristic]?.id ?? `#${h.characteristic}` : ""))).length;
  const sigmaMismatch = runningCharacteristics(s).filter(({ i }) => {
    const p = s.parameters[i], e = p.engine?.sigma_pt_min;
    if (!e || typeof p.sigmaMin !== "number") return false;
    const n = Number(plainNumber(e));
    return Number.isFinite(n) && Math.abs(n - p.sigmaMin) > 1e-12;
  }).map(({ id }) => id);
  return { provisional, sigmaMismatch, homogeneityDropped };
}
