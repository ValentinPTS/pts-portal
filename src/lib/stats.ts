// Statistics core for PT scoring — see ../../STATS-ENGINE.md.
// Pure functions, fully unit-tested (scripts/stats.test.mjs). The UI/report
// integration (results entry → these functions → Final Report) is the next step.
// "Manual override everywhere" (project rule): callers may pass an explicit
// assigned value / σ instead of the computed robust ones.

export function mean(x: number[]): number {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN;
}

export function median(x: number[]): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdDev(x: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  const m = mean(x);
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1));
}

/**
 * Robust mean & standard deviation — ISO 13528:2022 Annex C, Algorithm A.
 * x* = median; s* = 1.483·median(|xi−x*|); then iterate:
 *   δ = 1.5·s*; winsorize each xi to [x*−δ, x*+δ];
 *   x* = mean(winsorized); s* = 1.134·sqrt(Σ(φi−x*)²/(n−1)); until stable.
 */
export function algorithmA(x: number[]): { xStar: number; sStar: number; iterations: number } {
  const n = x.length;
  if (n === 0) return { xStar: NaN, sStar: NaN, iterations: 0 };
  if (n === 1) return { xStar: x[0], sStar: 0, iterations: 0 };

  let xStar = median(x);
  let sStar = 1.483 * median(x.map((v) => Math.abs(v - xStar)));
  let iterations = 0;

  for (let i = 0; i < 100; i++) {
    iterations++;
    if (sStar === 0) break;
    const delta = 1.5 * sStar;
    const lo = xStar - delta;
    const hi = xStar + delta;
    const w = x.map((v) => (v < lo ? lo : v > hi ? hi : v));
    const newX = mean(w);
    const newS = 1.134 * Math.sqrt(w.reduce((a, v) => a + (v - newX) ** 2, 0) / (n - 1));
    const stable =
      Math.abs(newX - xStar) <= 1e-9 * (Math.abs(xStar) || 1) &&
      Math.abs(newS - sStar) <= 1e-9 * (Math.abs(sStar) || 1);
    xStar = newX;
    sStar = newS;
    if (stable) break;
  }
  return { xStar, sStar, iterations };
}

/** Standard uncertainty of the robust assigned value (ISO 13528 §7.7.3): u = 1.25 · s* ÷ √n */
export function uncertaintyOfAssigned(sStar: number, n: number): number {
  return n > 0 ? (1.25 * sStar) / Math.sqrt(n) : NaN;
}

/** z-score = (xi − xpt) / σpt.  |z| < 2 satisfactory, 2–3 warning, ≥3 action. */
export function zScore(xi: number, xpt: number, sigmaPt: number): number {
  return sigmaPt > 0 ? (xi - xpt) / sigmaPt : NaN;
}

/** ζ-score = (xi − xpt) / √(u(xi)² + u(xpt)²).  |ζ| < 2 satisfactory. */
export function zetaScore(xi: number, xpt: number, uXi: number, uXpt: number): number {
  const d = Math.sqrt(uXi * uXi + uXpt * uXpt);
  return d > 0 ? (xi - xpt) / d : NaN;
}

/** Calibration Eₙ = (X_lab − X_ref) / √(U_lab² + U_ref²).  |Eₙ| ≤ 1 satisfactory. */
export function enScore(xLab: number, xRef: number, uLab: number, uRef: number): number {
  const d = Math.sqrt(uLab * uLab + uRef * uRef);
  return d > 0 ? (xLab - xRef) / d : NaN;
}

export type Verdict = "satisfactory" | "warning" | "action";
export function verdictZ(score: number): Verdict {
  const a = Math.abs(score);
  return a < 2 ? "satisfactory" : a < 3 ? "warning" : "action";
}
export function verdictEn(score: number): "A" | "N" {
  return Math.abs(score) <= 1 ? "A" : "N";
}
