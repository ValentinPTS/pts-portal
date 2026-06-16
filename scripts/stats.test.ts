import {
  mean, median, stdDev, algorithmA, uncertaintyOfAssigned,
  zScore, zetaScore, enScore, verdictZ, verdictEn,
} from "../src/lib/stats.ts";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, info = "") {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ FAIL:", name, info); }
}
function close(a: number, b: number, eps = 1e-3) { return Math.abs(a - b) <= eps; }

// basics
ok("mean", close(mean([1, 2, 3, 4, 5]), 3));
ok("median odd", close(median([5, 1, 3]), 3));
ok("median even", close(median([1, 2, 3, 4]), 2.5));
ok("stdDev", close(stdDev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 1e-3));

// Eₙ — matches the real calibration workbook example (→ 0.1094)
const en = enScore(-0.16, -0.183, 0.21, 0.009);
ok("Eₙ matches workbook (0.1094)", close(en, 0.1094, 1e-3), `got ${en.toFixed(4)}`);
ok("Eₙ verdict A", verdictEn(0.1094) === "A");
ok("Eₙ verdict N", verdictEn(-2.6) === "N");

// z & ζ
ok("z=1", close(zScore(12, 10, 2), 1));
ok("z verdict satisfactory", verdictZ(1) === "satisfactory");
ok("z verdict warning", verdictZ(2.5) === "warning");
ok("z verdict action", verdictZ(3.5) === "action");
ok("ζ", close(zetaScore(12, 10, 1, 1), 1.4142, 1e-3));

// Algorithm A — degenerate
const a0 = algorithmA([10, 10, 10, 10, 10]);
ok("AlgoA constant → xStar=10", close(a0.xStar, 10) && a0.sStar === 0);

// Algorithm A — symmetric, no outliers → ≈ classical mean
const sym = [8, 9, 10, 11, 12];
const aSym = algorithmA(sym);
ok("AlgoA symmetric xStar≈10", close(aSym.xStar, 10, 1e-2), `got ${aSym.xStar}`);

// Algorithm A — robust to an outlier: should sit near the bulk (~10), below classical mean (~13.3)
const out = [10, 11, 9, 10, 10, 30];
const aOut = algorithmA(out);
ok("AlgoA down-weights outlier", aOut.xStar < 11 && aOut.xStar < mean(out), `xStar=${aOut.xStar.toFixed(2)} classicalMean=${mean(out).toFixed(2)}`);
ok("AlgoA converged", aOut.iterations > 0 && aOut.iterations < 100);

// uncertainty of assigned value
ok("u(xpt) = 1.25·s*/√n", close(uncertaintyOfAssigned(2, 25), (1.25 * 2) / 5));

console.log(`\nstats.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
