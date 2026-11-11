// Sanitizer for USER-AUTHORED document HTML (the Word-like editor's body). It runs
// in three places — on save (server), before re-injecting the body into the printed
// shell (server), and before loading saved HTML into the contentEditable (client) —
// so a document can never carry active content that runs in the app origin when
// another staff member opens it, nor script into the PDF render.
//
// Defense in depth: only authenticated staff can author documents, and the print
// routes also send a strict no-script CSP. This is the belt to that CSP's braces.
// It is intentionally isomorphic (pure string ops, no DOM) so the exact same rules
// apply on the server and in the browser, and dependency-free (no DOMPurify) to keep
// the bundle small.
//
// What it KEEPS: all the formatting the editor produces — p/h1-3/div/span, b/strong,
// i/em/u, ul/ol/li, tables, br, a (http/https/mailto), img (incl. data:image base64
// and https URLs), and the class/style/src/alt/href/colspan/rowspan/width/height/
// data-* attributes. It also preserves HTML comments (the BODY/COVER markers).
//
// What it REMOVES: <script>/<style>/<iframe>/<object>/<embed>/<link>/<meta>/<base>/
// <form>/<noscript>/<template> elements, every inline event-handler attribute
// (onerror, onload, onclick, …), and javascript:/vbscript:/data:text/html URLs.

// script/style/noscript/template carry executable or layout-hijacking content — drop
// the whole element including its contents.

import { imageUrlAllowed } from "./image-hosts";
// the same tags plus other never-in-a-document elements, as bare/unclosed tags.
// An unclosed one at the very end too (the security sweep, SI-1: «<iframe srcdoc=…» with no «>»
// was left alone — the wrapper's own «</div>» then closed it).
// …and SVG's animation elements: they set an attribute to any value — «<animate attributeName=href
// values=javascript:…>» (the security sweep, round 2, R2S-2).
const DANGER_TAG = /<\/?(?:script|style|iframe|object|embed|link|meta|base|form|noscript|template|frame|frameset|applet|animate|animatemotion|animatetransform|set|discard|handler|listener)\b[^>]*(?:>|$)/gi;
// an iframe's inline document, a button's target — never in a document (SI-1)
// (and «srcset»: a list of pictures from anywhere, never the editor's — round 2)
const SRCDOC_ATTR = /([\s/"'`])(?:srcdoc|formaction|srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// inline event handlers: on<name>=… preceded by ANY separator the HTML tokenizer
// accepts before a new attribute — whitespace, `/`, or the closing quote of the
// previous attribute — NOT just whitespace. Matching only whitespace let
// `<svg/onload=…>` and `<img src="x"onerror=…>` smuggle a live handler past this
// filter (the `/` and `"` are attribute separators the browser honours). The
// separator is captured in group 1 and re-emitted so stripping the handler never
// eats the previous attribute's closing quote or the tag's self-closing slash.
const ON_ATTR = /([\s/"'`])on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// javascript:/vbscript: in attribute position (href/src/etc.) → strip the scheme so
// the value goes inert. Only matches after `=` so it never touches document text.
const JS_PROTO = /(=\s*["']?\s*)(?:javascript|vbscript)\s*:/gi;
// data:text/html (an XSS vector) → defang to text/plain. data:image/* is untouched.
const DATA_HTML = /data:\s*text\/html/gi;

// URL-bearing attributes. A literal-string scheme match (JS_PROTO) is defeated by
// HTML-entity / control-char obfuscation the browser decodes before it resolves the
// scheme — `href="jav&#9;ascript:…"` and `href="&#106;avascript:…"` both run. So we
// normalize each value the way a browser does (decode entities, strip control/space
// chars) and check the resulting scheme against an allow-list, neutralizing anything
// else. Only http/https/mailto/tel and inline data:image survive.
// (a table cell's «background» and a video's «poster» are pictures too — round 2)
const URL_ATTR = /\b(href|src|background|poster)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SAFE_URL_SCHEME = new Set(["http", "https", "mailto", "tel"]);

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}
// Decode the HTML character references a browser resolves inside an attribute value
// before it interprets the URL scheme (numeric/hex refs + the few named ones that
// matter for scheme obfuscation).
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d) => codePoint(parseInt(d, 10)))
    .replace(/&Tab;/gi, "\t")
    .replace(/&NewLine;/gi, "\n")
    .replace(/&colon;/gi, ":")
    .replace(/&amp;/gi, "&");
}
// Is this href/src value safe to keep? `isHref` marks a navigable context, where a
// data: URL (e.g. data:image/svg+xml → runs script when opened top-level) is never
// allowed; for src, inline data:image is fine (inert in an <img>).
function urlValueSafe(raw: string, isHref: boolean): boolean {
  const v = decodeEntities(raw)
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
    .replace(/\\/g, "/") // a browser reads «\» as «/» — «\\evil.example» is another site (round 2)
    .toLowerCase();
  if (v.startsWith("data:")) return !isHref && v.startsWith("data:image/");
  const m = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!m) {
    if (v.startsWith("//")) return false; // never protocol-relative
    // a picture on the portal's own address only from /brand/ — a picture at «/lab/doc/…/report» (or
    // «report», relative to the page) made every laboratory's browser «open» that report, on record
    // (R2S-10)
    return isHref || v === "" || v.startsWith("/brand/");
  }
  if (!SAFE_URL_SCHEME.has(m[1])) return false;
  // a picture is fetched by every viewer: only from the portal's own places (1.12)
  if (!isHref && (m[1] === "http" || m[1] === "https")) return imageUrlAllowed(decodeEntities(raw).trim());
  return true;
}

// The whole pass, again until nothing changes (the security sweep, SI-1): removing one tag
// joins the text around it — «<scr<script>ipt>» is «<script>» once the inner one is gone, and
// N layers of it survived N single passes. Every step only removes or blanks, so the input
// settles; if it ever did not within the bound, every «<» is escaped — nothing runs.
export function sanitizeDocHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html);
  for (let i = 0; i < 25; i++) {
    const next = sanitizeOnce(out);
    if (next === out) return out;
    out = next;
  }
  return out.replace(/</g, "&lt;");
}

