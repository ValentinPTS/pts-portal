// The documents' typefaces are the portal's own: public/fonts/<slug>.css holds the
// @font-face rules of one family and public/fonts/<slug>/ its woff2 files and its
// licence (SIL Open Font License 1.1). They are a mirror of what Google Fonts served —
// same faces, weights and subsets, so a document looks exactly as before — made by
// scripts/mirror-fonts.mjs. Opening a document therefore never contacts Google
// (docs/participant-portal/PROCESSORS-BG.md, item 1 of «Четири неща за решение»).
//
// The hrefs are site-relative, like /brand/logo.png: they resolve against the portal,
// which serves every document — the render routes, the release copies, the PDF
// (/api/pdf anchors the markup with <base href>) and the skin editor's preview.
// Pure: no imports, safe for the browser bundle (the Word editor, the skin editor).

/** The two families of the PTS brand: the body and the headings. */
export const BRAND_FONTS = ["PT Serif", "Sofia Sans Condensed"];

/** "Source Serif 4" → "source-serif-4": the family's stylesheet and folder name. */
export const fontSlug = (family: string): string =>
  family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The portal's stylesheet for one family. */
export const fontHref = (family: string): string => `/fonts/${fontSlug(family)}.css`;

/** The <link> tags that load these families (each once). */
export function fontLinks(families: string[]): string {
  return [...new Set(families.map(fontHref))].map((h) => `<link href="${h}" rel="stylesheet">`).join("\n");
}

/** A copy frozen before the fonts moved here still names the old outside stylesheet
 *  (and its preconnect hints). It is served with the portal's own copies of the same
 *  families instead — the stored copy is not changed, only where its fonts come from,
 *  and the copy keeps its exact faces without its viewer's browser going to Google. */
export function localizeFontLinks(html: string): string {
  return html.replace(/<link\b[^>]*\bhref="https:\/\/fonts\.(?:googleapis|gstatic)\.com([^"]*)"[^>]*>\n?/gi, (_m, rest: string) => {
    if (!rest.startsWith("/css")) return ""; // a preconnect hint: nothing to fetch any more
    const families = [...rest.replace(/&amp;/g, "&").matchAll(/[?&]family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, " "));
    return families.length ? fontLinks(families) + "\n" : "";
  });
}
