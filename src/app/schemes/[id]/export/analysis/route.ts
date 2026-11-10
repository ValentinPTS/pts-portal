import { requireOneOf } from "@/lib/access";
import { requireStaff, getRoleContext } from "@/lib/roles";
import { getScheme, updateSchemeWith } from "@/lib/store";
import { listParticipants } from "@/lib/participants";
import { listSubmissions, listCorrections } from "@/lib/submissions";
import { inFinalRound } from "@/lib/announcement-model";
import { lockInForce } from "@/lib/submission-lock-model";
import { analysisSheets, analysisGaps } from "@/lib/analysis-export";
import { xlsx } from "@/lib/xlsx";
import { logActivity } from "@/lib/activity";
import { randomUUID } from "crypto";
import { sha256 } from "@/lib/editions";
import { manifestOf, type AnalysisExportRecord } from "@/lib/transfer-check-model";

// «Изнеси към PTS_Analysis 2.0» (plan part 7.1; schema_version 2.1, Реш. 148; D3): the template's
// eight sheets, codes only — for the statistics expert and the coding expert. Before the submission
// is locked (6.6) the file is marked PRELIMINARY in its name. An export is whole, or it is not
// made; none goes out whose journal line was not written (as the round export, 1.10).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await ctx.params;
  await requireOneOf(["results.process", "results.enter"], id);
  let s: Awaited<ReturnType<typeof getScheme>>;
  let out: ReturnType<typeof analysisSheets>, gaps: ReturnType<typeof analysisGaps>, bytes: Uint8Array;
  try {
    s = await getScheme(id);
    if (!s) return new Response("Not found", { status: 404 });
    if (!["running", "processing", "report", "closed"].includes(s.status) && !(s.type === "C" && s.status === "open")) return new Response("The scheme has no results yet — nothing to export.", { status: 409 });
    const [parts, subs, corr] = await Promise.all([listParticipants(id), listSubmissions(id), listCorrections(id)]);
    const listed = parts.filter((p) => inFinalRound(s!, p));
    // codes, never provisional references — before the coding act the file would carry Z-numbers
    // a laboratory never keeps (7.1 review)
    gaps = analysisGaps(s, listed);
    if (gaps.provisional.length) return new Response(`Not exported: ${gaps.provisional.join(", ")} still have a provisional reference — run the coding act first (5.3).`, { status: 409 });
    out = analysisSheets(s, listed, subs, corr, s.submissionLocks);
    // the file built BEFORE the journal line — a throw never leaves «exported» with nothing handed out (review)
    bytes = xlsx(out.sheets, new Date(), undefined, !lockInForce(s.submissionLocks) ? `PRELIMINARY — ${s.number}: the submission is not locked; the latest versions, still open to change` : `${s.number} — PTS_Analysis 2.0 input`);
  } catch (e) {
    console.error("[analysis export] not made:", (e as Error)?.message ?? e);
    return new Response("The export could not be made — a part of the round could not be read. Nothing was exported; try again.", { status: 503 });
  }
  const lock = lockInForce(s!.submissionLocks);
  const preliminary = !lock;
  // what was sent — recorded before the file is handed out, while the scheme is in processing, or
  // its report is issued and may be corrected (7.4: a correction re-exports when what the portal
  // sent was wrong) (7.3: the transfer check compares 2.0's report with it); a record that cannot
  // be written: nothing handed out. Before processing and once closed, the journal line alone
  // records it. An issued R keeps the check it relied on — a later export never changes it.
  const manifest: AnalysisExportRecord = { id: randomUUID(), at: new Date().toISOString(), by: (await getRoleContext()).email ?? "", preliminary, ...(lock ? { lockId: lock.id } : {}), sha256: sha256(bytes), ...manifestOf(out.sheets, out.counts.outside) };
  let recorded = false;
  const records = (st: string) => st === "processing" || st === "report";
  if (records(s!.status)) {
    try {
      await updateSchemeWith(id, (cur) => {
        if (!records(cur.status)) return {};
        recorded = true;
        return { analysisExports: [...(cur.analysisExports ?? []), manifest] };
      });
    } catch { return new Response("The file is ready, but what it sends could not be recorded — so it is not handed out. Try again.", { status: 503 }); }
  }
  const logged = await logActivity("results.exported_2_0", {
    schemeId: id,
    summary: `Exported to PTS_Analysis 2.0 (schema 2.1)${preliminary ? " — PRELIMINARY, the submission not locked" : ""}: ${out.counts.participants} participations, ${out.counts.results} result rows (${out.counts.nr} N/R)${out.counts.outside.length ? `; results outside the form, not in the file: ${out.counts.outside.join(", ")}` : ""}${out.counts.homogeneityDropped ? `; ${out.counts.homogeneityDropped} homogeneity values of characteristics not in the file left out` : ""}`,
    subject: `analysis-export:${manifest.id}`,
    after: { participants: out.counts.participants, results: out.counts.results, nr: out.counts.nr, outside: out.counts.outside, preliminary, homogeneityDropped: out.counts.homogeneityDropped, sigmaMismatch: gaps.sigmaMismatch, sha256: manifest.sha256, recorded },
  });
  if (!logged) {
    // nothing handed out — so nothing «sent» stays on record for a check to confirm (review)
    if (recorded) { try { await updateSchemeWith(id, (cur) => ({ analysisExports: (cur.analysisExports ?? []).filter((x) => x.id !== manifest.id) })); } catch (e) { console.error("[analysis export] the record of an export not handed out could not be taken back:", (e as Error)?.message ?? e); } }
    return new Response("The file is ready, but its journal entry could not be written — so it is not handed out. Try again.", { status: 503 });
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const name = `${s!.number.replace(/\//g, "-").replace(/[^\w-]+/g, "_")}_PTS_Analysis_input_v2.1${preliminary ? "_PRELIMINARY" : ""}_${stamp}.xlsx`;
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

// a HEAD would run GET — record an export and write its journal line for a file never handed out (review)
export const HEAD = () => new Response(null, { status: 405, headers: { allow: "GET" } });
