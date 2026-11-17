// verify-doc-links — round 9's link rule (T1) as a gate, on the REAL cleaner and DOC_CSS. No dev server:
// every body goes through sanitizeDocHtml and is shown as the app shows it — docPrintHtml's page on screen
// (the print route, the lab's document, editions, the public plan), the same page as print (the PDF's
// column), the Fill view (its sticky Save bar), and the editor's canvas (WordEditor's own CSS) — in Chromium.
//   node --import ./scripts/ts-ext-hook.mjs scripts/verify-doc-links.mjs           (quick: ≈ 1 min)
//   node --import ./scripts/ts-ext-hook.mjs scripts/verify-doc-links.mjs --full    (10× the documents)
// The rule:
//   A  a link's clickable area never reaches more than 4 px beyond its own words (and pictures);
//   C  no link takes 15 % or more of the screen's clicks;
//   B  nothing of the body is hit outside the A4 sheet, and nothing hit outside the body's box is a link.
// Checked on: the one-feature cases of round 9 (each a way a link once grew over the page — and what real
// documents do, which must keep working: a real click on a link opens a NEW tab and the portal's stays; the PDF,
// made as /api/pdf makes it, carries no link annotation larger than a line of words), N seeded generated
// documents (links inside and around positioned, transformed, flex, grid, table, svg and math boxes, every
// spelling trick in their styles), and the built-in bodies (unchanged by the cleaner, byte for byte).
// Nothing leaves the machine: every request is answered from public/ or refused.
import { chromium } from "playwright";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { pageCheck } from "./doc-links/check.mjs";
import { makeGenerator, classPool, render } from "./doc-links/gen.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PORTAL ?? path.resolve(HERE, "..");
const FULL = process.argv.includes("--full");
const N = FULL ? 1500 : 150;
const SEED = Number(process.env.SEED ?? 20261113);
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

// ── the app's own modules ─────────────────────────────────────────────────────────────────
const lib = (p) => import(pathToFileURL(path.join(ROOT, "src", p)).href);
const { sanitizeDocHtml } = await lib("lib/sanitize-html.ts");
const { docPrintHtml, docDefaultBody, docCoverHtml } = await lib("lib/doc-template.ts");
const { DOCUMENTS, docEditorCss } = await lib("lib/documents.ts");
const { DOC_CSS, scopeCss } = await lib("lib/doc-css.ts");
const { SKINS, getSkin } = await lib("skins/index.ts");
const { docImgSrc } = await lib("lib/image-hosts.ts");
const { pavingBlocks } = await lib("lib/seed-paving-blocks.ts");
const { forceCalibration } = await lib("lib/seed-force.ts");

// made-up schemes: the seeds' structure, every name replaced
const fakeScheme = (type, skin) => {
  const s = structuredClone(type === "C" ? forceCalibration : pavingBlocks);
  Object.assign(s, { id: `zz-99-${type}-9`, number: `PTS 99/99-${type}-9`, titleEn: "Made-up scheme", titleBg: "Измислена схема", formData: {},
    team: s.team.map((m, i) => ({ ...m, name: `Тест Тестов ${i + 1}` })), ...(skin ? { skin } : {}) });
  if (s.partner) Object.assign(s.partner, { nameEn: "MADE-UP PARTNER", nameBg: "ИЗМИСЛЕН ПАРТНЬОР", locationEn: "Nowhere", locationBg: "Никъде" });
  return s;
};
const OPTS = { revealNames: true, participants: [1, 2].map((i) => ({ code: `9900${i}`, labName: `Измислена лаборатория ${i}`, country: "BG", contact: "x", email: `l${i}@example.invalid`, phone: "+359 0", deliveryAddress: "ул. Никъде", participations: 1, courier: "x", sampleCode: `S-${i}`, characteristics: [0] })) };
const COVER = "<!--PTS:CV-->";
const printPage = (body, doc = "plan", type = "T", skin = "classic") => docPrintHtml(fakeScheme(type, skin), doc, "bg", COVER + "\n" + body, OPTS, getSkin(skin));

// the Fill view's own CSS and bar, and the editor's canvas CSS — read from their sources so they track the code
const template = (src, name, consts = {}) => {
  const a = src.indexOf(`const ${name} = \``); if (a < 0) throw new Error(name + " not found");
  let i = src.indexOf("`", a) + 1; const from = i;
  for (; i < src.length; i++) { if (src[i] === "\\") { i++; continue; } if (src[i] === "`") break; }
  return new Function(...Object.keys(consts), "return `" + src.slice(from, i) + "`;")(...Object.values(consts));
};
const FILL_CSS = template(readFileSync(path.join(ROOT, "src/app/schemes/[id]/fill/[doc]/route.ts"), "utf8"), "css");
const fillPage = (body) => printPage(body).replace("</head>", `${FILL_CSS}</head>`)
  .replace("<body>", `<body><form method="post" action="/x"><div class="ff-bar" data-chrome="ff-bar"><a href="/x">←</a><span class="t">Попълване</span><button class="pdf" type="button" data-chrome="pdf">PDF</button><button class="save" type="submit" data-chrome="save">Запази</button></div>`)
  .replace("</body>", "</form></body>");
