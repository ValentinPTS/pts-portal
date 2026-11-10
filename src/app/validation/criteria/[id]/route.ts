import type { NextRequest } from "next/server";
import { requireSection } from "@/lib/access";
import { getCriteria, criteriaFile } from "@/lib/validation-criteria";

// A signed edition of the acceptance criteria (part 8.1; Реш. 134) — for whom «Валидиране»
// opens to (the head, the quality manager, the software administrator). From the PRIVATE
// bucket through this gate, never a signed link. No participant in it, so an opening is not
// journalled — the edition's recording is.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireSection("validation");
  const { id } = await ctx.params;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== "string" || !UUID.test(id)) return new Response("Not found", { status: 404 });
  let e;
  // the record unreadable is said as such — never «not found» (8.1 review)
  try { e = await getCriteria(id); } catch { return new Response("The record could not be read — try again.", { status: 503 }); }
  if (!e) return new Response("Not found", { status: 404 });
  const bytes = await criteriaFile(e);
  if (!bytes) return new Response("Not found", { status: 404 });
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const name = `criteria-edition-${e.edition}.${e.fileMime === "application/pdf" ? "pdf" : e.fileMime === "image/png" ? "png" : "jpg"}`;
  return new Response(out, {
    headers: {
      "content-type": e.fileMime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

// a HEAD would read the file for nothing
export const HEAD = () => new Response(null, { status: 405, headers: { allow: "GET" } });
