import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { requireStaff, canRevealNamesNow } from "@/lib/roles";
import { isLabDocSlot } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; code: string; slot: string }> }) {
  await requireStaff();
  if (!(await canRevealNamesNow())) return new Response("Forbidden", { status: 403 });
  const { id, code: rawCode, slot } = await ctx.params;
  if (!isLabDocSlot(slot)) return new Response("Not found", { status: 404 });
  const code = decodeURIComponent(rawCode);
  const scheme = await getScheme(id);
  const up = scheme?.labDocs?.[code]?.[slot];
  if (!up) return new Response("Not found", { status: 404 });
  return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
}