const WE = readFileSync(path.join(ROOT, "src/components/WordEditor.tsx"), "utf8");
const num = (k) => Number(new RegExp(`const ${k} = (\\d+)`).exec(WE)[1]);
const obj = (k) => Function(`return (${new RegExp(`const ${k} = (\\{[^}]*\\})`).exec(WE)[1]})`)();
const WEC = { SHEET_W_MM: num("SHEET_W_MM"), MARGIN_MM: obj("MARGIN_MM"), PAGE_PAD_PX: obj("PAGE_PAD_PX"), PAGE_BREAK_MM: num("PAGE_BREAK_MM"), SEAM_PX: num("SEAM_PX") };
const EDITOR_CSS = template(WE, "EDITOR_CSS", WEC), COVER_CSS = template(WE, "COVER_CSS", WEC);
const editorPage = () => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts/pt-serif.css"><style>:root{--canvas:#f6f7f4;--line:#e3e3e3;--green-soft:#eef3ea;--green-line:#cbd9be;--green-dark:#456b2c;--ink:#1f2d21;--muted:#6b6b6b;--red:#9e2b2b}body{margin:0;background:var(--canvas)}*{box-sizing:border-box}</style><style>${EDITOR_CSS + COVER_CSS + scopeCss(docEditorCss("plan", "T"), ".we-page")}</style></head><body><div class="we-stickyhead" data-chrome="toolbar"><div class="we-toolbar"><button class="we-tool">B</button></div></div><div class="we-body"><div class="we-col"><div class="we-page"><div class="we-docbody" contenteditable="true"></div></div></div><aside class="we-panel" data-chrome="panel">…</aside></div></body></html>`;

// ── a browser in which nothing leaves the machine ─────────────────────────────────────────
const ORIGIN = "http://pts-doc.localhost";
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const state = { html: "", csp: "", out: [] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await ctx.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith("data:")) return route.continue();
  const u = new URL(url);
  if (u.origin === ORIGIN && u.pathname === "/doc") return route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8", ...(state.csp ? { "content-security-policy": state.csp } : {}) }, body: state.html });
  const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^[/\\]+/, "");
  const f = path.join(ROOT, "public", rel);
  if (u.origin === ORIGIN && /^(brand|fonts)[/\\]/.test(rel) && existsSync(f)) return route.fulfill({ status: 200, headers: { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }, body: readFileSync(f) });
  state.out.push(url);
  return route.abort();
});
const CSP = `default-src 'none'; img-src ${docImgSrc()}; style-src 'unsafe-inline' 'self'; font-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`;
const pages = { screen: await ctx.newPage(), print: await ctx.newPage(), fill: await ctx.newPage(), editor: await ctx.newPage() };
await pages.print.setViewportSize({ width: 688, height: 1100 }); // the PDF's 182 mm column
await pages.print.emulateMedia({ media: "print" });
await pages.editor.setViewportSize({ width: 1440, height: 1100 });
let n = 0;
const settle = async (p, sel) => {
  await p.evaluate(() => (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : 0));
  await p.evaluate((s) => Promise.all([...document.querySelectorAll(s + " img")].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))), sel);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
await (async () => { state.html = editorPage(); state.csp = ""; await pages.editor.goto(`${ORIGIN}/doc?editor`, { waitUntil: "load" }); })();
/** One stored body in the four views: the rule's findings, per view. */
async function views(stored) {
  const res = {};
  for (const v of ["screen", "print", "fill"]) {
    state.html = v === "fill" ? fillPage(stored) : printPage(stored); state.csp = v === "fill" ? CSP.replace("form-action 'none'", "form-action 'self'") : CSP;
    const p = pages[v];
    await p.goto(`${ORIGIN}/doc?${v}=${n++}`, { waitUntil: "load" });
    await settle(p, ".pts-docbody");
    if (v !== "fill") await p.evaluate(() => { const b = document.querySelector(".pts-docbody").getBoundingClientRect(); window.scrollTo(0, Math.max(0, scrollY + b.top - 120)); });
    res[v] = await p.evaluate(pageCheck, { bodySel: ".pts-docbody", sheetSel: ".page", step: 16, cShare: 0.15, chrome: v === "fill" });
  }
  await pages.editor.evaluate((h) => { scrollTo(0, 0); document.querySelector(".we-docbody").innerHTML = h; }, sanitizeDocHtml(COVER + "\n" + stored));
  await settle(pages.editor, ".we-docbody");
  res.editor = await pages.editor.evaluate(pageCheck, { bodySel: ".we-docbody", sheetSel: ".we-page", step: 16, cShare: 0.15, chrome: true });
  return res;
}
const broken = (r) => (r.error ? [r.error] : [
  ...r.A.filter((a) => a.maxDist > 4).map((a) => `A: ${a.tag} «${a.text}» reaches ${a.maxDist >= 9999 ? "with no words" : a.maxDist + "px"}`),
  ...r.C.map((c) => `C: ${c.tag} takes ${(c.gridShare * 100).toFixed(0)}% of the clicks`),
  ...(r.B && (r.B.out || r.B.link) ? [`B: ${r.B.out} hits outside the sheet${r.B.link ? `, ${r.B.link} of them a link outside the body` : ""} (${r.B.samples[0]?.hit})`] : []),
]);

