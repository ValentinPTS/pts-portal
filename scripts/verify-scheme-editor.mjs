// Live end-to-end for the reworked scheme editor:
// add a date + a standard → they reach the documents and the apply wizard;
// a lab's application keeps pointing at ITS standard through a reorder (remap);
// deleting the standard drops the reference instead of misrouting it.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const S = "26-01-T-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

// ── 1. New editor renders; add a date + a standard; save ──
await go(`${BASE}/schemes/${S}/edit`);
await page.getByRole("button", { name: /Добави дата|Add date/ }).waitFor();
t("editor: new view with add buttons renders", true);

await page.getByRole("button", { name: /Добави дата|Add date/ }).click();
const dateInputs = page.locator("form input:not([type=hidden])");
// the new (last) schedule row: three visible inputs after the existing rows —
// fill via the last row's inputs by walking the schedule grid
const schedRows = page.locator("div.flex.items-end");
const newRow = schedRows.last();
const rowInputs = newRow.locator("input:not([type=hidden])");
await rowInputs.nth(0).fill("01.08.2026");
await rowInputs.nth(1).fill("Тестова дата");
await rowInputs.nth(2).fill("Test date");

await page.getByRole("button", { name: /Добави стандарт|Add standard/ }).click();
// the freshly added standard is the LAST card on the page (the header text
// changes while typing, so a hasText filter would go stale mid-fill)
const newCard = page.locator(".card").last();
const cardInputs = newCard.locator("input:not([type=hidden])");
await cardInputs.nth(0).fill("БДС TEST 9999");      // standard BG
await cardInputs.nth(1).fill("EN TEST 9999");       // standard EN
await cardInputs.nth(2).fill("Тестова характеристика"); // characteristic BG
await cardInputs.nth(3).fill("Test characteristic");    // characteristic EN

await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(new RegExp(`/schemes/${S}$`));
t("editor: saved and returned to the scheme page", true);

// ── 2. Round-trip: reopen shows the new rows; documents + wizard get them ──
await go(`${BASE}/schemes/${S}/edit`);
const html = await page.content();
t("round-trip: new date kept", html.includes("01.08.2026"));
t("round-trip: new standard kept", html.includes("TEST 9999"));

await go(`${BASE}/schemes/${S}/doc/invitation/print?lang=bg`);
t("invitation: new schedule date rendered", (await page.content()).includes("01.08"));

await go(`${BASE}/apply/${S}`);
const applyHtml = await page.content();
t("apply wizard: new standard is a step-3 option", applyHtml.includes("TEST 9999"));

// ── 3. A lab applies for the NEW standard (last box, ×2) ──
await page.fill('input[name="labName"]', "Ремап Лаб");
await page.fill('input[name="manager"]', "Иван Иванов");
await page.fill('input[name="contactPerson"]', "Мария Петрова");
await page.fill('input[name="email"]', "remap@example.com");
await page.fill('input[name="phone"]', "+359888123456");
await page.getByRole("button", { name: /Напред към детайли|Next: details/ }).click();
await page.fill('input[name="deliveryAddress"]', "ул. Тест 1, София");
await page.fill('input[name="postalCode"]', "1000");
await page.getByRole("button", { name: /Напред към тестовете|Next: test items/ }).click();
const selBoxes = page.locator('input[type="number"]');
await selBoxes.last().fill("2"); // the new standard is the last option
await page.getByRole("button", { name: /Изпрати заявката|Submit application/ }).click();
await page.waitForURL(/apply\/thanks/);
t("apply: application submitted", true);

await go(`${BASE}/schemes/${S}/applications`);
t("applications: count shows next to the NEW standard",
  (await page.content()).includes("Test characteristic ×2"));

// ── 4. Reorder: move the new standard from last to first → the application must
//       still point at IT (remapped key), not at whatever sits last now ──
await go(`${BASE}/schemes/${S}/edit`);
for (let i = 0; i < 3; i++) {
  await page.locator(".card", { hasText: "TEST 9999" }).last().getByRole("button", { name: "Move up" }).click();
}
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(new RegExp(`/schemes/${S}$`));

await go(`${BASE}/schemes/${S}/edit`);
const firstCard = page.locator(".card", { hasText: /Стандарт|Standard/ }).first();
t("reorder: new standard now first", (await firstCard.innerText()).includes("TEST 9999"));

await go(`${BASE}/schemes/${S}/applications`);
t("REMAP: application still points at its standard after reorder",
  (await page.content()).includes("Test characteristic ×2"));

// ── 5. Delete the standard → the application's reference is dropped cleanly ──
await go(`${BASE}/schemes/${S}/edit`);
await page.locator(".card", { hasText: "TEST 9999" }).last().getByRole("button", { name: "Remove" }).click();
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(new RegExp(`/schemes/${S}$`));

await go(`${BASE}/schemes/${S}/applications`);
const after = await page.content();
t("delete: dropped reference, no misrouting", !after.includes("Test characteristic") && !after.includes("×2"), "");

await go(`${BASE}/apply/${S}`);
t("delete: standard gone from the wizard", !(await page.content()).includes("TEST 9999"));

// ── 6. Stranding guard: a participant registered ONLY for a standard blocks
//       that standard's deletion (else the empty scope would read as "ALL") ──
await go(`${BASE}/schemes/${S}/edit`);
await page.getByRole("button", { name: /Добави стандарт|Add standard/ }).click();
const strandCard = page.locator(".card").last();
const strandInputs = strandCard.locator("input:not([type=hidden])");
await strandInputs.nth(0).fill("БДС STRAND 1");
await strandInputs.nth(1).fill("EN STRAND 1");
await strandInputs.nth(2).fill("Странд характеристика");
await strandInputs.nth(3).fill("Strand characteristic");
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(new RegExp(`/schemes/${S}$`));

await go(`${BASE}/apply/${S}`);
await page.fill('input[name="labName"]', "Странд Лаб");
await page.fill('input[name="manager"]', "Георги Георгиев");
await page.fill('input[name="contactPerson"]', "Елена Димитрова");
await page.fill('input[name="email"]', "strand@example.com");
await page.fill('input[name="phone"]', "+359888654321");
await page.getByRole("button", { name: /Напред към детайли|Next: details/ }).click();
await page.fill('input[name="deliveryAddress"]', "ул. Странд 2, Пловдив");
await page.fill('input[name="postalCode"]', "4000");
await page.getByRole("button", { name: /Напред към тестовете|Next: test items/ }).click();
await page.locator('input[type="number"]').last().fill("1"); // ONLY the strand standard
await page.getByRole("button", { name: /Изпрати заявката|Submit application/ }).click();
await page.waitForURL(/apply\/thanks/);

await go(`${BASE}/schemes/${S}/applications`);
await page
  .locator("div", { hasText: "Странд Лаб" })
  .filter({ has: page.getByRole("button", { name: /Одобри|Approve/ }) })
  .last() // innermost container = the Странд Лаб card
  .getByRole("button", { name: /Одобри|Approve/ })
  .click();
await page.waitForTimeout(800);
t("stranding setup: application approved into a participant", true);

await go(`${BASE}/schemes/${S}/edit`);
await page.locator(".card", { hasText: "STRAND 1" }).last().getByRole("button", { name: "Remove" }).click();
await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
await page.waitForURL(/err=stranded/);
t("stranding guard: save refused with the banner", (await page.content()).includes("НЕ са запазени") || (await page.content()).includes("NOT saved"));
await go(`${BASE}/schemes/${S}/edit`);
t("stranding guard: standard still there (nothing saved)", (await page.content()).includes("STRAND 1"));

await browser.close();
console.log(`verify-scheme-editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
