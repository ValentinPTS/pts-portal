// «Заключи подаването» (plan part 6.6; Реш. 21; the assignment §7). Pure.
//
// The technical end moment of the submission IS the start of processing: the act «Започни
// обработката» locks it. From then a result is not accepted, and a participation without a
// submitted version is N/R. The lock records, per participation in the final round, the version
// taken (its latest) or none — N/R. «Върни» (processing → running) appends a reopening; the next
// lock records again. The latest lock not followed by a reopening is the one in force.

export interface LockEntry {
  participantId: string; code: string;
  /** the version taken; null — none submitted online */
  version: number | null;
  /** no online version, but its results came another way — the Results Sheet uploaded or e-mailed
   *  and recorded by PTS (before Gate B, 6.8): NOT N/R (6.6 review) */
  via?: "outside";
}
/** N/R at the lock: no online version and nothing received another way. */
export const isNR = (e: LockEntry) => e.version === null && !e.via;
/** Results received outside the form: the Results Sheet uploaded, or «results returned» recorded
 *  (the participation's status) — the scheme's own count of results (`withResults`), the same rule. */
export const resultsOutsideForm = (labUploads: Record<string, { results?: unknown } | undefined> | undefined, p: { code: string; status?: string }) =>
  !!labUploads?.[p.code]?.results || p.status === "submitted" || p.status === "scored";
export type SubmissionLock =
  | { id: string; kind: "lock"; at: string; roundAt: string; by: string; entries: LockEntry[] }
  | { id: string; kind: "reopen"; at: string; by: string; note: string };

/** What a lock records: each participation in the final round — its latest submitted version, or
 *  none (N/R). In the order given (the participants' list). */
export function lockEntries(parts: readonly { id: string; code: string }[], versions: readonly { participantId: string; version: number }[], outside: ReadonlySet<string> = new Set()): LockEntry[] {
  const latest = new Map<string, number>();
  for (const v of versions) latest.set(v.participantId, Math.max(latest.get(v.participantId) ?? 0, v.version));
  return parts.map((p) => { const v = latest.get(p.id) ?? null; return { participantId: p.id, code: p.code, version: v, ...(v === null && outside.has(p.id) ? { via: "outside" as const } : {}) }; });
}

/** The lock in force — the latest lock with no reopening after it — or null. */
export function lockInForce(locks: readonly SubmissionLock[] | undefined): Extract<SubmissionLock, { kind: "lock" }> | null {
  const last = (locks ?? []).at(-1);
  return last && last.kind === "lock" ? last : null;
}

/** The version a lock took for a participation: a number; null — N/R; undefined — not in the lock
 *  (not in the final round when it was made). */
export const takenVersion = (lock: Extract<SubmissionLock, { kind: "lock" }> | null, participantId: string): number | null | undefined =>
  lock ? lock.entries.find((e) => e.participantId === participantId)?.version : undefined;
/** The lock's entry for a participation — or undefined (not in the lock). */
export const lockEntryOf = (lock: Extract<SubmissionLock, { kind: "lock" }> | null, participantId: string): LockEntry | undefined =>
  lock ? lock.entries.find((e) => e.participantId === participantId) : undefined;
/** «taken» (a version number), «outside», «nr» — or "" (not in the lock): one word for the pages. */
export const lockWord = (e: LockEntry | undefined): string => (!e ? "" : e.version !== null ? String(e.version) : e.via ? "outside" : "nr");

export const lockCounts = (entries: readonly LockEntry[]) => ({ taken: entries.filter((e) => e.version !== null).length, outside: entries.filter((e) => e.version === null && !!e.via).length, nr: entries.filter(isNR).length });
