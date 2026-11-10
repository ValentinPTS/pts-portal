import { randomUUID } from "crypto";
import { getDb, noMemoryFallback } from "./supabase";
import { sha256 } from "./editions";
import { CRITERIA_EXT, fileProblem, oneLine, type Level } from "./validation-model";
import { VALIDATION_BUCKET, ensureValidationBucket } from "./validation-criteria";
import type { ValidationTest, TestItem, AutoEvidence, TestProblem, RoundKind } from "./validation-test-model";

// The validation tests on record (plan parts 8.3–8.6; migration 0046). Never changed or removed: one
// recorded by mistake is VOIDED with the reason. The evidence file, if any, in the private
// validation-docs bucket, served through a gated route. The rules are lib/validation-test-model.ts.

const memStore = globalThis as unknown as { __ptsValidationTestsMem?: ValidationTest[] };
const mem: ValidationTest[] = memStore.__ptsValidationTestsMem ?? (memStore.__ptsValidationTestsMem = []);

type Row = { id: string; level: number; kind: RoundKind; tested_on: string; scheme_id: string; scheme_number: string; replay_of: string | null; criteria_id: string; criteria_edition: number; criteria_recorded_after: boolean; scope: string; items: TestItem[]; auto: AutoEvidence; result: "pass" | "fail"; conclusion: string; file_path: string | null; file_name: string | null; file_mime: string | null; file_size: number | null; file_sha256: string | null; recorded_by: string; recorded_at: string };
type VoidRow = { test_id: string; reason: string; voided_by: string; voided_at: string };
const toRow = (t: ValidationTest): Row => ({ id: t.id, level: t.level, kind: t.kind, tested_on: t.testedOn, scheme_id: t.schemeId, scheme_number: t.schemeNumber, replay_of: t.replayOf ?? null, criteria_id: t.criteriaId, criteria_edition: t.criteriaEdition, criteria_recorded_after: t.criteriaRecordedAfter, scope: t.scope, items: t.items, auto: t.auto, result: t.result, conclusion: t.conclusion, file_path: t.file?.path ?? null, file_name: t.file?.name ?? null, file_mime: t.file?.mime ?? null, file_size: t.file?.size ?? null, file_sha256: t.file?.sha256 ?? null, recorded_by: t.recordedBy, recorded_at: t.recordedAt });
const fromRow = (r: Row): ValidationTest => ({
  id: r.id, level: r.level as Level, kind: r.kind ?? "pts-t", testedOn: String(r.tested_on).slice(0, 10), schemeId: r.scheme_id, schemeNumber: r.scheme_number, ...(r.replay_of ? { replayOf: r.replay_of } : {}),
  criteriaId: r.criteria_id, criteriaEdition: r.criteria_edition, criteriaRecordedAfter: !!r.criteria_recorded_after, scope: r.scope ?? "", items: r.items ?? [], auto: r.auto ?? { unexpected: null },
  result: r.result, conclusion: r.conclusion, ...(r.file_path ? { file: { path: r.file_path, name: r.file_name ?? "", mime: r.file_mime ?? "", size: r.file_size ?? 0, sha256: r.file_sha256 ?? "" } } : {}),
  recordedBy: r.recorded_by, recordedAt: r.recorded_at,
});
const newestFirst = (a: ValidationTest, b: ValidationTest) => b.testedOn.localeCompare(a.testedOn) || b.recordedAt.localeCompare(a.recordedAt);

/** Every test recorded (a voided one carries its voiding), the newest first. A database error throws. */
export async function listTests(): Promise<ValidationTest[]> {
  const db = getDb();
  if (!db) return [...mem].sort(newestFirst);
  try {
    const [{ data, error }, voids] = await Promise.all([db.from("validation_tests").select("*"), db.from("validation_test_voids").select("*")]);
    if (error) throw error;
    if (voids.error) throw voids.error;
    const voided = new Map(((voids.data ?? []) as VoidRow[]).map((v) => [v.test_id, { reason: v.reason, by: v.voided_by, at: v.voided_at }]));
    return ((data ?? []) as Row[]).map((r) => ({ ...fromRow(r), ...(voided.has(r.id) ? { voided: voided.get(r.id) } : {}) })).sort(newestFirst);
  } catch (e) {
    noMemoryFallback("validation-tests", e);
    return [...mem].sort(newestFirst);
  }
}

