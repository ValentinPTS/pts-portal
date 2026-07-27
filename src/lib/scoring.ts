// Scoring layer — turns the manually-entered results (scheme.scoring) into the
// per-laboratory z / ζ / Eₙ scores via the unit-tested stats.ts. Used by BOTH
// the admin results screen and the Final Report renderers, so the numbers shown
// on screen are byte-for-byte the numbers printed in the report.
//
// A "metric" is one scored quantity:
//   testing     → one per parameter            (key = parameter index "0","1",…)
//   calibration → one per (direction × point)  (key = `${dirIdx}:${pointIdx}`)

import type { Scheme, Lang, AssignedValue, ResultEntry, Scoring } from "./types";
import { esc, pick } from "./doc-shell";
import { zScore, zetaScore, enScore, verdictZ, verdictEn, algorithmA, uncertaintyOfAssigned } from "./stats";
import { barChart, VERDICT_COLOR, type Bar, type RefLine } from "./charts";

const Z_REFS: RefLine[] = [
  { value: 2, label: "±2", color: "#b8860b" },
  { value: 3, label: "±3", color: "#9e2b2b" },
];
const EN_REFS: RefLine[] = [{ value: 1, label: "±1", color: "#9e2b2b" }];

const clean = (v: number) => parseFloat(v.toFixed(6)); // kill float noise
const g = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "" : String(clean(v));
const s2 = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(2);

export interface Metric {
  key: string;
  labelEn: string;
  labelBg: string;
  dirIdx?: number; // calibration only
  pointIdx?: number; // calibration only
  point?: string; // calibration only — the load value, e.g. "20"
}

export function metricsForScheme(s: Scheme): Metric[] {
  if (s.type === "C" && s.calibration) {
    const c = s.calibration;
    const dirsEn = c.directionsEn.length ? c.directionsEn : ["—"];
    const dirsBg = c.directionsBg.length ? c.directionsBg : dirsEn;
    const out: Metric[] = [];
    dirsEn.forEach((dEn, di) => {
      c.points.forEach((pt, pi) => {
        out.push({
          key: `${di}:${pi}`,
          labelEn: `${dEn} @ ${pt} ${c.unit}`,
          labelBg: `${dirsBg[di] ?? dEn} @ ${pt} ${c.unit}`,
          dirIdx: di,
          pointIdx: pi,
          point: pt,
        });
      });
    });
    return out;
  }
  return s.parameters.map((p, i) => ({
    key: String(i),
    labelEn: p.characteristicEn || `Parameter ${i + 1}`,
    labelBg: p.characteristicBg || `Параметър ${i + 1}`,
  }));
}

/**
 * Build a Scoring object from a submitted form. Field naming is positional —
 * metric index `mi`, participant index `pi` — and the caller passes the SAME
 * metric list and participant-code order used to render the form, so keys can
 * never drift. `num(key)` returns the parsed number or null (blank → skipped).
 * Pure (no FormData / store) so it is directly unit-testable.
 */
export function buildScoring(
  metrics: Metric[],
  participantCodes: string[],
  num: (key: string) => number | null
): Scoring {
  const assigned: Record<string, AssignedValue> = {};
  metrics.forEach((m, mi) => {
    const xpt = num(`a_${mi}_xpt`);
    if (xpt === null) return; // no assigned value → metric not yet scored
    assigned[m.key] = { xpt, sigma: num(`a_${mi}_sigma`) ?? 0, u: num(`a_${mi}_u`) ?? 0 };
  });
  const results: Record<string, Record<string, ResultEntry>> = {};
  participantCodes.forEach((code, pi) => {
    metrics.forEach((m, mi) => {
      const value = num(`r_${mi}_${pi}_value`);
      if (value === null) return; // no result entered for this lab/metric
      const entry: ResultEntry = { value, u: num(`r_${mi}_${pi}_u`) ?? 0 };
      // individual determinations I/II/III (F 7.2.1-6) — positional, blanks = null
      const det = [0, 1, 2].map((k) => num(`r_${mi}_${pi}_d${k}`));
      if (det.some((d) => d !== null)) entry.determinations = det;
      (results[code] ??= {})[m.key] = entry;
    });
  });
  return { assigned, results };
}

