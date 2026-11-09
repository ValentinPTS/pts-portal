// Live checks, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-pages.mjs
// (1) Declaration F 4.2-2 = exactly ONE full page in BG + EN — measured in the
//     PDF's own geometry, and the real PDF counted;
// (2) Invitation template has no top-level block taller than a page and shows
//     real page gaps in the editor; (3) the editor self-heals an oversized
//     .body wrapper (old saved pokani) into breakable blocks.
//
// Updated 2026-11-05: since "Editor pages = real A4" (2026-07-23) the SCREEN sheet
// folds the PDF's 16mm top margin into its padding, so measuring the print route
// on screen read 16mm (≈60px) too low on the page. The declaration is now measured
// in print media at the PDF's printable width (A4 − 14mm sides = 182mm), which is
// what /api/pdf lays out — and the PDF's page count is checked too, since the
// signature line alone never covered the form's footer line below it.
// Found by this check and fixed 2026-11-05 (lib/docs/declaration.ts DEC_CSS): the
// declaration's PDF was TWO pages in BG and EN — the form fit (signature at 954px of
// 994px), but its own footer line (.docfooter) ended at 1000px and the sheet's 50px
// bottom padding followed, so page 2 carried only "Revision 1 · F 4.2-2 · …".
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = "26-01-T-1";
const PXMM = 96 / 25.4;
const PAGE_H = Math.round(263 * PXMM); // 994px — one printed page of content (297 − 16 − 18 mm)
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name, extra); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const context = await browser.newContext(); // one context: both pages carry the persona
const page = await context.newPage();
page.setDefaultTimeout(60000);
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

await go(`${BASE}/dev/persona?role=manager`);

async function pdfPages(doc, lang) {
  const res = await page.request.post(`${BASE}/api/pdf`, {
    data: { id: S, doc, lang, composed: false }, timeout: 120000, // composed:false = the /doc/…/print route measured below
  });
  if (!res.ok()) throw new Error(`pdf ${doc}: ${res.status()}`);
  const counts = [...(await res.body()).toString("latin1").matchAll(/\/Count (\d+)/g)].map((m) => +m[1]);
  if (!counts.length) throw new Error("no /Count in PDF");
  return Math.max(...counts);
}

// ── 1. Declaration: one full page, both languages ──
// A second page with the PDF's printable box, in print media — the same layout
// Chromium paginates in /api/pdf (margins 16/14/18/14mm).
const printView = await context.newPage();
await printView.setViewportSize({ width: Math.round(182 * PXMM), height: PAGE_H });
await printView.emulateMedia({ media: "print" });
for (const lang of ["bg", "en"]) {
  await printView.goto(`${BASE}/schemes/${S}/doc/declaration/print?lang=${lang}`, { waitUntil: "load", timeout: 90000 });
  await printView.evaluate("document.fonts ? document.fonts.ready : 0").catch(() => {});
  const m = await printView.evaluate(() => {
    const pg = document.querySelector(".page");
    const top = pg.getBoundingClientRect().top;
    const below = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().bottom - top);
    return { sign: below(".dec-sign"), footer: below(".docfooter"), sheet: Math.round(pg.getBoundingClientRect().height) };
  });
  t(`declaration ${lang}: the form fits one page`, m.sign <= PAGE_H, `signature ends ${m.sign}px of ${PAGE_H}px`);
  t(`declaration ${lang}: fills the page (≥80%)`, m.sign >= PAGE_H * 0.8, `${m.sign}px = ${Math.round((m.sign / PAGE_H) * 100)}%`);
  const n = await pdfPages("declaration", lang);
  t(`declaration ${lang}: the PDF is one page`, n === 1,
    `pdf pages=${n}; footer line ends ${m.footer}px, sheet ${m.sheet}px of ${PAGE_H}px`);
}
await printView.close();

// ── 2. Invitation template: breakable blocks + page gaps in the editor ──
// A document never saved opens on the «Започни … от…» chooser; it renders after
// hydration, so wait for whichever comes first rather than checking once.
await go(`${BASE}/schemes/${S}/build/invitation`);
const editor = page.locator('[contenteditable="true"]').first();
const starter = page.getByRole("button", { name: /Шаблон по подразбиране|Default template/ });
await editor.or(starter).first().waitFor();
if (await starter.isVisible()) await starter.click();
await editor.waitFor();
await page.waitForTimeout(1500); // fonts + pagination settle
const inv = await page.evaluate((PH) => {
  const body = document.querySelector('[contenteditable="true"]');
  const kids = [...body.children].filter((c) => !c.classList.contains("we-gap"));
  const over = kids.filter((c) => c.offsetHeight > PH).map((c) => `${c.tagName}.${c.className} ${c.offsetHeight}px`);
  return { over, gaps: body.querySelectorAll(".we-gap").length };
}, PAGE_H);
t("invitation: no block taller than a page", inv.over.length === 0, JSON.stringify(inv.over));
t("invitation: editor shows page gaps (≥2)", inv.gaps >= 2, `gaps=${inv.gaps}`);

// ── 3. Self-heal: an oversized old-style .body wrapper gets unwrapped ──
// (in the open editor only — nothing is saved)
const healed = await page.evaluate(async () => {
  const body = document.querySelector('[contenteditable="true"]');
  const div = document.createElement("div");
  div.className = "body";
  div.innerHTML = Array.from({ length: 45 }, (_, i) => `<p>heal-me ${i}</p>`).join("");
  body.appendChild(div);
  body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const stillWrapped = [...body.children].some(
    (c) => c.classList.contains("body") && c.textContent.includes("heal-me")
  );
  const loose = body.querySelectorAll(":scope > p").length;
  return { stillWrapped, loose };
});
t("self-heal: oversized .body unwrapped", !healed.stillWrapped && healed.loose >= 45, JSON.stringify(healed));

await browser.close();
console.log(`verify-pages: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
