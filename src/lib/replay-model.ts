// A closed round loaded for a replay (plan part 8.2; Реш. 119, 130, 134; D8). Pure: no I/O.
//
// The round comes as THE 2.0 INPUT FILE (schema_version 2.1) — the file 2.0 processed, codes
// only, the format the portal itself writes (7.1). Read STRICTLY to the contract: no sheet, column,
// meta key or cell the contract does not have, codes that cannot be names, reported texts that are
// numbers — a laboratory's identity has nowhere to come in (8.2 review). Then made into a replay round
// in the test environment: the characteristics or calibration points with their ids, the
// participations by code, each one's results as one submitted version (the reported text as it was,
// a used value that differs from it as a correction — 6.5), locked. Its re-export is compared with the
// file cell by cell (replayDiff) — EXACTLY: text as text, numbers as numbers — what level 1 rests on.

import type { Cell } from "./xlsx";
import type { ReadSheet } from "./xlsx-read";
import type { Parameter, CalibrationData } from "./types";
import type { ExternalProvider } from "./scheme-meta";
import { ANALYSIS_HEADERS } from "./analysis-guide";
import { ENGINE_FIELDS, type EngineField } from "./characteristics-model";
import { plainNumber } from "./round-export-submissions";
import { colName } from "./xlsx";

export const REPLAY_SCHEMA = "2.1";
/** A laboratory's code: letters, digits and «-_.», no space, at least one digit and at most three
 *  letters — «126301», «L01», «LAB-07»; a name, even one word, is never a code (8.2 review). */
export const CODE_RE = /^(?=[^A-Za-z]*(?:[A-Za-z][^A-Za-z]*){0,3}$)(?=[^0-9]*[0-9])[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/;
/** A characteristic's id, as 2.0 keys it: no space at its ends, no control character, up to 64. */
export const CHAR_ID_RE = /^[^\s\u0000-\u001F\u007F](?:[^\u0000-\u001F\u007F]{0,62}[^\s\u0000-\u001F\u007F])?$/;
/** A reported value as a participant writes one: a number, with a comma or a point, perhaps «<» —
 *  never words. */
export const REPORTED_RE = /^(?:[<>≤≥]\s?)?[-+−]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
const SAMPLE_RE = /^[A-Za-z0-9._-]{0,40}$/;
export const MAX_ROWS = 20_000;

/** The contract's sheets (7.1) — no other. «Указания» is 2.0's guide, not read. */
export const CONTRACT_SHEETS = ["Scheme_meta", "Characteristics", "Participants", "Results", "Homogeneity", "Calibration", "External_providers", "Указания"] as const;
export const META_KEYS = ["schema_version", "scheme_code", "object_title", "object_title_en", "design_approved", "report_date", "period"] as const;
/** The columns that hold a number, per sheet — compared as numbers; every other cell as text. */
export const NUMERIC_COLUMNS: Record<string, ReadonlySet<string>> = {
  Characteristics: new Set(["precision_digits", "significant_digits", "specimens", "xpt_from_reference", "u_xpt_from_reference", "sigma_pt_predefined", "sigma_pt_min", "sigma_pt_max", "sigma_homogeneity", "delta_factor", "min_participants", "physical_min", "physical_max"]),
  Results: new Set(["determination_i", "determination_ii", "determination_iii", "mean", "u_k2"]),
  Homogeneity: new Set(["replicate_number", "value"]),
  Calibration: new Set(["nominal", "x_ref_before", "x_ref_after", "u_calibration", "u_other", "coverage_factor"]),
};

export interface ReplayResult { code: string; key: string; dets: Cell[]; mean: Cell; u: Cell; status: "reported" | "N/R" | "excluded"; reportedDets: string; reportedMean: string; reportedU: string }
export interface ReplayRound {
  meta: Record<string, string>;
  number: string;
  type: "T" | "C";
  /** the Characteristics rows, by header */
  characteristics: Record<string, Cell>[];
  participants: { code: string; takes: Record<string, boolean> }[];
  results: ReplayResult[];
  homogeneity: { series: string; sampleCode: string; key: string; replicate: number; value: number }[];
  calibration: { key: string; nominal: Cell; xBefore?: number; xAfter?: number; uCal?: number; uOther?: number; k?: number }[];
  providers: { name: string; address: string; services: string }[];
  /** what cannot be carried as it is — said before the round is made (never a note's words) */
  said: { excluded: string[]; nrNotes: string[] };
}

export type ReplayProblem = { where: string; why: string };
/** What the import tells its form (8.2) — kept here: a «use server» module exports functions only. */
export interface ReplayImportState { ok?: boolean; schemeId?: string; number?: string; unlogged?: boolean; problem?: string; problems?: ReplayProblem[]; detail?: string }

const s = (v: Cell): string => (v === null || v === undefined ? "" : typeof v === "number" ? String(v) : String(v).trim());
const num = (v: Cell): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const p = plainNumber(s(v));
  return p ? Number(p) : undefined;
};
const yes = (v: Cell) => /^(да|yes|y|1|true|x)$/i.test(s(v));

