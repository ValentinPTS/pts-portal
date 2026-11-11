// Sanitizer for USER-AUTHORED document HTML (the Word-like editor's body). It runs
// in three places — on save (server), before re-injecting the body into the printed
// shell (server), and before loading saved HTML into the contentEditable (client) —
// so a document can never carry active content that runs in the app origin when
// another staff member opens it, nor script into the PDF render, nor a picture that
// makes its viewer's browser open one of the portal's own pages.
//
// Defense in depth: only authenticated staff can author documents, and the print
// routes also send a strict no-script CSP. This is the belt to that CSP's braces.
// It is intentionally isomorphic (pure string ops, no DOM) so the exact same rules
// apply on the server and in the browser, and dependency-free (no DOMPurify) to keep
// the bundle small.
//
// How (the security sweep, round 3 — R3S-1/2/3): the body is READ AS A BROWSER READS IT,
// in one linear pass — tags, their attributes (quotes, «/» and a closing quote as separators,
// the first of two same-named attributes winning), comments and their odd endings — and
// every tag is decided on what the browser will see, never on what a pattern guessed. A
// tag that passes is kept byte for byte (the built-in documents come out unchanged); one
// that does not is rebuilt from what passed; text never carries a «<» that could start a
// tag (nor one that a dropped token would join to what follows); a tag cut off at the end is
// dropped, as the browser drops it.
//
// What it KEEPS: all the formatting the editor produces — p/h1-3/div/span, b/strong,
// i/em/u, ul/ol/li, tables, br, a (http/https/mailto/tel and relative links), img (inline
// data:image, the portal's /brand/ pictures, its own storage and ptsbg.eu), MathML, SVG,
// and the class/style/src/alt/href/colspan/rowspan/width/height/data-* attributes. It
// keeps plain comments (the cover's marker included).
//
// What it REMOVES: script/style/iframe/textarea/title/xmp/noembed/noframes/noscript/
// plaintext/template WITH what is in them; object/embed/link/meta/base/form/frame/
// frameset/applet and SVG's animation elements as tags; every on…= handler, srcdoc,
// formaction, srcset, ping; a link to anything but http/https/mailto/tel or a relative
// address; a picture from anywhere but the portal's places (a relative one only under
// /brand/, as the browser resolves it); a style that loads from elsewhere or calls
// anything but the ordinary CSS functions; and any attribute holding a script's scheme.

import { imageUrlAllowed } from "./image-hosts";

// ── what is dropped ─────────────────────────────────────────────────────────────────
// Elements whose content the browser reads as raw text (or never shows): dropped with
// everything up to their end tag — the content is never read as markup by us, so the
// «<p title="</xmp><img onerror=…>">» class has nothing to hide behind.
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "textarea", "title", "xmp", "noembed", "noframes", "noscript", "plaintext", "template",
]);
// Elements dropped as tags (their children, sanitized, stay).
const DROP_TAG = new Set([
  "object", "embed", "link", "meta", "base", "form", "frame", "frameset", "applet", "portal", "fencedframe",
  "animate", "animatemotion", "animatetransform", "animatecolor", "set", "discard", "handler", "listener",
  "html", "head", "body", "isindex", "keygen", "param",
]);
// Attributes never kept: an iframe's inline document, a list of pictures from anywhere, a ping on
// every click, a form's target — and a button's hold on the editor page's own forms, popovers and
// dialogs (form=, form…=, popovertarget=, commandfor=).
const DROP_ATTR = new Set(["srcdoc", "srcset", "imagesrcset", "ping", "action", "http-equiv", "popovertarget",
  "popovertargetaction", "commandfor", "command", "interestfor"]);
// Attributes that fetch what they name, wherever they stand.
const PICTURE_ATTR = new Set(["src", "lowsrc", "dynsrc", "background", "poster", "data", "longdesc"]);
// Attributes that are only ever words (never read as a URL or as CSS).
const TEXT_ATTR = new Set(["title", "alt", "placeholder", "value", "label", "class", "id", "name", "lang", "dir", "content", "summary", "abbr"]);
const SAFE_LINK_SCHEME = new Set(["http", "https", "mailto", "tel"]);
const SCRIPTISH = /(?:java|vb|live)script:|data:text\/html/;

