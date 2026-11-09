// Plan part 3.7 check (the commercial fields of a scheme; Реш. 153; Реш. 120), against
// a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-commercial.mjs
// On a scheme of its own: the price fields with the prices they make — at a share of
// 40 a second participation pays 40 % of the full price, shown with the 60 % discount
// it means; kept after saving; a share of 0 refused with its own notice, the rest of
// the form saved; a maximum below the minimum refused; at the maximum the staff page
// says «Запълнена» — a warning, nothing closed — and the laboratory sees none of it;
// each change on record.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const save = async () => {
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");
};
// typed until the field holds it (a fill before hydration is not seen)
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };
const box = () => page.locator("[data-commercial]");
const openEdit = async (S) => {
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await box().isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
};

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Цени ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  await openEdit(S);
  await type(box().locator('[name="com_base"]'), "100");
  await type(box().locator('[name="com_step"]'), "40");
  // typed «40 %» — the preview and the save read it alike (review)
  await type(box().locator('[name="com_share"]'), "40 %");
  const preview = await box().locator("[data-price-preview]").innerText();
  t("the prices shown: at 40, a second participation pays 40 % of the full price — the discount 60 %", /1 характеристика: пълна цена 100,00 € · второ и следващо участие — 40 % от нея = 40,00 € \(отстъпка 60 %\)/.test(preview), preview);
  t("…and for all the characteristics: base + step × (n − 1)", /характеристики: пълна цена \d[\d ]*,00 €/.test(preview));
  await box().locator('[name="com_addon"]').fill("25,50");
  await box().locator('[name="minParticipants"]').fill("1");
  await box().locator('[name="com_max"]').fill("1");
  await save();
  await openEdit(S);
  t("kept: base, step, share («40 %» read as 40), add-on, minimum, maximum", (await box().locator('[name="com_base"]').inputValue()) === "100" && (await box().locator('[name="com_step"]').inputValue()) === "40"
    && (await box().locator('[name="com_share"]').inputValue()) === "40" && (await box().locator('[name="com_addon"]').inputValue()) === "25,50"
    && (await box().locator('[name="minParticipants"]').inputValue()) === "1" && (await box().locator('[name="com_max"]').inputValue()) === "1");
  t("the own-courier address starts empty (D12)", (await box().locator('[name="com_pickupBg"]').inputValue()) === "");

  // a share of 0: the commercial fields are not saved, the rest is
  await type(box().locator('[name="com_share"]'), "0");
  await type(box().locator('[name="com_base"]'), "999");
  const title = `Kept ${stamp}`;
  await page.locator('input[name="titleEn"]').fill(title);
  await save();
  t("a share of 0 refused with its own notice", (await page.locator("[data-commercial-refused]").count()) === 1 && /делът|share/.test(await page.locator("[data-commercial-refused]").innerText()));
  await openEdit(S);
  t("…the prices stay as they were, the other change is saved", (await box().locator('[name="com_base"]').inputValue()) === "100" && (await page.locator('input[name="titleEn"]').inputValue()) === title);

  // a maximum below the minimum
  await box().locator('[name="minParticipants"]').fill("3");
  await box().locator('[name="com_max"]').fill("2");
  await save();
  t("a maximum below the minimum refused", /максималният брой|maximum number/.test(await page.locator("[data-commercial-refused]").innerText().catch(() => "")));
  t("…the section opened at the notice, showing what was saved (review)", await box().isVisible() && (await box().locator('[name="com_max"]').inputValue()) === "1");

  // review: the amount that does not read is named
  await openEdit(S);
  await box().locator('[name="com_step"]').fill("12 50");
  await save();
  t("an amount that does not read is named: the step", /стъпката|the step/.test(await page.locator("[data-commercial-refused]").innerText().catch(() => "")));

  // at the maximum: a warning on the staff page, nothing closed
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/lab");
  const labHtml = await (await page.request.get(`${BASE}/lab`)).text();
  t("the laboratory sees no maximum and no «full» warning", !/data-scheme-full|data-max-participants|максималния брой|Максимален брой/.test(labHtml));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  t("the staff page: «Запълнена» at the maximum (1 / 1) — applications stay open", (await page.locator("[data-scheme-full]").count()) === 1 && /остава отворено|stay open/.test(await page.locator("[data-scheme-full]").innerText()) && /1 \/ 1/.test(await page.locator("[data-max-participants]").innerText()));
  await go(`/schemes/${S}/applications`);
  t("…and on the applications page, where PTS approves (review)", (await page.locator("[data-scheme-full]").count()) === 1);

  // on record
  await go(`/activity?scheme=${S}`);
  await page.getByText(/Prices \/ participants/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("each change on record, money as it reads", /Prices \/ participants: base price: — → 100\.00 €; step: — → 40\.00 €; share paid by a 2nd\+ participation: 50 % → 40 %; MT\/CY\/IE add-on: — → 25\.50 €; maximum participants: — → 1; minimum participants: 5 → 1/.test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-commercial: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
