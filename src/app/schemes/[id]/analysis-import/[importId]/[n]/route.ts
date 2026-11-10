import { requireOneOf } from "@/lib/access";
import { requireStaff } from "@/lib/roles";
import { getScheme } from "@/lib/store";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { servedName } from "@/lib/analysis-import-model";
import { logActivity } from "@/lib/activity";

// A file that came back from PTS_Analysis 2.0 (plan part 7.2) — as it came, never changed — to who
// reads, enters or processes the results, or edits the scheme. By its import and its place, under a
// neutral name (never the name it came with — often a laboratory's, §4.2); each opening journalled
// as every scheme file's (1.9).
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; importId: string; n: string }> }) {
  await requireStaff();
  const { id, importId, n } = await ctx.params;
  await requireOneOf(["results.read", "results.enter", "results.process", "scheme.edit"], id);
  if (!/^\d+$/.test(n)) return new Response("Not found", { status: 404 });
  const s = await getScheme(id);
  const imp = s?.analysisImports?.find((x) => x.id === importId);
  const f = imp?.files[Number(n) - 1];
  if (!f) return new Response("Not found", { status: 404 });
  const res = await uploadedDocResponse({ path: f.path, name: servedName(f.kind, Number(n), f.mime, imp!.version), mime: f.mime, size: f.size, uploadedAt: imp!.at, uploadedBy: imp!.by }, new URL(req.url).searchParams.get("download") === "1");
  if (res.status === 200) await logActivity("file.downloaded", { schemeId: id, subject: `analysis-import:${importId}:${n}`, summary: `A file from PTS_Analysis ${imp!.version} opened (${f.kind})` });
  return res;
}