/** The headers a sheet may have — Participants: also participates_in_<an id>. */
const allowedHeader = (sheet: string, h: string, ids: readonly string[]) =>
  (ANALYSIS_HEADERS as Record<string, readonly string[]>)[sheet]?.includes(h) || (sheet === "Participants" && h.startsWith("participates_in_") && ids.includes(h.slice("participates_in_".length)));

/** Rows of a sheet as records by its header row — every cell under a header of the contract; any
 *  value under an unknown or empty header, or past the header row, is a problem (by its place only:
 *  never repeated back). Trailing empty rows dropped. */
function records(sheet: ReadSheet | undefined, ids: readonly string[], P: ReplayProblem[]): { header: string[]; rows: { n: number; r: Record<string, Cell> }[] } {
  if (!sheet || !sheet.rows.length) return { header: [], rows: [] };
  const header = (sheet.rows[0] ?? []).map((h) => s(h));
  header.forEach((h, i) => { if (h && !allowedHeader(sheet.name, h, ids)) P.push({ where: `${sheet.name} column ${colName(i)}`, why: "a column the contract does not have — only the contract's columns come in" }); });
  const rows: { n: number; r: Record<string, Cell> }[] = [];
  sheet.rows.slice(1).forEach((r, i) => {
    if (!r || !r.some((c) => s(c) !== "")) return;
    r.forEach((c, j) => { if (s(c) !== "" && !header[j]) P.push({ where: `${sheet.name} row ${i + 2}, column ${colName(j)}`, why: "a value outside the contract's columns" }); });
    rows.push({ n: i + 2, r: Object.fromEntries(header.filter(Boolean).map((h) => [h, r[header.indexOf(h)] ?? null])) });
  });
  return { header, rows };
}

