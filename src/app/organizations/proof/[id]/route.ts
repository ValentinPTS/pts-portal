import type { NextRequest } from "next/server";
import { requireCapAnywhere } from "@/lib/access";
import { actorNow } from "@/lib/identities";
import { openEntities } from "@/lib/entities";
import { proofFile } from "@/lib/entity-proofs";
import { logActivity } from "@/lib/activity";

// A legal entity's attached document (plan part 4.1) — for those who keep the
// laboratories' people (labs.manage). From the PRIVATE bucket through this gate, never a
// signed link: the entity is opened on record, and the opening is in the journal — if
// the journal cannot take it, the document stays shut.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireCapAnywhere("labs.manage"); // signed in, 2FA where required, and the capability
  const { id } = await ctx.params;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== "string" || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const [e] = await openEntities({ actor: await actorNow(), purpose: "names.view" }, id);
  // the current document, or — with ?n= — one from its history (none is lost; 4.1 review)
  const n = req.nextUrl.searchParams.get("n");
  const history = e?.proofHistory ?? [];
  const path = n === null ? e?.proofPath : /^\d{1,3}$/.test(n) && Number(n) >= 1 && Number(n) <= history.length ? history[Number(n) - 1].path : undefined;
  if (!e || !path) return new Response("Not found", { status: 404 });
  const f = await proofFile(path);
  if (!f) return new Response("Not found", { status: 404 });
  if (!(await logActivity("file.downloaded", { subject: `entity:${e.id}`, summary: n === null ? "A legal entity's document opened" : `A legal entity's earlier document opened (no. ${n})` }))) {
    return new Response("The journal could not record this opening — try again.", { status: 503 });
  }
  const out = new Uint8Array(f.bytes.byteLength);
  out.set(f.bytes);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const ext = f.mime === "application/pdf" ? "pdf" : f.mime === "image/png" ? "png" : "jpg";
  return new Response(out, {
    headers: {
      "content-type": f.mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="entity-document.${ext}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
