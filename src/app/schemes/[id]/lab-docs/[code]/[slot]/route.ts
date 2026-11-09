import type { NextRequest } from "next/server";
import { mayNow, requireCap } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { requireStaff } from "@/lib/roles";
import { isLabDocSlot } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { logActivity } from "@/lib/activity";

// Provider-side viewer for a document addressed to ONE laboratory (the proforma
// invoice). Private storage, streamed through this gate — never a public URL.
//
// §4.2: an invoice is made out to the laboratory by name and VAT number, so the
// file itself maps a participant CODE to a real identity. Only a manager may
// cross that line — the same rule that guards a lab's own signed protocol, so a
// staff member or auditor working "by code" cannot deanonymize a lab by opening
// the invoice addressed to it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  await requireStaff();
  const { id, code: rawCode, slot } = await ctx.params;
  await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  if (!(await mayNow("names.view", id))) return new Response("Forbidden", { status: 403 });
  if (!isLabDocSlot(slot)) return new Response("Not found", { status: 404 });
  const code = decodeURIComponent(rawCode);
  const scheme = await getScheme(id);
  const up = scheme?.labDocs?.[code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}

// Every download through this gate is in the journal (part 1.9): who, what, when.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  const res = await serve(req, ctx);
  if (res.status === 200 || res.status === 206) {
    const p = await ctx.params;
    await logActivity("file.downloaded", { schemeId: p.id, targetCode: decodeURIComponent(p.code), subject: `labdoc:${p.slot}`, summary: "A document addressed to one laboratory opened" });
  }
  return res;
}
