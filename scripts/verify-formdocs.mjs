// Live round-trip for the form-doc WYSIWYG fix (заявка / application):
// edit in the Word editor → lock (Fill view) shows the EDITS with live inputs →
// fill-save persists → composed print draws the value → Готов button works.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
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

// 1. Edit the заявка in the Word editor and save.
await go(`${BASE}/schemes/${S}/build/application`);
// a fresh document greets with the "Започни от…" chooser — start from the template
const starter = page.getByRole("button", { name: /Шаблон по подразбиране/ });
if (await starter.isVisible().catch(() => false)) await starter.click();
const ed = page.locator('[contenteditable="true"]').first();
await ed.waitFor();
await ed.click({ position: { x: 200, y: 40 } });
await page.keyboard.press("Control+Home").catch(() => {});
await page.keyboard.type("EDIT-MARKER-77 ");
await page.getByRole("button", { name: /^Запази$/ }).click();
await page.getByText(/Всичко е запазено|Запазено ✓/).first().waitFor();
t("editor: edit saved", true);

// 2. The Готов button now exists for a form doc — mark ready.
const readyBtn = page.getByRole("button", { name: /Маркирай като готов/ });
t("editor: Готов button visible for заявка", await readyBtn.isVisible().catch(() => false));
await readyBtn.click();
await page.getByRole("button", { name: /Готов ✓/ }).waitFor();
t("editor: marked ready", true);

// 3. Locked Fill view shows the EDITED body, hydrated into live inputs.
await go(`${BASE}/schemes/${S}/fill/application?lang=bg`);
const body = await page.content();
t("fill: shows the owner's edit", body.includes("EDIT-MARKER-77"));
const line = page.locator('input.ff-line').first();
t("fill: static blanks hydrated into inputs", await line.count().then((n) => n > 0));

// 4. Fill a value, save, confirm it persists.
await line.fill("TEST-VAL-99");
await page.getByRole("button", { name: /^Запази$/ }).click();
await page.waitForURL(/saved=1/);
t("fill: value persisted after save", (await page.locator('input.ff-line').first().inputValue()) === "TEST-VAL-99");
t("fill: edit still shown after save", (await page.content()).includes("EDIT-MARKER-77"));

// 5. Composed print draws the fill value into the edited body.
await go(`${BASE}/schemes/${S}/build/application/print?lang=bg`);
const printed = await page.content();
t("print: edited body used", printed.includes("EDIT-MARKER-77"));
t("print: fill value drawn in", printed.includes("TEST-VAL-99"));
t("print: no live inputs in the печат view", !/<input[^>]*class="ff-line"/.test(printed));

// 6. Scheme page: заявка reads as done (docReady set).
await go(`${BASE}/schemes/${S}`);
t("scheme page loads after changes", (await page.content()).includes("Заявка"));

await browser.close();
console.log(`verify-formdocs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