// ── character references, as the browser reads them inside an attribute ───────────────
// Every named reference that yields an ASCII character (the rest yield none — they cannot
// make a scheme, a path or CSS syntax). One this check does not know refuses the value.
const NAMED: Record<string, string> = {
  Tab: "\t", NewLine: "\n", excl: "!", quot: '"', QUOT: '"', num: "#", dollar: "$", percnt: "%", amp: "&", AMP: "&",
  apos: "'", lpar: "(", rpar: ")", ast: "*", midast: "*", plus: "+", comma: ",", period: ".", sol: "/", colon: ":",
  semi: ";", lt: "<", LT: "<", equals: "=", gt: ">", GT: ">", quest: "?", commat: "@", lsqb: "[", lbrack: "[",
  bsol: "\\", rsqb: "]", rbrack: "]", Hat: "^", lowbar: "_", UnderBar: "_", grave: "`", DiacriticalGrave: "`",
  lcub: "{", lbrace: "{", verbar: "|", vert: "|", VerticalLine: "|", rcub: "}", rbrace: "}", fjlig: "fj",
  nvlt: "<\u20d2", nvgt: ">\u20d2", bne: "=\u20e5", nbsp: "\u00a0", NonBreakingSpace: "\u00a0", shy: "\u00ad",
};
// The references a browser also reads WITHOUT a «;» (the legacy ones): those yielding ASCII,
// and the rest as one opaque non-ASCII character (inert for every check here).
const LEGACY_ASCII: Record<string, string> = { amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"' };
const LEGACY_OTHER = new Set(("AElig Aacute Acirc Agrave Aring Atilde Auml COPY Ccedil ETH Eacute Ecirc Egrave Euml Iacute " +
  "Icirc Igrave Iuml Ntilde Oacute Ocirc Ograve Oslash Otilde Ouml REG THORN Uacute Ucirc Ugrave Uuml Yacute aacute acirc " +
  "acute aelig agrave aring atilde auml brvbar ccedil cedil cent copy curren deg divide eacute ecirc egrave eth euml frac12 " +
  "frac14 frac34 iacute icirc iexcl igrave iquest iuml laquo macr micro middot nbsp not ntilde oacute ocirc ograve ordf ordm " +
  "oslash otilde ouml para plusmn pound raquo reg sect shy sup1 sup2 sup3 szlig thorn times uacute ucirc ugrave uml uuml " +
  "yacute yen yuml").split(" "));

const isAlpha = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isAlnum = (c: number) => isAlpha(c) || isDigit(c);
const isHex = (c: number) => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
// the tokenizer's whitespace (a CR is a LF once the browser has normalised the input)
const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

function numericRef(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "\ufffd";
  // the C1 range is read as Windows-1252 — none of those is ASCII
  if (cp >= 0x80 && cp <= 0x9f) return "\ufffd";
  return String.fromCodePoint(cp);
}

/** An attribute's value as the browser decodes it, or null when it holds a reference this cannot read. */
function decodeAttr(raw: string): string | null {
  if (raw.indexOf("&") < 0) return raw;
  let out = "", i = 0;
  const n = raw.length;
  for (;;) {
    const amp = raw.indexOf("&", i);
    if (amp < 0) return out + raw.slice(i);
    out += raw.slice(i, amp);
    let k = amp + 1;
    if (raw.charCodeAt(k) === 35 /* # */) {
      k++;
      const hex = raw.charCodeAt(k) === 120 || raw.charCodeAt(k) === 88;
      if (hex) k++;
      const start = k;
      while (k < n && (hex ? isHex(raw.charCodeAt(k)) : isDigit(raw.charCodeAt(k)))) k++;
      if (k === start) { out += raw.slice(amp, k); i = k; continue; } // «&#» with no digits: as written
      const digits = raw.slice(start, k).replace(/^0+/, "");
      const cp = digits.length > 8 ? 0x110000 : parseInt(digits || "0", hex ? 16 : 10);
      if (raw.charCodeAt(k) === 59) k++;
      out += numericRef(cp);
      i = k;
      continue;
    }
    while (k < n && isAlnum(raw.charCodeAt(k))) k++;
    const name = raw.slice(amp + 1, k);
    if (!name) { out += "&"; i = amp + 1; continue; }
    if (raw.charCodeAt(k) === 59 /* ; */) {
      const ch = NAMED[name] ?? LEGACY_ASCII[name] ?? (LEGACY_OTHER.has(name) ? "\ufffd" : undefined);
      if (ch === undefined) return null;
      out += ch;
      i = k + 1;
      continue;
    }
    // no «;»: only a legacy name, and in an attribute not when «=» follows
    if (raw.charCodeAt(k) !== 61 /* = */ && (name in LEGACY_ASCII || LEGACY_OTHER.has(name))) {
      out += LEGACY_ASCII[name] ?? "\ufffd";
    } else out += raw.slice(amp, k);
    i = k;
  }
}

// a URL as the URL parser reads it: no leading/trailing controls or spaces, no tab or newline anywhere
// (trimmed by a scan — a «[…]+$» pattern is quadratic on a long run of spaces)
function urlFlat(v: string): string {
  let a = 0, b = v.length;
  while (a < b && v.charCodeAt(a) <= 32) a++;
  while (b > a && v.charCodeAt(b - 1) <= 32) b--;
  return v.slice(a, b).replace(/[\t\n\r]/g, "");
}

/** May a link (href on a/area) go here? Only http/https/mailto/tel and addresses on the portal itself. */
function linkSafe(raw: string): boolean {
  const v = decodeAttr(raw);
  if (v === null) return false;
  const flat = urlFlat(v).replace(/\\/g, "/").toLowerCase();
  if (flat === "") return true;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(flat);
  if (m) return SAFE_LINK_SCHEME.has(m[1]);
  return !flat.startsWith("//"); // never protocol-relative («\\host» too, read as «//host»)
}

const PORTAL = "https://portal.invalid";
const RASTER = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]/;