// ── 1. the one-feature cases ─────────────────────────────────────────────────────────────
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const H = (id) => `https://evil.example/${id}`;
const nest = (k, open, close, inner) => open.repeat(k) + inner + close.repeat(k);
const PROBES = [
  // ── a link grown by what the screen holds do not cover (height, display, stretch, fonts) ──
  ["P01", "attack", "block link with a height", `<p>a</p><a href="${H("P01")}" style="display:block;height:2000px">x</a><p>b</p>`],
  ["P02", "attack", "inline-block link with a line-height", `<p>a <a href="${H("P02")}" style="display:inline-block;line-height:2000px">x</a> b</p>`],
  ["P03", "attack", "block link with min-height in vh", `<a href="${H("P03")}" style="display:block;min-height:100vh">x</a>`],
  ["P04", "attack", "block link sized by aspect-ratio", `<a href="${H("P04")}" style="display:block;aspect-ratio:1/9">x</a>`],
  ["P05", "attack", "link stretched by a flex holder", `<div style="display:flex;height:3000px"><a href="${H("P05")}" style="flex:1">x</a></div>`],
  ["P06", "attack", "link stretched by a grid holder (no style on the link)", `<div style="display:grid;grid-template-rows:3000px"><a href="${H("P06")}">x</a></div>`],
  ["P07", "attack", "table cell with height=3000 inside a link", `<a href="${H("P07")}"><table><tr><td height="3000">x</td></tr></table></a>`],
  ["P08", "attack", "block with a height inside a link", `<a href="${H("P08")}"><div style="height:3000px">x</div></a>`],
  ["P09", "attack", "empty list-item link (no text at all)", `<p>a</p><a href="${H("P09")}" style="display:list-item"></a><p>b</p>`],
  ["P10", "attack", "3000px transparent font on the link", `<p><a href="${H("P10")}" style="font-size:3000px;color:transparent">x</a></p>`],
  ["P11", "attack", "huge font set on the holder (font shorthand)", `<div style="font:5000px/0 serif"><a href="${H("P11")}">x</a></div>`],
  ["P12", "attack", "a run of no-break spaces as the link's text", `<p><a href="${H("P12")}">x${"&nbsp; ".repeat(2500)}</a></p>`],
  ["P13", "attack", "wide holder + block link", `<div style="width:5000px"><a href="${H("P13")}" style="display:block">x</a></div>`],
  ["P14", "attack", "table width=5000 + block link in its cell", `<table width="5000"><tr><td><a href="${H("P14")}" style="display:block">x</a></td></tr></table>`],
  ["P15", "attack", "block link pushed off its text by text-indent", `<a href="${H("P15")}" style="display:block;text-indent:-3000px">x</a>`],
  ["P16", "attack", "a 1×1 picture blown up inside a link", `<a href="${H("P16")}"><img src="${PNG1}" width="600" height="900" alt=""></a>`],
  ["P17", "attack", "invisible (transparent) link text", `<p><a href="${H("P17")}" style="color:transparent">невидим текст на линка</a></p>`],
  // ── image maps: an <area> is a link the stylesheet never names ──
  ["P20", "attack", "free picture with an image map over the whole screen", `<p>t</p><img class="free" src="${PNG1}" usemap="#m" alt="" style="left:-500mm;top:-300mm;width:2000mm;height:2000mm;z-index:9"><map name="m"><area shape="default" href="${H("P20")}"></map>`],
  ["P21", "attack", "in-flow picture with an image map, height attribute", `<img src="${PNG1}" width="5000" height="5000" usemap="#m2" alt=""><map name="m2"><area shape="default" href="${H("P21")}"></map>`],
  // ── SVG and MathML ──
  ["P22", "attack", "SVG link: a transparent rect in a 5000×5000 svg", `<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="5000"><a href="${H("P22")}"><rect width="5000" height="5000" fill="red" fill-opacity="0"/></a></svg>`],
  ["P23", "attack", "SVG link around an empty foreignObject (viewBox, no size)", `<svg viewBox="0 0 10 10"><a href="${H("P23")}"><foreignObject width="10" height="10"></foreignObject></a></svg>`],
  ["P24", "attack", "link in MathML mtext with a block height", `<math><mtext><a href="${H("P24")}" style="display:block;height:3000px">x</a></mtext></math>`],
  ["P41", "attack", "an empty svg 3000px tall inside a link", `<a href="${H("P41")}"><svg height="3000"></svg></a>`],
  ["P25", "attack", "link in a foreignObject, block height", `<svg width="600" height="3000"><foreignObject width="600" height="3000"><a href="${H("P25")}" style="display:block;height:3000px">x</a></foreignObject></svg>`],
  // ── margins and classes ──
  ["P26", "attack", "holder pulled 150px left (the cap)", `<div style="margin-left:-150px"><a href="${H("P26")}">x</a></div>`],
  ["P27", "attack", "12 nested holders, each -149px", nest(12, `<div style="margin-left:-149px">`, `</div>`, `<a href="${H("P27")}">x</a>`)],
  ["P28", "attack", "the shell's class «dochead-wrap» (negative margins, z-index 41) around a link", `<div class="dochead-wrap"><a href="${H("P28")}" style="display:block;height:200px">x</a></div>`],
  ["P29", "attack", "the shell's class «dochead» on the link (flex)", `<p>a</p><a class="dochead" href="${H("P29")}">x</a>`],
  ["P30", "attack", "an <dialog open> sized to the screen around a link", `<dialog open style="width:100vw;height:100vh"><a href="${H("P30")}" style="display:block;height:100%">x</a></dialog>`],
  // ── print only (the screen holds them; the PDF does not) ──
  ["P31", "attack", "padding on the link", `<p><a href="${H("P31")}" style="padding:3000px">x</a></p>`],
  ["P32", "attack", "border inside the link", `<a href="${H("P32")}"><p style="border:1000px solid transparent"></p></a>`],
  ["P33", "attack", "transform scale on the link", `<p><a href="${H("P33")}" style="display:inline-block;transform:scale(50)">x</a></p>`],
  ["P34", "attack", "absolute holder with a huge inset", `<div style="position:absolute;inset:-5000px"><a href="${H("P34")}" style="display:block;height:100%">x</a></div>`],
  ["P35", "attack", "zoom on the link", `<p><a href="${H("P35")}" style="display:inline-block;zoom:50">x</a></p>`],
  // ── the editor's own classes on document content ──
  ["P36", "attack", "editor class «we-colorpop» (absolute, z 50) around a link", `<p style="position:relative">t<span class="we-colorpop" style="width:3000px;height:3000px"><a href="${H("P36")}">x</a></span></p>`],
  ["P37", "attack", "editor class «we-stickyhead» (sticky, z 30) in the body", `<div class="we-stickyhead" style="height:400px">x</div>`],
  ["P38", "attack", "holder pushed right by a POSITIVE margin (never checked)", `<div style="margin-left:900px"><a href="${H("P38")}">x</a></div>`],
  ["P39", "attack", "holder lifted by a positive top on a relative box — print only", `<div style="position:relative;top:-3000px"><a href="${H("P39")}">x</a></div>`],
  ["P40", "attack", "free picture with an image map over the Fill view's sticky Save bar", `<p>t</p><img class="free" src="${PNG1}" usemap="#m4" alt="" style="left:-100mm;top:-100mm;width:400mm;height:120mm;z-index:99"><map name="m4"><area shape="default" href="${H("P40")}"></map>`],
  // ── round 9 review 4: what is left open at the end, what cannot shrink, what cannot be seen ──
  ["P42", "attack", "a link left open at the end of the body (the footer after it)", `<p>Body text.</p><p>Hello <a href="${H("P42")}">x`],
  ["P43", "attack", "a dropdown left open at the end of the body", `<p>Text</p><select name="x"><option>a</option>`],
  ["P44", "attack", "a cell left open at the end, its words white and 4 pt", `<p>Text</p><table><tr><td style="color:#fff;font-size:4pt">x`],
  ["P45", "attack", "bold left open at the end, white and 4 pt", `<p>Text</p><p><b style="color:#fff;font-size:4pt">x`],
  ["P46", "attack", "a formula's letter holding a box (the page after it inside the formula)", `<math><mi><mrow>x</mi></math><p>a <a href="${H("P46")}">link</a> b</p><table><tr><td>cell</td></tr></table>`],
  // (a word longer than its cell — 300 letters, 150 words tied by no-break spaces, a 96-pt word — widens its table, and
  // a link in the next cell can leave the sheet: a known Low, the price of never splitting a real word in a cell;
  // round 9 review 4, second look)
  ["P48", "attack", "a long option in the cell before a link", `<table><tr><td><select name="a"><option>${"Long option text ".repeat(40)}</option></select></td><td><a href="${H("P48")}">link</a></td></tr></table>`],
  ["P49", "attack", "ten fields in the cells before a link", `<table><tr>${"<td><input type=\"text\" name=\"x\"></td>".repeat(10)}<td><a href="${H("P49")}">link</a></td></tr></table>`],
  ["P52", "attack", "right to left, a negative indent before a link", `<p dir="rtl" style="margin-left:120mm;text-indent:-120mm"><a href="${H("P52")}">link</a> text after the link</p>`],
  ["P53", "attack", "a picture's 100-mm margin in the cell before a link", `<table><tr><td><img src="${PNG1}" style="width:100mm;margin-left:100mm" alt=""></td><td><a href="${H("P53")}">link</a></td></tr></table>`],
  ["P54", "attack", "a link in white words", `<p>Before</p><p><a href="${H("P54")}"><span style="color:#fff;background:#fff">${"word ".repeat(60)}</span></a></p><p>After</p>`],
  ["P55", "attack", "a link of 3000 em spaces, Braille blanks or Hangul fillers", `<p>Before</p><p><a href="${H("P55")}">.${"&emsp;".repeat(3000)}.</a><a href="${H("P55")}">${"&#10240;".repeat(3000)}</a><a href="${H("P55")}">${"\u3164".repeat(3000)}</a></p><p>After</p>`],
  // ── what real documents do (must keep working) ──
  ["L01", "legit", "a link in a sentence", `<p>Повече на <a href="https://ptsbg.eu/">ptsbg.eu</a> и на тел.</p>`],
  ["L02", "legit", "a link that wraps over two lines", `<p style="width:200px">Текст <a href="https://ptsbg.eu/a">много дълъг текст на линк, който се пренася на втори ред</a>.</p>`],
  ["L03", "legit", "mailto in a table cell", `<table class="ptable"><tr><td>Имейл</td><td><a href="mailto:office@example.invalid">office@example.invalid</a></td></tr></table>`],
  ["L04", "legit", "a linked logo", `<p><a href="https://ptsbg.eu/"><img src="/brand/logo.png" alt="" style="width:30mm"></a></p>`],
  ["L05", "legit", "a free stamp below the last line (no link)", `<p>Подпис:</p><img class="free" src="/brand/snas.png" alt="" style="left:100mm;top:20mm;width:40mm;height:40mm;z-index:2">`],
  ["L06", "legit", "a free stamp inside a link (R8UP-6)", `<p>Подпис:</p><a href="https://ptsbg.eu/"><img class="free" src="/brand/snas.png" alt="" style="left:100mm;top:20mm;width:40mm;height:40mm;z-index:2"></a>`],
  ["L07", "legit", "a Word table with margin-left:-5.4pt", `<table style="margin-left:-5.4pt;border-collapse:collapse"><tr><td style="width:233.3pt;border:solid windowtext 1.0pt;padding:0cm 5.4pt">a</td><td style="width:233.3pt;border:solid windowtext 1.0pt;padding:0cm 5.4pt">b</td></tr></table>`],
  ["L08", "legit", "a wide table (wider than the column)", `<table class="ptable" style="width:130%"><tr><td>a</td><td>b</td><td>c</td></tr></table>`],
  ["L09", "legit", "a heading with a link", `<h2 class="sec"><span class="n">1.</span> <a href="https://ptsbg.eu/s">Раздел</a></h2>`],
  ["L10", "legit", "a link in a list", `<ul><li><a href="https://ptsbg.eu/l">точка</a></li></ul>`],
  ["L11", "legit", "a picture placed right (float) next to a link", `<p><img src="/brand/logo.png" alt="" style="float:right;margin:4px 0 8px 12px;width:30mm">Виж <a href="https://ptsbg.eu/f">тук</a>.</p>`],
];
const pdfLinks = async () => {
  const pdf = await pages.print.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" } });
  const area = (595.28 - 2 * 39.69) * (841.89 - 45.35 - 51.02);
  return Math.max(0, ...[...pdf.toString("latin1").matchAll(/\/Subtype\s*\/Link[\s\S]{0,400}?\/Rect\s*\[([^\]]*)\]/g)].map((m) => { const [a, b, c, d] = m[1].trim().split(/\s+/).map(Number); return Math.abs((c - a) * (d - b)) / area; }));
};
for (const [id, kind, what, body] of PROBES) {
  const stored = sanitizeDocHtml(body);
  const res = await views(stored);
  const bad = Object.entries(res).flatMap(([v, r]) => broken(r).map((x) => `${v} ${x}`));
  const share = await pdfLinks(); // the print page still shows this body
  let click = "";
  if (kind === "legit" && /<a href="https?:/.test(stored)) {
    // a real click on the link's first word: the link opens in a NEW tab, the portal's tab stays where it was
    state.html = printPage(stored); state.csp = CSP;
    await pages.screen.goto(`${ORIGIN}/doc?click=${n++}`, { waitUntil: "load" });
    await settle(pages.screen, ".pts-docbody");
    const pt = await pages.screen.evaluate(() => {
      const a = document.querySelector(".pts-docbody a[href]"); if (!a) return null;
      const tw = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); let tx = tw.nextNode(); while (tx && !tx.data.trim()) tx = tw.nextNode();
      let b; if (tx) { const r = document.createRange(); r.setStart(tx, tx.data.search(/\S/)); r.setEnd(tx, tx.data.search(/\S/) + 1); b = r.getClientRects()[0]; } else b = a.getBoundingClientRect();
      return b && b.width ? [b.left + b.width / 2, b.top + b.height / 2] : null;
    });
    if (!pt) { click = "no link left to click"; } else {
    const before = pages.screen.url(), out0 = state.out.length;
    const popup = ctx.waitForEvent("page", { timeout: 3000 }).catch(() => null);
    await pages.screen.mouse.click(pt[0], pt[1]);
    const tab = await popup;
    await pages.screen.waitForTimeout(200);
    if (!tab) click = "the link opened no new tab";
    else if (pages.screen.url() !== before) click = "the portal's tab left";
    else if (!state.out.slice(out0).some((u) => /^https?:/.test(u))) click = "the new tab went nowhere";
    if (tab) await tab.close().catch(() => {});
    }
  }
  t(`${id} (${kind}) ${what}`, !bad.length && share <= 0.03 && !click, [...bad, share > 0.03 ? `a PDF link covers ${(share * 100).toFixed(0)}% of a page` : "", click].filter(Boolean).join("; ") + ` — ${stored.slice(0, 160)}`);
}

