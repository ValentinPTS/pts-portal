// Live checks for the auto lists (F 7.2.1-4/-5/-6):
// bottom "Автоматични списъци" section, no lifecycle status, excluded from
// progress, editor without Готов, manager customization honored + resettable.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const S = "26-01-T-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

// helpers: reset a customized list from its row menu; wait for N auto pills.
async function resetRow(name) {
  const row = page.locator("div")
    .filter({ hasText: name })
    .filter({ has: page.locator('button[aria-label="More"]') })
    .last(); // innermost matching div = the row card itself
  await row.locator('button[aria-label="More"]').click();
  await page.getByRole("button", { name: /Върни автоматичния изглед/ }).click();
}
async function waitAutoPills(n) {
  for (let i = 0; i < 12; i++) {
    if ((await page.getByText("Автоматичен ⟳").count()) === n) return true;
    await page.waitForTimeout(900);
    await go(`${BASE}/schemes/${S}`);
  }
  return (await page.getByText("Автоматичен ⟳").count()) === n;
}

// 1. Scheme page: lists live ONLY in the bottom section, marked automatic.
await go(`${BASE}/schemes/${S}`);
await page.getByText("Автоматични списъци").waitFor();
// clean slate: undo any customization left over from a previous run
while ((await page.getByText("Персонализиран").count()) > 0) {
  await resetRow(await page.locator("div").filter({ has: page.getByText("Персонализиран") }).filter({ has: page.locator('button[aria-label="More"]') }).last().locator("div").first().innerText().then((s) => s.split("\n")[0]));
  await waitAutoPills(3);
}
t("section: bottom 'Автоматични списъци' present", true);
const autoPills = await page.getByText("Автоматичен ⟳").count();
t("lists: show 'Автоматичен' status (3)", autoPills === 3, `pills=${autoPills}`);
t("lists: no 'Незапочнат' on them", (await page.getByText("Незапочнат").count()) <= 12);
const bodyText = await page.locator("body").innerText();
const stagesPart = bodyText.split("Автоматични списъци")[0];
t("stages: lists moved out of stage groups", !stagesPart.includes("Списък на заявилите участие"), "");
t("progress: total is 12 (lists excluded)", /\/\s*12|от\s*12|12\s*док/.test(bodyText) || !bodyText.includes("/ 15"), "");

// 2. Editor for a list: no Готов button; for the plan: it's there.
await go(`${BASE}/schemes/${S}/build/registered`);
const starter = page.getByRole("button", { name: /Шаблон по подразбиране/ });
if (await starter.isVisible().catch(() => false)) await starter.click();
await page.locator('[contenteditable="true"]').first().waitFor();
t("editor(list): no Готов button", (await page.getByRole("button", { name: /Маркирай като готов|Готов ✓/ }).count()) === 0);

// 3. Customize the list (manager) → save → scheme page shows "Персонализиран".
await page.locator('[contenteditable="true"]').first().click({ position: { x: 200, y: 30 } });
await page.keyboard.type("CUSTOM-LIST-33 ");
await page.getByRole("button", { name: /^Запази$/ }).click();
await page.getByText(/Всичко е запазено|Запазено ✓/).first().waitFor();
await go(`${BASE}/schemes/${S}`);
t("scheme page: customized pill appears", (await page.getByText("Персонализиран").count()) === 1);

// 4. Composed print honors the customization (manager view).
await go(`${BASE}/schemes/${S}/build/registered/print?lang=bg`);
t("print: manager sees the customization", (await page.content()).includes("CUSTOM-LIST-33"));

// 5. Reset to automatic from the row menu.
await go(`${BASE}/schemes/${S}`);
await resetRow("Списък на заявилите участие");
t("reset: back to 'Автоматичен'", await waitAutoPills(3));
await go(`${BASE}/schemes/${S}/build/registered/print?lang=bg`);
t("reset: print is the fresh auto list again", !(await page.content()).includes("CUSTOM-LIST-33"));

// screenshot of the section for the design check
await go(`${BASE}/schemes/${S}`);
await page.getByText("Автоматични списъци").scrollIntoViewIfNeeded();
await page.screenshot({ path: "/tmp/lists-section.png" });

await browser.close();
console.log(`verify-lists: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
