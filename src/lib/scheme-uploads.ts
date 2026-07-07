import type { SupabaseClient } from "@supabase/supabase-js";

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
