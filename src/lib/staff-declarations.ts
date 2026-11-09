import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb, noMemoryFallback } from "./supabase";
import { getStaffByEmail } from "./staff";
import { isProviderHead, isFounder } from "./provider-people";
import { sofiaDay } from "./chain";

// The staff confidentiality declaration Ф 4.2-1, per provider person (plan part 2.8;
// E17; ISO/IEC 17043 §4.2; migration 0028). PTS's own form, signed on paper: the
// portal records the date it was signed and keeps the signed scan in a PRIVATE
// bucket, served only through a gated, journalled route (/users/declarations/[id]).
// Never changed or removed — signed again, it is a new record, and the latest signed
// is the one in force. One recorded by mistake is VOIDED, with the reason: in force for
// nobody, its scan for the head only.

export const DECLARATION_BUCKET = "staff-declarations";
export const DECLARATION_EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
export const MAX_DECLARATION_BYTES = 15_000_000;

export interface StaffDeclaration {
  id: string;
  personEmail: string;
  signedOn: string; // yyyy-mm-dd
  filePath: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  recordedBy: string;
  recordedAt: string;
  voided?: { reason: string; by: string; at: string };
}

const memStore = globalThis as unknown as { __ptsDeclarationsMem?: StaffDeclaration[] };
const mem: StaffDeclaration[] = memStore.__ptsDeclarationsMem ?? (memStore.__ptsDeclarationsMem = []);
type VoidRow = { declaration_id: string; reason: string; voided_by: string; voided_at: string };

type Row = { id: string; person_email: string; signed_on: string; file_path: string; file_name: string; file_mime: string; file_size: number; recorded_by: string; recorded_at: string };
const toRow = (d: StaffDeclaration): Row => ({ id: d.id, person_email: d.personEmail, signed_on: d.signedOn, file_path: d.filePath, file_name: d.fileName, file_mime: d.fileMime, file_size: d.fileSize, recorded_by: d.recordedBy, recorded_at: d.recordedAt });
const fromRow = (r: Row): StaffDeclaration => ({ id: r.id, personEmail: r.person_email, signedOn: String(r.signed_on).slice(0, 10), filePath: r.file_path, fileName: r.file_name, fileMime: r.file_mime, fileSize: r.file_size, recordedBy: r.recorded_by, recordedAt: r.recorded_at });
const norm = (e: string) => (e ?? "").trim().toLowerCase();
// the one in force first: the latest signed, then the latest recorded
const newestFirst = (a: StaffDeclaration, b: StaffDeclaration) => b.signedOn.localeCompare(a.signedOn) || b.recordedAt.localeCompare(a.recordedAt);

/** Every declaration recorded — of one person, or of everyone — the one in force first
 *  (a voided one carries its voiding). */
export async function listDeclarations(q: { personEmail?: string } = {}): Promise<StaffDeclaration[]> {
  const keep = (d: StaffDeclaration) => !q.personEmail || d.personEmail === norm(q.personEmail);
  const db = getDb();
  if (!db) return mem.filter(keep).sort(newestFirst);
  try {
    let query = db.from("staff_declarations").select("*");
    if (q.personEmail) query = query.eq("person_email", norm(q.personEmail));
    const [{ data, error }, voids] = await Promise.all([query, db.from("staff_declaration_voids").select("*")]);
    if (error) throw error;
    if (voids.error) throw voids.error;
    const voided = new Map(((voids.data ?? []) as VoidRow[]).map((v) => [v.declaration_id, { reason: v.reason, by: v.voided_by, at: v.voided_at }]));
    return ((data ?? []) as Row[]).map((r) => ({ ...fromRow(r), ...(voided.has(r.id) ? { voided: voided.get(r.id) } : {}) })).sort(newestFirst);
  } catch (e) {
    noMemoryFallback("staff-declarations", e);
    return mem.filter(keep).sort(newestFirst);
  }
}

export async function getDeclaration(id: string): Promise<StaffDeclaration | null> {
  return (await listDeclarations()).find((d) => d.id === id) ?? null;
}

/** The declaration in force for each person (the latest signed, not voided). */
export async function declarationsInForce(): Promise<Map<string, StaffDeclaration>> {
  const out = new Map<string, StaffDeclaration>();
  for (const d of await listDeclarations()) if (!d.voided && !out.has(d.personEmail)) out.set(d.personEmail, d);
  return out;
}

