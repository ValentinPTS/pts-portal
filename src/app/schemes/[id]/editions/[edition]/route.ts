import type { NextRequest } from "next/server";
import { requireCap, mayNow, mayViewDoc } from "@/lib/access";
import { isRestrictedDoc } from "@/lib/documents";
import { editionResponse, getEdition } from "@/lib/editions";
import { hasEditions, editionLabel } from "@/lib/editions-model";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";

// One edition's frozen file (part 3.0) — the document exactly as it was issued as
// that edition, in either language (?lang=en), or as a download (?download=1). For
// the scheme's own staff who may open that document: the Order only for the staff it
// is for (Реш. 149). A file whose bytes are not the ones recorded is not served.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ id: string; edition: string }> }) {
  await requireStaff();
  const { id, edition } = await ctx.params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const ed = await getEdition(edition);
  // an edition of another scheme answers as a missing one
  if (!ed || ed.schemeId !== id || !hasEditions(ed.docKey)) return { res: new Response("Not found", { status: 404 }) };
  if (isRestrictedDoc(ed.docKey) && !(await mayNow("names.view", id))) return { res: new Response("Forbidden", { status: 403 }) };
  if (!(await mayViewDoc(ed.docKey, id))) return { res: new Response("Forbidden — the Order is for the staff it assigns roles to (Реш. 149).", { status: 403 }) };
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  return { res: await editionResponse(ed, lang, req.nextUrl.searchParams.get("download") === "1"), ed, lang };
}

// Every opening is in the journal (part 1.9): who, which edition, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; edition: string }> }) {
  const { res, ed, lang } = await serve(req, ctx);
  if (ed && (res.status === 200 || res.status === 206)) {
    await logActivity("file.downloaded", { schemeId: ed.schemeId, subject: `edition:${ed.id}`, summary: `${editionLabel("en", ed.no, ed.issuedOn)} of “${ed.docKey}” opened (${lang})` });
  }
  return res;
}