/** May this be fetched as a picture? Only inline pictures, the portal's own /brand/ (as the browser
 *  resolves it — «/brand/../lab/…» is not), its storage and ptsbg.eu (R2S-10, R3S-2). */
function pictureUrlSafe(decoded: string, opts: { svgData?: boolean; fragment?: boolean } = {}): boolean {
  const flat = urlFlat(decoded);
  if (flat === "") return true;
  const lower = flat.toLowerCase();
  if (opts.fragment && flat.startsWith("#")) return true; // an SVG reference inside the document itself
  if (lower.startsWith("data:")) return RASTER.test(lower) || (!!opts.svgData && lower.startsWith("data:image/svg+xml"));
  const m = /^([a-z][a-z0-9+.-]*):/.exec(lower);
  if (m) {
    if ((m[1] !== "http" && m[1] !== "https") || !imageUrlAllowed(flat)) return false;
    // on the portal's own address (it may live on a ptsbg.eu name) only /brand/, as a relative one
    let u: URL;
    try { u = new URL(flat); } catch { return false; }
    return !portalHosts().includes(u.host.toLowerCase()) || BRAND_PATH.test(u.pathname);
  }
  if (/^[\\/]{2}/.test(flat)) return false; // protocol-relative
  let u: URL;
  try { u = new URL(flat, `${PORTAL}/doc/page`); } catch { return false; }
  return u.origin === PORTAL && BRAND_PATH.test(u.pathname);
}
const BRAND_PATH = /^\/brand\/[A-Za-z0-9._\-/]+$/;
/** The portal's own host(s): its fixed address, and in a browser the page's own. */
function portalHosts(): string[] {
  const hosts: string[] = [];
  try { const site = process.env.NEXT_PUBLIC_SITE_URL; if (site) hosts.push(new URL(site).host.toLowerCase()); } catch { /* none set */ }
  try { const here = (globalThis as { location?: { host?: string } }).location?.host; if (here) hosts.push(here.toLowerCase()); } catch { /* not a browser */ }
  return hosts;
}

