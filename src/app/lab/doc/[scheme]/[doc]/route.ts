import type { NextRequest } from "next/server";
import { getLabSession } from "@/lib/lab-auth";
import { listParticipationsForLab } from "@/lib/participants";
import { getScheme } from "@/lib/store";
import { getDoc, hasDocContent, isFormDoc } from "@/lib/documents";
import { canLabFetchDoc } from "@/lib/doc-release";
import { uploadedDocResponse } from "@/lib/scheme-uploads";
import { docPrintHtml, docDefaultBody } from "@/lib/doc-template";
import { drawFormBody, retagFormBody } from "@/lib/form-hydrate";
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
  const skin = await resolveSkinAsync(scheme);

  // The certificate is GENERATED, one per participation, and must stay that way:
  // it is rendered fresh against this lab's own code and certificate number. It
  // deliberately does not go through the saved-body path below, because a saved
  // editor body is one shared document — serving it here would hand every lab the
  // same certificate.
  if (doc === "certificate") {
    const cert = scheme.certificates?.[mine.code];
    const opts: DocOptions = { participant: { code: mine.code, labName: mine.labName, certNo: cert?.no, certDate: cert?.date } };
    return html(stripBodyMarkers(withSkin(skin, () => def.render!(scheme, lang, opts))));
  }

  // Everything else: serve what the provider actually WROTE. He may compose a
  // document in the built-in editor instead of uploading a PDF, and until now the
  // laboratory received the blank default template while his edits sat unread in
  // scheme.docs — the same failure the uploaded-file path had. This mirrors his own
  // print route: saved body, form controls redrawn from the latest saved values,
  // dropped into the document's branded shell. Falls back to the default template
  // so the document is never blank.
  //
  // No participants are passed and names are never revealed, so anything the shell
  // or the default body renders about the cohort stays masked.
  const opts: DocOptions = { revealNames: false, participants: [] };
  let saved = scheme.docs?.[doc]?.[lang] ?? "";
  if (saved && isFormDoc(doc)) {
    saved = drawFormBody(
      retagFormBody(saved, docDefaultBody(scheme, doc, lang, opts)),
      scheme.formData?.[doc] ?? {},
    );
  }
  const body = saved || docDefaultBody(scheme, doc, lang, opts);
  return html(docPrintHtml(scheme, doc, lang, body, opts, skin));
}

function html(markup: string): Response {
  return new Response(markup, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}
