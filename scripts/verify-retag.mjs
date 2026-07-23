// Live check for LEGACY form-doc bodies (saved before data-ff existed): strip
// every data-ff from a заявка in the editor and save (= an old document), then
// prove the locked Fill view is still interactive (retagFormBody re-attaches
// identity), values persist, print draws them, and reopening the editor serves
// the body re-tagged so the next save makes it permanent.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const S = "26-01-T-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

// 1. Make the saved заявка legacy: strip all data-ff in the editor and save.
await go(`${BASE}/schemes/${S}/build/application`);
const starter = page.getByRole("button", { name: /Шаблон по подразбиране/ });
if (await starter.isVisible().catch(() => false)) await starter.click();
const ed = page.locator('[contenteditable="true"]').first();
await ed.waitFor();
const stripped = await page.evaluate(() => {
  const body = document.querySelector('[contenteditable="true"]');
  let n = 0;
  body.querySelectorAll("[data-ff]").forEach((el) => { el.removeAttribute("data-ff"); n++; });
  body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return n;
});
t("setup: stripped a real number of tags", stripped > 3, `stripped=${stripped}`);
await page.getByRole("button", { name: /^Запази$/ }).click();
await page.getByText(/Всичко е запазено|Запазено ✓/).first().waitFor();

// 2. Locked Fill view: still interactive (retag on the fly).
await go(`${BASE}/schemes/${S}/fill/application?lang=bg`);
const named = await page.locator("input.ff-line[name]").count();
t("fill: legacy body hydrated into named inputs", named >= 3, `inputs=${named}`);
const line = page.locator("input.ff-line").first();
await line.fill("LEGACY-VAL-55");
await page.getByRole("button", { name: /^Запази$/ }).click();
await page.waitForURL(/saved=1/);
t("fill: value persisted on a legacy body", (await page.locator("input.ff-line").first().inputValue()) === "LEGACY-VAL-55");

// 3. Print draws the value into the legacy body.
await go(`${BASE}/schemes/${S}/build/application/print?lang=bg`);
t("print: legacy body draws the fill value", (await page.content()).includes("LEGACY-VAL-55"));

// 4. Editor serves the body re-tagged; saving persists the identity.
await go(`${BASE}/schemes/${S}/build/application`);
await ed.waitFor();
const tags = await page.evaluate(() => document.querySelector('[contenteditable="true"]').querySelectorAll("[data-ff]").length);
t("editor: reopened legacy body is re-tagged", tags >= stripped - 1, `tags=${tags} (was ${stripped})`);

await browser.close();
console.log(`verify-retag: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