// ── 1b. round 9 review 4: the page around the body stays the page's ──────────────────────
// what is left open at the end of a body never takes the footer into it (a link, a dropdown, a formula, white
// 4-pt words); in print the title page's white band covers the side strip beside the logo; a link always looks one
const look = async (view, stored, fn, arg) => {
  state.html = printPage(stored); state.csp = CSP;
  await pages[view].goto(`${ORIGIN}/doc?look=${n++}`, { waitUntil: "load" });
  await settle(pages[view], ".pts-docbody");
  return pages[view].evaluate(fn, arg);
};
const footerOf = () => { const f = document.querySelector(".docfooter"); if (!f) return "none"; const cs = getComputedStyle(f); return [!!f.closest(".pts-docbody, a, select, math, b"), cs.color, cs.fontSize].join(" "); };
for (const view of ["screen", "print"]) {
  const own = await look(view, "<p>Text</p>", footerOf);
  const off = [];
  for (const [id, , , body] of PROBES.filter((p) => ["P42", "P43", "P44", "P45", "P46"].includes(p[0]))) { const f = await look(view, sanitizeDocHtml(body), footerOf); if (f !== own) off.push(`${id}: ${f}`); }
  t(`review 4 — ${view}: what a body leaves open never takes the page's footer (a link, a dropdown, a cell, bold, a formula)`, !off.length && own.startsWith("false "), `${own} | ${off.join("; ")}`);
}
{
  const cover = docCoverHtml(fakeScheme("T", "classic"), "instruction", "bg", OPTS, getSkin("classic"));
  const r = await look("print", sanitizeDocHtml(cover + "<p>Текст.</p>"), () => {
    const side = document.querySelector(".doc-side"), band = document.querySelector(".pts-docbody .dochead-wrap");
    if (!side || !band) return `strip ${!!side}, band ${!!band}`;
    side.style.pointerEvents = "auto"; // hit-testing follows the painting order: what is on top there
    const s = side.getBoundingClientRect(), b = band.getBoundingClientRect();
    const top = document.elementFromPoint(s.left + s.width / 2, b.top + Math.min(40, b.height / 2));
    return top && top.closest(".dochead-wrap") ? "band" : top ? top.className || top.tagName : "nothing";
  });
  t("review 4 — print: the title page's white band covers the side strip beside the logo", r === "band", r);
}
{
  const body = PROBES.find((p) => p[0] === "P54")[3];
  const r = await look("screen", sanitizeDocHtml(body + `<p><a href="https://evil.example/s">a <s>struck</s> word</a></p>`), () => [...document.querySelectorAll(".pts-docbody a, .pts-docbody a *")].map((e) => { const cs = getComputedStyle(e); return `${e.localName}: ${cs.color} on ${cs.backgroundColor}, ${cs.textDecorationLine}, ${cs.textShadow ? "edged" : "bare"}`; }));
  t("review 4 — a link always looks one: its own colour, edged, on what is behind it, underlined itself — a <s> inside keeps its line",
    r.length > 2 && r.every((x) => /: rgb\(5, 99, 193\) on rgba\(0, 0, 0, 0\), .*, edged$/.test(x)) && r.filter((x) => x.startsWith("a:")).every((x) => x.includes(", underline,")) && r.some((x) => x.startsWith("s:") && x.includes("line-through")), JSON.stringify(r.slice(0, 4)));
  // seen: the link's area as painted, against the same area with its letters hidden — never the same picture to a
  // reader (≥ 10 pixels a step of 64 apart in a channel; blue on blue without the link's white edge: 0)
  // a PNG (8-bit, RGB or RGBA, not interlaced — what Chromium's screenshots are) as {w, h, px: RGBA bytes}
  const png = (buf) => {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), type = buf[25], bpp = type === 6 ? 4 : 3;
    const idat = []; for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o), t = buf.toString("latin1", o + 4, o + 8); if (t === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
    const raw = inflateSync(Buffer.concat(idat)), row = w * bpp, px = Buffer.alloc(w * h * 4), prev = Buffer.alloc(row), cur = Buffer.alloc(row);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (row + 1)];
      for (let x = 0; x < row; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = raw[y * (row + 1) + 1 + x];
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[x] = (v + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
      }
      for (let x = 0; x < w; x++) { px[(y * w + x) * 4] = cur[x * bpp]; px[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; px[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; px[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
      cur.copy(prev);
    }
    return { w, h, px };
  };
  // how many pixels of two pictures of one place differ by a step a reader sees (≥ 64 in a channel)
  const differ = (a, b) => { const A = png(a), B = png(b); let n = 0; for (let i = 0; i < A.px.length; i += 4) if (Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2])) >= 64) n++; return n; };
  const seen = async (view, html) => {
    state.html = printPage(sanitizeDocHtml(html)); state.csp = CSP;
    const p = pages[view];
    await p.goto(`${ORIGIN}/doc?seen=${n++}`, { waitUntil: "load" });
    await settle(p, ".pts-docbody");
    const box = await p.evaluate(() => { const a = document.querySelector(".pts-docbody a"); a.scrollIntoView({ block: "center" }); const r = a.getBoundingClientRect(); return { x: Math.max(0, r.left - 2), y: Math.max(0, r.top - 2), width: r.width + 4, height: r.height + 4 }; });
    const shown = await p.screenshot({ clip: box });
    await p.evaluate(() => { for (const e of document.querySelectorAll(".pts-docbody a, .pts-docbody a *")) e.style.setProperty("visibility", "hidden", "important"); });
    const hidden = await p.screenshot({ clip: box });
    return differ(shown, hidden) >= 10;
  };
  const BLUE = "#0563c1";
  const hiders = {
    "blue words on a blue cell": `<table><tr><td style="background-color:${BLUE};color:${BLUE}"><a href="https://evil.example/h1">hidden words</a></td></tr></table>`,
    "blue on a blue paragraph": `<p style="background-color:${BLUE}"><a href="https://evil.example/h2">hidden words</a></p>`,
    "a link painted blue on its own": `<p><a href="https://evil.example/h3"><span style="background-color:${BLUE};color:${BLUE}">hidden words</span></a></p>`,
    "white words on white": `<p><a href="https://evil.example/h4"><span style="color:#fff;background-color:#fff">hidden words</span></a></p>`,
  };
  // (in print a link has no white edge — it was more text in the PDF — so blue on a blue cell is screen's alone)
  for (const view of ["screen", "print"]) {
    const hid = [], cases = Object.entries(hiders).filter(([k]) => view === "screen" || !k.startsWith("blue"));
    for (const [k, h] of cases) if (!(await seen(view, h))) hid.push(k);
    t(`review 4 — ${view}: no colour hides a link (${cases.map(([k]) => k).join("; ")})`, !hid.length, hid.join("; "));
  }
  t("review 4 — a link of blanks only is no link", !/<a /.test(sanitizeDocHtml(PROBES.find((p) => p[0] === "P55")[3]).replace(/<a href="https:\/\/evil\.example\/P55" target="_blank" rel="noopener noreferrer">\. \.<\/a>/, "")));
}

