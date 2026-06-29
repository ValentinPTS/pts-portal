import type { NextRequest } from "next/server";
import { getScheme } from "@/lib/store";
import { getDoc } from "@/lib/documents";
import { listParticipants } from "@/lib/participants";
import { docPrintHtml, docDefaultBody } from "@/lib/doc-template";
import { getRevision } from "@/lib/doc-revisions";
import { canRevealNamesNow } from "@/lib/roles";
import { resolveSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";

// Renders the owner-built (Word-editor) document: the saved body HTML re-injected
// into the document's own branded shell (cover/head + footer + its CSS). Used by
// the editor's PDF export and the preview iframe.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await ctx.params;
  const scheme = await getScheme(id);
  const def = getDoc(doc);
  if (!scheme || !def || !def.render) return new Response("Not found", { status: 404 });

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";

  // Data-driven documents (the lists) need the live participants in their shell.
  // Name guard (§4.2): only a manager sees real names on the two lists; everyone
  // else gets codes + a "confidential" placeholder — same as the auto print route.
  const reveal = await canRevealNamesNow();
  const ps = await listParticipants(id);
  const opts: DocOptions = {
    revealNames: reveal,
    participants: ps.map((p) => ({
      code: p.code, labName: p.labName, country: p.country, contact: p.contact,
      email: p.email, phone: p.phone, deliveryAddress: p.deliveryAddress, participations: p.participations,
    })),
  };

  // ?rev=<id> previews a specific saved revision (the History page); else the
  // current saved body, falling back to the faithful default so it's never blank.
  const isList = doc === "registered" || doc === "registered-coded";
  const revId = req.nextUrl.searchParams.get("rev");
  let saved = scheme.docs?.[doc]?.[lang] ?? "";
  if (revId) {
    const rev = await getRevision(revId);
    if (rev && rev.schemeId === id && rev.docKey === doc) saved = rev[lang] ?? "";
  }
  // The participant lists are data-driven — always render them fresh from the live
  // data (masked per `reveal`), never from saved HTML. This both honours the name
  // guard and stops a stale/edited copy from drifting from the real participants.
  if (isList) saved = "";
  const body = saved || docDefaultBody(scheme, doc, lang, opts);
  const skin = await resolveSkinAsync(scheme);
  const html = docPrintHtml(scheme, doc, lang, body, opts, skin);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Strict CSP (see /doc/[doc]/print): the owner-built body is rich HTML, so
      // block scripts while allowing the fonts/images documents legitimately use.
      "content-security-policy":
        "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}
