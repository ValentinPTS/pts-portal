import type { NextRequest } from "next/server";
import { requireStaff, getRoleContext, canManagePeople } from "@/lib/roles";
import { getDeclaration, declarationFile } from "@/lib/staff-declarations";
import { logActivity } from "@/lib/activity";
import { utf8Name } from "@/lib/scheme-uploads";

// A person's signed Ф 4.2-1 (part 2.8) — for the head of the PT provider, who keeps
// PTS's people's papers, and for the person themselves. From the PRIVATE bucket
// through this gate, never a signed link, so every opening is in the journal (1.9).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const rc = await getRoleContext();
  const { id } = await ctx.params;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const d = typeof id === "string" && UUID.test(id) ? await getDeclaration(id).catch(() => null) : null;
  if (!d) return new Response("Not found", { status: 404 });
  // a voided one was recorded by mistake — perhaps against the wrong person: the head's only
  const own = !d.voided && !!rc.email && rc.email.trim().toLowerCase() === d.personEmail;
  if (!own && !(await canManagePeople(rc))) return new Response("Forbidden — a person's declaration is theirs and the head's.", { status: 403 });
  const bytes = await declarationFile(d);
  if (!bytes) return new Response("Not found", { status: 404 });
  // no opening without its record: if the journal cannot take it, the scan stays shut
  if (!(await logActivity("file.downloaded", { subject: `declaration:${d.id}`, summary: `The signed Ф 4.2-1 of ${d.personEmail} opened${own ? " by its signer" : ""}` }))) {
    return new Response("The journal could not record this opening — try again.", { status: 503 });
  }
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const name = (d.fileName || "declaration").replace(/[^\w.\-]+/g, "_");
  return new Response(out, {
    headers: {
      "content-type": d.fileMime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${utf8Name(d.fileName || "declaration")}`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
