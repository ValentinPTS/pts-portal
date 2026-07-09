import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getScheme } from "@/lib/store";
import { uploadedDocResponse } from "@/lib/scheme-uploads";

// A lab views/downloads ITS OWN uploaded file (protocol / results). Scoped to the
// signed-in lab's own participation — a lab can never reach another code's files.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });
  const { scheme: schemeId, slot } = await ctx.params;
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const mine = (await listParticipationsForLab(ls.lab.id)).find((p) => p.schemeId === schemeId);
  if (!mine) return new Response("Forbidden", { status: 403 });
  const scheme = await getScheme(schemeId);
  const up = scheme?.labUploads?.[mine.code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}
