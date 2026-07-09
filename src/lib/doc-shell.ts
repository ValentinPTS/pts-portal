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

// ── Contact strip shown on every document title page (matches the brand cards) ──
// Hardcoded brand contacts for now (a future Organization profile can override).
const PTS_CONTACTS = { web: "www.ptsbg.eu", email: "office@ptsbg.eu", phone: "+359 897 503 980" };
const ICO_GLOBE = `<svg viewBox="0 0 32 32" fill="none" stroke="#111" stroke-width="1.6"><circle cx="16" cy="16" r="13"/><ellipse cx="16" cy="16" rx="6.5" ry="13"/><line x1="3" y1="16" x2="29" y2="16"/><line x1="6" y1="9.5" x2="26" y2="9.5"/><line x1="6" y1="22.5" x2="26" y2="22.5"/></svg>`;
const ICO_MAIL = `<svg viewBox="0 0 32 32" fill="none" stroke="#111" stroke-width="1.6"><circle cx="16" cy="16" r="13"/><rect x="8.5" y="11" width="15" height="10.5" rx="1.5"/><path d="M8.7 11.6 16 17l7.3-5.4"/></svg>`;
const ICO_PHONE = `<svg viewBox="0 0 32 32" fill="#111" stroke="none"><circle cx="16" cy="16" r="13" fill="none" stroke="#111" stroke-width="1.6"/><path d="M13.1 9.2c.4 2 .9 3.1 1.5 4 .2.4.2.8-.1 1.1l-1 1c.9 1.6 2.1 2.8 3.7 3.7l1-1c.3-.3.7-.4 1.1-.2.9.6 2 1.1 4 1.5.5.1.8.5.8 1V24c0 .6-.5 1-1 1-6.8 0-12.3-5.5-12.3-12.3 0-.5.4-1 1-1H12c.6 0 1 .3 1.1.8z"/></svg>`;
export function contactsBar(): string {
  return `<div class="contacts">
    <div class="contact"><span class="ico">${ICO_GLOBE}</span><span class="ctext">${PTS_CONTACTS.web}</span></div>
    <div class="contact"><span class="ico">${ICO_MAIL}</span><span class="ctext">${PTS_CONTACTS.email}</span></div>
    <div class="contact"><span class="ico">${ICO_PHONE}</span><span class="ctext">${PTS_CONTACTS.phone}</span></div>
  </div>`;
}

// A neutral "drop the photo here" placeholder, used on the cover when no photo has
// been chosen yet. It's a normal <img> (an inline SVG data-URI) so in the editor it
// behaves like any picture: click to size, move, replace or remove it.
const COVER_PLACEHOLDER_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='560' height='320'>` +
  `<rect x='3' y='3' width='554' height='314' rx='16' fill='#f3f5f1' stroke='#b7d0c0' stroke-width='2.5' stroke-dasharray='11 9'/>` +
  `<g fill='none' stroke='#5f7d52' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>` +
  `<rect x='223' y='118' width='114' height='82' rx='11'/><circle cx='280' cy='160' r='23'/><path d='M249 118l10-17h42l10 17'/></g>` +
  `<text x='280' y='244' font-family='Segoe UI, sans-serif' font-size='21' font-weight='700' fill='#5f7d52' text-anchor='middle'>Cover photo</text>` +
  `<text x='280' y='270' font-family='Segoe UI, sans-serif' font-size='14' fill='#88a77b' text-anchor='middle'>click to add or replace</text></svg>`;
export const COVER_PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(COVER_PLACEHOLDER_SVG);

// The cover photo with the scheme's chosen size (% width) + placement (left/centre/
// right). When no photo is set yet it renders the placeholder above, so the title
// page always shows where the picture goes (the owner swaps it in the editor).
export function coverImgTag(s: Scheme): string {
  const w = typeof s.coverImageWidth === "number" && s.coverImageWidth > 0 ? Math.min(100, Math.round(s.coverImageWidth)) : 46;
  const margin = s.coverImageAlign === "left" ? "10px auto 10px 0" : s.coverImageAlign === "right" ? "10px 0 10px auto" : "10px auto";
  // The scheme's own photo, else the global default title-page photo (one upload →
  // every title page), else the placeholder prompting to add one.
  const url = s.coverImage || activeSkin().defaultCover || "";
  const empty = !url;
  const src = empty ? COVER_PLACEHOLDER : esc(url);
  // width (not max-width) so the owner can resize the photo freely in the editor —
  // up to the full content width (max-width:100% is the only ceiling).
  return `<img class="coverimg${empty ? " coverimg-empty" : ""}" data-cover="1" src="${src}" alt="" style="width:${w}%;max-width:100%;display:block;margin:${margin};">`;
}

// ── Skin engine ────────────────────────────────────────────────────────────

// The built-in skin = the current strict brand. (classicCover/classicFooter are
// function declarations defined below and hoisted, so this reference is valid.)
export const classicSkin: Skin = {
  meta: { id: "classic", name: "Classic", description: "The current PTS brand — green cover band, red rules, PT Serif body.", types: ["T", "C"] },
  css: DOC_CSS,
  fontsHref: FONTS_HREF,
  cover: classicCover,
  footer: classicFooter,
  sideBorder: true, // the PTS brand always carries the embroidery side border
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
<body>${sk.sideBorder !== false ? `<div class="doc-side" aria-hidden="true"></div>` : ""}<div class="page">${bodyHTML}</div></body>
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
    <img class="emb" src="/brand/embroidery-border.png" alt="">
    <div class="schemeno">№ ${esc(s.number)}</div>
    <div class="schemettl">${esc(pick(lang, s.titleEn, s.titleBg))}</div>
    ${coverImgTag(s)}
    ${contactsBar()}
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

// A lighter top for utility forms (Application, Declaration, Protocol, Instruction,
// Results, Feedback, the participant lists): the brand logo + an embroidery band +
// the centred document title — NO full title page, photo or contacts. Followed by
// the body-start marker, so it honours the same contract as cover().
export function docHeader(s: Scheme, lang: Lang, docTitleEn: string, docTitleBg: string): string {
  void s;
  // Wrapped in a white band that bleeds left over the embroidery side strip, so the
  // side embroidery visually starts at the first section (not beside the logo/title).
  return `<div class="dochead-wrap">
    <div class="dochead">
      <img class="logo" src="/brand/logo.png" alt="PTS Bulgaria">
      <span class="hband" aria-hidden="true"></span>
    </div>
    <div class="docttl2">${esc(pick(lang, docTitleEn, docTitleBg))}</div>
  </div>` + BODY_START;
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
