import { getDb } from "./supabase";

// The file each export to PTS_Analysis 2.0 handed out (plan part 7.10): kept as it was handed out —
// its bytes, in a PRIVATE bucket of its own (the scheme documents' bucket takes PDF and images only) —
// so the round export carries what went to 2.0 beside what came back (7.2). Codes only, as the export
// is. Without a database (development), the bytes stay inline as a data: URL, as every upload does.
export const ANALYSIS_EXPORT_BUCKET = "analysis-exports";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// checked once per server instance (review: a round trip per export otherwise); a failure is not kept
let bucketReady: Promise<void> | null = null;
async function ensureBucket(): Promise<void> {
  const db = getDb();
  if (!db) return;
  bucketReady ??= (async () => {
    const { data: bucket } = await db.storage.getBucket(ANALYSIS_EXPORT_BUCKET);
    // made public by hand, every participation's results by code would be open at a guessable address: refuse (review)
    if (bucket?.public) throw new Error(`the ${ANALYSIS_EXPORT_BUCKET} bucket is public — make it private first`);
    if (bucket) return;
    const { error } = await db.storage.createBucket(ANALYSIS_EXPORT_BUCKET, { public: false, fileSizeLimit: "16MB", allowedMimeTypes: [XLSX_MIME] });
    if (error && !/exist/i.test(error.message)) throw error;
  })().catch((e) => { bucketReady = null; throw e; });
  return bucketReady;
}

/** Keep the bytes handed out; the path to them. Throws when they cannot be kept — then nothing is handed out. */
export async function keepExportFile(schemeId: string, exportId: string, bytes: Uint8Array): Promise<string> {
  const db = getDb();
  if (!db) return `data:${XLSX_MIME};base64,${Buffer.from(bytes).toString("base64")}`;
  await ensureBucket();
  const path = `${schemeId}/${exportId}.xlsx`;
  const { error } = await db.storage.from(ANALYSIS_EXPORT_BUCKET).upload(path, bytes, { contentType: XLSX_MIME, upsert: false });
  if (error) throw error;
  return path;
}

/** Take a kept file back — an export whose record or journal line could not be written was never handed out.
 *  A file that cannot be removed is said in the log (review: an orphan is otherwise invisible). */
export async function dropExportFile(path: string): Promise<void> {
  const db = getDb();
  if (!db || path.startsWith("data:")) return;
  try {
    const { error } = await db.storage.from(ANALYSIS_EXPORT_BUCKET).remove([path]);
    if (error) console.error(`[analysis export] a file not handed out could not be removed (${path}):`, error.message);
  } catch (e) {
    console.error(`[analysis export] a file not handed out could not be removed (${path}):`, (e as Error)?.message ?? e);
  }
}
