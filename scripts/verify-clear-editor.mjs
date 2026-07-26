// Live checks for the "clear scheme editor":
// T: grouped standard cards with live заявка/План previews + click-to-focus +
//    paste cleanup. C: calibration-first editor (no standards), заявка step 3
//    built from the device, count stored under "cal" and shown on approval page.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
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

// open the scheme so labs can apply, and save (round-trips the cal_* fields)
await page.getByRole("button", { name: /Отворена|Open/ }).first().click();
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(/schemes\/25-06-C-1$/);
await go(`${BASE}/schemes/25-06-C-1/edit`);
t("C: calibration survives a save round-trip", (await page.content()).includes("Силомер клас 00"));

// ── 3. C заявка: step 3 = the device item; submit stores the count ──
await go(`${BASE}/apply/25-06-C-1`);
const ahtml = await page.content();
t("C заявка: device is the step-3 item", ahtml.includes("Силомер клас 00"));
t("C заявка: quantity + points shown", ahtml.includes("Сила (20 kN, 40 kN"));

await page.fill('input[name="labName"]', "Калибрационна Лаб");
await page.fill('input[name="manager"]', "Петър Петров");
await page.fill('input[name="contactPerson"]', "Анна Ангелова");
await page.fill('input[name="email"]', "callab@example.com");
await page.fill('input[name="phone"]', "+359888111222");
await page.getByRole("button", { name: /Напред към детайли|Next: details/ }).click();
await page.fill('input[name="deliveryAddress"]', "бул. Калибрация 7, Варна");
await page.fill('input[name="postalCode"]', "9000");
await page.getByRole("button", { name: /Напред към тестовете|Next: test items/ }).click();
await page.locator('input[type="number"]').first().fill("2");
await page.getByRole("button", { name: /Изпрати заявката|Submit application/ }).click();
await page.waitForURL(/apply\/thanks/);
t("C заявка: submitted", true);

await go(`${BASE}/schemes/25-06-C-1/applications`);
const apps = await page.content();
t("C applications: count labeled by the quantity", apps.includes("Force ×2") || apps.includes("Сила ×2"), "");

// approve → participant with participations from the cal count
await page.getByRole("button", { name: /Одобри|Approve/ }).first().click();
await page.waitForTimeout(900);
await go(`${BASE}/schemes/25-06-C-1/participants`);
t("C approve: participant created", (await page.content()).includes("Калибрационна Лаб"));

// ── 4. T заявка unchanged: standards still the step-3 items ──
await go(`${BASE}/apply/26-01-T-1`);
t("T заявка: standards still render", (await page.content()).includes("EN 1338"));

await browser.close();
console.log(`verify-clear-editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
