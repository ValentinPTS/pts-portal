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
// inline event handlers: on<name>=… with quoted, single-quoted, or bare values.
const ON_ATTR = /\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// javascript:/vbscript: in attribute position (href/src/etc.) → strip the scheme so
// the value goes inert. Only matches after `=` so it never touches document text.
const JS_PROTO = /(=\s*["']?\s*)(?:javascript|vbscript)\s*:/gi;
// data:text/html (an XSS vector) → defang to text/plain. data:image/* is untouched.
const DATA_HTML = /data:\s*text\/html/gi;

export function sanitizeDocHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html);
  out = out.replace(DANGER_BLOCK, "");
  out = out.replace(DANGER_TAG, "");
  out = out.replace(ON_ATTR, "");
  out = out.replace(JS_PROTO, "$1");
  out = out.replace(DATA_HTML, "data:text/plain");
  return out;
}

// True when sanitizing would change the input — i.e. it contained something unsafe.
// Used only for logging/telemetry; callers always store the sanitized output.
export function isUnsafeDocHtml(html: string): boolean {
  return sanitizeDocHtml(html) !== html;
}
