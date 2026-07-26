import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { requireStaff, canRevealNamesNow } from "@/lib/roles";
import { uploadedDocResponse } from "@/lib/scheme-uploads";

// Staff viewer for a file a LAB uploaded from its portal (signed receipt protocol /
// completed results sheet). Private storage, streamed through this gate — never a
// public URL. ?download=1 forces a download; otherwise inline (browser viewer).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  await requireStaff();
  // §4.2 blind review: these are the lab's OWN signed documents on its letterhead —
  // the file content itself maps a participant CODE to a real lab identity. Only a
  // manager may cross that boundary (canRevealNames), so an auditor/staff working
  // "by code" can't deanonymize a lab by opening its uploaded protocol.
  if (!(await canRevealNamesNow())) return new Response("Forbidden", { status: 403 });
  const { id, code: rawCode, slot } = await ctx.params;
  const code = decodeURIComponent(rawCode);
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const scheme = await getScheme(id);
  const up = scheme?.labUploads?.[code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}