/** Void one recorded by mistake — with the reason, on record; never deleted. */
export async function voidDeclaration(p: { id: string; reason: string; by: string }): Promise<{ ok: true; entry: StaffDeclaration } | { ok: false; error: "missing" | "already" | "reason" | "failed" }> {
  const reason = (p.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500) return { ok: false, error: "reason" };
  const d = await getDeclaration(p.id);
  if (!d) return { ok: false, error: "missing" };
  if (d.voided) return { ok: false, error: "already" };
  const voided = { reason, by: p.by, at: new Date().toISOString() };
  const db = getDb();
  if (!db) {
    const m = mem.find((x) => x.id === p.id)!;
    m.voided = voided;
    return { ok: true, entry: m };
  }
  const { error } = await db.from("staff_declaration_voids").insert({ declaration_id: p.id, reason, voided_by: p.by });
  if (error) return { ok: false, error: (error as { code?: string }).code === "23505" ? "already" : "failed" };
  return { ok: true, entry: { ...d, voided } };
}

export type DeclarationProblem = "person" | "date" | "file" | "type" | "size" | "failed";

/** One of PTS's people — an active team member, or the head or a founder (who need
 *  no team row): the auditor and the laboratories sign no Ф 4.2-1 here. (The same
 *  as the role code's own eligibility, lib/scheme-roles.ts.) */
export async function ofPts(email: string): Promise<boolean> {
  const staff = await getStaffByEmail(email);
  return staff ? staff.status === "active" && staff.role !== "auditor" : isProviderHead(email) || isFounder(email);
}

async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data: bucket } = await db.storage.getBucket(DECLARATION_BUCKET);
  // made public by hand, every scan would be open at a guessable address: refuse
  if (bucket?.public) throw new Error(`the ${DECLARATION_BUCKET} bucket is public — make it private first`);
  if (!bucket) {
    const { error } = await db.storage.createBucket(DECLARATION_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: Object.keys(DECLARATION_EXT) });
    if (error && !/exist/i.test(error.message)) throw error;
  }
}

/** Record a signed declaration, with its scan (already checked to be a real PDF, PNG
 *  or JPG by its bytes — the caller's). */
export async function recordDeclaration(p: { personEmail: string; signedOn: string; file: { bytes: Uint8Array; mime: string; name: string }; by: string }): Promise<{ ok: true; entry: StaffDeclaration } | { ok: false; error: DeclarationProblem }> {
  const email = norm(p.personEmail);
  if (!email || !(await ofPts(email))) return { ok: false, error: "person" };
  const day = (p.signedOn ?? "").trim();
  // a real calendar day, not after today in Sofia, not before 2000
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day || day > sofiaDay(new Date().toISOString()) || day < "2000-01-01") return { ok: false, error: "date" };
  if (!p.file.bytes.byteLength) return { ok: false, error: "file" };
  const ext = DECLARATION_EXT[p.file.mime];
  if (!ext) return { ok: false, error: "type" };
  if (p.file.bytes.byteLength > MAX_DECLARATION_BYTES) return { ok: false, error: "size" };
  const id = randomUUID();
  const entry: StaffDeclaration = {
    id, personEmail: email, signedOn: day, filePath: "", fileName: String(p.file.name || `Ф 4.2-1.${ext}`).slice(0, 160),
    fileMime: p.file.mime, fileSize: p.file.bytes.byteLength, recordedBy: p.by, recordedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (!db) {
    // no database (local): the scan inline, as the other uploads keep theirs
    entry.filePath = `data:${p.file.mime};base64,${Buffer.from(p.file.bytes).toString("base64")}`;
    mem.push(entry);
    return { ok: true, entry };
  }
  let uploaded = false;
  try {
    await ensureBucket(db);
    entry.filePath = `${id}.${ext}`; // never the person's name in the path
    const up = await db.storage.from(DECLARATION_BUCKET).upload(entry.filePath, p.file.bytes, { contentType: p.file.mime, upsert: false });
    if (up.error) throw up.error;
    uploaded = true;
    const { error } = await db.from("staff_declarations").insert(toRow(entry));
    if (error) throw error;
  } catch (e) {
    console.error("[staff-declarations] not recorded:", (e as Error)?.message);
    // no record was made: a signed scan is not left behind without one
    if (uploaded) await db.storage.from(DECLARATION_BUCKET).remove([entry.filePath]).catch(() => {});
    return { ok: false, error: "failed" };
  }
  return { ok: true, entry };
}

/** The signed scan's bytes — the CALLER decides who may have them. */
export async function declarationFile(d: StaffDeclaration): Promise<Uint8Array | null> {
  if (d.filePath.startsWith("data:")) {
    const m = d.filePath.match(/^data:[^;]+;base64,(.*)$/);
    return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
  }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(DECLARATION_BUCKET).download(d.filePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
