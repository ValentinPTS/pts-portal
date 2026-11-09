import type { NextRequest } from "next/server";
import { requireCapAnywhere } from "@/lib/access";
import { getLabApplication } from "@/lib/lab-applications";
import { getDb } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

// A document a laboratory attached to its account application (registration
// papers), for a manager. Streamed through this gate from the PRIVATE «lab-docs»
// bucket — never a signed link handed to the browser — so that every opening is in
// the journal (part 1.9). The file's type is the stored one (checked by magic bytes
// when it was submitted); the browser may neither sniff it nor frame it elsewhere.
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; n: string }> }) {
  await requireCapAnywhere("labs.manage"); // a laboratory's account papers (2.4)
  const { id, n } = await ctx.params;
  const i = Number(n);
  const app = await getLabApplication(id);
  const path = app && Number.isInteger(i) && i >= 0 ? app.docPaths[i] : undefined;
  if (!path) return new Response("Not found", { status: 404 });
  const db = getDb();
  if (!db) return new Response("Not found", { status: 404 });
  const { data, error } = await db.storage.from("lab-docs").download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const name = (path.split("/").pop() ?? "document").replace(/[^\w.\-]+/g, "_");
  const mime = MIME[(name.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";
  const bytes = new Uint8Array(await data.arrayBuffer());
  const download = req.nextUrl.searchParams.get("download") === "1";
  await logActivity("file.downloaded", { subject: `lab-application:${id}:${i}`, summary: "A document of a laboratory's account application opened" });
  return new Response(bytes, {
    headers: {
      "content-type": mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
