import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb, noMemoryFallback } from "./supabase";
import { sha256 } from "./editions";
import { CRITERIA_EXT, fileProblem, editionProblem, voidProblem, oneLine, type CriteriaEdition, type CriteriaProblem, type Level } from "./validation-model";

// The acceptance criteria's signed editions (plan part 8.1; Реш. 134; migration 0045). PTS signs
// on paper; the portal keeps the signed scan in a PRIVATE bucket, served only through a gated
// route (/validation/criteria/[id]), with its SHA-256. Never changed or removed: a new edition is
// a new record; one recorded by mistake is VOIDED with the reason. The rule they set is
// lib/validation-model.ts.

export const VALIDATION_BUCKET = "validation-docs";

const memStore = globalThis as unknown as { __ptsValidationCriteriaMem?: CriteriaEdition[] };
const mem: CriteriaEdition[] = memStore.__ptsValidationCriteriaMem ?? (memStore.__ptsValidationCriteriaMem = []);

type Row = { id: string; edition: number; signed_on: string; signed_by: string; levels: number[]; note: string; file_path: string; file_name: string; file_mime: string; file_size: number; file_sha256: string; recorded_by: string; recorded_at: string };
type VoidRow = { criteria_id: string; reason: string; voided_by: string; voided_at: string };
const toRow = (e: CriteriaEdition): Row => ({ id: e.id, edition: e.edition, signed_on: e.signedOn, signed_by: e.signedBy, levels: e.levels, note: e.note, file_path: e.filePath, file_name: e.fileName, file_mime: e.fileMime, file_size: e.fileSize, file_sha256: e.fileSha256, recorded_by: e.recordedBy, recorded_at: e.recordedAt });
const fromRow = (r: Row): CriteriaEdition => ({ id: r.id, edition: r.edition, signedOn: String(r.signed_on).slice(0, 10), signedBy: r.signed_by, levels: (r.levels ?? []) as Level[], note: r.note ?? "", filePath: r.file_path, fileName: r.file_name, fileMime: r.file_mime, fileSize: r.file_size, fileSha256: r.file_sha256, recordedBy: r.recorded_by, recordedAt: r.recorded_at });
const byEdition = (a: CriteriaEdition, b: CriteriaEdition) => b.edition - a.edition;

/** Every edition recorded, the newest first (a voided one carries its voiding). */
export async function listCriteria(): Promise<CriteriaEdition[]> {
  const db = getDb();
  if (!db) return [...mem].sort(byEdition);
  try {
    const [{ data, error }, voids] = await Promise.all([db.from("validation_criteria").select("*"), db.from("validation_criteria_voids").select("*")]);
    if (error) throw error;
    if (voids.error) throw voids.error;
    const voided = new Map(((voids.data ?? []) as VoidRow[]).map((v) => [v.criteria_id, { reason: v.reason, by: v.voided_by, at: v.voided_at }]));
    return ((data ?? []) as Row[]).map((r) => ({ ...fromRow(r), ...(voided.has(r.id) ? { voided: voided.get(r.id) } : {}) })).sort(byEdition);
  } catch (e) {
    noMemoryFallback("validation-criteria", e);
    return [...mem].sort(byEdition);
  }
}

export async function getCriteria(id: string): Promise<CriteriaEdition | null> {
  return (await listCriteria()).find((e) => e.id === id) ?? null;
}

/** What the bucket takes: the signed scans (8.1) and a replay's source file (8.2). */
export const VALIDATION_MIMES = [...Object.keys(CRITERIA_EXT), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

/** The private bucket, made on first use — and, made before 8.2, taught the XLSX type (8.2 review):
 *  refused if made public; a bucket that cannot be read is never taken for one that is not there. */
export async function ensureValidationBucket(db: SupabaseClient): Promise<void> {
  const { data: bucket, error: read } = await db.storage.getBucket(VALIDATION_BUCKET);
  if (read && !/not.?found|does not exist/i.test(read.message)) throw read;
  // made public by hand, every signed scan would be open at a guessable address: refuse
  if (bucket?.public) throw new Error(`the ${VALIDATION_BUCKET} bucket is public — make it private first`);
  if (!bucket) {
    const { error } = await db.storage.createBucket(VALIDATION_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: VALIDATION_MIMES });
    if (error && !/exist/i.test(error.message)) throw error;
    return;
  }
  const allowed = (bucket as { allowed_mime_types?: string[] | null }).allowed_mime_types;
  if (allowed && VALIDATION_MIMES.some((m) => !allowed.includes(m))) {
    const { error } = await db.storage.updateBucket(VALIDATION_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: [...new Set([...allowed, ...VALIDATION_MIMES])] });
    if (error) throw error;
  }
}

