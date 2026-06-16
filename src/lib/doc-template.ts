import type { Scheme, Lang, DocOptions } from "./types";
import type { Skin } from "../skins/types";
import { getDoc } from "./documents";
import { BODY_START, BODY_END, stripBodyMarkers, withSkin } from "./doc-shell";
import { resolveSkin } from "../skins";

// Bridges the faithful document renderers and the Word-like builder.
//
// Every renderer emits its content between the BODY_START / BODY_END markers
// (placed by the shared cover()/footer() helpers). From a fully-rendered
// document we can therefore:
//   • extract the editable BODY  → the Default-template the owner starts from;
//   • re-inject an edited BODY    → a faithful PDF that keeps the document's own
//     cover/head, footer and CSS (no per-document special-casing needed).

const PAGE_OPEN = '<div class="page">';

function bodyBounds(full: string): { start: number; end: number } | null {
  const end = full.indexOf(BODY_END);
  if (end < 0) return null;
  let start = full.indexOf(BODY_START);
  if (start >= 0) start += BODY_START.length;
  else {
    // documents without a generic cover (e.g. the Order memo, the Certificate
    // frame) have no BODY_START — the editable region begins at the page content.
    const pg = full.indexOf(PAGE_OPEN);
    if (pg < 0) return null;
    start = pg + PAGE_OPEN.length;
  }
  return start <= end ? { start, end } : null;
}

// Is there a live renderer (and therefore a faithful Default template) for this key?
export function hasDocTemplate(key: string): boolean {
  return !!getDoc(key)?.render;
}

// The editable body of a document, as the HTML the Word editor starts from.
export function docDefaultBody(s: Scheme, key: string, lang: Lang, opts?: DocOptions): string {
  const def = getDoc(key);
  if (!def?.render) return "";
  const full = def.render(s, lang, opts);
  const b = bodyBounds(full);
  if (!b) return "";
  return stripBodyMarkers(full.slice(b.start, b.end)).trim();
}

// A complete, faithful document HTML built from an EDITED body — the renderer's
// own cover/head, footer and CSS are kept; only the body region is replaced.
// Pass `skin` (resolved by the async-aware caller, so custom skins apply); when
// omitted it falls back to the sync built-in resolution.
export function docPrintHtml(
  s: Scheme, key: string, lang: Lang, editedBody: string, opts?: DocOptions, skin?: Skin
): string {
  const def = getDoc(key);
  if (!def?.render) return "";
  // render the shell (cover/footer/CSS) in the scheme's chosen skin
  const full = withSkin(skin ?? resolveSkin(s), () => def.render!(s, lang, opts));
  const b = bodyBounds(full);
  if (!b) return stripBodyMarkers(full);
  return stripBodyMarkers(full.slice(0, b.start) + "\n" + editedBody + "\n" + full.slice(b.end));
}