/**
 * Fingerprint of the state a results form was rendered from — its "version".
 * Keys are sorted and fields written in a fixed order, so the value is stable
 * across the JSONB round-trip (Postgres does not preserve object key order) and
 * identical whenever the data is identical. `shape` carries the form's positional
 * layout (metric keys, then participant codes in render order) because the field
 * names r_<mi>_<pi>_* are index-based: if that layout changed since render, the
 * submitted indices no longer mean what they meant. Pure → unit-testable.
 */
export function scoringStamp(scoring: Scoring | undefined, shape: string[] = []): string {
  const sc = scoring ?? { assigned: {}, results: {} };
  const parts: string[] = shape.map((k) => `k|${k}`);
  for (const key of Object.keys(sc.assigned).sort()) {
    const a = sc.assigned[key];
    parts.push(`a|${key}|${g(a.xpt)}|${g(a.sigma)}|${g(a.u)}`);
  }
  for (const code of Object.keys(sc.results).sort()) {
    const byMetric = sc.results[code] ?? {};
    for (const key of Object.keys(byMetric).sort()) {
      const e = byMetric[key];
      parts.push(`r|${code}|${key}|${g(e.value)}|${g(e.u)}|${(e.determinations ?? []).map((d) => g(d)).join(",")}`);
    }
  }
  // FNV-1a 32-bit — short, dependency-free, deterministic. The value is only ever
  // compared against a re-computation of itself, so collisions are irrelevant.
  let h = 0x811c9dc5;
  const s = parts.join(";");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

/** The finite results entered for one metric, across all participant codes. */
export function resultValues(scoring: Scoring, key: string): number[] {
  const out: number[] = [];
  for (const code of Object.keys(scoring.results)) {
    const e = scoring.results[code]?.[key];
    if (e && Number.isFinite(e.value)) out.push(e.value);
  }
  return out;
}

/**
 * How many valid results a robust CONSENSUS assigned value needs for this scheme:
 * the minimum number of participants the scheme was declared with (Plan §5,
 * Statistical project §3) — never below 2. Below it, Statistical project §4
 * applies: xpt/σpt are pre-set by hand, not derived from the participants.
 */
export function consensusMinimum(s: Scheme): number {
  return Math.max(2, s.minParticipants || 0);
}

/**
 * The STATISTICAL floor for deriving a robust consensus assigned value — the
 * number of results below which Algorithm A cannot say anything, whatever the
 * scheme planned for.
 *
 * Deliberately NOT scheme.minParticipants: that is an ENROLMENT target (how many
 * laboratories the round expects to sign up, printed in Plan §5) and using it here
 * turned "Auto-compute" into a silent no-op on any round that is still collecting
 * results — a working button becoming a dead one. The real defect is at n = 2,
 * where Algorithm A degenerates: s* is always 0.801859·|x₁ − x₂|, so BOTH labs
 * score z = ±0.62 ("satisfactory") however far apart they are. From n = 3 the
 * estimator has freedom and the result is meaningful, if wide.
 */
export const CONSENSUS_FLOOR = 3;

/**
 * Metrics that have results entered but fewer than `minN` — exactly the ones
 * computeAssigned refuses, so the on-screen warning can never disagree with what
 * was computed. Metrics with no results at all stay silent (nothing attempted).
 */
export function belowMinimum(metrics: Metric[], scoring: Scoring, minN = CONSENSUS_FLOOR): Metric[] {
  const need = Math.max(2, minN);
  return metrics.filter((m) => {
    const n = resultValues(scoring, m.key).length;
    return n > 0 && n < need;
  });
}

/**
 * Suggested assigned values from the participants' results, via ISO 13528
 * Algorithm A (robust mean x* and robust SD s*), with u(xpt) = 1.25 · s* ÷ √n.
 * This is the *consensus* approach — appropriate for TESTING schemes only;
 * for calibration the assigned value is the reference lab's value (kept manual).
 * Caller decides whether to apply it. Pure → unit-testable.
 *
 * A metric with fewer than `minN` results is SKIPPED — see CONSENSUS_FLOOR for
 * why the default is 3 and why it is NOT the scheme's enrolment target. Below the
 * floor, Statistical project §4 applies: xpt/σpt are entered by hand instead.
 */
export function computeAssigned(
  metrics: Metric[],
  scoring: Scoring,
  minN = CONSENSUS_FLOOR
): Record<string, AssignedValue> {
  const need = Math.max(2, minN);
  const round6 = (v: number) => parseFloat(v.toFixed(6));
  const out: Record<string, AssignedValue> = {};
  for (const m of metrics) {
    const values = resultValues(scoring, m.key);
    if (values.length < need) continue;
    const { xStar, sStar } = algorithmA(values);
    if (Number.isNaN(xStar)) continue;
    out[m.key] = {
      xpt: round6(xStar),
      sigma: round6(sStar),
      u: round6(uncertaintyOfAssigned(sStar, values.length)),
    };
  }
  return out;
}

// ── §7.5.1/§8.4 audit trail: what actually changed in a results save ──────────
// Pure diff of two Scoring objects so a save can be logged with WHICH cell changed
// and WHAT IT WAS BEFORE — the question an ISO 17043 audit asks about a z-score.
// `null` = the cell was blank. Values are rounded like the UI (clean) so float
// noise never registers as a phantom change. Pure → unit-testable.
export interface ScoringChange {
  what: string;      // "xpt" | "sigma" | "u" | "value" | "I" | "II" | "III"
  metricKey: string;
  code?: string;     // participant code — absent for the assigned-value row
  before: number | null;
  after: number | null;
}

const DET_LABEL = ["I", "II", "III"];

export function diffScoring(before: Scoring | undefined, after: Scoring): ScoringChange[] {
  const out: ScoringChange[] = [];
  const b: Scoring = before ?? { assigned: {}, results: {} };
  const n = (v: number | null | undefined): number | null =>
    v === null || v === undefined || Number.isNaN(v) ? null : clean(v);
  const push = (what: string, metricKey: string, x: number | null, y: number | null, code?: string) => {
    if (x === y) return;
    out.push({ what, metricKey, code, before: x, after: y });
  };
  const keys = (a: object, c: object) => [...new Set([...Object.keys(a), ...Object.keys(c)])].sort();

  for (const key of keys(b.assigned, after.assigned)) {
    const x = b.assigned[key], y = after.assigned[key];
    push("xpt", key, n(x?.xpt), n(y?.xpt));
    push("sigma", key, n(x?.sigma), n(y?.sigma));
    push("u", key, n(x?.u), n(y?.u));
  }
  for (const code of keys(b.results, after.results)) {
    const bx = b.results[code] ?? {}, ay = after.results[code] ?? {};
    for (const key of keys(bx, ay)) {
      const x = bx[key], y = ay[key];
      push("value", key, n(x?.value), n(y?.value), code);
      push("u", key, n(x?.u), n(y?.u), code);
      for (let d = 0; d < DET_LABEL.length; d++)
        push(DET_LABEL[d], key, n(x?.determinations?.[d]), n(y?.determinations?.[d]), code);
    }
  }
  return out;
}

// One-line, CODE-ONLY summary for the activity log (§4.2 — never a lab name).
// Capped so one bulk save cannot write an unbounded row.
export function describeScoringChanges(changes: ScoringChange[], metrics: Metric[], max = 12): string {
  if (changes.length === 0) return "no values changed";
  const label = new Map(metrics.map((m) => [m.key, m.labelEn.slice(0, 40)]));
  const fmt = (v: number | null) => (v === null ? "—" : String(v));
  const parts = changes.slice(0, max).map(
    (c) => `${c.code ?? "assigned"} · ${label.get(c.metricKey) || c.metricKey} · ${c.what}: ${fmt(c.before)} → ${fmt(c.after)}`
  );
  const more = changes.length - parts.length;
  return `${changes.length} value(s) changed — ${parts.join("; ")}${more > 0 ? `; +${more} more` : ""}`;
}

export interface ScoredRow {
  code: string;
  value: number;
  u: number;
  z: number | null;
  zeta: number | null;
  en: number | null;
  verdict: "satisfactory" | "warning" | "action" | "A" | "N" | null;
  ok: boolean | null; // null = not enough data to judge
}

/** σpt,min floor for a metric (testing characteristics only; 0 for calibration). */
export function sigmaFloor(s: Scheme, key: string): number {
  if (s.type === "C") return 0;
  return s.parameters[Number(key)]?.sigmaMin ?? 0;
}

/** All scored rows for one metric, computed from scheme.scoring (codes only). */
export function scoreMetric(
  s: Scheme,
  key: string
): { assigned?: AssignedValue; rows: ScoredRow[] } {
  const sc = s.scoring;
  if (!sc) return { rows: [] };
  const assigned = sc.assigned[key];
  const isCal = s.type === "C";
  const rows: ScoredRow[] = [];

  for (const code of Object.keys(sc.results).sort()) {
    const entry = sc.results[code]?.[key];
    if (!entry) continue;
    let z: number | null = null;
    let zeta: number | null = null;
    let en: number | null = null;
    let verdict: ScoredRow["verdict"] = null;
    let ok: boolean | null = null;

    if (assigned) {
      if (isCal) {
        en = enScore(entry.value, assigned.xpt, entry.u, assigned.u);
        if (!Number.isNaN(en)) {
          verdict = verdictEn(en);
          ok = verdict === "A";
        }
      } else {
        // σpt = max(s* / entered σ, σpt,min floor) — ISO 13528 / Stat project §7.4
        const sigmaEff = Math.max(assigned.sigma || 0, sigmaFloor(s, key));
        if (sigmaEff > 0) z = zScore(entry.value, assigned.xpt, sigmaEff);
        if (entry.u > 0 || assigned.u > 0)
          zeta = zetaScore(entry.value, assigned.xpt, entry.u, assigned.u);
        const primary = z ?? zeta;
        if (primary !== null && !Number.isNaN(primary)) {
          verdict = verdictZ(primary);
          ok = verdict === "satisfactory";
        }
      }
    }
    rows.push({ code, value: entry.value, u: entry.u, z, zeta, en, verdict, ok });
  }
  return { assigned, rows };
}

// ── verdict → coloured cell for the printed report / screen ──────────────────
function verdictCell(lang: Lang, v: ScoredRow["verdict"]): string {
  if (v === null) return "—";
  if (v === "A") return esc(pick(lang, "A — satisfactory", "A — удовлетв."));
  if (v === "N")
    return `<b style="color:var(--red)">${esc(pick(lang, "N — unsatisfactory", "N — неудовлетв."))}</b>`;
  if (v === "satisfactory") return esc(pick(lang, "Satisfactory", "Удовлетворителен"));
  if (v === "warning")
    return `<b style="color:#b8860b">${esc(pick(lang, "Warning", "Предупреждение"))}</b>`;
  return `<b style="color:var(--red)">${esc(pick(lang, "Action", "Действие"))}</b>`;
}

/**
 * Testing Final Report §9 body — one block per parameter that has data.
 * Returns "" when nothing has been scored yet (caller keeps its placeholder).
 */
export function reportResultsTesting(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const blocks: string[] = [];
  for (const m of metricsForScheme(s)) {
    const { assigned, rows } = scoreMetric(s, m.key);
    if (!assigned || rows.length === 0) continue;
    const floor = sigmaFloor(s, m.key);
    const sigmaEff = Math.max(assigned.sigma || 0, floor);
    const floorNote = floor > (assigned.sigma || 0) ? ` (σ<sub>pt,min</sub> = ${g(floor)})` : "";
    const head = `<p class="muted">${L("Assigned value", "Приета стойност")} x<sub>pt</sub> = ${g(
      assigned.xpt
    )} · σ<sub>pt</sub> = ${g(sigmaEff)}${floorNote} · u(x<sub>pt</sub>) = ${g(assigned.u)}</p>`;
    const body = rows
      .map(
        (r) => `<tr><td>${esc(r.code)}</td><td>${g(r.value)}</td><td>${g(r.u)}</td>
        <td>${s2(r.z)}</td><td>${s2(r.zeta)}</td><td>${verdictCell(lang, r.verdict)}</td></tr>`
      )
      .join("");
    // z-score chart (falls back to ζ when no σ was entered)
    const useZeta = !(assigned.sigma > 0);
    const bars = rows
      .map((r): Bar | null => {
        const v = useZeta ? r.zeta : r.z;
        return v === null || Number.isNaN(v)
          ? null
          : { label: r.code, value: v, color: VERDICT_COLOR[r.verdict ?? ""] ?? "#88a77b" };
      })
      .filter((b): b is Bar => b !== null);
    const chart = barChart(bars, Z_REFS, {
      caption: `${useZeta ? "ζ" : "z"}-${pick(lang, "scores", "оценки")} · ${pick(lang, m.labelEn, m.labelBg)}`,
      yMaxMin: 3.5,
    });

    blocks.push(`<h3 class="sub">${L(m.labelEn, m.labelBg)}</h3>${head}
      <table class="ptable"><thead><tr>
        <th>${L("Lab code", "Код на лаб.")}</th><th>${L("Result", "Резултат")} x<sub>i</sub></th>
        <th>u(x<sub>i</sub>)</th><th>z</th><th>ζ</th><th>${L("Evaluation", "Оценка")}</th>
      </tr></thead><tbody>${body}</tbody></table>${chart}`);
  }
  return blocks.join("\n");
}

/**
 * Calibration Final Report §9 body — one Eₙ table per load direction.
 * Returns "" when nothing has been scored yet (caller keeps its placeholder).
 */
export function reportResultsCalibration(s: Scheme, lang: Lang): string {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = s.calibration;
  if (!c) return "";
  const metrics = metricsForScheme(s);
  const dirsEn = c.directionsEn.length ? c.directionsEn : ["—"];
  const dirsBg = c.directionsBg.length ? c.directionsBg : dirsEn;
  const blocks: string[] = [];

  dirsEn.forEach((dEn, di) => {
    const rowsHtml: string[] = [];
    const dirMetrics = metrics.filter((m) => m.dirIdx === di);
    const collected: { point: string; row: ScoredRow }[] = [];
    dirMetrics.forEach((m) => {
      const { assigned, rows } = scoreMetric(s, m.key);
      if (!assigned || rows.length === 0) return;
      for (const r of rows) {
        collected.push({ point: m.point ?? "", row: r });
        rowsHtml.push(`<tr><td>${esc(m.point ?? "")}</td><td>${esc(r.code)}</td>
          <td>${g(r.value)}</td><td>${g(r.u)}</td>
          <td>${g(assigned.xpt)}</td><td>${g(assigned.u)}</td>
          <td>${g(r.value - assigned.xpt)}</td>
          <td>${s2(r.en)}</td><td>${verdictCell(lang, r.verdict)}</td></tr>`);
      }
    });
    if (rowsHtml.length === 0) return;
    // Eₙ chart — label by point, disambiguating by lab code when >1 lab took part
    const codes = new Set(collected.map((x) => x.row.code));
    const bars = collected
      .map(({ point, row }): Bar | null =>
        row.en === null || Number.isNaN(row.en)
          ? null
          : {
              label: codes.size > 1 ? `${point}·${row.code}` : point,
              value: row.en,
              color: VERDICT_COLOR[row.verdict ?? ""] ?? "#88a77b",
            }
      )
      .filter((b): b is Bar => b !== null);
    const chart = barChart(bars, EN_REFS, {
      caption: `Eₙ · ${pick(lang, dEn, dirsBg[di] ?? dEn)} (${esc(c.unit)})`,
      yMaxMin: 1.3,
    });
    blocks.push(`<h3 class="sub">${esc(pick(lang, dEn, dirsBg[di] ?? dEn))} — ${L(
      "Eₙ scores per participant",
      "Оценки Eₙ по участник"
    )}</h3>
      <table class="ptable"><thead><tr>
        <th>${L("Point", "Точка")} (${esc(c.unit)})</th><th>${L("Lab code", "Код на лаб.")}</th>
        <th>X<sub>LAB</sub></th><th>U<sub>LAB</sub></th><th>X<sub>REF</sub></th><th>U<sub>REF</sub></th>
        <th>D</th><th>E<sub>n</sub></th><th>${L("Eval", "Оценка")}</th>
      </tr></thead><tbody>${rowsHtml.join("")}</tbody></table>${chart}`);
  });
  return blocks.join("\n");
}
