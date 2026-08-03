import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getScheme } from "@/lib/store";
import { isLabDocSlot } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";

// A laboratory downloads a document addressed to IT — today the proforma invoice.
//
// The code is never taken from the URL: it is resolved from the signed-in lab's
// OWN participations, so a lab can only ever reach a slot belonging to a
// participation it actually holds.
//
// ?p= names WHICH participation, because one lab account can hold more than one in
// the same scheme (it may apply twice) and each has its own code and its own
// invoice. It is matched against the lab's own list, so an id belonging to anyone
// else simply does not match. Absent or unknown → the first, which is also what a
// link written before this parameter existed means.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });
  const { scheme: schemeId, slot } = await ctx.params;
  if (!isLabDocSlot(slot)) return new Response("Not found", { status: 404 });
  const ours = (await listParticipationsForLab(ls.lab.id)).filter((p) => p.schemeId === schemeId);
  const wanted = req.nextUrl.searchParams.get("p");
  const mine = ours.find((p) => p.id === wanted) ?? ours[0];
  if (!mine) return new Response("Forbidden", { status: 403 });
  const scheme = await getScheme(schemeId);
  const up = scheme?.labDocs?.[mine.code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}
