import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadedDoc } from "./types";
import { getDb } from "./supabase";

// Storage for ready-made document files uploaded into a scheme's document slots.
// PRIVATE bucket — scheme documents can contain confidential participant data, so
// the files are never public; they're served only through the auth-gated viewer
// route (/schemes/[id]/uploaded/[doc]). Same pattern as the lab-docs bucket.
export const SCHEME_DOC_BUCKET = "scheme-docs";

// Allowed upload types → file extension. PDF + image scans only (they render inline
// in the browser); Word/other are intentionally excluded (would need conversion).
export const SCHEME_DOC_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const MAX_SCHEME_DOC_BYTES = 15_000_000; // 15 MB

export async function ensureSchemeDocsBucket(db: SupabaseClient): Promise<void> {
  const { data: bucket } = await db.storage.getBucket(SCHEME_DOC_BUCKET);
  if (!bucket) {
    const { error } = await db.storage.createBucket(SCHEME_DOC_BUCKET, {
      public: false,
      fileSizeLimit: "16MB",
      allowedMimeTypes: Object.keys(SCHEME_DOC_EXT),
    });
    if (error && !/exist/i.test(error.message)) throw error;
  }
}

// Stream one uploaded file to the caller — shared by the auth-gated viewer routes
// (owner doc uploads AND lab uploads). Handles both real storage paths and the
// dev data:-URL fallback. The CALLER does authorization; this only moves bytes.
export async function uploadedDocResponse(up: UploadedDoc, download: boolean): Promise<Response> {
  let bytes: Uint8Array;
  let mime = up.mime || "application/octet-stream";
  if (up.path.startsWith("data:")) {
    // dev fallback — the file is stored inline as a data: URL
    const m = up.path.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return new Response("Not found", { status: 404 });
    mime = m[1];
    bytes = new Uint8Array(Buffer.from(m[2], "base64"));
  } else {
    const db = getDb();
    if (!db) return new Response("Not found", { status: 404 });
    const { data, error } = await db.storage.from(SCHEME_DOC_BUCKET).download(up.path);
    if (error || !data) return new Response("Not found", { status: 404 });
    bytes = new Uint8Array(await data.arrayBuffer());
  }
  const safeName = (up.name || "document").replace(/[^\w.\-]+/g, "_");
  // copy into a fresh (plain-ArrayBuffer-backed) array so the Response body type is exact
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return new Response(out, {
    headers: {
      "content-type": mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
