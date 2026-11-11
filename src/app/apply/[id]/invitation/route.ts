import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { isStarted } from "@/lib/visibility";
import { editionResponse, getEdition } from "@/lib/editions";

// The scheme's invitation, public (plan part 10.1; D15: «plan, invitation and application are public
// for a started scheme, prices included») — as 5.4's plan: only a started scheme (Реш. 147), only the
// edition PTS released to the participants — never the live document, never a draft. An unstarted or
// unreleased one answers as missing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await getScheme(id);
  if (!s || !isStarted(s) || !s.sentToParticipants?.invitation) return new Response("Not found", { status: 404 });
  const rec = s.releasedEditions?.invitation;
  const ed = rec ? await getEdition(rec.id).catch(() => null) : null;
  if (!ed || ed.schemeId !== s.id || ed.docKey !== "invitation") return new Response("The invitation cannot be opened right now. Try again in a moment.", { status: 503 });
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  return editionResponse(ed, lang, req.nextUrl.searchParams.get("download") === "1");
}
