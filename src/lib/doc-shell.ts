import { AsyncLocalStorage } from "node:async_hooks";
import type { Scheme, Lang } from "./types";
import type { Skin } from "../skins/types";
import { esc, pick, BODY_START, BODY_END, stripBodyMarkers, DOC_CSS, FONTS_HREF } from "./doc-css";

// Shared branding shell for ALL generated documents. The look is provided by the
// active SKIN (see src/skins); the built-in "Classic" skin below is the strict PTS
// brand (green headings, red rules, PT Serif body, embroidery cover). Renderers
// compose these helpers unchanged — cover()/footer()/wrapDoc() delegate to whatever
// skin is active for the current render (set via withSkin()).
//
// The pure primitives (esc, pick, body markers, DOC_CSS, FONTS_HREF) live in
// doc-css.ts so the client-side skin editor can share them without bundling this
// module's node:async_hooks dependency. Re-exported here for the existing importers.
export { esc, pick, BODY_START, BODY_END, stripBodyMarkers, DOC_CSS } from "./doc-css";

// ── Skin engine ────────────────────────────────────────────────────────────

// The built-in skin = the current strict brand. (classicCover/classicFooter are
// function declarations defined below and hoisted, so this reference is valid.)
export const classicSkin: Skin = {
  meta: { id: "classic", name: "Classic", description: "The current PTS brand — green cover band, red rules, PT Serif body.", types: ["T", "C"] },
  css: DOC_CSS,
  fontsHref: FONTS_HREF,
  cover: classicCover,
  footer: classicFooter,
};

const skinCtx = new AsyncLocalStorage<Skin>();
// Render `fn` with `skin` active; renderers read it through cover()/footer()/wrapDoc().
export function withSkin<T>(skin: Skin, fn: () => T): T {
  return skinCtx.run(skin, fn);
}
function activeSkin(): Skin {
  return skinCtx.getStore() ?? classicSkin;
}

export function wrapDoc(lang: Lang, titleAttr: string, bodyHTML: string, extraCss = ""): string {
  const sk = activeSkin();
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(titleAttr)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${sk.fontsHref}" rel="stylesheet">
<style>${sk.css}${extraCss}</style>
</head>
<body><div class="page">${bodyHTML}</div></body>
</html>`;
}

// Classic cover/head (the built-in brand). Skins provide their own `cover`.
function classicCover(
  s: Scheme,
  lang: Lang,
  docTitleEn: string,
  docTitleBg: string,
  opts: { withImage?: boolean } = {}
): string {
  const inAcc = pick(lang, "in accordance with", "съгласно");
  return `<div class="cover">
    <div class="head"><img class="logo" src="/brand/logo.png" alt="PTS Bulgaria"><img class="tag" src="/brand/tagline.png" alt=""></div>
    <img class="emb" src="/brand/embroidery-border.png" alt="">
    <div class="docttl">${esc(pick(lang, docTitleEn, docTitleBg))}</div>
    <div class="inacc">${esc(inAcc)} ${esc(s.standard)}</div>
    <div class="schemeno">${esc(s.number)}</div>
    <div class="schemettl">${esc(pick(lang, s.titleEn, s.titleBg))}</div>
    ${opts.withImage && s.coverImage ? `<img class="coverimg" src="${s.coverImage}" alt="">` : ""}
  </div>`;
}

// Title page (cover) for the active skin, followed by the body-start marker.
export function cover(
  s: Scheme,
  lang: Lang,
  docTitleEn: string,
  docTitleBg: string,
  opts: { withImage?: boolean } = {}
): string {
  return activeSkin().cover(s, lang, docTitleEn, docTitleBg, opts) + BODY_START;
}

export function sec(n: number | string, en: string, bg: string, lang: Lang, body: string): string {
  return `<h2 class="sec"><span class="n">${n}.</span> ${esc(pick(lang, en, bg))}</h2><div class="body">${body}</div>`;
}

export function heading(en: string, bg: string, lang: Lang): string {
  return `<h2 class="sec">${esc(pick(lang, en, bg))}</h2>`;
}

function classicFooter(s: Scheme, formNumber: string): string {
  return `<div class="docfooter">${esc(s.revision)} · ${esc(formNumber)} · ${esc(s.revisionDate)}</div>`;
}

// Footer for the active skin, preceded by the body-end marker.
export function footer(s: Scheme, formNumber: string): string {
  return BODY_END + activeSkin().footer(s, formNumber);
}
