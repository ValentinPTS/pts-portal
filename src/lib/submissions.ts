// The results form's store (plan part 6.1; migration 0042): a participation's DRAFT, as typed —
// one per participation, changed as it is typed. The submitted versions (append-only, 6.4) go
// into public.submissions, which the database refuses to change.
//
// Supabase when configured, else memory — the same fallback as every store; on a deployment a
// failure is an error, never a quiet memory row (1.1). PTS does not read drafts: nothing here
// lists them for a scheme.

import { getDb, noMemoryFallback } from "./supabase";

export interface StoredDraft {
  participantId: string;
  schemeId: string;
  data: unknown;
  configVersion?: number;
  /** the revision — a save names the one it was typed over (6.1 review) */
  rev: number;
  updatedAt: string;
  updatedBy: string;
}

const g = globalThis as unknown as { __ptsDraftsMem?: Map<string, StoredDraft> };
const mem: Map<string, StoredDraft> = g.__ptsDraftsMem ?? (g.__ptsDraftsMem = new Map());
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("submissions", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[submissions] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

type Row = { participant_id: string; scheme_id: string; data: unknown; config_version: number | null; rev: number; updated_at: string; updated_by: string };
const fromRow = (r: Row): StoredDraft => ({ participantId: r.participant_id, schemeId: r.scheme_id, data: r.data, configVersion: r.config_version ?? undefined, rev: r.rev ?? 1, updatedAt: r.updated_at, updatedBy: r.updated_by });

/** This participation's draft — of THIS scheme only — or null. */
export async function getDraft(participantId: string, schemeId: string): Promise<StoredDraft | null> {
  const fromMem = () => { const d = mem.get(participantId); return d && d.schemeId === schemeId ? { ...d } : null; };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.from("submission_drafts").select("*").eq("participant_id", participantId).eq("scheme_id", schemeId).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e); // on a deployment: throws — a draft not read is never shown as none (6.1 review)
    return fromMem();
  }
}

/** Save the participation's draft as typed — the whole draft — OVER the revision the form
 *  holds (0 = there was none). A newer one stored meanwhile (another tab, another user of the
 *  participation, a page brought back by «Back»): nothing written, «stale» (6.1 review). */
export async function putDraft(d: Omit<StoredDraft, "updatedAt" | "rev">, baseRev: number): Promise<StoredDraft | "stale"> {
  const now = new Date().toISOString();
  const db = getDb();
  const inMem = () => {
    const cur = mem.get(d.participantId);
    if ((cur?.rev ?? 0) !== baseRev || (cur && cur.schemeId !== d.schemeId)) return "stale" as const;
    const row: StoredDraft = { ...d, rev: baseRev + 1, updatedAt: now };
    mem.set(d.participantId, row);
    return row;
  };
  if (!db) return inMem();
  try {
    if (baseRev === 0) {
      // the first draft: inserted only if there is none — two first saves at once: one wins
      const { data, error } = await db.from("submission_drafts").insert({ participant_id: d.participantId, scheme_id: d.schemeId, data: d.data, config_version: d.configVersion ?? null, rev: 1, updated_at: now, updated_by: d.updatedBy }).select("*");
      if (error) { if (/duplicate key|unique|23505/i.test(`${error.code ?? ""} ${error.message}`)) return "stale"; throw error; }
      return fromRow((data ?? [])[0] as Row);
    }
    const { data, error } = await db.from("submission_drafts").update({ data: d.data, config_version: d.configVersion ?? null, rev: baseRev + 1, updated_at: now, updated_by: d.updatedBy })
      .eq("participant_id", d.participantId).eq("scheme_id", d.schemeId).eq("rev", baseRev).select("*");
    if (error) throw error;
    return (data ?? []).length ? fromRow((data as Row[])[0]) : "stale";
  } catch (e) {
    warn(e);
    return inMem();
  }
}

// ── the submitted versions (written from 6.4; append-only in the database, migration 0042) ──
export interface Submission { id: string; participantId: string; schemeId: string; version: number; data: unknown; configVersion?: number; submittedAt: string; roundAt?: string; submittedBy: string }
const gs = globalThis as unknown as { __ptsSubmissionsMem?: Submission[] };
const memSubs: Submission[] = gs.__ptsSubmissionsMem ?? (gs.__ptsSubmissionsMem = []);
type SubRow = { id: string; participant_id: string; scheme_id: string; version: number; data: unknown; config_version: number | null; submitted_at: string; round_at: string | null; submitted_by: string };

/** Every submitted version of a round, by participation and version — for the round export
 *  (Реш. 136). A database error throws: an export is whole, or it is not made. */
export async function listSubmissions(schemeId: string): Promise<Submission[]> {
  const db = getDb();
  if (!db) return memSubs.filter((x) => x.schemeId === schemeId).map((x) => ({ ...x }));
  const { data, error } = await db.from("submissions").select("*").eq("scheme_id", schemeId).order("participant_id").order("version");
  if (error) throw new Error(`[submissions] not read: ${error.message}`, { cause: error });
  return ((data ?? []) as SubRow[]).map((r) => ({ id: r.id, participantId: r.participant_id, schemeId: r.scheme_id, version: r.version, data: r.data, configVersion: r.config_version ?? undefined, submittedAt: r.submitted_at, roundAt: r.round_at ?? undefined, submittedBy: r.submitted_by }));
}

/** Record a submitted version — the next one only (the database's guard, 0042, refuses any other;
 *  memory keeps the same rule). Throws on failure: a submission is recorded whole, or not at all. */
export async function addSubmission(x: Omit<Submission, "submittedAt">): Promise<Submission> {
  const row: Submission = { ...x, submittedAt: new Date().toISOString() };
  const db = getDb();
  if (!db) {
    const latest = Math.max(0, ...memSubs.filter((s) => s.participantId === x.participantId).map((s) => s.version));
    if (x.version !== latest + 1) throw new Error(`submissions: ${x.version} is not the next version (the latest is ${latest})`);
    memSubs.push(row);
    return { ...row };
  }
  const { data, error } = await db.from("submissions").insert({ id: x.id, participant_id: x.participantId, scheme_id: x.schemeId, version: x.version, data: x.data, config_version: x.configVersion ?? null, round_at: x.roundAt ?? null, submitted_by: x.submittedBy }).select("submitted_at");
  if (error) throw new Error(`[submissions] not recorded: ${error.message}`, { cause: error });
  return { ...row, submittedAt: ((data ?? [])[0] as { submitted_at?: string } | undefined)?.submitted_at ?? row.submittedAt };
}

/** One participation's submitted versions, oldest first. A database error throws. */
export async function listSubmissionsFor(participantId: string, schemeId: string): Promise<Submission[]> {
  return (await listSubmissions(schemeId)).filter((s) => s.participantId === participantId).sort((a, b) => a.version - b.version);
}

