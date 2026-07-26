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
const DANGER_BLOCK = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
// the same tags plus other never-in-a-document elements, as bare/unclosed tags.
const DANGER_TAG = /<\/?(?:script|style|iframe|object|embed|link|meta|base|form|noscript|template|frame|frameset|applet)\b[^>]*>/gi;
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
const URL_ATTR = /\b(href|src)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
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
    .toLowerCase();
  if (v.startsWith("data:")) return !isHref && v.startsWith("data:image/");
  const m = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!m) return true; // relative / anchor / query — no scheme, safe
  return SAFE_URL_SCHEME.has(m[1]);
}

export function sanitizeDocHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html);
  out = out.replace(DANGER_BLOCK, "");
  out = out.replace(DANGER_TAG, "");
  // Re-run until stable: consuming one separator can leave a second, chained handler
  // (`<img/onload=a/onerror=b>`) directly abutting the kept separator. Bounded so a
  // pathological input can never loop.
  for (let i = 0; i < 8; i++) {
    const next = out.replace(ON_ATTR, "$1");
    if (next === out) break;
    out = next;
  }
  out = out.replace(URL_ATTR, (full, name, _eq, _whole, dq, sq, bare) => {
    const isHref = /href/i.test(name);
    const value = dq ?? sq ?? bare ?? "";
    if (urlValueSafe(value, isHref)) return full;
    return isHref ? `${name}="#"` : ""; // blank a dangerous href; drop a dangerous src
  });
  out = out.replace(JS_PROTO, "$1");
  out = out.replace(DATA_HTML, "data:text/plain");
  return out;
}

// True when sanitizing would change the input — i.e. it contained something unsafe.
// Used only for logging/telemetry; callers always store the sanitized output.
export function isUnsafeDocHtml(html: string): boolean {
  return sanitizeDocHtml(html) !== html;
}
