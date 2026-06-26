import type { Scheme, Lang, DocOptions } from "./types";
import type { Skin } from "../skins/types";
import { getDoc } from "./documents";
import { BODY_START, BODY_END, stripBodyMarkers, withSkin } from "./doc-shell";
import { COVER_MARK, stripCoverMark } from "./doc-css";
import { withFormCtx } from "./form-fields";
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

// The TITLE PAGE (cover) of a document, as editable HTML — extracted straight from
// the live render so the doc title, photo slot and contacts match exactly. Prefixed
// with COVER_MARK so the export pipeline knows the saved content carries its own
// cover and must not re-add the skin's. Returns "" for documents that have no
// generic cover (the Order memo / Certificate, whose head is already part of the body).
export function docCoverHtml(s: Scheme, key: string, lang: Lang, opts?: DocOptions, skin?: Skin): string {
  const def = getDoc(key);
  if (!def?.render) return "";
  const full = withSkin(skin ?? resolveSkin(s), () =>
    withFormCtx({ fill: false, values: s.formData?.[key] ?? {} }, () => def.render!(s, lang, opts))
  );
  const bs = full.indexOf(BODY_START);
  const pg = full.indexOf(PAGE_OPEN);
  if (bs < 0 || pg < 0 || pg > bs) return ""; // no generic cover region
  const region = full.slice(pg + PAGE_OPEN.length, bs);
  const cover = stripBodyMarkers(region).trim();
  return cover ? COVER_MARK + "\n" + cover : "";
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
  // render the shell (cover/footer/CSS) in the scheme's chosen skin, with any
  // saved form-field values for this document drawn into the controls.
  const full = withSkin(skin ?? resolveSkin(s), () =>
    withFormCtx({ fill: false, values: s.formData?.[key] ?? {} }, () => def.render!(s, lang, opts))
  );
  const b = bodyBounds(full);
  if (!b) return stripBodyMarkers(full);
  // When the saved content carries its OWN title page (COVER_MARK), replace from the
  // start of the page content (dropping the skin's regenerated cover) so the cover
  // isn't duplicated; otherwise replace only the body and keep the skin's cover.
  const hasOwnCover = editedBody.includes(COVER_MARK);
  let start = b.start;
  if (hasOwnCover) {
    const pg = full.indexOf(PAGE_OPEN);
    if (pg >= 0) start = pg + PAGE_OPEN.length;
  }
  // Wrap the edited body in a position:relative container — the same anchor the
  // Word editor uses for free/overlapping images — so absolutely-positioned photos
  // (placed in mm) land in the exact same spot in the PDF as in the editor.
  const wrapped = `<div class="pts-docbody" style="position:relative">\n${stripCoverMark(editedBody)}\n</div>`;
  return stripBodyMarkers(full.slice(0, start) + "\n" + wrapped + "\n" + full.slice(b.end));
}
