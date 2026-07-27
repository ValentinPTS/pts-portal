import type { Parameter, Scoring } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Parameter (standard) index remapping.
//
// A scheme's standards are referenced BY POSITION in three places:
//   • applications[].selections        — { "<paramIndex>": participations }
//   • participants[].characteristics  — number[] of param indexes
//   • scoring (T schemes)              — assigned/results keyed by "<paramIndex>"
// When the owner reorders or deletes standards in the scheme editor, those
// references must follow their standard (or be dropped with it) — otherwise a
// lab that applied for "Water absorption" would silently point at whatever
// standard now occupies that slot.
//
// The editor posts each surviving row's ORIGINAL index; the action turns that
// into an old→new map and runs it through these pure helpers.
// ─────────────────────────────────────────────────────────────────────────────

export type IndexMap = ReadonlyMap<number, number>; // old index → new index; absent = deleted

// Order-sensitive fingerprint of the standards list (djb2 — cheap, isomorphic).
// The apply wizard posts the signature of the list it RENDERED; the submit action
// recomputes it against the current scheme. A mismatch means the owner
// restructured the standards while the lab's form was open — the positional
// sel_i answers can't be trusted and the lab must re-pick from the fresh list.
export function paramsSignature(parameters: Parameter[]): string {
  const text = parameters.map((p) => `${p.standardEn}${p.characteristicEn}`).join("");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${parameters.length}.${h.toString(36)}`;
}

// Is the mapping just "nothing moved, nothing deleted"? (oldCount = the length
// of the parameter list before the edit; appended NEW rows never need a remap.)
export function isIdentityMap(map: IndexMap, oldCount: number): boolean {
  if (map.size !== oldCount) return false;
  for (const [o, n] of map) if (o !== n) return false;
  return true;
}

// { "2": 3, "0": 1 } with map {0→0, 2→1}  →  { "1": 3, "0": 1 }
export function remapSelections(
  selections: Record<string, number>,
  map: IndexMap
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(selections)) {
    const oldIdx = parseInt(k, 10);
    if (!Number.isInteger(oldIdx)) continue;
    const next = map.get(oldIdx);
    if (next !== undefined) out[String(next)] = v;
  }
  return out;
}

// [0, 2] with map {0→1, 2→0}  →  [1, 0] (sorted; deleted ones dropped).
// undefined stays undefined ("all characteristics" semantics is preserved).
export function remapCharacteristics(
  characteristics: number[] | undefined,
  map: IndexMap
): number[] | undefined {
  if (!characteristics) return undefined;
  const out = characteristics
    .map((c) => map.get(c))
    .filter((c): c is number => c !== undefined)
    .sort((a, b) => a - b);
  return out;
}

// Testing schemes key scoring by parameter index ("0","1",…). Calibration keys
// ("<dir>:<point>") don't reference parameters — pass scoring through untouched
// for C schemes (the caller decides via schemeType).
export function remapScoring(scoring: Scoring | undefined, map: IndexMap): Scoring | undefined {
  if (!scoring) return undefined;
  const remapKeys = <V,>(rec: Record<string, V>): Record<string, V> => {
    const out: Record<string, V> = {};
    for (const [k, v] of Object.entries(rec)) {
      const oldIdx = parseInt(k, 10);
      if (!Number.isInteger(oldIdx) || String(oldIdx) !== k) continue; // only pure index keys
      const next = map.get(oldIdx);
      if (next !== undefined) out[String(next)] = v;
    }
    return out;
  };
  const results: Scoring["results"] = {};
  for (const [code, byMetric] of Object.entries(scoring.results)) {
    results[code] = remapKeys(byMetric);
  }
  return { assigned: remapKeys(scoring.assigned), results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration slot protection (scoring + the Results Sheet, lib/docs/results-c.ts)
//
// Unlike the standards editor, calibration points and directions are edited as
// free-form comma-separated text (SchemeEditor cal_points / cal_dirEn), so a
// surviving point carries NO original index: "20, 40, 60" → "20, 60" cannot be
// told apart from a relabel of the second point. Deleting or reordering a point
// therefore shifts every "<dir>:<point>" key after it and silently reattaches an
// already-issued Eₙ to a DIFFERENT load. These helpers let the save action refuse
// such an edit while data is attached, instead of corrupting it.
// ─────────────────────────────────────────────────────────────────────────────

// The direction list the metric keys are actually indexed by: an empty EN list
// collapses to ONE unnamed direction (mirrors scoring.ts metricsForScheme).
export function effectiveDirections(directionsEn: readonly string[]): string[] {
  return directionsEn.length ? [...directionsEn] : ["—"];
}

// Every `<dir>:<point>` slot that currently holds owner-entered data — the assigned
// (reference) values, every participant's results, and the non-blank Results-Sheet
// fields. Deduped [dirIdx, pointIdx] pairs.
export function calibrationDataSlots(
  scoring: Scoring | undefined,
  resultsSheet: Record<string, string> | undefined
): [number, number][] {
  const seen = new Set<string>();
  const fromKey = (k: string) => {
    const m = /^(\d+):(\d+)$/.exec(k);
    if (m) seen.add(`${Number(m[1])}:${Number(m[2])}`);
  };
  if (scoring) {
    Object.keys(scoring.assigned).forEach(fromKey);
    for (const byMetric of Object.values(scoring.results)) Object.keys(byMetric).forEach(fromKey);
  }
  for (const [k, v] of Object.entries(resultsSheet ?? {})) {
    if (!String(v).trim()) continue; // a blank field carries no data
    const m = /^(?:result|unc)_(\d+)_(\d+)$/.exec(k);
    if (m) seen.add(`${Number(m[1])}:${Number(m[2])}`);
  }
  return [...seen].map((k) => k.split(":").map(Number) as [number, number]);
}

// Which of those slots would STOP meaning what they mean today? A slot survives
// only when its index still exists AND still holds the same text — deletion,
// reorder and in-place replacement all move the data onto another load point.
//
// Two deliberate escape hatches, so the guard can never brick the edit page:
//   • a slot whose OLD index no longer exists is already orphaned → ignored;
//   • a slot whose OLD point is blank is ignored, because the editor drops blanks
//     when it loads (SchemeEditor filters them) and the save trims and drops them
//     too, so such a slot could never re-match and would refuse every future save.
// Comparison is trimmed on both sides for the same reason: the save trims each
// element, so a stored "20 " must still count as unchanged against "20".
export function calibrationSlotsBroken(
  slots: readonly [number, number][],
  oldPoints: readonly string[], newPoints: readonly string[],
  oldDirsEn: readonly string[], newDirsEn: readonly string[]
): [number, number][] {
  const norm = (x: string | undefined) => String(x ?? "").trim();
  const oldD = effectiveDirections(oldDirsEn);
  const newD = effectiveDirections(newDirsEn);
  return slots.filter(([d, p]) => {
    if (oldD[d] === undefined || oldPoints[p] === undefined) return false;
    if (!norm(oldPoints[p])) return false;
    return norm(newD[d]) !== norm(oldD[d]) || norm(newPoints[p]) !== norm(oldPoints[p]);
  });
}