// ── 1d. round 9, last look: a link's edge is no text in print; a link is above any free picture ──────────────
{
  // in print no shadow and no stroke on a link or what is in it: either draws its words again, and the PDF's text
  // layer read every linked word twice («See the official / official website / website for details.»)
  const LINKED = `<p>See the <a href="https://ptsbg.eu/">official website</a> for details, and <a href="https://ptsbg.eu/b"><b>bold</b> <s>struck</s></a>.</p>`;
  const marks = await look("print", sanitizeDocHtml(LINKED), () => [...document.querySelectorAll(".pts-docbody a, .pts-docbody a *")].map((e) => { const cs = getComputedStyle(e); return `${e.localName}:${cs.textShadow}/${cs.webkitTextStrokeWidth}`; }));
  t("last look — print: no text-shadow or text-stroke on a link or what is in it", marks.length > 2 && marks.every((x) => /:none\/0px$/.test(x)), JSON.stringify(marks));
  // …and, where pdftotext is on the machine, the PDF's own text layer: each linked word once
  const bin = ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"].find((b) => existsSync(b));
  if (bin) {
    const pdf = await pages.print.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" } }); // (the print page still shows LINKED)
    const dir = mkdtempSync(path.join(tmpdir(), "vdl-")), f = path.join(dir, "links.pdf");
    writeFileSync(f, pdf);
    const txt = execFileSync(bin, [f, "-"]).toString();
    rmSync(dir, { recursive: true, force: true });
    const n = (w) => txt.split(w).length - 1;
    t("last look — the PDF's text layer has each linked word once (pdftotext)", n("official") === 1 && n("website") === 1 && n("struck") === 1, JSON.stringify(txt.split("\n").filter((l) => /official|website|struck/.test(l))));
  } else console.log("(no pdftotext on this machine: the computed-style check above stands for the PDF's text layer)");
  // a free picture laid over a link (z-index up to 20) never hides it: at the centre of each of its words the link is on
  // top — pictures made to take clicks here only to read what is painted on top (the screen and the PDF), and as they
  // are in the editor
  const COVERED = `<p>Изтеглете:</p><p><a href="https://evil.example/under">${"изтегли ".repeat(12)}</a></p><img class="free" src="/brand/logo.png" alt="" style="left:0mm;top:5mm;width:160mm;height:25mm;z-index:20">`;
  const onTop = () => { const a = document.querySelector('a[href*="under"]'); const img = document.querySelector("img.free"); if (!a || !img) return "missing"; img.style.setProperty("pointer-events", "auto", "important");
    const r = [...a.getClientRects()][0], ir = img.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const under = ir.left <= x && x <= ir.right && ir.top <= y && y <= ir.bottom; const top = document.elementFromPoint(x, y); return (under ? "covered, " : "not covered, ") + (top && top.closest("a") === a ? "link on top" : "on top: " + (top ? top.tagName : "nothing")); };
  const res = [];
  for (const view of ["screen", "print"]) res.push(`${view}: ${await look(view, sanitizeDocHtml(COVERED), onTop)}`);
  await pages.editor.evaluate((h) => { scrollTo(0, 0); document.querySelector(".we-docbody").innerHTML = h; }, sanitizeDocHtml(COVERED));
  await settle(pages.editor, ".we-docbody");
  res.push(`editor: ${await pages.editor.evaluate(onTop)}`);
  t("last look — a link under a free picture is on top at its own words (screen, print, the editor)", res.every((x) => x.endsWith("covered, link on top") && x.includes(": covered")), res.join(" | "));
}

