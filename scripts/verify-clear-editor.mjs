// Live checks for the "clear scheme editor":
// T: grouped standard cards with live заявка/План previews + click-to-focus +
//    paste cleanup. C: calibration-first editor (no standards), the заявка's
//    participation item built from the device.
// Against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-clear-editor.mjs
//
// Updated 2026-11-05: online applications are closed until part 9.2 (part 0.4,
// Реш. 1, 145–146) — /apply/<id> shows the PDF route, never the wizard. The old
// steps "C заявка step 3 = the device", "submit ×2 → «Force ×2» on the
// applications page → approve → participant" cannot run: no laboratory can apply
// online. What a laboratory fills in now is the заявка FORM, so the device, the
// quantity and the calibration points are checked in the C заявка document
// (Ф 7.2.1-3 §2), and the T заявка's standards in the T document. The
// count-from-"cal" approval path returns to this check with part 9.2.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

await go(`${BASE}/dev/persona?role=manager`);

// ── 1. TESTING scheme editor: groups, placeholders, preview, click-to-focus ──
await go(`${BASE}/schemes/26-01-T-1/edit`);
await page.getByRole("button", { name: /Добави стандарт|Add standard/ }).waitFor();
const html = await page.content();
t("T: destination groups present", html.includes("Какво виждат лабораториите") && html.includes("Само в Плана"));
t("T: real example placeholders", html.includes("Метод с телена кошница"));
t("T: заявка + План previews render", html.includes("Заявката (стъпка 3)") && html.includes("Планът (§6)"));

// live preview mirrors typing (first card's standard BG field)
const firstStd = page.locator('input[id$="-stdBg"]').first();
await firstStd.fill("БДС TEST-PREVIEW 42");
await page.waitForTimeout(200);
t("T: preview updates live", (await page.content()).split("БДС TEST-PREVIEW 42").length >= 4, "field + header + 2 previews");

// paste cleanup: junk chars (zero-width, PUA, FFFD) stripped on input
await firstStd.fill("");
await page.evaluate(() => {
  const el = document.querySelector('input[id$="-stdBg"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "БДС​ EN� 933-1");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(150);
t("T: pasted junk characters removed", (await firstStd.inputValue()) === "БДС EN 933-1", JSON.stringify(await firstStd.inputValue()));

// click-to-focus: clicking the preview's standard line focuses the field
// (the dark заявка preview shows the typed value with cursor:pointer)
await page.locator('input[id$="-chBg"]').first().focus();
await page.locator('[data-prev="std"]').first().click();
const focusedIsStd = await page.evaluate(() => document.activeElement?.id?.endsWith("-stdBg") ?? false);
t("T: clicking the preview focuses the matching field", focusedIsStd);

// ── 2. CALIBRATION scheme editor: calibration-first, no standards ──
await go(`${BASE}/schemes/25-06-C-1/edit`);
await page.getByText(/Обект и калибриране|Object & calibration/).first().waitFor();
const chtml = await page.content();
t("C: calibration is the main section", chtml.includes("Устройство за калибриране"));
t("C: no standards cards", !chtml.includes("Добави стандарт"));
t("C: device value loaded", chtml.includes("Силомер клас 00"));
t("C: заявка preview from device", chtml.includes("как ще го видят лабораториите"));

// set the scheme Open and save (round-trips the cal_* fields)
await page.getByRole("button", { name: /Отворена|Open/ }).first().click();
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(/schemes\/25-06-C-1$/);
await go(`${BASE}/schemes/25-06-C-1/edit`);
t("C: calibration survives a save round-trip", (await page.content()).includes("Силомер клас 00"));

// ── 3. C заявка: the participation item is the device, with quantity + points ──
await go(`${BASE}/apply/25-06-C-1`);
t("C: no online wizard while applications are closed (part 0.4)",
  (await page.locator('input[name="labName"]').count()) === 0);

await go(`${BASE}/schemes/25-06-C-1/doc/application/print?lang=bg`);
const part2 = (await page.locator("body").innerText()).replace(/\s+/g, " ");
t("C заявка: device is the participation item", part2.includes("Силомер клас 00"));
t("C заявка: quantity + points shown",
  part2.includes("Сила") && /20 \/ 40 \/ 60/.test(part2) && part2.includes("Точки на калибриране (kN)"));

// ── 4. T заявка unchanged: standards still the participation items ──
await go(`${BASE}/schemes/26-01-T-1/doc/application/print?lang=bg`);
t("T заявка: standards still render", (await page.content()).includes("EN 1338"));

await browser.close();
console.log(`verify-clear-editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