/** The file read and checked. Every problem, by sheet and row — or the round. */
export function readReplay(sheets: readonly ReadSheet[]): { ok: true; round: ReplayRound } | { ok: false; problems: ReplayProblem[] } {
  const P: ReplayProblem[] = [];
  const by = new Map(sheets.map((x) => [x.name, x]));
  // a sheet the contract does not have — by its place, never its name (it may be one)
  sheets.forEach((x, i) => { if (!(CONTRACT_SHEETS as readonly string[]).includes(x.name)) P.push({ where: `sheet ${i + 1}`, why: "a sheet the contract does not have — only the contract's sheets come in" }); });
  for (const name of ["Scheme_meta", "Characteristics", "Participants", "Results"] as const) if (!by.has(name)) P.push({ where: name, why: "the sheet is missing" });
  if (P.length) return { ok: false, problems: P };
  const total = sheets.reduce((n, x) => n + x.rows.length, 0);
  if (total > MAX_ROWS) return { ok: false, problems: [{ where: "file", why: `more than ${MAX_ROWS} rows` }] };

  // Scheme_meta — key / value; the contract's keys only, once each
  const meta: Record<string, string> = {};
  by.get("Scheme_meta")!.rows.forEach((r, i) => {
    if (i === 0 || !r || !r.some((c) => s(c) !== "")) return;
    const k = s(r[0]);
    if (!(META_KEYS as readonly string[]).includes(k)) { P.push({ where: `Scheme_meta row ${i + 1}`, why: "a key the contract does not have" }); return; }
    if (k in meta) { P.push({ where: `Scheme_meta row ${i + 1}`, why: `«${k}» twice` }); return; }
    if (r.slice(2).some((c) => s(c) !== "")) P.push({ where: `Scheme_meta row ${i + 1}`, why: "a value outside the contract's columns" });
    meta[k] = s(r[1]).slice(0, 300);
  });
  if (meta.schema_version !== REPLAY_SCHEMA) P.push({ where: "Scheme_meta", why: `schema_version is «${(meta.schema_version ?? "").slice(0, 10)}» — this reads ${REPLAY_SCHEMA}` });
  const number = (meta.scheme_code ?? "").slice(0, 60);
  if (!number) P.push({ where: "Scheme_meta", why: "no scheme_code" });

  // Characteristics
  const chSheet = by.get("Characteristics")!;
  const chHead = (chSheet.rows[0] ?? []).map((x) => s(x)), idCol = chHead.indexOf("characteristic_id");
  const ids = idCol < 0 ? [] : chSheet.rows.slice(1).map((r) => s(r?.[idCol] ?? null)).filter(Boolean);
  const ch = records(chSheet, ids, P);
  for (const h of ["characteristic_id", "name", "unit"]) if (!ch.header.includes(h)) P.push({ where: "Characteristics", why: `no «${h}» column` });
  const seenIds: string[] = [];
  for (const { n, r } of ch.rows) {
    const id = s(r.characteristic_id ?? null);
    if (!CHAR_ID_RE.test(id)) P.push({ where: `Characteristics row ${n}`, why: "the characteristic_id is not one" });
    else if (seenIds.includes(id)) P.push({ where: `Characteristics row ${n}`, why: `«${id}» twice` });
    seenIds.push(id);
  }
  if (!ch.rows.length) P.push({ where: "Characteristics", why: "no characteristic" });
  const isC = ch.rows.length > 0 && ch.rows.every(({ r }) => s(r.assigned_value_method ?? null).toLowerCase() === "calibration");
  for (const { n, r } of ch.rows) {
    const sp = num(r.specimens ?? null);
    if (s(r.specimens ?? null) !== "" && (!sp || sp < 1 || sp > 3 || !Number.isInteger(sp))) P.push({ where: `Characteristics row ${n}`, why: "specimens is 1, 2 or 3" });
    for (const c of NUMERIC_COLUMNS.Characteristics) if (s(r[c] ?? null) !== "" && num(r[c] ?? null) === undefined) P.push({ where: `Characteristics row ${n}`, why: `${c} is not a number` });
  }

  // Participants — codes only; a country a two-letter code at most
  const pa = records(by.get("Participants"), seenIds, P);
  if (!pa.header.includes("laboratory_code")) P.push({ where: "Participants", why: "no «laboratory_code» column" });
  const takeCols = pa.header.filter((h) => h.startsWith("participates_in_"));
  const codes: string[] = [];
  const participants = pa.rows.map(({ n, r }) => {
    const code = s(r.laboratory_code ?? null);
    // a name is refused, and not repeated back — only its row
    if (!CODE_RE.test(code)) P.push({ where: `Participants row ${n}`, why: "the laboratory_code is not a code (digits, at most three letters, -_. — no space): a name never comes in" });
    else if (codes.includes(code)) P.push({ where: `Participants row ${n}`, why: `the code ${code} twice` });
    if (s(r.country ?? null) !== "" && !/^[A-Z]{2}$/.test(s(r.country ?? null))) P.push({ where: `Participants row ${n}`, why: "the country is a two-letter code, or empty" });
    for (const h of takeCols) if (s(r[h] ?? null) !== "" && !/^(да|не|yes|no|y|n|1|0|true|false|x)$/i.test(s(r[h] ?? null))) P.push({ where: `Participants row ${n}`, why: `${h} is Да or Не` });
    codes.push(code);
    const takes = Object.fromEntries(seenIds.map((id) => [id, isC || !takeCols.length ? true : yes(r[`participates_in_${id}`] ?? null)]));
    return { code, takes };
  });
  if (!participants.length) P.push({ where: "Participants", why: "no participant" });

  // Results — the reported texts are numbers (a name never sits in one)
  const re = records(by.get("Results"), seenIds, P);
  for (const h of ["laboratory_code", "characteristic_id", "status"]) if (!re.header.includes(h)) P.push({ where: "Results", why: `no «${h}» column` });
  const said = { excluded: [] as string[], nrNotes: [] as string[] };
  const seen = new Set<string>();
  const results: ReplayResult[] = [];
  const reportedOk = (t: string) => t === "" || /^n\/?r$/i.test(t) || REPORTED_RE.test(t);
  for (const { n, r } of re.rows) {
    const code = s(r.laboratory_code ?? null), key = s(r.characteristic_id ?? null), where = `Results row ${n}`;
    if (!codes.includes(code)) { P.push({ where, why: CODE_RE.test(code) ? `the code ${code} is not in Participants` : "the laboratory_code is not a code" }); continue; }
    if (!seenIds.includes(key)) { P.push({ where, why: "the characteristic is not in Characteristics" }); continue; }
    if (seen.has(`${code}\u0000${key}`)) { P.push({ where, why: `${code} / ${key} twice` }); continue; }
    seen.add(`${code}\u0000${key}`);
    const st = s(r.status ?? null).toLowerCase();
    const status = st === "n/r" || st === "nr" ? "N/R" : st === "excluded" ? "excluded" : st === "reported" || st === "" ? "reported" : null;
    if (!status) { P.push({ where, why: "the status is not reported, N/R or excluded" }); continue; }
    const dets = [r.determination_i ?? null, r.determination_ii ?? null, r.determination_iii ?? null];
    const reportedDets = s(r.reported_determinations ?? null), reportedMean = s(r.reported_mean ?? null), reportedU = s(r.reported_u_k2 ?? null);
    if (!reportedOk(reportedMean) || !reportedOk(reportedU) || !reportedDets.split(";").every((x) => reportedOk(x.trim()))) { P.push({ where, why: "a reported_* cell is not a number as reported (or N/R)" }); continue; }
    if (status !== "N/R") {
      for (const [j, d] of [...dets, r.mean ?? null, r.u_k2 ?? null].entries()) if (s(d) !== "" && num(d) === undefined) P.push({ where, why: `${["determination_i", "determination_ii", "determination_iii", "mean", "u_k2"][j]} is not a number` });
      if (s(r.mean ?? null) === "" && !dets.some((d) => s(d) !== "")) P.push({ where, why: "a reported result with no value" });
    }
    if (status === "excluded") said.excluded.push(`${code} / ${key}`);
    if (status === "N/R" && s(r.notes ?? null)) said.nrNotes.push(`${code} / ${key}`);
    results.push({ code, key, dets, mean: r.mean ?? null, u: r.u_k2 ?? null, status, reportedDets: reportedDets.slice(0, 200), reportedMean: reportedMean.slice(0, 60), reportedU: reportedU.slice(0, 60) });
  }

  // Homogeneity, Calibration, External_providers — optional sheets; each row's key once
  const hk = new Set<string>();
  const homogeneity = records(by.get("Homogeneity"), seenIds, P).rows.flatMap(({ n, r }) => {
    const key = s(r.characteristic_id ?? null), rep = num(r.replicate_number ?? null), value = num(r.value ?? null);
    const series = s(r.series ?? null) || "H1", sampleCode = s(r.sample_code ?? null);
    if (!seenIds.includes(key) || !rep || !Number.isInteger(rep) || rep < 1 || value === undefined) { P.push({ where: `Homogeneity row ${n}`, why: "a characteristic, a replicate (1, 2…) and a value" }); return []; }
    if (!SAMPLE_RE.test(series) || !SAMPLE_RE.test(sampleCode)) { P.push({ where: `Homogeneity row ${n}`, why: "the series and the sample's code are codes (letters, digits, -_.)" }); return []; }
    const k = `${series}\u0000${sampleCode}\u0000${key}\u0000${rep}`;
    if (hk.has(k)) { P.push({ where: `Homogeneity row ${n}`, why: "the same series, sample, characteristic and replicate twice" }); return []; }
    hk.add(k);
    return [{ series: series.slice(0, 20), sampleCode, key, replicate: rep, value }];
  });
  const ck = new Set<string>();
  const calibration = records(by.get("Calibration"), seenIds, P).rows.flatMap(({ n, r }) => {
    const key = s(r.characteristic_id ?? null);
    if (!seenIds.includes(key)) { P.push({ where: `Calibration row ${n}`, why: "not a characteristic of the file" }); return []; }
    if (ck.has(key)) { P.push({ where: `Calibration row ${n}`, why: `«${key}» twice` }); return []; }
    ck.add(key);
    for (const c of NUMERIC_COLUMNS.Calibration) if (s(r[c] ?? null) !== "" && num(r[c] ?? null) === undefined) P.push({ where: `Calibration row ${n}`, why: `${c} is not a number` });
    return [{ key, nominal: r.nominal ?? null, xBefore: num(r.x_ref_before ?? null), xAfter: num(r.x_ref_after ?? null), uCal: num(r.u_calibration ?? null), uOther: num(r.u_other ?? null), k: num(r.coverage_factor ?? null) }];
  });
  const pk = new Set<string>();
  const providers = records(by.get("External_providers"), seenIds, P).rows.flatMap(({ n, r }) => {
    const p = { name: s(r.name ?? null).slice(0, 200), address: s(r.address ?? null).slice(0, 300), services: s(r.services ?? null).slice(0, 500) };
    if (!p.name) return [];
    if (pk.has(p.name)) { P.push({ where: `External_providers row ${n}`, why: "the same provider twice" }); return []; }
    pk.add(p.name);
    return [p];
  });

  if (P.length) return { ok: false, problems: P.slice(0, 200) };
  return { ok: true, round: { meta, number, type: isC ? "C" : "T", characteristics: ch.rows.map((x) => x.r), participants, results, homogeneity, calibration, providers, said } };
}

