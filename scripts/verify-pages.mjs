// Live checks: (1) Declaration = exactly ONE full page in BG + EN;
// (2) Invitation template has no top-level block taller than a page and shows
//     real page gaps in the editor; (3) the editor self-heals an oversized
//     .body wrapper (old saved pokani) into breakable blocks.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const S = "26-01-T-1";
const PAGE_H = Math.round((263 * 96) / 25.4); // 994px — one printed page of content
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name, extra); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

// ── 1. Declaration: one full page, both languages ──
for (const lang of ["bg", "en"]) {
  await go(`${BASE}/schemes/${S}/doc/declaration/print?lang=${lang}`);
  await page.evaluate("document.fonts ? document.fonts.ready : 0").catch(() => {});
  const h = await page.evaluate(() => {
    const pg = document.querySelector(".page");
    const sign = document.querySelector(".dec-sign");
    return Math.round(sign.getBoundingClientRect().bottom - pg.getBoundingClientRect().top);
  });
  t(`declaration ${lang}: fits one page`, h <= PAGE_H, `${h}px vs ${PAGE_H}px`);
  t(`declaration ${lang}: fills the page (≥80%)`, h >= PAGE_H * 0.8, `${h}px = ${Math.round((h / PAGE_H) * 100)}%`);
}

// ── 2. Invitation template: breakable blocks + page gaps in the editor ──
await go(`${BASE}/schemes/${S}/build/invitation`);
const starter = page.getByRole("button", { name: /Шаблон по подразбиране/ });
if (await starter.isVisible().catch(() => false)) await starter.click();
await page.locator('[contenteditable="true"]').first().waitFor();
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
