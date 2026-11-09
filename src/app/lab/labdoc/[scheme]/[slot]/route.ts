import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { getParticipantSession, participationsOf } from "@/lib/participant-session";
import { listVisibleParticipations, isStarted } from "@/lib/visibility";
import { getScheme } from "@/lib/store";
import { isLabDocSlot } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { logAs } from "@/lib/activity-store";

// A participation downloads a document addressed to IT — today the proforma invoice.
// To a laboratory's account and, since 5.5, to every user of its legal entity (design §6:
// «Всички потребители на организацията виждат и свалят проформата») — each only for its
// own participations, as the document route decides (5.4).
//
// The code is never taken from the URL: it is resolved from the reader's OWN
// participations, so it can only ever reach a slot belonging to a participation it holds.
//
// ?p= names WHICH participation, because one laboratory can hold more than one in the same
// scheme and each has its own code and its own invoice. It is matched against the reader's
// own list, so an id belonging to anyone else simply does not match. Absent → the first,
// which is what a link written before this parameter existed means.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Served = { res: Response; log?: { code: string; actor: string } };

async function serve(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }): Promise<Served> {
  const ls = await getLabSession();
  const ps = ls ? null : await getParticipantSession().catch(() => null);
  if (!ls && !ps) return { res: new Response("Unauthorized", { status: 401 }) };
  const { scheme: schemeId, slot } = await ctx.params;
  if (!isLabDocSlot(slot)) return { res: new Response("Not found", { status: 404 }) };
  const scheme = await getScheme(schemeId);
  if (!scheme) return { res: new Response("Not found", { status: 404 }) };
  // its participations in THIS scheme — a started one (Реш. 147)
  const ours = ls
    ? (await listVisibleParticipations(ls.lab.id)).filter((p) => p.schemeId === schemeId).map((p) => ({ id: p.id, code: p.code }))
    : isStarted(scheme) ? (await participationsOf(ps!)).filter((p) => p.schemeId === schemeId).map((p) => ({ id: p.participantId, code: p.code })) : [];
  const wanted = req.nextUrl.searchParams.get("p");
  const mine = ours.find((p) => p.id === wanted) ?? ours[0];
  if (!mine) return { res: new Response("Forbidden", { status: 403 }) };
  const up = scheme.labDocs?.[mine.code]?.[slot];
  if (!up) return { res: new Response("Not found", { status: 404 }) };
  return { res: await uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1"), log: { code: mine.code, actor: ls ? ls.userId : ps!.user.id } };
}

// Every download through this gate is in the journal (part 1.9): which participation's
// code, which account, when — the laboratory is never named (§4.2).
export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; slot: string }> }) {
  const { res, log } = await serve(req, ctx);
  if ((res.status === 200 || res.status === 206) && log) {
    const p = await ctx.params;
    await logAs({ kind: "lab", userId: log.actor }, "file.downloaded", { schemeId: p.scheme, targetCode: log.code, subject: `labdoc:${p.slot}`, summary: "A laboratory downloaded a document addressed to it" });
  }
  return res;
}
