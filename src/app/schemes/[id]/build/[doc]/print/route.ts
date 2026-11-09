import type { NextRequest } from "next/server";
import { mayNow, requireCap, mayViewDoc } from "@/lib/access";
import { getScheme } from "@/lib/store";
import { getDoc, isFormDoc, isListDoc, isRestrictedDoc, savedDocBody, usableForDoc, showsIdentities } from "@/lib/documents";
import { listParticipants, withIdentities, withoutIdentity } from "@/lib/participants";
import { inRound } from "@/lib/application-model";
import { actorNow } from "@/lib/identities";
import { docPrintHtml, docDefaultBody } from "@/lib/doc-template";
import { drawFormBody, retagFormBody } from "@/lib/form-hydrate";
import { getRevision } from "@/lib/doc-revisions";
import { requireStaff } from "@/lib/roles";
import { resolveSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";
import { logActivity } from "@/lib/activity";
import { docImgSrc } from "@/lib/image-hosts";

// Renders the owner-built (Word-editor) document: the saved body HTML re-injected
// into the document's own branded shell (cover/head + footer + its CSS). Used by
// the editor's PDF export and the preview iframe.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  // Is this our own headless renderer? Established FIRST, because it decides both
  // who may read this route and whether a forwarded name-reveal flag is trustworthy.
  const internalToken = process.env.INTERNAL_TOKEN;
  const isInternal = !!internalToken && req.headers.get("x-internal-token") === internalToken;

  // Read gate — same reasoning as the sibling /doc/[doc]/print route: this serves a
  // whole confidential document, and the proxy deliberately fails OPEN on a missing
  // Supabase anon key, so the route guards itself. The headless PDF renderer carries
  // no session and is admitted by the internal token instead.
  if (!isInternal) await requireStaff();

  const { id, doc } = await ctx.params;
  if (!isInternal) await requireCap("codes.view", id); // in THIS scheme, by the role model (2.4)
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";

  // Data-driven documents (the lists) need the live participants in their shell.
  // Name guard (§4.2): only a manager sees real names on the two lists; everyone
  // else gets codes + a "confidential" placeholder. /api/pdf forwards the caller's
  // already-checked permission as a header, trusted ONLY with the valid internal
  // token; a direct navigation falls back to the viewer's own session role (an
  // auditor/staff can never coax names out this way).
  const reveal = isInternal
    ? req.headers.get("x-reveal") === "1"
    : await mayNow("names.view", id);
  // F 7.2.1-6 is the name↔code mapping itself: refused, not masked (part 0.2).
  if (isRestrictedDoc(doc) && !reveal) return new Response("Forbidden — only a manager may open this list (ISO/IEC 17043 §4.2).", { status: 403 });
  // the Order (Реш. 149, 2.6); under the internal token /api/pdf has asked already
  if (!isInternal && !(await mayViewDoc(doc, id))) return new Response("Forbidden — the Order is for the staff it assigns roles to (Реш. 149).", { status: 403 });
  // who is behind the codes only when it may be shown — an opening, on record (2.3);
  // under the internal token, the caller /api/pdf names is the one asking
  // the round's documents list the participations in it — never one refused, annulled or withdrawn (5.1)
  const coded = (await listParticipants(id)).filter(inRound);
  const ps = reveal && showsIdentities(doc)
    ? await withIdentities(coded, id, { actor: (isInternal && req.headers.get("x-actor")) || (await actorNow()), purpose: "names.view" })
    : coded.map(withoutIdentity);
  if (!isInternal && reveal && doc === "results-coded" && ps.length) await logActivity("names.viewed", { schemeId: id, subject: "doc:results-coded", summary: "Laboratory names shown with their codes — F 7.2.1-6 (composed)" });
  const opts: DocOptions = {
    revealNames: reveal,
    participants: ps.map((p) => ({
      code: p.code, labName: p.labName, country: p.country, contact: p.contact,
      email: p.email, phone: p.phone, deliveryAddress: p.deliveryAddress, participations: p.participations,
      courier: p.courier, sampleCode: p.sampleCode, characteristics: p.characteristics,
    })),
  };

  // ?rev=<id> previews a specific saved revision (the History page); else the
  // current saved body, falling back to the faithful default so it's never blank.
  const isList = isListDoc(doc);
  const revId = req.nextUrl.searchParams.get("rev");
  let saved = savedDocBody(scheme, doc)?.[lang] ?? "";
  if (revId) {
    const rev = await getRevision(revId);
    // a coded-list revision from before the swap is the other list's content
    if (rev && rev.schemeId === id && rev.docKey === doc) saved = usableForDoc(doc, rev) ? rev[lang] ?? "" : "";
  }
  // The participant lists are data-driven. A manager's saved CUSTOMIZATION is
  // honoured; for anyone else they render fresh from the live data (masked per
  // `reveal`) — a saved list body may carry real names, so it never reaches a
  // role that can't reveal them.
  if (isList && !reveal) saved = "";
  // A form document's edited body bakes control states as of edit time — redraw
  // them from the latest fill-saved values (data-ff identity; fields the fill
  // never saved keep the editor's state), so print matches the locked Fill view.
  // Legacy bodies (saved before data-ff) get identity re-attached from the
  // template first — the same positional mapping the Fill view uses.
  if (saved && isFormDoc(doc)) {
    saved = drawFormBody(
      retagFormBody(saved, docDefaultBody(scheme, doc, lang, opts)),
      scheme.formData?.[doc] ?? {}
    );
  }
  const body = saved || docDefaultBody(scheme, doc, lang, opts);
  const skin = await resolveSkinAsync(scheme);
  const html = docPrintHtml(scheme, doc, lang, body, opts, skin);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Strict CSP (see /doc/[doc]/print): the owner-built body is rich HTML, so
      // block scripts while allowing the fonts/images documents legitimately use.
      "content-security-policy":
        `default-src 'none'; img-src ${docImgSrc()}; style-src 'unsafe-inline' 'self'; font-src 'self'; frame-ancestors 'self'`,
      "x-content-type-options": "nosniff",
    },
  });
}
