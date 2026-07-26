// Parameter (standard) index remapping: when the owner reorders or deletes
// standards in the scheme editor, every position-based reference — the labs'
// requested participations, participants' registered characteristics, and the
// T-scheme scoring keys — must follow its standard or be dropped with it.
import { isIdentityMap, remapSelections, remapCharacteristics, remapScoring } from "../src/lib/param-remap.ts";
import type { Scoring } from "../src/lib/types.ts";

let pass = 0, fail = 0;
function t(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else { fail++; console.error("FAIL:", name, extra); }
}
const M = (pairs: [number, number][]) => new Map(pairs);

// ── identity detection ──
t("identity: same order", isIdentityMap(M([[0, 0], [1, 1], [2, 2]]), 3));
t("identity: appended new rows don't count", isIdentityMap(M([[0, 0], [1, 1]]), 2));
t("not identity: reorder", !isIdentityMap(M([[0, 1], [1, 0]]), 2));
t("not identity: deletion", !isIdentityMap(M([[0, 0]]), 2));

// ── selections (applications) ──
// swap standards 0↔1: the lab that asked 2× for standard 1 must still point at it
let sel = remapSelections({ "0": 3, "1": 2 }, M([[0, 1], [1, 0]]));
t("selections: swap follows the standard", sel["1"] === 3 && sel["0"] === 2, JSON.stringify(sel));
// delete standard 0 (old 1 → new 0, old 2 → new 1)
sel = remapSelections({ "0": 5, "1": 2, "2": 1 }, M([[1, 0], [2, 1]]));
t("selections: deleted standard's counts dropped", !("2" in sel) && sel["0"] === 2 && sel["1"] === 1 && Object.keys(sel).length === 2, JSON.stringify(sel));
// garbage keys never crash or survive
sel = remapSelections({ x: 4, "0": 1 } as Record<string, number>, M([[0, 0]]));
t("selections: non-numeric keys ignored", sel["0"] === 1 && Object.keys(sel).length === 1, JSON.stringify(sel));

// ── characteristics (participants) ──
t("characteristics: undefined stays undefined (means ALL)", remapCharacteristics(undefined, M([[0, 0]])) === undefined);
t("characteristics: swap remaps + sorts", JSON.stringify(remapCharacteristics([0, 2], M([[0, 2], [2, 0], [1, 1]]))) === "[0,2]");
t("characteristics: deletion drops the ref", JSON.stringify(remapCharacteristics([0, 1, 2], M([[0, 0], [2, 1]]))) === "[0,1]");
t("characteristics: all deleted → empty list", JSON.stringify(remapCharacteristics([1], M([[0, 0]]))) === "[]");

// ── scoring (T schemes) ──
const scoring: Scoring = {
  assigned: { "0": { xpt: 10, sigma: 1, u: 0.5 }, "1": { xpt: 20, sigma: 2, u: 0.7 } },
  results: {
    AA1: { "0": { value: 10.2, u: 0.4 }, "1": { value: 19.8, u: 0.6 } },
    BB2: { "1": { value: 21.0, u: 0.9 } },
  },
};
const sc = remapScoring(scoring, M([[0, 1], [1, 0]]))!;
t("scoring: assigned follows the standard", sc.assigned["1"].xpt === 10 && sc.assigned["0"].xpt === 20);
t("scoring: results follow per participant", sc.results.AA1["1"].value === 10.2 && sc.results.BB2["0"].value === 21.0);
const scDel = remapScoring(scoring, M([[1, 0]]))!;
t("scoring: deleted standard's results dropped", !("1" in scDel.assigned) && scDel.assigned["0"].xpt === 20 && !("1" in scDel.results.AA1), JSON.stringify(scDel));
t("scoring: undefined passes through", remapScoring(undefined, M([])) === undefined);
// keys with leading zeros / padding are NOT treated as index refs
const scOdd = remapScoring({ assigned: { "01": { xpt: 1, sigma: 1, u: 1 } }, results: {} }, M([[1, 0]]))!;
t("scoring: non-canonical keys dropped, not misrouted", Object.keys(scOdd.assigned).length === 0, JSON.stringify(scOdd));

// ── end-to-end shape: reorder then delete, applied to all three at once ──
// standards [A,B,C] → owner deletes B and swaps A/C: map {0→1, 2→0}
const map = M([[0, 1], [2, 0]]);
t("e2e: application for B is gone, A/C intact",
  JSON.stringify(remapSelections({ "0": 1, "1": 4, "2": 2 }, map)) === JSON.stringify({ "1": 1, "0": 2 }));
t("e2e: participant registered for A+B keeps only A (at its new slot)",
  JSON.stringify(remapCharacteristics([0, 1], map)) === "[1]");

console.log(`param-remap.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
