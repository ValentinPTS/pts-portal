import type { NextRequest } from "next/server";
import { mayNow, requireCap, mayViewDoc } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { getDb } from "@/lib/supabase";
import { requireStaff } from "@/lib/roles";
import { isRestrictedDoc, showsIdentities } from "@/lib/documents";
import { SCHEME_DOC_BUCKET, utf8Name } from "@/lib/scheme-uploads";
import { logActivity } from "@/lib/activity";

// Serves an uploaded document file (PDF / image) from the PRIVATE scheme-docs bucket,
// gated to internal staff. Streams the bytes through this route so the confidential
// file is never exposed via a public/guessable URL. ?download=1 forces a download;
// otherwise it renders inline (the browser's PDF/image viewer, framed by our page).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireStaff();
  const { id, doc } = await ctx.params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  // an uploaded F 7.2.1-6 is a scan of the name↔code mapping (part 0.2) — and an uploaded
  // F 7.2.1-4 or certificate carries the laboratories' names too: as the round export
  // files them (identity/), only who sees names here opens them (§4.2, 2.9)
  if ((isRestrictedDoc(doc) || showsIdentities(doc)) && !(await mayNow("names.view", id))) return new Response("Forbidden — only who sees the laboratories' names here may open this document (ISO/IEC 17043 §4.2).", { status: 403 });
  if (!(await mayViewDoc(doc, id))) return new Response("Forbidden — the Order is for the staff it assigns roles to (Реш. 149).", { status: 403 }); // an uploaded Order (Реш. 149, 2.6)
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
      // …and its own name for browsers that read «filename*» (round 2, R2U-7)
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${utf8Name(up.name || "document")}`,
      // confine framing to our own origin; don't let the browser sniff the type.
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

// Every download through this gate is in the journal (part 1.9): who, what, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  const res = await serve(req, ctx);
  if (res.status === 200 || res.status === 206) {
    const p = await ctx.params;
    await logActivity("file.downloaded", { schemeId: p.id, subject: `uploaded:${p.doc}`, summary: "An uploaded scheme document opened" });
  }
  return res;
}