// ── 1c. round 9 review 4, second look: a word in a table's cell is never split ─────────────────
// (a cell is as wide as its longest word, as it always was: «anywhere» split «Международни» in an 18-mm Word cell)
{
  const splitWords = () => { const out = []; const body = document.querySelector(".pts-docbody, .we-docbody"); const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let x; (x = tw.nextNode());) { const el = x.parentElement; if (!el.closest("td,th") || el.closest("a")) continue; const re = /\S+/g; let m;
      while ((m = re.exec(x.data))) { const r = document.createRange(); r.setStart(x, m.index); r.setEnd(x, m.index + m[0].length); if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1) out.push(m[0]); } }
    return out; };
  const W = (w, t) => `<td width=${Math.round(w / 0.75)} valign=top style='width:${w}pt;border:solid windowtext 1.0pt;padding:0cm 5.4pt 0cm 5.4pt'><p class=MsoNormal>${t}</p></td>`;
  const tables = {
    "an auto table": '<table border="1" style="border-collapse:collapse"><tr><td>Описание на изпитването и на всички условия, при които то се провежда в лабораторията на участника</td><td>Международни</td><td>Неопределеност</td><td>Стойност</td></tr></table>',
    "an 18-mm cell": '<table style="border-collapse:collapse"><tr><td style="width:18mm;border:solid windowtext 1.0pt">Квалификация</td><td style="width:140mm;border:solid windowtext 1.0pt">Текст на клетката</td></tr></table>',
    "a Word table of narrow cells": `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'><tr>${W(42, "Международни")}${W(48, "Неопределеност")}${W(45, "Квалификация")}${W(40, "Валидиране")}${W(50, "Сертифициране")}${W(150, "Описание на изпитването и на условията")}</tr></table>`,
    "a table with a link": `<table border="1"><tr><td>Акредитационен номер и Международни споразумения</td><td><a href="https://ptsbg.eu/">ptsbg.eu/акредитация</a></td></tr></table>`,
  };
  const split = [];
  for (const [k, h] of Object.entries(tables)) {
    for (const view of ["screen", "print"]) { const r = await look(view, sanitizeDocHtml(h), splitWords); if (r.length) split.push(`${k} (${view}): ${r.join(", ")}`); }
    await pages.editor.evaluate((x) => { scrollTo(0, 0); document.querySelector(".we-docbody").innerHTML = x; }, sanitizeDocHtml(h));
    await settle(pages.editor, ".we-docbody");
    const r = await pages.editor.evaluate(splitWords); if (r.length) split.push(`${k} (editor): ${r.join(", ")}`);
  }
  t("review 4b — no word in a table's cell split across lines (screen, print, the editor)", !split.length, split.join(" | "));
}

