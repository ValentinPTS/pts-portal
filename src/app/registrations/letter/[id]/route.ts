import type { NextRequest } from "next/server";
import { requireSection } from "@/lib/access";
import { getLabApplication } from "@/lib/lab-applications";
import { getDb } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";
import { JOIN_LETTER_BUCKET, memLetter } from "@/lib/join-letters";
import { UUID_RE } from "@/lib/entities-model";

// The organisation's signed letter on which PTS decided a request to join (plan part 9.1) — for whom
// «Одобрения на регистрации» opens to. Streamed through this gate from the PRIVATE bucket — never a signed
// link — so every opening is in the journal (1.9); never cached, never framed elsewhere.
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireSection("registrations");
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });
  const a = await getLabApplication(id);
  const path = a?.kind === "join" ? a.letterPath : undefined;
  if (!path) return new Response("Not found", { status: 404 });
  let bytes: Uint8Array | undefined;
  const db = getDb();
  if (db) {
    const { data, error } = await db.storage.from(JOIN_LETTER_BUCKET).download(path);
    if (error || !data) return new Response("The letter could not be read", { status: 503 });
    bytes = new Uint8Array(await data.arrayBuffer());
  } else bytes = memLetter(path)?.bytes;
  if (!bytes) return new Response("Not found", { status: 404 });
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  await logActivity("file.downloaded", { subject: `lab-application:${id}:letter`, summary: "The signed letter of a request to join opened" });
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "content-disposition": `inline; filename="letter.${ext || "bin"}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
export const HEAD = () => new Response(null, { status: 405 });
