import type { NextRequest } from "next/server";
import { mayNow, requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { logActivity } from "@/lib/activity";

// Staff viewer for a file a LAB uploaded from its portal (signed receipt protocol /
// completed results sheet). Private storage, streamed through this gate — never a
// public URL. ?download=1 forces a download; otherwise inline (browser viewer).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  await requireStaff();
  // §4.2 blind review: these are the lab's OWN signed documents on its letterhead —
  // the file content itself maps a participant CODE to a real lab identity. Only a
  // scheme manager or coding expert of THIS scheme may cross that boundary (the role model, 2.4), so an auditor/staff working
  // "by code" can't deanonymize a lab by opening its uploaded protocol.
  const { id, code: rawCode, slot } = await ctx.params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (!(await mayNow("names.view", id))) return new Response("Forbidden", { status: 403 });
  const code = decodeURIComponent(rawCode);
  if (slot !== "protocol" && slot !== "results") return new Response("Not found", { status: 404 });
  const scheme = await getScheme(id);
  const up = scheme?.labUploads?.[code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}

// Every download through this gate is in the journal (part 1.9): who, what, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  const res = await serve(req, ctx);
  if (res.status === 200 || res.status === 206) {
    const p = await ctx.params;
    await logActivity("file.downloaded", { schemeId: p.id, targetCode: decodeURIComponent(p.code), subject: `upload:${p.slot}`, summary: "A laboratory's uploaded file opened" });
  }
  return res;
}
