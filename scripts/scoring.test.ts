// Run: node --experimental-strip-types scripts/scoring.test.ts
// Exercises the real scoring module against synthetic testing + calibration
// schemes, then checks the Final Report HTML builders embed the computed scores.
import { metricsForScheme, scoreMetric, buildScoring, computeAssigned, reportResultsTesting, reportResultsCalibration } from "../src/lib/scoring.ts";
import type { Scoring } from "../src/lib/types.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; }
  else { fail++; console.error(`✗ ${name} ${extra}`); }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── minimal scheme factories ────────────────────────────────────────────────
const base = (over: Partial<Scheme>): Scheme => ({
  id: "x", number: "PTS 26/01-T-1", type: "T", status: "report",
  titleEn: "", titleBg: "", objectEn: "", objectBg: "", distribution: "simultaneous",
  formNumber: "", revision: "", revisionDate: "", standard: "", regNo: "", minParticipants: 1,
  team: [], partner: { nameEn: "", nameBg: "", locationEn: "", locationBg: "", servicesEn: [], servicesBg: [] },
  parameters: [], schedule: [], prices: [], assignedValueMethodEn: "", assignedValueMethodBg: "",
  scoresEn: "", scoresBg: "", clauses: {}, ...over,
});

// ── TESTING: one parameter, xpt=100, σ=2, u(xpt)=0.5 ─────────────────────────
const t = base({
  type: "T",
  parameters: [{ standardEn: "EN 1", standardBg: "EN 1", characteristicEn: "Strength", characteristicBg: "Якост", rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "" }],
  scoring: {
    assigned: { "0": { xpt: 100, sigma: 2, u: 0.5 } },
    results: {
      "261101": { "0": { value: 102, u: 1 } },   // z = +1
      "261102": { "0": { value: 95, u: 1.5 } },  // z = -2.5 (warning)
      "261103": { "0": { value: 110, u: 2 } },   // z = +5 (action)
    },
  },
});

const tMetrics = metricsForScheme(t);
ok("testing: one metric", tMetrics.length === 1 && tMetrics[0].key === "0");

const tScore = scoreMetric(t, "0");
const byCode = new Map(tScore.rows.map((r) => [r.code, r]));
ok("testing: 3 rows", tScore.rows.length === 3);
ok("testing: z(102)=+1", near(byCode.get("261101")!.z!, 1));
ok("testing: ζ(102)=2/√(1+0.25)", near(byCode.get("261101")!.zeta!, 2 / Math.sqrt(1.25)));
ok("testing: 102 satisfactory", byCode.get("261101")!.verdict === "satisfactory");
ok("testing: z(95)=-2.5 warning", near(byCode.get("261102")!.z!, -2.5) && byCode.get("261102")!.verdict === "warning");
ok("testing: z(110)=+5 action", near(byCode.get("261103")!.z!, 5) && byCode.get("261103")!.verdict === "action");

const tHtml = reportResultsTesting(t, "en");
ok("testing report: has param heading", tHtml.includes("Strength"));
ok("testing report: shows code", tHtml.includes("261101"));
ok("testing report: shows z=1.00", tHtml.includes("1.00"));
ok("testing report: has z-score chart", tHtml.includes("<svg") && tHtml.includes("±2") && tHtml.includes("±3"));
ok("testing report: empty when no scoring", reportResultsTesting(base({ type: "T", parameters: t.parameters }), "en") === "");

// ── CALIBRATION: Tension/Compression × points 20,40 ──────────────────────────
const c = base({
  type: "C", number: "PTS 25/06-C-1",
  calibration: {
    quantityEn: "Force", quantityBg: "Сила", unit: "kN", deviceEn: "", deviceBg: "",
    points: ["20", "40"], directionsEn: ["Tension", "Compression"], directionsBg: ["Опън", "Натиск"],
    referenceLabEn: "", referenceLabBg: "", referenceLabLocEn: "", referenceLabLocBg: "",
    methodEn: "", methodBg: "", feeEn: "", feeBg: "", stabilityFormula: "", enCriterionEn: "", enCriterionBg: "",
  },
  scoring: {
    // Tension@20: X_ref=20.0, U_ref=0.05 ; Compression@40: X_ref=40.0, U_ref=0.1
    assigned: { "0:0": { xpt: 20, sigma: 0, u: 0.05 }, "1:1": { xpt: 40, sigma: 0, u: 0.1 } },
    results: {
      "256101": { "0:0": { value: 20.04, u: 0.03 }, "1:1": { value: 40.5, u: 0.1 } },
    },
  },
});

const cMetrics = metricsForScheme(c);
ok("cal: 4 metrics (2 dir × 2 pts)", cMetrics.length === 4);
ok("cal: metric keys", cMetrics[0].key === "0:0" && cMetrics[3].key === "1:1");

