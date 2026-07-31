import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getScheme } from "@/lib/store";
import { getDoc, hasDocContent } from "@/lib/documents";
import { canLabFetchDoc } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { stripBodyMarkers, withSkin } from "@/lib/doc-shell";
import { resolveSkinAsync } from "@/skins";
import type { DocOptions } from "@/lib/types";

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ scheme: string; doc: string }> }) {
  const ls = await getLabSession();
  if (!ls) return new Response("Unauthorized", { status: 401 });

  const { scheme: schemeId, doc } = await ctx.params;

  // the lab must own a participation in this scheme
  const mine = (await listParticipationsForLab(ls.lab.id)).find((p) => p.schemeId === schemeId);
  if (!mine) return new Response("Forbidden", { status: 403 });

  const scheme = await getScheme(schemeId);
  const def = getDoc(doc);
  if (!scheme || !def) return new Response("Not found", { status: 404 });

  // RELEASE gate — participating is not enough. The dashboard only lists what was
  // released; the URL obeys the same rule, so a link can never outrun the screen:
  // no unreleased handout, no draft Final Report (it carries the whole cohort's
  // scores) and no certificate rendered with a lab's name and a blank number (§7.4).
  const allowed = canLabFetchDoc(doc, {
    sent: scheme.sentToParticipants,
    reported: scheme.status === "report" || scheme.status === "closed",
    hasCert: !!scheme.certificates?.[mine.code],
  });
  if (!allowed) return new Response("Not available yet", { status: 403 });

  // The provider's own file wins when it is the active version — same rule the
  // owner's documents page shows him, so both sides always see the same document.
  //
  // NEVER for the certificate. scheme.uploads holds ONE file per document slot,
  // shared by the whole cohort — fine for a document every participant receives
  // identically, but a certificate belongs to exactly one laboratory. Serving the
  // slot here would hand every lab whichever certificate was uploaded last (§4.2).
  // The certificate is always rendered, scoped to this participation's code.
  const up = doc === "certificate" ? undefined : scheme.uploads?.[doc];
  const preferBuilt = scheme.docActive?.[doc] === "built" && hasDocContent(scheme, doc);
  if (up && !preferBuilt) {
    return uploadedDocResponse(up, req.nextUrl.searchParams.get("download") === "1");
  }

  if (!def.render) return new Response("Not found", { status: 404 });
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "bg";

  // certificate → scoped to THIS lab's code only
  let opts: DocOptions | undefined;
  if (doc === "certificate") {
    const cert = scheme.certificates?.[mine.code];
    opts = { participant: { code: mine.code, labName: mine.labName, certNo: cert?.no, certDate: cert?.date } };
  }

  const skin = await resolveSkinAsync(scheme);
  const html = stripBodyMarkers(withSkin(skin, () => def.render!(scheme, lang, opts)));
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}
