import type { NextRequest } from "next/server";
import { requireCap } from "@/lib/access";
import { actorNow } from "@/lib/identities";
import { randomUUID } from "crypto";
import { buildRoundExport } from "@/lib/round-export";
import { logActivity } from "@/lib/activity";
import { getDb } from "@/lib/supabase";

// «Изнеси целия кръг» (part 1.10, Реш. 136): the whole round as one ZIP.
//   ?part=coded → the coded part only — what the statistics expert may be given
// A manager's alone until part 2.4 brings the scheme manager and the coding expert.
// Every export is in the journal — the whole one also as an opening of the code ↔
// laboratory link — and no export goes out whose journal line was not written.
//
// Delivery: a Vercel function answers at most 4.5 MB, and a round with its scans is
// more. With a database the ZIP goes into the PRIVATE «round-exports» bucket and the
// browser is sent to a signed link valid five minutes; exports older than an hour are
// removed as the next one is made (they are copies of the round, not records).
// Locally (no database) the ZIP is the answer itself.
export const runtime = "nodejs";
export const maxDuration = 60;

const EXPORT_BUCKET = "round-exports";
const KEEP_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await requireCap("names.view", id); // the scheme manager and the coding expert (1.10, 2.4)
  const raw = req.nextUrl.searchParams.get("part");
  if (raw !== null && raw !== "all" && raw !== "coded") return new Response("Unknown part — use ?part=coded, or nothing for both.", { status: 400 });
  const want = raw === "coded" ? "coded" : "all";
  let out;
  try {
    out = await buildRoundExport(id, want, new Date(), await actorNow()); // the opening is on record (2.3)
  } catch (e) {
    // an export is whole, or it is not made
    console.error("[export] not made:", (e as Error)?.message ?? e);
    return new Response("The export could not be made — a part of the round could not be read. Nothing was exported; try again.", { status: 503 });
  }
  if (!out) return new Response("Not found", { status: 404 });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // «PTS 26/01-T-1» → «PTS_26-01-T-1»: the slash first, then anything else unsafe
  const name = `${out.scheme.number.replace(/\//g, "-").replace(/[^\w-]+/g, "_")}_${want === "coded" ? "coded" : "round"}${out.missing.length ? "_INCOMPLETE" : ""}_${stamp}.zip`;

  const logged = await logActivity("round.exported", {
    schemeId: id, subject: `export:${want}`,
    summary: `The round exported — ${want === "coded" ? "the coded part only" : "both parts (coded and identity)"}; ${out.files.length} files${out.missing.length ? `, ${out.missing.length} recorded files missing in storage` : ""}`,
  }) && (want === "coded" || await logActivity("names.viewed", { schemeId: id, subject: "export:identity", summary: "Laboratory names with their codes — in the round export (identity/)" }));
  if (!logged) return new Response("The export is ready, but its journal entry could not be written — so it is not handed out. Try again.", { status: 503 });

  const db = getDb();
  if (db) {
    try {
      const { data: bucket } = await db.storage.getBucket(EXPORT_BUCKET);
      if (!bucket) {
        const { error } = await db.storage.createBucket(EXPORT_BUCKET, { public: false });
        if (error && !/exist/i.test(error.message)) throw error;
      }
      // the copies an hour old go first
      const { data: old } = await db.storage.from(EXPORT_BUCKET).list("", { limit: 1000 });
      const stale = (old ?? []).filter((o) => o.created_at && Date.now() - Date.parse(o.created_at) > KEEP_MS).map((o) => o.name);
      if (stale.length) await db.storage.from(EXPORT_BUCKET).remove(stale);
      const path = `${Date.now()}-${randomUUID()}.zip`;
      const { error: ue } = await db.storage.from(EXPORT_BUCKET).upload(path, Buffer.from(out.zip), { contentType: "application/zip", upsert: false });
      if (ue) throw ue;
      const { data: signed, error: se } = await db.storage.from(EXPORT_BUCKET).createSignedUrl(path, 300, { download: name });
      if (se || !signed?.signedUrl) throw se ?? new Error("no signed link");
      return Response.redirect(signed.signedUrl, 303);
    } catch (e) {
      console.error("[export] storage hand-out failed:", (e as Error)?.message ?? e);
      // small enough for a function's answer → hand it out directly
      if (out.zip.length > 4_000_000) return new Response("The export was made but could not be handed out (storage). Try again in a moment.", { status: 503 });
    }
  }
  return new Response(out.zip as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
