import type { Scheme, Lang, DocOptions } from "./types";
import { getDoc, isFormDoc, savedDocBody } from "./documents";
import { stripCohortNames, stripPortalScores } from "./doc-release";
import { docPrintHtml, docDefaultBody } from "./doc-template";
import { drawFormBody, retagFormBody } from "./form-hydrate";
import { resolveSkinAsync } from "../skins";

// The cohort document a laboratory receives, as print-ready HTML — one file, the
// same for every participant (SENDABLE_DOCS). What the provider actually WROTE: the
// saved editor body with its form controls redrawn from the latest saved values,
// in the document's branded shell; the default template when nothing was built.
//
// Nothing about the cohort can be revealed: no participants are passed, names are
// never revealed, and a saved body is scrubbed of a participants table (§4.2) and
// of the portal's own scores (Реш. 135) — each replaced by a visible note.
//
// Used to freeze an edition (lib/editions, part 3.0) and, for a document released before
// freezing existed, by the lab route the first time it is opened.
export async function renderCohortDoc(scheme: Scheme, doc: string, lang: Lang): Promise<string> {
  const def = getDoc(doc);
  if (!def?.render) return "";
  const skin = await resolveSkinAsync(scheme);
  const opts: DocOptions = { revealNames: false, participants: [] };
  let saved = stripPortalScores(stripCohortNames(savedDocBody(scheme, doc)?.[lang] ?? "", lang), lang);
  if (saved && isFormDoc(doc)) {
    saved = drawFormBody(
      retagFormBody(saved, docDefaultBody(scheme, doc, lang, opts)),
      scheme.formData?.[doc] ?? {},
    );
  }
  const body = saved || docDefaultBody(scheme, doc, lang, opts);
  return docPrintHtml(scheme, doc, lang, body, opts, skin);
}