// ── what the replay round is made of ─────────────────────────────────────────

const cellText = (v: Cell): string => (typeof v === "number" ? String(v) : s(v));

/** Testing: the characteristics with their ids, names, methods, units, specimens and 2.0 fields. */
export function replayParameters(round: ReplayRound): Parameter[] {
  return round.characteristics.map((r) => {
    const engine: Partial<Record<EngineField, string>> = {};
    for (const f of ENGINE_FIELDS) { const v = cellText(r[f] ?? null); if (v !== "") engine[f] = v.slice(0, 500); }
    const spec = num(r.specimens ?? null);
    const p: Parameter = {
      id: s(r.characteristic_id ?? null), characteristicBg: s(r.name ?? null).slice(0, 300), characteristicEn: s(r.name_en ?? null).slice(0, 300),
      standardBg: s(r.standard_full ?? null).slice(0, 500), standardEn: s(r.standard_full_en ?? null).slice(0, 500), rangeBg: "", rangeEn: "",
      specimensBg: spec ? String(spec) : "", specimensEn: spec ? String(spec) : "", unit: s(r.unit ?? null).slice(0, 40),
      ...(spec ? { determinations: spec } : {}),
      ...(s(r.group ?? null) ? { group: s(r.group ?? null).slice(0, 120) } : {}), ...(s(r.group_en ?? null) ? { groupEn: s(r.group_en ?? null).slice(0, 120) } : {}),
      ...(num(r.physical_min ?? null) !== undefined ? { guardMin: num(r.physical_min ?? null) } : {}), ...(num(r.physical_max ?? null) !== undefined ? { guardMax: num(r.physical_max ?? null) } : {}),
      ...(Object.keys(engine).length ? { engine } : {}),
    };
    return p;
  });
}

