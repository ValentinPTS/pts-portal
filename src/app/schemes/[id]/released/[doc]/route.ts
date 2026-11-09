import type { NextRequest } from "next/server";
import { requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { isSendableDoc } from "@/lib/doc-release";
import { editionResponse, getEdition } from "@/lib/editions";
import { requireStaff } from "@/lib/roles";
import { logActivity } from "@/lib/activity";

// What the participants hold: the EDITION the document went out as (part 3.0), for
// the provider to see exactly that — whatever has been edited since. Only cohort
// documents are ever released, and those carry no names (rendered as the
// participants receive them), so any internal role of the scheme may look.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  await requireStaff();
  const { id, doc } = await ctx.params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (!isSendableDoc(doc)) return new Response("Not found", { status: 404 });
  const scheme = await getScheme(id);
  const rec = scheme?.sentToParticipants?.[doc] ? scheme.releasedEditions?.[doc] : undefined;
  const ed = rec ? await getEdition(rec.id) : null;
  if (!ed || ed.schemeId !== id || ed.docKey !== doc) return new Response("Not found", { status: 404 });
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  return editionResponse(ed, lang, req.nextUrl.searchParams.get("download") === "1");
}

// Every download through this gate is in the journal (part 1.9): who, what, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  const res = await serve(req, ctx);
  if (res.status === 200 || res.status === 206) {
    const p = await ctx.params;
    await logActivity("file.downloaded", { schemeId: p.id, subject: `released:${p.doc}`, summary: "The edition sent to the participants opened" });
  }
  return res;
}