export async function getTest(id: string): Promise<ValidationTest | null> {
  return (await listTests()).find((t) => t.id === id) ?? null;
}

/** Record a test — everything already read and decided (the caller: the form read, the criteria, the
 *  auto evidence, the result). The evidence file, if any, kept first; a record that fails takes it back. */
export async function recordTest(t: Omit<ValidationTest, "id" | "recordedAt" | "file">, file: { bytes: Uint8Array; mime: string; name: string } | null): Promise<{ ok: true; entry: ValidationTest } | { ok: false; error: TestProblem }> {
  // fileProblem answers only «file», «type», «size» or «not-file» — the same words a test uses
  if (file) { const bad = fileProblem(file); if (bad) return { ok: false, error: bad as TestProblem }; }
  const id = randomUUID();
  const entry: ValidationTest = { ...t, id, recordedAt: new Date().toISOString() };
  const db = getDb();
  if (file) {
    const ext = CRITERIA_EXT[file.mime];
    entry.file = { path: "", name: oneLine(file.name || `evidence.${ext}`, 160), mime: file.mime, size: file.bytes.byteLength, sha256: sha256(file.bytes) };
  }
  if (!db) {
    if (file) entry.file!.path = `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}`;
    mem.push(entry);
    return { ok: true, entry };
  }
  let uploaded = false;
  try {
    if (file) {
      // the bucket refused if made public by hand (8.3 review)
      await ensureValidationBucket(db);
      entry.file!.path = `tests/${id}.${CRITERIA_EXT[file.mime]}`;
      const up = await db.storage.from(VALIDATION_BUCKET).upload(entry.file!.path, file.bytes, { contentType: file.mime, upsert: false });
      if (up.error) throw up.error;
      uploaded = true;
    }
    const { error } = await db.from("validation_tests").insert(toRow(entry));
    if (error) throw error;
  } catch (e) {
    console.error("[validation-tests] not recorded:", (e as Error)?.message);
    // a read that fails is never taken for «not recorded» — the evidence then stays (8.3 review)
    const stayed = await db.from("validation_tests").select("id").eq("id", id).then((r) => (r.error ? true : (r.data ?? []).length > 0), () => true);
    if (stayed) return { ok: true, entry };
    if (uploaded) {
      const { error } = await db.storage.from(VALIDATION_BUCKET).remove([entry.file!.path]).catch((x) => ({ error: x as Error }));
      if (error) console.error(`[validation-tests] evidence without its record could not be removed (${entry.file!.path}):`, error.message);
    }
    return { ok: false, error: "failed" };
  }
  return { ok: true, entry };
}

/** Void one recorded by mistake — with the reason, on record; never deleted. */
export async function voidTest(p: { id: string; reason: string; by: string }): Promise<{ ok: true; entry: ValidationTest } | { ok: false; error: "missing" | "already" | "reason" | "failed" }> {
  const t = await getTest(p.id);
  if (!t) return { ok: false, error: "missing" };
  if (t.voided) return { ok: false, error: "already" };
  const reason = oneLine(p.reason, 501);
  if (Array.from(reason).length < 5 || Array.from(reason).length > 500) return { ok: false, error: "reason" };
  const voided = { reason, by: p.by, at: new Date().toISOString() };
  const db = getDb();
  if (!db) { const m = mem.find((x) => x.id === p.id)!; m.voided = voided; return { ok: true, entry: m }; }
  const { error } = await db.from("validation_test_voids").insert({ test_id: p.id, reason, voided_by: p.by });
  if (error) return { ok: false, error: (error as { code?: string }).code === "23505" ? "already" : "failed" };
  return { ok: true, entry: { ...t, voided } };
}

/** The evidence file's bytes — the CALLER decides who may have them. */
export async function testFile(t: ValidationTest): Promise<Uint8Array | null> {
  if (!t.file) return null;
  if (t.file.path.startsWith("data:")) { const m = t.file.path.match(/^data:[^;]+;base64,(.*)$/); return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null; }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(VALIDATION_BUCKET).download(t.file.path);
  if (error) throw new Error(`storage (${VALIDATION_BUCKET}): ${error.message}`);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
