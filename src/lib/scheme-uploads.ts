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
/** The bytes of an uploaded file (and its type), or null when it is not there. */
export async function uploadedDocBytes(up: UploadedDoc): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (up.path.startsWith("data:")) {
    // dev fallback — the file is stored inline as a data: URL
    const m = up.path.match(/^data:([^;]+);base64,(.*)$/);
    return m ? { bytes: new Uint8Array(Buffer.from(m[2], "base64")), mime: m[1] } : null;
  }
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(SCHEME_DOC_BUCKET).download(up.path);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime: up.mime || "application/octet-stream" };
}

export async function uploadedDocResponse(up: UploadedDoc, download: boolean): Promise<Response> {
  const got = await uploadedDocBytes(up);
  if (!got) return new Response("Not found", { status: 404 });
  return uploadedBytesResponse(got.bytes, got.mime, up.name, download);
}

/** A file's own name for «filename*» (RFC 5987): control characters, quotes and slashes out; every byte
 *  outside the attribute characters percent-encoded. */
// cut at 150 CHARACTERS, never inside one: «.slice(0, 150)» halved an emoji and encodeURIComponent threw on
// the lone half — a 500 for the download (the security sweep, round 3 — R3S-6); a lone half typed as
// such becomes «_»
// …and the extension kept: a long name lost its «.pdf» (round 4, R4U-6)
export const utf8Name = (name: string) => {
  const chars = Array.from(String(name || "document").replace(/[\u0000-\u001F\u007F"\\/]+/g, "_"))
    .map((ch) => (/^[\ud800-\udfff]$/.test(ch) ? "_" : ch));
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(chars.slice(-9).join(""))?.[0] ?? "";
  const clean = chars.length <= 150 ? chars.join("") : chars.slice(0, 150 - ext.length).join("") + ext;
  return encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
};

/** Serve a file's bytes as the uploads are served. */
export function uploadedBytesResponse(bytes: Uint8Array, mime: string, name: string, download: boolean): Response {
  const safeName = String(name || "document").replace(/[^\w.\-]+/g, "_");
  // copy into a fresh (plain-ArrayBuffer-backed) array so the Response body type is exact
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return new Response(out, {
    headers: {
      "content-type": mime,
      // …and the name as it was, for every browser that reads RFC 6266's «filename*» — a Cyrillic name was
      // left as «_1_.pdf» (the security sweep, UL-4); the plain one stays for the rest
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${utf8Name(name)}`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
