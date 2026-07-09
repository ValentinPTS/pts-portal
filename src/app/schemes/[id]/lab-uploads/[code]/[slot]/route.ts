import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { uploadedDocResponse } from "@/lib/scheme-uploads";

// Staff viewer for a file a LAB uploaded from its portal (signed receipt protocol /
// completed results sheet). Private storage, streamed through this gate — never a
// public URL. ?download=1 forces a download; otherwise inline (browser viewer).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  await requireStaff();
  const { id, code: rawCode, slot } = await ctx.params;
  const code = decodeURIComponent(rawCode);
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const scheme = await getScheme(id);
  const up = scheme?.labUploads?.[code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}