// ── CSS (a style attribute, or an SVG attribute read as CSS) ─────────────────────────
// The ordinary functions; any other — image-set(), image(), cross-fade(), element(), paint(),
// src(), expression(), attr() — refuses the whole value (R3S-2).
const CSS_FUNCS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark",
  "calc", "min", "max", "clamp", "var", "round", "mod", "rem", "abs", "sign",
  "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
  "repeating-conic-gradient", "-webkit-linear-gradient", "-webkit-radial-gradient", "-webkit-repeating-linear-gradient",
  "-webkit-repeating-radial-gradient", "-moz-linear-gradient", "-moz-radial-gradient",
  "translate", "translatex", "translatey", "translatez", "translate3d", "rotate", "rotatex", "rotatey", "rotatez",
  "rotate3d", "scale", "scalex", "scaley", "scalez", "scale3d", "skew", "skewx", "skewy", "matrix", "matrix3d", "perspective",
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia",
  "cubic-bezier", "steps", "counter", "counters", "inset", "circle", "ellipse", "polygon", "rect", "xywh",
  "fit-content", "minmax", "repeat", "format",
]);
const CSS_BANNED_IDENT = new Set(["behavior", "-moz-binding", "expression"]);

const cssIsNameChar = (c: number) => isAlnum(c) || c === 45 || c === 95 || c >= 0x80;
const cssIsNameStart = (c: number) => isAlpha(c) || c === 95 || c >= 0x80;

/** Is this CSS safe — no load from outside the portal's places, no unusual function, no at-rule?
 *  A small CSS tokenizer (comments, strings, escapes, url tokens) — linear, never a guess. */
function cssSafe(css: string): boolean {
  const n = css.length;
  let i = 0;
  // read one escape at i (i points at «\»); returns [char, next index]
  const escape = (p: number): [string, number] => {
    let q = p + 1;
    if (q >= n) return ["\ufffd", q];
    if (isHex(css.charCodeAt(q))) {
      const s = q;
      while (q < n && q - s < 6 && isHex(css.charCodeAt(q))) q++;
      const cp = parseInt(css.slice(s, q), 16);
      if (q < n && isWs(css.charCodeAt(q))) q++;
      return [cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? "\ufffd" : String.fromCodePoint(cp), q];
    }
    const cp = css.codePointAt(q)!;
    return [String.fromCodePoint(cp), q + (cp > 0xffff ? 2 : 1)];
  };
  const validEscape = (p: number) => css.charCodeAt(p) === 92 && p + 1 < n && css.charCodeAt(p + 1) !== 10 && css.charCodeAt(p + 1) !== 12 && css.charCodeAt(p + 1) !== 13;
  const readName = (p: number): [string, number] => {
    let out = "";
    while (p < n) {
      const c = css.charCodeAt(p);
      if (cssIsNameChar(c)) { out += css[p]; p++; }
      else if (validEscape(p)) { const [ch, q] = escape(p); out += ch; p = q; }
      else break;
    }
    return [out, p];
  };
  const readString = (p: number, quote: number): [string, number, boolean] => {
    let out = "";
    p++;
    while (p < n) {
      const c = css.charCodeAt(p);
      if (c === quote) return [out, p + 1, true];
      if (c === 10 || c === 12 || c === 13) return [out, p, false]; // a bad string
      if (c === 92) {
        if (p + 1 >= n) { p++; continue; }
        const d = css.charCodeAt(p + 1);
        if (d === 10 || d === 12 || d === 13) { p += 2; continue; } // a line continued
        const [ch, q] = escape(p); out += ch; p = q; continue;
      }
      out += css[p]; p++;
    }
    return [out, p, true];
  };
  const startsIdent = (p: number) => {
    const c = css.charCodeAt(p);
    if (cssIsNameStart(c) || validEscape(p)) return true;
    if (c === 45 /* - */) { const d = css.charCodeAt(p + 1); return cssIsNameStart(d) || d === 45 || validEscape(p + 1); }
    return false;
  };
  while (i < n) {
    const c = css.charCodeAt(i);
    if (c === 47 && css.charCodeAt(i + 1) === 42) { // a comment
      const e = css.indexOf("*/", i + 2);
      if (e < 0) return true;
      i = e + 2;
      continue;
    }
    if (c === 34 || c === 39) { const [, q, good] = readString(i, c); if (!good) return false; i = q; continue; }
    if (c === 64 /* @ */) return false; // no at-rule in a style
    if (isDigit(c)) { while (i < n && (cssIsNameChar(css.charCodeAt(i)) || css.charCodeAt(i) === 46)) i++; continue; }
    if (startsIdent(i)) {
      const [name, q] = readName(i);
      const lname = name.toLowerCase();
      if (CSS_BANNED_IDENT.has(lname)) return false;
      if (css.charCodeAt(q) !== 40 /* ( */) { i = q; continue; }
      i = q + 1;
      if (lname !== "url") { if (!CSS_FUNCS.has(lname)) return false; continue; }
      // url( … )
      while (i < n && isWs(css.charCodeAt(i))) i++;
      const d = css.charCodeAt(i);
      if (d === 34 || d === 39) {
        const [url, r, good] = readString(i, d);
        if (!good || !pictureUrlSafe(url)) return false;
        i = r;
        continue;
      }
      let url = "";
      while (i < n) {
        const e = css.charCodeAt(i);
        if (e === 41 /* ) */) { i++; break; }
        if (isWs(e)) { while (i < n && isWs(css.charCodeAt(i))) i++; if (i < n && css.charCodeAt(i) !== 41) return false; continue; }
        if (e === 34 || e === 39 || e === 40 || e < 32 || e === 127) return false; // a bad url
        if (e === 92) { if (!validEscape(i)) return false; const [ch, r] = escape(i); url += ch; i = r; continue; }
        url += css[i]; i++;
      }
      if (!pictureUrlSafe(url)) return false;
      continue;
    }
    if (c === 92 /* a stray «\» */) { i += 2; continue; }
    i++;
  }
  return true;
}

