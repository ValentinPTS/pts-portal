import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listVisibleParticipations } from "@/lib/visibility";
import { getScheme } from "@/lib/store";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { logActivity } from "@/lib/activity";

// A lab views/downloads ITS OWN uploaded file (protocol / results). Scoped to the
// signed-in lab's own participation — a lab can never reach another code's files.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });
  const { scheme: schemeId, slot } = await ctx.params;
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const mine = (await listVisibleParticipations(ls.lab.id)).find((p) => p.schemeId === schemeId);
  if (!mine) return new Response("Forbidden", { status: 403 });
  const scheme = await getScheme(schemeId);
  const up = scheme?.labUploads?.[mine.code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}

// Every download through this gate is in the journal (part 1.9): who, what, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const res = await serve(req, ctx);
  if (res.status === 200 || res.status === 206) {
    const p = await ctx.params;
    // by its code in this scheme — the laboratory is never named (§4.2)
    const ls = await getLabSession();
    const ours = ls ? (await listVisibleParticipations(ls.lab.id)).filter((x) => x.schemeId === p.scheme) : [];
    const code = (ours.find((x) => x.id === req.nextUrl.searchParams.get("p")) ?? ours[0])?.code;
    await logActivity("file.downloaded", { schemeId: p.scheme, targetCode: code, subject: `upload:${p.slot}`, summary: "A laboratory opened its own uploaded file" });
  }
  return res;
}
