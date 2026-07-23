// The editor page must be geometrically IDENTICAL to the printed A4:
// sheet 210mm wide, text column exactly 608px, sheets 297mm tall on the sheet
// grid, and — the real test — the editor's page count must equal the actual
// PDF's page count for the same saved document.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
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

async function openDoc(doc) {
  await go(`${BASE}/schemes/${S}/build/${doc}`);
  const editor = page.locator('[contenteditable="true"]').first();
  const starter = page.getByRole("button", { name: /Шаблон по подразбиране/ });
  for (let i = 0; i < 30 && !(await editor.isVisible().catch(() => false)); i++) {
    if (await starter.isVisible().catch(() => false)) await starter.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
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
const grid = await page.evaluate((PXMM) => {
  const sheet = document.querySelector(".we-page");
  const gaps = document.querySelectorAll(".we-docbody .we-gap").length;
  const n = gaps + 1;
  return { n, total: sheet.getBoundingClientRect().height, expected: n * 297 * PXMM + gaps * 24 };
}, PXMM);
t(`sheet stack = n×297mm + seams (n=${grid.n})`, Math.abs(grid.total - grid.expected) <= 2,
  `${grid.total.toFixed(1)}px vs ${grid.expected.toFixed(1)}px`);

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
