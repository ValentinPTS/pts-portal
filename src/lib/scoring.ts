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
 * Suggested assigned values from the participants' results, via ISO 13528
 * Algorithm A (robust mean x* and robust SD s*), with u(xpt) = 1.25 · s* ÷ √n.
 * This is the *consensus* approach — appropriate for TESTING schemes only;
 * for calibration the assigned value is the reference lab's value (kept manual).
 * Caller decides whether to apply it. Pure → unit-testable. A metric with fewer
 * than 2 results is skipped (can't form a robust SD).
 */
export function computeAssigned(metrics: Metric[], scoring: Scoring): Record<string, AssignedValue> {
  const round6 = (v: number) => parseFloat(v.toFixed(6));
  const out: Record<string, AssignedValue> = {};
  for (const m of metrics) {
    const values: number[] = [];
    for (const code of Object.keys(scoring.results)) {
      const e = scoring.results[code]?.[m.key];
      if (e && Number.isFinite(e.value)) values.push(e.value);
    }
    if (values.length < 2) continue;
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