const en1 = scoreMetric(c, "0:0").rows[0];
ok("cal: En tension@20 satisfactory", near(en1.en!, 0.04 / Math.sqrt(0.03 ** 2 + 0.05 ** 2)) && en1.verdict === "A");
const en2 = scoreMetric(c, "1:1").rows[0];
ok("cal: En compression@40 unsatisfactory", near(en2.en!, 0.5 / Math.sqrt(0.1 ** 2 + 0.1 ** 2)) && en2.verdict === "N");

const cHtml = reportResultsCalibration(c, "en");
ok("cal report: Tension heading", cHtml.includes("Tension"));
ok("cal report: Compression heading", cHtml.includes("Compression"));
ok("cal report: code shown", cHtml.includes("256101"));
ok("cal report: N (unsatisfactory) marked", cHtml.includes("unsatisfactory"));
ok("cal report: has Eₙ chart", cHtml.includes("<svg") && cHtml.includes("±1"));
ok("cal report: empty when no scoring", reportResultsCalibration(base({ type: "C", calibration: c.calibration }), "en") === "");

// ── buildScoring: the exact form round-trip the save action performs ─────────
// Simulate the form the page renders for the testing scheme `t` above:
//   2 participants, metric 0. Participant order = the `participantCodes` array.
const form: Record<string, string> = {
  a_0_xpt: "100", a_0_sigma: "2", a_0_u: "0.5",
  r_0_0_value: "102", r_0_0_u: "1",     // pi=0 → first code
  r_0_1_value: "95,5", r_0_1_u: "",     // pi=1 → BG decimal comma, blank u → 0
  // pi=2 left entirely blank → no result stored
};
const numFromForm = (k: string): number | null => {
  const raw = (form[k] ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : null;
};
const built = buildScoring(metricsForScheme(t), ["261101", "261102", "261103"], numFromForm);
ok("build: assigned xpt parsed", built.assigned["0"]?.xpt === 100 && built.assigned["0"]?.sigma === 2);
ok("build: pi=0 maps to first code", built.results["261101"]?.["0"]?.value === 102);
ok("build: BG comma decimal", built.results["261102"]?.["0"]?.value === 95.5);
ok("build: blank u → 0", built.results["261102"]?.["0"]?.u === 0);
ok("build: blank participant skipped", built.results["261103"] === undefined);

// no assigned value entered → metric not scored at all
const built2 = buildScoring(metricsForScheme(t), ["261101"], () => null);
ok("build: empty form → empty scoring", Object.keys(built2.assigned).length === 0 && Object.keys(built2.results).length === 0);

// ── computeAssigned: robust consensus (ISO 13528 Algorithm A) ────────────────
const M0 = [{ key: "0", labelEn: "", labelBg: "" }];
const mk = (vals: number[]): Scoring => ({
  assigned: {},
  results: Object.fromEntries(vals.map((v, i) => [`lab${i}`, { "0": { value: v, u: 0 } }])),
});

const eq = computeAssigned(M0, mk([10, 10, 10, 10, 10]));
ok("compute: identical values → xpt=10, σ=0, u=0", eq["0"].xpt === 10 && eq["0"].sigma === 0 && eq["0"].u === 0);

const rob = computeAssigned(M0, mk([1, 2, 3, 4, 5, 100]));
ok("compute: robust mean resists outlier (≈3.6, not ~19)", rob["0"].xpt > 2 && rob["0"].xpt < 6);
ok("compute: σ and u are finite & positive", rob["0"].sigma > 0 && rob["0"].u > 0 && rob["0"].u < rob["0"].sigma);

const one = computeAssigned(M0, mk([42]));
ok("compute: <2 results → metric skipped", one["0"] === undefined);

// ── σpt,min floor: σpt = max(σ, floor) raises σ and lowers |z| ────────────────
const tFloor = base({
  type: "T",
  parameters: [{ ...t.parameters[0], sigmaMin: 0.5 }],
  scoring: { assigned: { "0": { xpt: 100, sigma: 0.1, u: 0 } }, results: { lab: { "0": { value: 101, u: 0 } } } },
});
const rFloor = scoreMetric(tFloor, "0").rows[0];
ok("floor: σpt,min=0.5 overrides σ=0.1 → z=(101-100)/0.5=2", near(rFloor.z!, 2));
const tNoFloor = base({
  type: "T",
  parameters: [t.parameters[0]],
  scoring: { assigned: { "0": { xpt: 100, sigma: 0.1, u: 0 } }, results: { lab: { "0": { value: 101, u: 0 } } } },
});
ok("floor: without floor same data → z=10", near(scoreMetric(tNoFloor, "0").rows[0].z!, 10));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