const slug = (t: string) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "dir";

/** Calibration: the points with their ids (and directions, when every id is «point|direction»),
 *  their nominal values, the quantity, unit and method — as the export writes them back. */
export function replayCalibration(round: ReplayRound): CalibrationData {
  const rows = round.characteristics;
  const nominalOf = new Map(round.calibration.map((c) => [c.key, cellText(c.nominal)]));
  const paired = rows.every((r) => /^[^|]+\|[^|]+$/.test(s(r.characteristic_id ?? null)));
  const unit = s(rows[0]?.unit ?? null);
  const pointIds: string[] = [], points: string[] = [], dirSlugs: string[] = [], dirsEn: string[] = [], dirsBg: string[] = [];
  const strip = (name: string, nominal: string) => { const tail = ` ${nominal} ${unit}`.trimEnd(); const base = name.split(" · ")[0]; return base.endsWith(tail) ? base.slice(0, -tail.length).trim() : base.trim(); };
  for (const r of rows) {
    const id = s(r.characteristic_id ?? null);
    const [pid, dslug] = paired ? id.split("|") : [id, ""];
    if (!pointIds.includes(pid)) { pointIds.push(pid); points.push(nominalOf.get(id) ?? ""); }
    if (paired && !dirSlugs.includes(dslug)) {
      dirSlugs.push(dslug);
      const en = s(r.name_en ?? null).split(" · ")[1] ?? "", bg = s(r.name ?? null).split(" · ")[1] ?? "";
      // the direction's words, when their slug is the id's — else the id's own part
      dirsEn.push(en && slug(en) === dslug.replace(/-\d+$/, "") ? en : dslug);
      dirsBg.push(bg || en || dslug);
    }
  }
  const first = rows[0] ?? {};
  const nominal0 = points[0] ?? "";
  return {
    quantityEn: strip(s(first.name_en ?? null), nominal0), quantityBg: strip(s(first.name ?? null), nominal0), unit,
    deviceEn: "", deviceBg: "", points, pointIds, directionsEn: dirsEn, directionsBg: dirsBg,
    referenceLabEn: "", referenceLabBg: "", referenceLabLocEn: "", referenceLabLocBg: "",
    methodEn: s(first.standard_full_en ?? null), methodBg: s(first.standard_full ?? null), feeEn: "", feeBg: "",
    stabilityFormula: "", enCriterionEn: "", enCriterionBg: "",
  };
}