/** Record a signed edition — the words already read (lib/validation-model readCriteriaForm). Its
 *  number is the paper's: not one recorded already, in the order of the days signed. */
export async function recordCriteria(p: { edition: number; signedOn: string; signedBy: string; levels: Level[]; note: string; file: { bytes: Uint8Array; mime: string; name: string }; by: string }):
  Promise<{ ok: true; entry: CriteriaEdition } | { ok: false; error: CriteriaProblem }> {
  const bad = fileProblem(p.file);
  if (bad) return { ok: false, error: bad };
  const id = randomUUID();
  const ext = CRITERIA_EXT[p.file.mime];
  const entry: CriteriaEdition = {
    id, edition: p.edition, signedOn: p.signedOn, signedBy: p.signedBy, levels: p.levels, note: p.note, filePath: "",
    fileName: oneLine(p.file.name || `criteria.${ext}`, 160),
    fileMime: p.file.mime, fileSize: p.file.bytes.byteLength, fileSha256: sha256(p.file.bytes), recordedBy: p.by, recordedAt: new Date().toISOString(),
  };
  let existing: CriteriaEdition[];
  try { existing = await listCriteria(); } catch { return { ok: false, error: "failed" }; }
  const clash = editionProblem(existing, entry);
  if (clash) return { ok: false, error: clash };
  const db = getDb();
  if (!db) {
    // no database (local): the scan inline, as the other uploads keep theirs
    entry.filePath = `data:${p.file.mime};base64,${Buffer.from(p.file.bytes).toString("base64")}`;
    mem.push(entry);
    return { ok: true, entry };
  }
  let uploaded = false;
  try {
    await ensureValidationBucket(db);
    entry.filePath = `criteria/${id}.${ext}`;
    const up = await db.storage.from(VALIDATION_BUCKET).upload(entry.filePath, p.file.bytes, { contentType: p.file.mime, upsert: false });
    if (up.error) throw up.error;
    uploaded = true;
    const { error } = await db.from("validation_criteria").insert(toRow(entry));
    if (error) throw error;
  } catch (e) {
    console.error("[validation-criteria] not recorded:", (e as Error)?.message);
    // an insert that went through but failed to answer leaves its row: then the scan stays with it (8.1 review)
    const stayed = uploaded && await db.from("validation_criteria").select("id").eq("id", id).then((r) => (r.data ?? []).length > 0, () => true);
    if (stayed) return { ok: true, entry };
    // no record was made: a signed scan is not left behind without one
    if (uploaded) {
      const { error } = await db.storage.from(VALIDATION_BUCKET).remove([entry.filePath]).catch((x) => ({ error: x as Error }));
      if (error) console.error(`[validation-criteria] a scan without its record could not be removed (${entry.filePath}):`, error.message);
    }
    return { ok: false, error: "failed" };
  }
  return { ok: true, entry };
}

/** Void one recorded by mistake — with the reason, on record; never deleted. */
export async function voidCriteria(p: { id: string; reason: string; by: string }): Promise<{ ok: true; entry: CriteriaEdition } | { ok: false; error: "missing" | "already" | "reason" | "failed" }> {
  const e = await getCriteria(p.id);
  const bad = voidProblem(e, p.reason);
  if (bad) return { ok: false, error: bad };
  const reason = oneLine(p.reason, 500);
  const voided = { reason, by: p.by, at: new Date().toISOString() };
  const db = getDb();
  if (!db) {
    const m = mem.find((x) => x.id === p.id)!;
    m.voided = voided;
    return { ok: true, entry: m };
  }
  const { error } = await db.from("validation_criteria_voids").insert({ criteria_id: p.id, reason, voided_by: p.by });
  if (error) return { ok: false, error: (error as { code?: string }).code === "23505" ? "already" : "failed" };
  return { ok: true, entry: { ...e!, voided } };
}

/** The signed scan's bytes — the CALLER decides who may have them. */
export async function criteriaFile(e: CriteriaEdition): Promise<Uint8Array | null> {
  if (e.filePath.startsWith("data:")) {
    const m = e.filePath.match(/^data:[^;]+;base64,(.*)$/);
    return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
  }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(VALIDATION_BUCKET).download(e.filePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