// An opening tag and its attributes, for the last check.
const ANY_TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*|\/[^>]*)>/g;

// script/style/noscript/template with everything in them — found by a scan, never a backtracking regex
// (R2S-8: «[\s\S]*?<\/style>» from every «<style>» made 800 KB take 8 s): each opening looks for its
// closing once; a tag that is never closed again is not looked for again (its opening alone is removed).
const BLOCK_OPEN = /<(script|style|noscript|template)\b/gi;
function dropBlocks(input: string): string {
  let out = "", from = 0;
  const unclosed = new Set<string>();
  BLOCK_OPEN.lastIndex = 0;
  for (let m = BLOCK_OPEN.exec(input); m; m = BLOCK_OPEN.exec(input)) {
    const tag = m[1].toLowerCase();
    if (unclosed.has(tag)) continue; // its opening goes with DANGER_TAG
    const close = new RegExp(`</${tag}\\b[^>]*>`, "gi");
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(input);
    if (!c) { unclosed.add(tag); continue; }
    out += input.slice(from, m.index);
    from = c.index + c[0].length;
    BLOCK_OPEN.lastIndex = from;
  }
  return out + input.slice(from);
}

// The portal's own markers (lib/doc-css): a body's start and end never belong in what a person wrote, and
// a cover's mark only where it stands alone between tags — removed later by the shell, a marker inside
// a tag («<scr<!--PTS:BS-->ipt>») rebuilt the tag it had hidden (the security sweep, round 2, R2S-1).
const BODY_MARKS = /<!--PTS:(?:BS|BE)-->/g;
const COVER_MARK_RE = /<!--PTS:CV-->/g;

function sanitizeOnce(input: string): string {
  let out = input.replace(BODY_MARKS, "");
  out = out.replace(COVER_MARK_RE, (m, off: number, str: string) => {
    const before = off > 0 ? str[off - 1] : "", after = str[off + m.length] ?? "";
    return (before === "" || /[\s>]/.test(before)) && (after === "" || /[\s<]/.test(after)) ? m : "";
  });
  out = dropBlocks(out);
  out = out.replace(DANGER_TAG, "");
  // Re-run until stable: consuming one separator can leave a second, chained handler
  // (`<img/onload=a/onerror=b>`) directly abutting the kept separator. Bounded so a
  // pathological input can never loop.
  for (let i = 0; i < 8; i++) {
    const next = out.replace(ON_ATTR, "$1");
    if (next === out) break;
    out = next;
  }
  out = out.replace(SRCDOC_ATTR, "$1");
  out = out.replace(URL_ATTR, (full, name, _eq, _whole, dq, sq, bare) => {
    const isHref = /href/i.test(name);
    const value = dq ?? sq ?? bare ?? "";
    if (urlValueSafe(value, isHref)) return full;
    return isHref ? `${name}="#"` : ""; // blank a dangerous href; drop a dangerous src
  });
  out = out.replace(JS_PROTO, "$1");
  out = out.replace(DATA_HTML, "data:text/plain");
  // a tag that holds a script's scheme ANYWHERE in it, read as a browser reads it (its entities decoded,
  // its control characters and spaces gone) — whatever attribute the regexes above took it for
  // («<a x=href="a href=&#106;avascript:…">»: one quoted value to them, a second attribute to a browser;
  // R2S-2): kept as its bare tag, every attribute dropped
  out = out.replace(ANY_TAG, (full, name: string, attrs: string) => {
    const flat = decodeEntities(attrs).replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
    if (/(?:java|vb|live)script:|data:text\/html/.test(flat)) return `<${name}>`;
    // a picture in a style («background:url(…)») only from the portal's places, as any picture (round 2)
    return /url\s*\(/i.test(attrs)
      ? full.replace(/url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (u, _q, url: string) => (urlValueSafe(url, false) ? u : "url()"))
      : full;
  });
  return out;
}

// True when sanitizing would change the input — i.e. it contained something unsafe.
// Used only for logging/telemetry; callers always store the sanitized output.
export function isUnsafeDocHtml(html: string): boolean {
  return sanitizeDocHtml(html) !== html;
}
