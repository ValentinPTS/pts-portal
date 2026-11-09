import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listVisibleParticipations } from "@/lib/visibility";
import { getScheme } from "@/lib/store";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { logActivity } from "@/lib/activity";

// A lab views/downloads ITS OWN uploaded file (protocol / results). Scoped to the
// signed-in lab's own participation — a lab can never reach another code's files.
// ?p= names WHICH of its participations (one laboratory may hold two in a scheme — each
// uploads its own since 5.5); matched against its own list, else the first.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownParticipation(req: NextRequest, schemeId: string) {
  const ls = await getLabSession();
  if (!ls) return null;
  const ours = (await listVisibleParticipations(ls.lab.id)).filter((p) => p.schemeId === schemeId);
  const wanted = req.nextUrl.searchParams.get("p");
  return ours.find((p) => p.id === wanted) ?? ours[0] ?? null;
}

async function serve(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });
  const { scheme: schemeId, slot } = await ctx.params;
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const mine = await ownParticipation(req, schemeId);
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
    // by its code in this scheme — the laboratory is never named (§4.2); the same one served
    const code = (await ownParticipation(req, p.scheme))?.code;
    await logActivity("file.downloaded", { schemeId: p.scheme, targetCode: code, subject: `upload:${p.slot}`, summary: "A laboratory opened its own uploaded file" });
  }
  return res;
}
