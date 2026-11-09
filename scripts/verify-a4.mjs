// The editor page must be geometrically IDENTICAL to the printed A4:
// sheet 210mm wide, text column exactly 608px, sheets 297mm tall on the sheet
// grid, and — the real test — the editor's page count must equal the actual
// PDF's page count for the same saved document.
// Against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-a4.mjs
// Updated 2026-11-05: default port 3000, the manager persona, the start chooser
// waited for (it renders after hydration), and the grid check prints each sheet.
// Found by this check and fixed 2026-11-05 (components/WordEditor.tsx): the editor
// paginated once on opening and again only on an edit, so the title page's images
// (logo, embroidery, cover photo) loading AFTER that first pass made sheet 1 ~257px
// too tall and pushed every later seam off the grid until the first keystroke. It
// now re-paginates when a picture loads and when the web fonts are ready.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = "26-01-T-1";
const PXMM = 96 / 25.4;
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name, extra); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(60000);
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

await go(`${BASE}/dev/persona?role=manager`);

// A document never saved opens on the «Започни … от…» chooser — start it from the
// default template; one already saved opens straight in the editor.
async function openDoc(doc) {
  await go(`${BASE}/schemes/${S}/build/${doc}`);
  const editor = page.locator('[contenteditable="true"]').first();
  const starter = page.getByRole("button", { name: /Шаблон по подразбиране|Default template/ });
  await editor.or(starter).first().waitFor();
  if (await starter.isVisible()) await starter.click();
  await editor.waitFor();
  await page.evaluate("document.fonts ? document.fonts.ready : 0").catch(() => {});
  await page.waitForTimeout(1200); // pagination settle
}

async function pdfPages(doc, lang = "bg") {
  const res = await page.request.post(`${BASE}/api/pdf`, {
    data: { id: S, doc, lang, composed: true }, timeout: 120000,
  });
  if (!res.ok()) throw new Error(`pdf ${doc}: ${res.status()}`);
  const buf = await res.body();
  const counts = [...buf.toString("latin1").matchAll(/\/Count (\d+)/g)].map((m) => +m[1]);
  if (!counts.length) throw new Error("no /Count in PDF");
  return Math.max(...counts);
}

// ── 1. Sheet + column geometry in the editor ──
await openDoc("plan");
const geo = await page.evaluate(() => {
  const sheet = document.querySelector(".we-page");
  const body = document.querySelector(".we-docbody");
  const cs = getComputedStyle(sheet);
  return {
    sheetW: sheet.getBoundingClientRect().width,
    col: body.clientWidth,
    padL: cs.paddingLeft, padT: cs.paddingTop, padR: cs.paddingRight, padB: cs.paddingBottom,
    border: cs.borderLeftWidth,
  };
});
t("sheet width = 210mm", Math.abs(geo.sheetW - 210 * PXMM) < 1, `${geo.sheetW.toFixed(1)}px vs ${(210 * PXMM).toFixed(1)}px`);
t("text column = 608px (PDF exact)", Math.abs(geo.col - 608) <= 1, `${geo.col}px`);
t("no layout border", geo.border === "0px", geo.border);

// ── 2. Sheets sit on the 297mm grid ──
// Each sheet runs from one seam (.we-gapsep, the 24px canyon) to the next. Only the
// total is asserted — single sheets may differ by a few px (a gap stops the margins
// either side of it from collapsing; the last sheet absorbs it) — but each sheet's
// height is printed so a failure says which page is off.
const grid = await page.evaluate((PXMM) => {
  const sheet = document.querySelector(".we-page");
  const r = sheet.getBoundingClientRect();
  const seams = [...document.querySelectorAll(".we-docbody .we-gapsep")].map((s) => s.getBoundingClientRect());
  const edges = [r.top, ...seams.flatMap((s) => [s.top, s.bottom]), r.bottom];
  const sheets = [];
  for (let i = 0; i < edges.length; i += 2) sheets.push(+(edges[i + 1] - edges[i]).toFixed(1));
  const gaps = seams.length;
  return { n: gaps + 1, sheets, a4: 297 * PXMM, total: r.height, expected: (gaps + 1) * 297 * PXMM + gaps * 24 };
}, PXMM);
t(`sheet stack = n×297mm + seams (n=${grid.n})`, Math.abs(grid.total - grid.expected) <= 2,
  `${grid.total.toFixed(1)}px vs ${grid.expected.toFixed(1)}px; sheets ${grid.sheets.join(" / ")} (A4 = ${grid.a4.toFixed(1)}px)`);

// ── 3. THE test: editor page count == real PDF page count, three documents ──
for (const doc of ["plan", "invitation", "results"]) {
  await openDoc(doc);
  const saveBtn = page.getByRole("button", { name: /^Запази$/ });
  if (await saveBtn.isEnabled().catch(() => false)) {
    await saveBtn.click();
    await page.getByText(/Всичко е запазено|Запазено ✓/).first().waitFor();
  }
  const edPages = await page.evaluate(() => document.querySelectorAll(".we-docbody .we-gap").length + 1);
  const pdfN = await pdfPages(doc);
  t(`WYSIWYG pages: ${doc} editor=${edPages} pdf=${pdfN}`, edPages === pdfN);
}

// ── 4. Fill view sheet = A4 too ──
await go(`${BASE}/schemes/${S}/fill/application?lang=bg`);
await page.waitForTimeout(800);
const fillW = await page.evaluate(() => document.querySelector(".page").getBoundingClientRect().width);
t("fill view sheet = 210mm", Math.abs(fillW - 210 * PXMM) < 1, `${fillW.toFixed(1)}px`);

// ── 5. Certificate keeps its own tighter column on screen (print margins + 10mm) ──
await go(`${BASE}/schemes/${S}/doc/certificate/print?lang=bg`);
const cert = await page.evaluate(() => {
  const pg = document.querySelector(".page");
  const cs = getComputedStyle(pg);
  return { w: pg.getBoundingClientRect().width, padL: cs.paddingLeft };
});
t("certificate sheet = 210mm", Math.abs(cert.w - 210 * PXMM) < 1, `${cert.w.toFixed(1)}px`);
t("certificate padding = 14mm+10mm", Math.abs(parseFloat(cert.padL) - 24 * PXMM) < 1, cert.padL);

// screenshot of the editor for the design check
await openDoc("plan");
await page.screenshot({ path: "/tmp/a4-editor.png", clip: { x: 0, y: 0, width: 1500, height: 1000 } });

await browser.close();
console.log(`verify-a4: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
