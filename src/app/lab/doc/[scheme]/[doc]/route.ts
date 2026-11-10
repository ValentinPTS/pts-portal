import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { isStarted, listVisibleParticipations } from "@/lib/visibility";
import { getScheme, updateSchemeWith } from "@/lib/store";
import { logActivity, logAs } from "@/lib/activity";
import { getParticipantSession, participationsOf } from "@/lib/participant-session";
import { releaseFor, RELEASE_LEVEL_LABEL, type ReleaseViewer } from "@/lib/release-model";
import { listParticipants } from "@/lib/participants";
import { inFinalRound } from "@/lib/announcement-model";
import { getDoc } from "@/lib/documents";
import { canLabFetchDoc, isSendableDoc } from "@/lib/doc-release";
import { editionResponse, freezeNow, getEdition, issueEdition, latestEdition, sameAs, servable, reissueReason, amendmentStampFor, type DocEdition } from "@/lib/editions";
import { isAmendedDoc, needsAmendment } from "@/lib/amendments-model";
import { editionLabel } from "@/lib/editions-model";
import type { Scheme } from "@/lib/types";
import { stripBodyMarkers, withSkin } from "@/lib/doc-shell";
import { resolveSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";
import { labCertificate } from "@/lib/cert-number";
import { docImgSrc } from "@/lib/image-hosts";
import { issueInForce, reaches, rLabel } from "@/lib/report-issue-model";

// Lab-scoped document view. A laboratory can fetch ONLY:
//   • documents for a scheme it actually participates in (verified by lab_id),
//   • that the provider has RELEASED to the participants (lib/doc-release), and
//   • its OWN certificate (scoped to its own code — never another lab's).
//
// What it gets back is what the provider actually put in the slot. He writes his
// documents in Word and exports PDF, so when an uploaded file is the active
// version the BYTES are streamed; only when the document was built in the app is
// print-ready HTML rendered. Serving the app's empty template while his real PDF
// sat unread in the slot was the gap this closes.
//
// The participant LISTS (F 7.2.1-4/-5/-6) and the provider's planning papers can
// never be released at all — see SENDABLE_DOCS (§4.2).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Served = { res: Response; log?: { code: string; subject: string; summary: string; actor: string } };

async function serve(req: NextRequest, ctx: { params: Promise<{ scheme: string; doc: string }> }): Promise<Served> {
  // a laboratory account (since 2a) or a user of a legal entity (4.4) — each acts for its
  // own participations only; the user also for releases made to it by name (5.4)
  const ls = await getLabSession();
  const ps = ls ? null : await getParticipantSession().catch(() => null);
  if (!ls && !ps) return { res: new Response("Unauthorized", { status: 401 }) };

  const { scheme: schemeId, doc } = await ctx.params;
  const scheme = await getScheme(schemeId);
  const def = getDoc(doc);
  if (!scheme || !def) return { res: new Response("Not found", { status: 404 }) };

  // its participations in THIS scheme — a started one (Реш. 147); the one asked for by ?p, else the first
  const asked = req.nextUrl.searchParams.get("p");
  let ours: { id: string; code: string; labName?: string }[];
  if (ls) ours = (await listVisibleParticipations(ls.lab.id)).filter((p) => p.schemeId === schemeId).map((p) => ({ id: p.id, code: p.code, labName: p.labName }));
  else ours = isStarted(scheme) ? (await participationsOf(ps!)).filter((p) => p.schemeId === schemeId).map((p) => ({ id: p.participantId, code: p.code })) : [];
  const mine = ours.find((x) => x.id === asked) ?? ours[0];
  if (!mine) return { res: new Response("Forbidden", { status: 403 }) };
  // the release that reaches THIS participation (the one its page lists), and this user by name (5.4 review)
  const viewer: ReleaseViewer = { participantIds: [mine.id], ...(ps ? { userId: ps.user.id } : {}) };
  const actor = ls ? ls.userId : ps!.user.id;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";
  const download = req.nextUrl.searchParams.get("download") === "1";

  // RELEASE gate — participating is not enough. The dashboard only lists what was
  // released; the URL obeys the same rule, so a link can never outrun the screen:
  // no unreleased handout, no draft Final Report (it carries the whole cohort's
  // scores) and no certificate rendered with a lab's name and a blank number (§7.4).
  // A handout reaches it at one of three levels — every participant, its participation,
  // or this user by name (5.4) — the latest release that reaches it.
  // …only while the participation goes on in the round: refused, annulled, withdrawn or
  // off the final list, it is given nothing more (5.1, 5.2; 5.4 review)
  const coded = (await listParticipants(schemeId)).find((p) => p.id === mine.id);
  const goingOn = !!coded && inFinalRound(scheme, coded);
  const reaching = isSendableDoc(doc) && goingOn ? releaseFor(scheme, doc, viewer) : null;
  const allowed = isSendableDoc(doc) ? !!reaching
    : canLabFetchDoc(doc, {
      sent: scheme.sentToParticipants,
      reported: scheme.status === "report" || scheme.status === "closed",
      hasCert: !!ls && !!labCertificate(scheme.certificates, mine.code), // a certificate: the laboratory account's (names, §7.4)
      // an issued R stays the official report whatever the uploads slot holds now (7.4 review)
      officialReport: !!scheme.uploads?.report || !!issueInForce(scheme.reportIssues),
    });
  if (!allowed) return { res: new Response("Not available yet", { status: 403 }) };
  const opened = (ed: DocEdition, level: string) => ({ code: mine.code, actor, subject: `edition:${ed.id}`, summary: `“${doc}” ${editionLabel("en", ed.no, ed.issuedOn)} opened by the laboratory — ${level}` });

  // The report is served ONLY as PTS's uploaded file — never the portal's own
  // render or an editor body, which carry portal-computed scores (Реш. 135, 0.6) —
  // and as an EDITION of it (3.0): its latest, so a replaced file reaches the
  // laboratories only when PTS issues it as the next edition, with its note
  // (ISO/IEC 17043 §7.4.3: an amended report is identified as such).
  if (doc === "report") {
    // 7.4: once issued by the act — the R in force, never a later edition; and only to a
    // participation it reaches: marked paid, or opened by hand (D7)
    const inForce = issueInForce(scheme.reportIssues);
    if (inForce) {
      if (!reaches(scheme.reportAccess, mine.code)) return { res: new Response("The final report is issued — it opens for you once your payment is marked.", { status: 403 }) };
      const ed = await getEdition(inForce.editionId).catch(() => null);
      if (!ed || ed.schemeId !== scheme.id || ed.docKey !== "report") return { res: new Response("The final report cannot be opened right now. Try again in a moment.", { status: 503 }) };
      return { res: await editionResponse(ed, "bg", download), log: opened(ed, `the final report ${rLabel(inForce.r)}`) };
    }
    if (!scheme.uploads?.report) return { res: new Response("Not available yet", { status: 403 }) };
    const ed = await reportEdition(scheme).catch((e) => {
      console.warn("[editions] could not find or keep the report's edition:", (e as Error)?.message ?? e);
      return null;
    });
    return ed ? { res: await editionResponse(ed, "bg", download), log: opened(ed, "the final report") } : { res: new Response("The final report cannot be opened right now. Try again in a moment.", { status: 503 }) };
  }

  // A released handout is served AS THE EDITION IT WENT OUT AS (part 3.0) — the one of
  // the release that reaches this laboratory (5.4): that edition's frozen file, never a
  // fresh render, so later edits reach it only as a later edition. NEVER the live
  // document instead (N5, closed for good in 5.4): an edition that cannot be read or
  // kept answers «try again», not whatever the document is now.
  if (reaching) {
    const ed = await (reaching.level === "all" ? releasedEdition(scheme, doc) : targetEdition(scheme, doc, reaching.editionId)).catch((e) => {
      console.warn("[editions] could not find or keep the released edition:", (e as Error)?.message ?? e);
      return null;
    });
    if (ed) return { res: await editionResponse(ed, lang, download), log: opened(ed, RELEASE_LEVEL_LABEL[reaching.level].en) };
    return { res: new Response("This document cannot be opened right now. Try again in a moment.", { status: 503 }) };
  }

  // The certificate is GENERATED, one per participation, and must stay that way:
  // it is rendered fresh against this lab's own code and certificate number. It
  // deliberately does not go through the saved-body path, because a saved editor
  // body is one shared document — serving it here would hand every lab the same
  // certificate (§4.2). Never the cohort's uploaded slot either.
  if (doc === "certificate" && def.render) {
    const skin = await resolveSkinAsync(scheme);
    const cert = labCertificate(scheme.certificates, mine.code);
    const opts: DocOptions = { participant: { code: mine.code, labName: mine.labName ?? "", certNo: cert?.no, certDate: cert?.date } };
    return { res: html(stripBodyMarkers(withSkin(skin, () => def.render!(scheme, lang, opts)))), log: { code: mine.code, actor, subject: `certificate:${mine.code}`, summary: "The laboratory's certificate opened" } };
  }
  return { res: new Response("Not found", { status: 404 }) };
}

// The edition a release to one participation or one user went out as (5.4).
async function targetEdition(scheme: Scheme, doc: string, editionId?: string): Promise<DocEdition | null> {
  if (!editionId) return null;
  const ed = await getEdition(editionId);
  return ed && ed.schemeId === scheme.id && ed.docKey === doc ? ed : null;
}

function html(markup: string): Response {
  return new Response(markup, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        `default-src 'none'; img-src ${docImgSrc()}; style-src 'unsafe-inline' 'self'; font-src 'self'; frame-ancestors 'self'`,
      "x-content-type-options": "nosniff",
    },
  });
}

