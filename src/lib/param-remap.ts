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
