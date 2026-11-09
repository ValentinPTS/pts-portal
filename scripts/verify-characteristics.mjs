// Plan part 3.6 check (characteristics; D3; А3), against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-characteristics.mjs
// On a scheme of its own (the aggregates sample): a characteristic's unit, step, guard
// limits, determinations, U required, group and a 2.0 field kept; its stable id shown,
// kept when the list is reordered; a step that does not read refuses the
// characteristics but keeps the rest; the preview of what a laboratory sees; each
// change a configuration version on record; the static reminder reaches the
// laboratory — and no 2.0 field does.
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
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.searchParams.has("err") || u.searchParams.has("chars"), { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");
};
const row = (i) => page.locator(`[data-char-row="${i}"]`);
// typed until the controlled field holds it (a fill before hydration is not seen)
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Характеристики ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  // the first save gives the ids (and the baseline version)
  await go(`/schemes/${S}/edit`);
  await row(0).waitFor();
  await save();
  await go(`/schemes/${S}/edit`);
  const id0 = await row(0).locator("[data-char-id]").getAttribute("data-char-id");
  const id1 = await row(1).locator("[data-char-id]").getAttribute("data-char-id");
  t("each characteristic has a stable id", /^ch-\d+$/.test(id0 ?? "") && /^ch-\d+$/.test(id1 ?? "") && id0 !== id1, `${id0} ${id1}`);

  // the 3.6 fields
  const r0 = row(0);
  await type(r0.getByLabel(/^Мерна единица|^Unit/), "%");
  await type(r0.getByLabel(/^Стъпка на докладване|^Reporting step/), "0,1");
  await type(r0.getByLabel(/^Долна защитна граница|^Lower guard limit/), "0");
  await type(r0.getByLabel(/^Горна защитна граница|^Upper guard limit/), "10");
  await r0.getByLabel(/^Брой определяния|^Determinations/).selectOption("3");
  await r0.getByLabel(/U е задължителна|U is required/).check();
  await type(r0.getByLabel(/^Статистическа група \(БГ\)|^Statistical group \(BG\)/), "Физични");
  await r0.locator("[data-engine-fields] summary").click();
  await type(r0.locator("[data-engine-fields]").getByLabel("assigned_value_method"), `consensus-${stamp}`);
  t("the preview: what the laboratory sees — name, method, unit, determinations, U", /Лабораторията вижда: .+ — .+ · % · 3 определяния · U задължителна/.test(await r0.locator("[data-lab-view]").innerText()));
  await save();
  await go(`/schemes/${S}/edit`);
  const r0b = row(0);
  t("kept: unit, step, guard limits, determinations, U, group", (await r0b.getByLabel(/^Мерна единица|^Unit/).inputValue()) === "%" && (await r0b.getByLabel(/^Стъпка на докладване|^Reporting step/).inputValue()) === "0.1"
    && (await r0b.getByLabel(/^Горна защитна граница|^Upper guard limit/).inputValue()) === "10" && (await r0b.getByLabel(/^Брой определяния|^Determinations/).inputValue()) === "3"
    && (await r0b.getByLabel(/U е задължителна|U is required/).isChecked()) && (await r0b.getByLabel(/^Статистическа група \(БГ\)/).inputValue()) === "Физични");
  t("…and the 2.0 field, as entered", (await r0b.locator("[data-engine-fields]").getByLabel("assigned_value_method").inputValue()) === `consensus-${stamp}`);

  // a step that does not read: the characteristics are not saved, the rest is
  await type(r0b.getByLabel(/^Стъпка на докладване|^Reporting step/), "-1");
  const title = `Kept ${stamp}`;
  await page.locator('input[name="titleEn"]').fill(title);
  await save();
  t("a negative step refuses the characteristics, naming the row", new URL(page.url()).searchParams.has("chars") && (await page.locator("[data-charfields-refused]").innerText()).includes("1:"));
  t("…the step stays as it was, the other change is saved", (await row(0).getByLabel(/^Стъпка на докладване|^Reporting step/).inputValue()) === "0.1" && (await page.locator('input[name="titleEn"]').inputValue()) === title);

  // review: refused together with the number — both notices show, neither hides the other
  // (from a fresh page: the address already carries the last refusal)
  await go(`/schemes/${S}/edit`);
  await row(0).waitFor();
  await type(row(0).getByLabel(/^Стъпка на докладване|^Reporting step/), "-1");
  await type(page.locator('input[name="number"]'), "НЕ Е НОМЕР");
  await save();
  t("a number that does not read and a step that does not: both notices", (await page.locator("[data-number-refused]").count()) === 1 && (await page.locator("[data-charfields-refused]").count()) === 1);

  // review: a blank new row with a bad field is dropped — it does not block the save
  await go(`/schemes/${S}/edit`);
  await row(0).waitFor();
  const rows0 = await page.locator("[data-char-row]").count();
  for (let i = 0; i < 20 && (await page.locator("[data-char-row]").count()) === rows0; i++) { await page.getByRole("button", { name: /Добави стандарт|Add standard/ }).click(); await page.waitForTimeout(400); }
  await type(row(rows0).getByLabel(/^Стъпка на докладване|^Reporting step/), "-5");
  await type(row(0).getByLabel(/^Мерна единица|^Unit/), "kg");
  await save();
  await go(`/schemes/${S}/edit`);
  t("a blank new row with a bad step is dropped, the rest saved", (await page.locator("[data-char-row]").count()) === rows0 && (await row(0).getByLabel(/^Мерна единица|^Unit/).inputValue()) === "kg");

  // a reorder: the ids move with their characteristics
  await go(`/schemes/${S}/edit`);
  // moved up until the editor shows it moved (a click before hydration does nothing)
  for (let i = 0; i < 20 && (await row(0).locator("[data-char-id]").getAttribute("data-char-id")) !== id1; i++) { await row(1).getByRole("button", { name: "Move up" }).click(); await page.waitForTimeout(400); }
  await save();
  await go(`/schemes/${S}/edit`);
  t("a reorder keeps each id with its characteristic", (await row(0).locator("[data-char-id]").getAttribute("data-char-id")) === id1 && (await row(1).locator("[data-char-id]").getAttribute("data-char-id")) === id0);

  // the static reminder, one per scheme
  await page.locator("details.mt-8 summary").first().click();
  await page.locator('textarea[name="staticReminderBg"]').fill(`Проверете уреда преди изпитване ${stamp}`);
  await save();
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await page.waitForTimeout(1500);
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/lab");
  const card = page.locator(`[data-lab-card="${S}"]`);
  t("the laboratory sees the scheme's static reminder", new RegExp(`Напомняне: Проверете уреда преди изпитване ${stamp}`).test(await card.innerText()));
  const labHtml = await (await page.request.get(`${BASE}/lab`)).text();
  t("…and never a 2.0 field", !labHtml.includes(`consensus-${stamp}`));
  await go("/dev/persona?role=manager");

  // on record: a configuration version for each change
  await go(`/activity?scheme=${S}`);
  await page.getByText(/configuration version/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const versions = (await page.locator("main").innerText()).match(/Characteristics: configuration version \d+/g) ?? [];
  t("each change of the characteristics is a configuration version on record", versions.length >= 3, String(versions.length));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-characteristics: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
