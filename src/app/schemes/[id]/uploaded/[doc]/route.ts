import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { getDb } from "@/lib/supabase";
import { requireStaff } from "@/lib/roles";
import { SCHEME_DOC_BUCKET } from "@/lib/scheme-uploads";

// Serves an uploaded document file (PDF / image) from the PRIVATE scheme-docs bucket,
// gated to internal staff. Streams the bytes through this route so the confidential
// file is never exposed via a public/guessable URL. ?download=1 forces a download;
// otherwise it renders inline (the browser's PDF/image viewer, framed by our page).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireStaff();
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const up = scheme?.uploads?.[doc];
  if (!scheme || !up) return new Response("Not found", { status: 404 });

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

  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = (up.name || "document").replace(/[^\w.\-]+/g, "_");
  // copy into a fresh (plain-ArrayBuffer-backed) array so the Response body type is
  // exact — matches the /api/pdf route's pattern.
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return new Response(out, {
    headers: {
      "content-type": mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      // confine framing to our own origin; don't let the browser sniff the type.
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