export const replayProviders = (round: ReplayRound): Omit<ExternalProvider, "id">[] =>
  round.providers.map((p) => ({ name: p.name, address: p.address, servicesBg: p.services, servicesEn: "" }));

/** A used value the file holds that differs from the reported one — recorded as the round's 6.5
 *  correction, as the export reads it back (used ≠ reported, never merged — 8.2 review). */
export interface ReplayCorrection { key: string; field: string; reported: string; used: string }

/** A participation's results as the form's own submitted payload — the reported text exactly as it
 *  was («4,30» stays «4,30»; with none in the file, the number's own text); a used value that differs
 *  from the reported one as a correction; U at k = 2 only when the reported U is the u_k2. */
export function replayResults(round: ReplayRound, code: string, importId: string): { data: Record<string, unknown>; corrections: ReplayCorrection[] } | null {
  const mine = round.results.filter((r) => r.code === code);
  if (!mine.length) return null;
  const n = (t: string) => { const p = plainNumber(t); return p ? Number(p) : null; };
  const numText = (v: Cell) => (typeof v === "number" ? String(v) : plainNumber(s(v)) || "");
  const corrections: ReplayCorrection[] = [];
  /** the reported text, and a correction when the used number in the file differs from it */
  const field = (key: string, f: string, reported: string, used: Cell): string => {
    const usedText = numText(used);
    if (!reported) return usedText;
    const rn = n(reported);
    if (usedText !== "" && (rn === null || rn !== Number(usedText))) corrections.push({ key, field: f, reported, used: usedText });
    return reported;
  };
  if (round.type === "T") {
    const specimens = new Map(round.characteristics.map((r) => [s(r.characteristic_id ?? null), num(r.specimens ?? null) ?? 1]));
    const rows: Record<string, { d: string[]; mean: string; U: string; k: string; nr?: boolean }> = {};
    const values: Record<string, unknown> = {};
    for (const r of mine) {
      if (r.status === "N/R") { rows[r.key] = { d: [], mean: "", U: "", k: "", nr: true }; values[r.key] = { nr: true }; continue; }
      const reported = r.reportedDets ? r.reportedDets.split(";").map((x) => x.trim()).map((x) => (/^n\/?r$/i.test(x) ? "" : x)) : [];
      const want = specimens.get(r.key) ?? 1;
      const d = Array.from({ length: want }, (_, j) => field(r.key, `d${j + 1}`, reported[j] ?? "", r.dets[j] ?? null));
      const mean = field(r.key, "mean", r.reportedMean, r.mean);
      const before = corrections.length;
      const U = field(r.key, "U", r.reportedU, r.u);
      // a reported U that is not the u_k2 was reported at another k — not known here: not said to be 2
      const k = U && corrections.length === before ? "2" : "";
      rows[r.key] = { d, mean, U, k };
      values[r.key] = { d: d.map(n), mean: n(mean), U: n(U), k: k ? 2 : null };
    }
    return { data: { v: 1, kind: "T", draft: { v: 1, rows }, values, notices: [], replay: { importId } }, corrections };
  }
  const points: Record<string, { ref: string; meas: string; U: string; cmc: string }> = {};
  const values: Record<string, unknown> = {};
  for (const r of mine) {
    if (r.status === "N/R") { values[r.key] = { nr: true }; continue; }
    const error = field(r.key, "error", r.reportedMean, r.mean), U = field(r.key, "U", r.reportedU, r.u);
    points[r.key] = { ref: "", meas: "", U, cmc: "" };
    // the error as reported — exactly (8.2 review: «0,030» never becomes «0.03»)
    values[r.key] = { ref: null, meas: null, error, U: n(U), cmc: null };
  }
  return { data: { v: 1, kind: "C", draft: { v: 1, kind: "C", general: {}, points }, values, notices: [], replay: { importId } }, corrections };
}

