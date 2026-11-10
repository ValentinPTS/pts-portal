// The round export's submissions as TABLES (plan part 6.9; Реш. 136 — «so the round can continue on
// the current forms if the portal is dropped»). Pure. The versions are already in the export as
// JSON (6.4); here they are flat, and the values IN FORCE are given as they would go to the Results
// Sheet or to 2.0:
//   coded/submitted_values.csv — every value of every submitted version, as typed and as a number;
//   coded/results_in_force.csv — per participation: the version the lock took (6.6), else the
//     latest; EVERY field of it, reported and used (the correction in force, 6.5); N/R, N/A,
//     «outside» (a sheet sent outside the form), «none».
// Codes only: the labels are the scheme's, never the laboratory's words; the typed laboratory and
// person stay in identity/submissions_by.csv. Rows in the scheme's own order (the database keeps a
// version's keys in its own order, not the rows' — 6.9 review).

import { readValue, decimalOf } from "./results-model";
import { activeCorrections, targetOf, type ResultCorrection } from "./corrections-model";
import { lockInForce, lockEntryOf, resultsOutsideForm, type SubmissionLock } from "./submission-lock-model";
import type { Submission } from "./submissions";

type Payload = {
  kind?: string;
  draft?: { rows?: Record<string, { d?: unknown; mean?: unknown; U?: unknown; k?: unknown; nr?: unknown }>; points?: Record<string, { ref?: unknown; meas?: unknown; U?: unknown; cmc?: unknown; na?: unknown }> };
  values?: Record<string, { nr?: unknown; na?: unknown; error?: unknown } | undefined>;
};
const payloadOf = (data: unknown): Payload => (data && typeof data === "object" ? data as Payload : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A typed value as a plain decimal with a point, exactly («0,0000005» → 0.0000005, never 5e-7) —
 *  or "" when it does not read (6.9 review). */
export function plainNumber(typed: string): string {
  if (!typed || readValue(typed) === null) return "";
  const d = decimalOf(typed);
  if (!d) return "";
  const neg = d.int < BigInt(0), digits = (neg ? -d.int : d.int).toString().padStart(d.scale + 1, "0");
  let s = d.scale ? `${digits.slice(0, -d.scale)}.${digits.slice(-d.scale)}` : digits;
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return neg && s !== "0" ? `-${s}` : s;
}

/** The scheme's order of a version's keys — the characteristics' or the points' places; a key no
 *  longer in the scheme after them, in its own order. */
export const inSchemeOrder = (keys: readonly string[], rank: (key: string) => number): string[] =>
  keys.map((k, i) => ({ k, r: rank(k), i })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).map((x) => x.k);

type Field = { key: string; field: string; typed: string };
/** Every field of a version, as submitted — in the scheme's order. A determination not given: N/R for
 *  it (Реш. 19, 20); a characteristic N/R, a point N/A: one row. */
function fieldsOf(data: unknown, rank: (key: string) => number): Field[] {
  const d = payloadOf(data);
  const out: Field[] = [];
  const add = (key: string, field: string, typed: string) => out.push({ key, field, typed });
  for (const key of inSchemeOrder(Object.keys(d.values ?? {}), rank)) {
    const v = d.values?.[key];
    if (d.kind === "C") {
      const p = d.draft?.points?.[key];
      if (!p || p.na === true || v?.na === true) { add(key, "na", "N/A"); continue; }
      add(key, "ref", str(p.ref)); add(key, "meas", str(p.meas));
      add(key, "error", str(v?.error)); // as computed and confirmed (D1)
      add(key, "U", str(p.U));
      if (str(p.cmc)) add(key, "cmc", str(p.cmc));
    } else {
      const r = d.draft?.rows?.[key];
      if (!r || r.nr === true || v?.nr === true) { add(key, "nr", "N/R"); continue; }
      (Array.isArray(r.d) ? r.d : []).forEach((x, i) => add(key, `d${i + 1}`, str(x) || "N/R"));
      add(key, "mean", str(r.mean));
      if (str(r.U)) add(key, "U", str(r.U));
      if (str(r.k)) add(key, "k", str(r.k));
    }
  }
  return out;
}
const asNumber = (typed: string) => (typed === "N/R" || typed === "N/A" ? "" : plainNumber(typed));

export type ValueRow = { code: string; version: number; submittedAt: string; key: string; label: string; field: string; typed: string; number: string };
/** Every value of a version, flat. */
export function versionValueRows(sub: Submission, code: string, labelOf: (key: string) => string, rank: (key: string) => number = () => 0): ValueRow[] {
  return fieldsOf(sub.data, rank).map((f) => ({ code, version: sub.version, submittedAt: sub.submittedAt, key: f.key, label: labelOf(f.key), field: f.field, typed: f.typed, number: asNumber(f.typed) }));
}

/** The version in force for a participation — the one the lock took (6.6), else the latest — and
 *  where it comes from: «lock», «latest»; with none, «outside» (results by a sheet — the lock's own
 *  rule, before a lock too), «nr» (the lock said so) or «none». A version the lock took but not
 *  among those read: an error (an export is whole, or it is not made). Shared by 6.9 and 7.1. */
export function versionInForce(p: { id: string; code: string; status?: string }, subs: readonly Submission[], locks: readonly SubmissionLock[] | undefined, labUploads?: Record<string, { results?: unknown } | undefined>): { sub: Submission | null; source: "lock" | "latest" | "outside" | "nr" | "none" } {
  const mine = subs.filter((s) => s.participantId === p.id).sort((a, b) => a.version - b.version);
  const e = lockEntryOf(lockInForce(locks), p.id);
  if (e) {
    if (e.version === null) return { sub: null, source: e.via ? "outside" : "nr" };
    const sub = mine.find((s) => s.version === e.version);
    if (!sub) throw new Error(`[export] version ${e.version} of ${p.code}, taken by the lock, was not read — the export is not made`);
    return { sub, source: "lock" };
  }
  const sub = mine.at(-1) ?? null;
  return { sub, source: sub ? "latest" : resultsOutsideForm(labUploads, p) ? "outside" : "none" };
}

export type InForceRow = { code: string; version: number | ""; source: "lock" | "latest" | "outside" | "nr" | "none"; key: string; label: string; field: string; reported: string; reported_number: string; used: string; used_number: string; corrected: "yes" | "" };

/** Per participation on the final list, the values in force — the version the lock took, else the
 *  latest; EVERY field, reported and used: the correction in force, else the reported value. U is
 *  used at k = 2 (D3): a U reported with another k and no used U recorded has no used value, and its
 *  k row then says no k is used — never a U at k = 3 read as u_k2 (6.9 review). A participation with
 *  no version: «outside» if its results came another way (a sheet — the same rule as the lock's),
 *  else «nr» (the lock said so) or «none». A version the lock took but not read: the export is not
 *  made (it is whole, or nothing). */
export function inForceRows(
  parts: readonly { id: string; code: string; status?: string }[], subs: readonly Submission[], corrections: readonly ResultCorrection[],
  locks: readonly SubmissionLock[] | undefined, labelOf: (key: string) => string, rank: (key: string) => number = () => 0,
  labUploads?: Record<string, { results?: unknown } | undefined>,
): InForceRow[] {
  const out: InForceRow[] = [];
  const empty = { key: "", label: "", field: "", reported: "", reported_number: "", used: "", used_number: "", corrected: "" as const };
  for (const p of parts) {
    const { sub, source } = versionInForce(p, subs, locks, labUploads);
    if (!sub) { out.push({ code: p.code, version: "", source, ...empty }); continue; }
    const active = activeCorrections(corrections.filter((c) => c.participantId === p.id), sub.version);
    const fields = fieldsOf(sub.data, rank);
    // a U reported with k ≠ 2 and no used U recorded — per characteristic
    const kOf = new Map(fields.filter((f) => f.field === "k").map((f) => [f.key, f.typed] as const));
    const kOff = (key: string) => { const k = readValue(kOf.get(key) ?? ""); return typeof k === "number" && k !== 2; };
    for (const f of fields) {
      const c = active.get(targetOf(f.key, f.field));
      let used: string;
      if (c && c.used !== null) used = c.used;
      else if (f.field === "U" && kOff(f.key)) used = ""; // no used U at k = 2 yet (D3)
      else if (f.field === "k") used = active.get(targetOf(f.key, "U")) || !kOff(f.key) ? "2" : ""; // the used U is at k = 2
      else used = f.typed;
      out.push({ code: p.code, version: sub.version, source, key: f.key, label: labelOf(f.key), field: f.field, reported: f.typed, reported_number: asNumber(f.typed), used, used_number: asNumber(used), corrected: c && c.used !== null ? "yes" : "" });
    }
  }
  return out;
}

export const VALUE_COLUMNS = ["code", "version", "submittedAt", "key", "label", "field", "typed", "number"];
export const IN_FORCE_COLUMNS = ["code", "version", "source", "key", "label", "field", "reported", "reported_number", "used", "used_number", "corrected"];