// Every download through this gate is in the journal (part 1.9; Реш. 50 «кой го е
// свалил»): which edition, at which level, by which participation's code and account —
// the laboratory is never named (§4.2).
export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; doc: string }> }) {
  const { res, log } = await serve(req, ctx);
  if ((res.status === 200 || res.status === 206) && log) {
    const p = await ctx.params;
    await logAs({ kind: "lab", userId: log.actor }, "file.downloaded", { schemeId: p.scheme, targetCode: log.code, subject: log.subject, summary: log.summary });
  }
  return res;
}

// The edition this released document went out as — or, for one released before
// editions existed, the one kept now: the latest edition if the document is still
// what it froze, else the next one, by the system, saying why (the first request
// to record it wins; any other uses that one).
async function releasedEdition(scheme: Scheme, doc: string): Promise<DocEdition | null> {
  const rec = scheme.releasedEditions?.[doc];
  if (rec) {
    const ed = await getEdition(rec.id);
    return ed && ed.schemeId === scheme.id && ed.docKey === doc ? ed : null;
  }
  const [now, latest] = await Promise.all([freezeNow(scheme, doc), latestEdition(scheme.id, doc)]);
  if (!now) return null;
  const stamp = amendmentStampFor(scheme, latest);
  const same = !!latest && sameAs(now, latest, stamp);
  let ed: DocEdition | null = latest && same && (await servable(latest)) ? latest : null;
  // an opened scheme's plan or invitation, changed since its latest edition, goes out
  // only by an amendment (3.3): its latest edition is what the participants get — a
  // first opening never issues the change
  if (!ed && latest && !same && isAmendedDoc(doc) && needsAmendment(scheme)) ed = (await servable(latest)) ? latest : null;
  else if (!ed) {
    const r = await issueEdition({
      scheme, docKey: doc, frozen: now, by: "system:first-opening", amendment: same ? stamp : undefined,
      reason: latest && same ? reissueReason(latest.no)
        : "Запазена при първото отваряне от участник — документът е изпратен преди въвеждането на редакциите (част 3.0).",
    });
    if (r.ok) {
      ed = r.edition;
      await logActivity("doc.edition", { schemeId: scheme.id, subject: `edition:${ed.id}`, summary: `${editionLabel("en", ed.no, ed.issuedOn)} of “${doc}” kept on its first opening (released before editions existed)` });
    } else if (r.error === "conflict") {
      ed = await latestEdition(scheme.id, doc); // another opening kept it a moment earlier: that one
    }
    if (!ed) return null;
  }
  if (!ed) return null;
  let served: DocEdition = ed;
  let otherId: string | null = null;
  await updateSchemeWith(scheme.id, (s) => {
    const had = s.releasedEditions?.[doc];
    if (had) { otherId = had.id; return {}; }
    if (!s.sentToParticipants?.[doc]) return {}; // withdrawn meanwhile: nothing to record
    return { releasedEditions: { ...(s.releasedEditions ?? {}), [doc]: { id: ed!.id, no: ed!.no, at: s.sentToParticipants[doc] } } };
  });
  if (otherId) served = (await getEdition(otherId)) ?? ed;
  return served;
}

// The final report's edition a laboratory is served: the latest issued — or, when
// none is yet, edition 1 of the uploaded file, kept on this first opening.
async function reportEdition(scheme: Scheme): Promise<DocEdition | null> {
  const latest = await latestEdition(scheme.id, "report");
  if (latest) return latest;
  const now = await freezeNow(scheme, "report");
  if (!now) return null;
  const r = await issueEdition({ scheme, docKey: "report", frozen: now, by: "system:first-opening", reason: "Окончателният доклад — запазен при първото отваряне от участник (част 3.0)." });
  if (r.ok) {
    await logActivity("doc.edition", { schemeId: scheme.id, subject: `edition:${r.edition.id}`, summary: `${editionLabel("en", r.edition.no, r.edition.issuedOn)} of “report” kept on its first opening by a participant` });
    return r.edition;
  }
  return r.error === "conflict" ? latestEdition(scheme.id, "report") : null;
}
