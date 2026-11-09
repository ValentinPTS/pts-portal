// The document attached to a legal entity where VIES cannot say — outside the EU, the
// service down (plan part 4.1): a registration certificate, an extract. In a PRIVATE
// bucket, the path a random id — never the entity's name — served only through the
// gated, journalled route /organizations/proof/[id].
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "./supabase";

export const ENTITY_PROOF_BUCKET = "entity-proofs";
export const PROOF_EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
// under the host's 4.5 MB limit on a request's body (4.1 review)
export const MAX_PROOF_BYTES = 4_000_000;

async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data: bucket } = await db.storage.getBucket(ENTITY_PROOF_BUCKET);
  if (bucket?.public) throw new Error(`the ${ENTITY_PROOF_BUCKET} bucket is public — make it private first`);
  if (!bucket) {
    const { error } = await db.storage.createBucket(ENTITY_PROOF_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: Object.keys(PROOF_EXT) });
    if (error && !/exist/i.test(error.message)) throw error;
  }
}

/** Keep the document; its path — or, locally with no database, the file inline. The
 *  caller checked the bytes are a real PDF, PNG or JPG. */
export async function storeProof(file: { bytes: Uint8Array; mime: string }): Promise<string> {
  const ext = PROOF_EXT[file.mime];
  if (!ext) throw new Error("type");
  const db = getDb();
  if (!db) return `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}`;
  await ensureBucket(db);
  const path = `${randomUUID()}.${ext}`;
  const up = await db.storage.from(ENTITY_PROOF_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: false });
  if (up.error) throw up.error;
  return path;
}

/** The document's bytes and type — the CALLER decides who may have them. */
export async function proofFile(path: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const m = path.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { bytes: new Uint8Array(Buffer.from(m[2], "base64")), mime: m[1] };
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(ENTITY_PROOF_BUCKET).download(path);
  if (error || !data) return null;
  const ext = path.split(".").pop() ?? "";
  const mime = Object.entries(PROOF_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
}

/** Remove a stored document — a file just stored whose record could not be written, or
 *  an erased profile's (4.7). Says whether it is gone: Supabase answers a failure in
 *  `error`, it does not throw (4.7 review). */
export async function removeProof(path: string): Promise<boolean> {
  if (path.startsWith("data:")) return true; // kept in the record itself (memory, locally)
  const db = getDb();
  if (!db) return true;
  const r = await db.storage.from(ENTITY_PROOF_BUCKET).remove([path]).catch((e) => ({ error: e as Error }));
  return !r.error;
}