// ── the tag reader (the HTML tokenizer's tag states) ────────────────────────────────────
type Attr = { name: string; raw: string | null };
type Tag = { name: string; attrs: Attr[]; selfClosing: boolean; end: number; complete: boolean; nameOk: boolean };

const TAG_NAME_OK = /^[a-z][a-z0-9-]*$/;
const ATTR_NAME_OK = /^[a-z_:][a-z0-9_:.-]*$/;

/** Read a tag whose name starts at p (just after «<» or «</»), exactly as the browser does. */
function readTag(s: string, p: number): Tag {
  const n = s.length;
  const attrs: Attr[] = [];
  let selfClosing = false;
  const s0 = p;
  while (p < n) { const c = s.charCodeAt(p); if (isWs(c) || c === 47 || c === 62) break; p++; }
  const name = s.slice(s0, p).replace(/[A-Z]+/g, (m) => m.toLowerCase());
  const done = (end: number, complete: boolean): Tag => ({ name, attrs, selfClosing, end, complete, nameOk: TAG_NAME_OK.test(name) });
  // before attribute name
  for (;;) {
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    let c = s.charCodeAt(p);
    if (c === 62) return done(p + 1, true);
    if (c === 47) { // self-closing start tag
      p++;
      if (p >= n) return done(n, false);
      if (s.charCodeAt(p) === 62) { selfClosing = true; return done(p + 1, true); }
      continue; // reconsume in «before attribute name»
    }
    // attribute name («=» as its first character belongs to it)
    const a0 = p;
    p++;
    while (p < n) { c = s.charCodeAt(p); if (isWs(c) || c === 47 || c === 62 || c === 61) break; p++; }
    const attr: Attr = { name: s.slice(a0, p).replace(/[A-Z]+/g, (m) => m.toLowerCase()), raw: null };
    attrs.push(attr);
    // after attribute name
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    if (s.charCodeAt(p) !== 61) continue; // «/», «>» or a new attribute
    p++;
    // before attribute value
    while (p < n && isWs(s.charCodeAt(p))) p++;
    if (p >= n) return done(n, false);
    c = s.charCodeAt(p);
    if (c === 34 || c === 39) {
      const close = s.indexOf(c === 34 ? '"' : "'", p + 1);
      if (close < 0) return done(n, false);
      attr.raw = s.slice(p + 1, close);
      p = close + 1;
      // after a quoted value: whitespace, «/», «>» — anything else starts the next attribute at once
      continue;
    }
    if (c === 62) { attr.raw = ""; return done(p + 1, true); }
    const v0 = p;
    while (p < n) { c = s.charCodeAt(p); if (isWs(c) || c === 62) break; p++; }
    attr.raw = s.slice(v0, p);
    if (p >= n) return done(n, false);
  }
}

