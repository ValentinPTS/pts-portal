import type { NextRequest } from "next/server";
import { requireSection } from "@/lib/access";
import { getTest, testFile } from "@/lib/validation-tests";

// A validation test's evidence file (part 8.3) — for whom «Валидиране» opens to. From the PRIVATE
// bucket through this gate, never a signed link.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireSection("validation");
  const { id } = await ctx.params;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== "string" || !UUID.test(id)) return new Response("Not found", { status: 404 });
  let t, bytes;
  try { t = await getTest(id); bytes = t ? await testFile(t) : null; } catch { return new Response("The record could not be read — try again.", { status: 503 }); }
  if (!t || !t.file || !bytes) return new Response("Not found", { status: 404 });
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const ext = t.file.mime === "application/pdf" ? "pdf" : t.file.mime === "image/png" ? "png" : "jpg";
  return new Response(out, {
    headers: {
      "content-type": t.file.mime,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="validation-test-${t.level}-${t.testedOn}.${ext}"`,
      "content-security-policy": "frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

export const HEAD = () => new Response(null, { status: 405, headers: { allow: "GET" } });