// ── the re-export compared with the file ─────────────────────────────────────

export interface ReplayDiff { sheet: string; column: string; source: string; exported: string; expected?: string }

const isNumCol = (sheet: string, col: string) => !!NUMERIC_COLUMNS[sheet]?.has(col);
const REPORTED_OF: Record<string, string> = { reported_mean: "mean", reported_u_k2: "u_k2" };

// Why a difference is expected — the replay is another round of the same data (Реш. 130), and the
// portal writes some cells itself. Never a value changed: those are always unexpected.
const EXPECTED_META: Record<string, string> = {
  scheme_code: "the replay's own SIM number (Реш. 130)",
  report_date: "the replay's report is not issued",
  design_approved: "the replay's own record of the design's approval (stage 4)",
};

/** The source file against the portal's re-export (as written and read back), cell by cell, keyed by
 *  the rows' own keys — EXACTLY: a text column as text, a number column as a number (the same number
 *  written as text is said); a key twice on either side, a sheet on one side only — always said. Free
 *  text the file holds (a note) is never shown — only that it differs. */
export function replayDiff(source: readonly ReadSheet[], exported: readonly ReadSheet[], round: Pick<ReplayRound, "said">): ReplayDiff[] {
  const out: ReplayDiff[] = [];
  const ex = new Map(exported.map((x) => [x.name, x]));
  const excluded = new Set(round.said.excluded);
  const keyed: Record<string, (r: Cell[], h: string[]) => string> = {
    Scheme_meta: (r) => s(r[0]),
    Characteristics: (r, h) => s(r[h.indexOf("characteristic_id")]),
    Participants: (r, h) => s(r[h.indexOf("laboratory_code")]),
    Results: (r, h) => `${s(r[h.indexOf("laboratory_code")])} / ${s(r[h.indexOf("characteristic_id")])}`,
    Homogeneity: (r, h) => [0, 1, 2, 3].map((i) => s(r[h.indexOf(ANALYSIS_HEADERS.Homogeneity[i])])).join(" / "),
    Calibration: (r, h) => s(r[h.indexOf("characteristic_id")]),
    External_providers: (r, h) => s(r[h.indexOf("name")]),
  };
  for (const x of [...source, ...exported]) if (!(x.name in keyed) && x.name !== "Указания") out.push({ sheet: x.name, column: "(sheet)", source: source.includes(x) ? "(sheet)" : "—", exported: exported.includes(x) ? "(sheet)" : "—" });
  const shown = (col: string, v: Cell) => (col === "notes" && s(v) ? "(бележка)" : cellText(v));
  for (const [name, keyOf] of Object.entries(keyed)) {
    const a = source.find((x) => x.name === name), b = ex.get(name);
    if (!a && !b) continue;
    if (!a || !b) { out.push({ sheet: name, column: "(sheet)", source: a ? "(sheet)" : "—", exported: b ? "(sheet)" : "—" }); continue; }
    const ha = (a.rows[0] ?? []).map(s), hb = (b.rows[0] ?? []).map(s);
    const listOf = (sheet: ReadSheet, h: string[]) => sheet.rows.slice(1).filter((r) => r?.some((c) => s(c) !== "")).map((r) => [keyOf(r, h), r] as const);
    const la = listOf(a, ha), lb = listOf(b, hb);
    // a key twice — on either side — is never folded into one (8.2 review)
    for (const [side, list] of [["source", la], ["exported", lb]] as const) {
      const seen = new Set<string>();
      for (const [k] of list) { if (seen.has(k)) out.push({ sheet: name, column: `${k} · (twice)`, source: side === "source" ? "(twice)" : "", exported: side === "exported" ? "(twice)" : "" }); seen.add(k); }
    }
    const rowsA = new Map(la), rowsB = new Map(lb);
    const cols = name === "Scheme_meta" ? ["value"] : [...new Set([...ha, ...hb])].filter(Boolean);
    for (const k of new Set([...rowsA.keys(), ...rowsB.keys()])) {
      const ra = rowsA.get(k), rb = rowsB.get(k);
      if (!ra || !rb) {
        const why = name === "Results" && !ra && rb && cellText(rb[hb.indexOf("status")]) === "N/R" ? "the portal writes N/R for a characteristic with no result" : undefined;
        out.push({ sheet: name, column: k, source: ra ? "(row)" : "—", exported: rb ? "(row)" : "—", ...(why ? { expected: why } : {}) });
        continue;
      }
      for (const c of cols) {
        const va = name === "Scheme_meta" ? ra[1] ?? null : ha.includes(c) ? ra[ha.indexOf(c)] ?? null : null;
        const vb = name === "Scheme_meta" ? rb[1] ?? null : hb.includes(c) ? rb[hb.indexOf(c)] ?? null : null;
        let expected: string | undefined;
        if (isNumCol(name, c)) {
          if (s(va) === "" && s(vb) === "") continue;
          const na = num(va), nb = num(vb);
          if (na !== undefined && nb !== undefined && na === nb) {
            if (typeof va === typeof vb) continue;
            expected = "the same number — written as text on one side";
          }
        } else if (cellText(va) === cellText(vb)) continue;
        if (!expected) {
          if (name === "Scheme_meta" && EXPECTED_META[k]) expected = EXPECTED_META[k];
          else if (name === "Results" && c === "status" && excluded.has(k) && cellText(vb) === "reported") expected = "«excluded» is 2.0's decision — the portal sends the result as reported";
          else if (name === "Results" && c === "notes") expected = "the notes are the portal's own words";
          else if (name === "Participants" && c === "country" && cellText(vb) === "") expected = "the portal sends no country";
          else if (name === "Results" && REPORTED_OF[c] && s(va) === "" && num(vb) !== undefined && num(vb) === num(rb[hb.indexOf(REPORTED_OF[c])] ?? null)) expected = "the file left it empty — the portal writes the value as reported";
          else if (name === "Results" && c === "reported_determinations" && s(va) === "" && cellText(vb).split(";").every((x, j) => num(x.trim()) !== undefined && num(x.trim()) === num(rb[hb.indexOf(["determination_i", "determination_ii", "determination_iii"][j])] ?? null))) expected = "the file left it empty — the portal writes the determinations as reported";
        }
        out.push({ sheet: name, column: `${k} · ${c}`, source: shown(c, va), exported: shown(c, vb), ...(expected ? { expected } : {}) });
      }
    }
  }
  return out;
}