type Verdict = { keep: true } | { keep: false } | { keep: true; value: string };

function decideAttr(tag: string, name: string, raw: string | null): Verdict {
  if (!ATTR_NAME_OK.test(name)) return { keep: false };
  if (name.startsWith("on") || name.startsWith("form") || DROP_ATTR.has(name)) return { keep: false };
  if (raw === null) return { keep: true }; // a bare attribute («checked»)
  const isLink = (name === "href" && (tag === "a" || tag === "area")) || (name === "xlink:href" && tag === "a");
  if (isLink) return linkSafe(raw) ? { keep: true } : { keep: true, value: "#" };
  const decoded = decodeAttr(raw);
  const isPicture = PICTURE_ATTR.has(name) || name === "href" || name === "xlink:href";
  if (isPicture) {
    if (decoded === null) return { keep: false };
    const ok = pictureUrlSafe(decoded, { svgData: tag === "img" && name === "src", fragment: name === "href" || name === "xlink:href" });
    return ok ? { keep: true } : { keep: false };
  }
  const isText = TEXT_ATTR.has(name) || name.startsWith("data-") || name.startsWith("aria-");
  if (decoded === null) return isText ? { keep: true } : { keep: false };
  // a script's scheme anywhere in a value, read as the browser reads it (R2S-2)
  if (SCRIPTISH.test(decoded.replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase())) return { keep: false };
  // a style, and any other value with a function in it (SVG reads fill/filter/mask/… as CSS)
  if (name === "style" || (!isText && decoded.indexOf("(") >= 0)) return cssSafe(decoded) ? { keep: true } : { keep: false };
  return { keep: true };
}