// ── 2. seeded generated documents ────────────────────────────────────────────────────────
const SKIN_CSS = SKINS.map((s) => s.css);
const generate = makeGenerator(classPool([DOC_CSS, ...SKIN_CSS, ...DOCUMENTS.flatMap((d) => [d.editorCss?.t ?? "", d.editorCss?.c ?? ""]), EDITOR_CSS, COVER_CSS]));
const rng = (seed) => { let a = seed >>> 0 || 1; const next = () => { a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p }; };
const byView = { screen: [], print: [], fill: [], editor: [] };
for (let i = 0; i < N; i++) {
  const html = render(generate(rng(SEED * 7919 + i)));
  const res = await views(sanitizeDocHtml(html));
  for (const [v, r] of Object.entries(res)) { const b = broken(r); if (b.length) byView[v].push(`#${i} ${b[0]} — ${html.slice(0, 200)}`); }
}
for (const [v, list] of Object.entries(byView)) t(`${N} generated documents (seed ${SEED}) — ${v}: no link beyond its words, none taking the screen, nothing outside the sheet, no link outside the body`, !list.length, `${list.length} documents; first: ${list[0] ?? ""}`);

// ── 3. the built-in bodies, unchanged by the cleaner ──────────────────────────────────────
const changed = [];
let pieces = 0;
for (const d of DOCUMENTS.filter((x) => x.render)) for (const type of ["T", "C"]) for (const lang of ["bg", "en"]) {
  const body = docDefaultBody(fakeScheme(type), d.key, lang, OPTS);
  if (body) { pieces++; if (sanitizeDocHtml(body) !== body) changed.push(`${d.key}/${type}/${lang}`); }
  for (const skin of ["classic", "modern", "minimal"]) { const c = docCoverHtml(fakeScheme(type, skin), d.key, lang, OPTS, getSkin(skin)); if (c) { pieces++; if (sanitizeDocHtml(c) !== c) changed.push(`${d.key}/${type}/${lang}/${skin} title page`); } }
}
t(`the ${pieces} built-in bodies and title pages come out of the cleaner byte for byte`, !changed.length, changed.slice(0, 5).join(", "));

await browser.close();
console.log(`\nverify-doc-links: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