// a value written back, always double-quoted: its references stay as written (they decode the same)
const quoteAttr = (raw: string) => raw.replace(/"/g, "&quot;").replace(/</g, "&lt;");

// a comment kept as written only when it is plain — the cover's mark, a builder's note; the
// portal's other markers never come from what a person wrote (R2S-1)
function commentKept(data: string): boolean {
  if (/[<>]|--/.test(data) || data.startsWith("-")) return false;
  return !/^pts:/i.test(data) || data === "PTS:CV";
}

function sanitizePass(s: string): string {
  const n = s.length;
  const lower = s.replace(/[A-Z]+/g, (m) => m.toLowerCase()); // ASCII only: same length, same indexes
  let out = "";
  let text = 0; // the start of the text not yet written
  let i = 0;
  // text keeps a «<» that starts nothing («ΔM < 0.1 %»); one that could start a tag or a comment —
  // or that ends the run, where what follows is joined to it once a token between is dropped — is escaped
  const flush = (to: number) => { if (to > text) out += s.slice(text, to).replace(/<(?=[A-Za-z/!?]|$)/g, "&lt;"); };
  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) break;
    const c1 = s.charCodeAt(lt + 1);
    if (isAlpha(c1)) {
      const tag = readTag(s, lt + 1);
      flush(lt);
      if (!tag.complete) return out; // cut off at the end: the browser drops it, and so does this
      i = text = tag.end;
      if (!tag.nameOk) continue;
      if (DROP_WITH_CONTENT.has(tag.name)) {
        // up to its end tag («</name» then whitespace, «/» or «>»), never read as markup
        let from = tag.end;
        for (;;) {
          const e = lower.indexOf("</" + tag.name, from);
          if (e < 0) return out;
          const after = s.charCodeAt(e + 2 + tag.name.length);
          if (e + 2 + tag.name.length >= n) return out;
          if (isWs(after) || after === 47 || after === 62) {
            const close = readTag(s, e + 2);
            if (!close.complete) return out;
            i = text = close.end;
            break;
          }
          from = e + 2;
        }
        continue;
      }
      if (DROP_TAG.has(tag.name)) continue;
      const seen = new Set<string>();
      const kept: string[] = [];
      let changed = s.slice(lt + 1, tag.end).includes("<"); // a «<» inside: rebuilt, escaped
      for (const a of tag.attrs) {
        if (seen.has(a.name)) { changed = true; continue; } // the browser keeps the first
        seen.add(a.name);
        const v = decideAttr(tag.name, a.name, a.raw);
        if (!v.keep) { changed = true; continue; }
        if ("value" in v) { changed = true; kept.push(` ${a.name}="${quoteAttr(v.value)}"`); continue; }
        kept.push(a.raw === null ? ` ${a.name}` : ` ${a.name}="${quoteAttr(a.raw)}"`);
      }
      out += changed ? `<${tag.name}${kept.join("")}${tag.selfClosing ? "/" : ""}>` : s.slice(lt, tag.end);
      continue;
    }
    if (c1 === 47 /* / */) {
      const c2 = s.charCodeAt(lt + 2);
      if (isAlpha(c2)) {
        const tag = readTag(s, lt + 2);
        flush(lt);
        if (!tag.complete) return out;
        i = text = tag.end;
        if (!tag.nameOk || DROP_WITH_CONTENT.has(tag.name) || DROP_TAG.has(tag.name)) continue;
        const src = s.slice(lt, tag.end);
        out += /^<\/[A-Za-z][A-Za-z0-9-]*>$/.test(src) ? src : `</${tag.name}>`;
        continue;
      }
      if (lt + 2 >= n) { i = lt + 1; continue; } // «</» at the very end is text
      flush(lt);
      if (c2 === 62) { i = text = lt + 3; continue; } // «</>» is nothing
      const e = s.indexOf(">", lt + 2); // a bogus comment
      if (e < 0) return out;
      i = text = e + 1;
      continue;
    }
    if (c1 === 33 /* ! */) {
      flush(lt);
      if (s.startsWith("<!--", lt)) {
        const p = lt + 4;
        if (s.charCodeAt(p) === 62) { i = text = p + 1; continue; } // «<!-->»
        if (s.charCodeAt(p) === 45 && s.charCodeAt(p + 1) === 62) { i = text = p + 2; continue; } // «<!--->»
        const a = s.indexOf("-->", p), b = s.indexOf("--!>", p);
        if (a < 0 && b < 0) return out; // runs to the end
        if (a >= 0 && (b < 0 || a < b)) {
          if (commentKept(s.slice(p, a))) out += s.slice(lt, a + 3);
          i = text = a + 3;
        } else i = text = b + 4;
        continue;
      }
      const e = s.indexOf(">", lt + 2); // <!DOCTYPE …>, <![CDATA[ … — dropped
      if (e < 0) return out;
      i = text = e + 1;
      continue;
    }
    if (c1 === 63 /* ? */) {
      flush(lt);
      const e = s.indexOf(">", lt + 2);
      if (e < 0) return out;
      i = text = e + 1;
      continue;
    }
    i = lt + 1; // a «<» that starts nothing — text, escaped when written
  }
  flush(n);
  return out;
}

// The portal's body markers never belong in what a person wrote (lib/doc-css; R2S-1).
const BODY_MARKS = /<!--PTS:(?:BS|BE)-->/g;

export function sanitizeDocHtml(html: string | null | undefined): string {
  if (!html) return "";
  const input = String(html).replace(BODY_MARKS, "").replace(/\u0000/g, "\ufffd");
  const once = sanitizePass(input);
  // a second pass changes nothing; if it ever did, every «<» is escaped — nothing runs
  return sanitizePass(once) === once ? once : once.replace(/</g, "&lt;");
}

// True when sanitizing would change the input — i.e. it contained something unsafe.
// Used only for logging/telemetry; callers always store the sanitized output.
export function isUnsafeDocHtml(html: string): boolean {
  return sanitizeDocHtml(html) !== html;
}
