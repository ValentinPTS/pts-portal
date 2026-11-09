// Plan part 3.8 check (the per-scheme lists; Реш. 108, 154; M1 §18), against a LOCAL
// dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-scheme-lists.mjs
// A testing scheme starts with empty lists; the waybill offered as a quick choice and
// added; a row in one language refused with its own notice naming the list and the
// row, the rest of the form saved; completed, kept, each row keeping its id; the
// accreditation flag kept; a calibration scheme shows its Instruction's checks; each
// change on record.
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
const lists = () => page.locator("[data-scheme-lists]");
const ship = () => lists().locator('[data-list="ship"]');
const openEdit = async (S) => {
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await lists().isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
};

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Списъци ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  await openEdit(S);
  t("a testing scheme starts with empty lists — nothing invented", (await lists().locator("[data-list-row]").count()) === 0);
  // the waybill: a quick choice, added when clicked (until the editor shows it)
  for (let i = 0; i < 20 && (await ship().locator("[data-list-row]").count()) === 0; i++) { await ship().locator('[data-suggest="Waybill"]').click(); await page.waitForTimeout(400); }
  t("the waybill offered and added", (await ship().locator('[data-list-row="0"] input[name="ship_0_bg"]').inputValue()) === "Товарителница");
  await ship().getByRole("button", { name: /Добави ред|Add a row/ }).click();
  await ship().locator('input[name="ship_1_bg"]').fill(`Декларация ${stamp}`);
  const title = `Kept ${stamp}`;
  await page.locator('input[name="titleEn"]').fill(title);
  await lists().locator('input[name="accreditationRequired"]').check();
  await save();
  t("a row in one language refused: its list, its row and its words named", new RegExp(`Документи към пратката, ред 2 \\(«Декларация ${stamp}»\\)|Shipment documents, row 2 \\(«Декларация ${stamp}»\\)`).test(await page.locator("[data-lists-refused]").innerText().catch(() => "")));
  await openEdit(S);
  t("…that list stays as it was; the flag and the other change are saved (review)", (await ship().locator("[data-list-row]").count()) === 0 && (await page.locator('input[name="titleEn"]').inputValue()) === title && await lists().locator('input[name="accreditationRequired"]').isChecked());

  // completed: kept, with ids
  for (let i = 0; i < 20 && (await ship().locator("[data-list-row]").count()) === 0; i++) { await ship().locator('[data-suggest="Waybill"]').click(); await page.waitForTimeout(400); }
  await ship().getByRole("button", { name: /Добави ред|Add a row/ }).click();
  await ship().locator('input[name="ship_1_bg"]').fill(`Декларация ${stamp}`);
  await ship().locator('input[name="ship_1_en"]').fill(`Declaration ${stamp}`);
  await save();
  await openEdit(S);
  const id0 = await ship().locator('input[name="ship_0_id"]').inputValue();
  const id1 = await ship().locator('input[name="ship_1_id"]').inputValue();
  t("kept: both rows, each with its own id", (await ship().locator("[data-list-row]").count()) === 2 && /^li-\d+$/.test(id0) && /^li-\d+$/.test(id1) && id0 !== id1, `${id0} ${id1}`);
  t("…and the accreditation flag", await lists().locator('input[name="accreditationRequired"]').isChecked());
  // the first row removed: the second keeps its id
  await ship().locator('[data-list-row="0"]').getByRole("button", { name: /Премахни реда|Remove the row/ }).click();
  await save();
  await openEdit(S);
  t("a row removed: the other keeps its id", (await ship().locator("[data-list-row]").count()) === 1 && (await ship().locator('input[name="ship_0_id"]').inputValue()) === id1);

  // a calibration scheme: its Instruction's checks
  await go("/schemes/25-06-C-1/edit");
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await lists().isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  const rc = lists().locator('[data-list="rcpt"]');
  t("a calibration scheme shows its Instruction's receipt checks (M1 §18)", (await rc.locator("[data-list-row]").count()) === 5 && (await rc.locator('input[name="rcpt_3_bg"]').inputValue()) === "Няма конденз");

  // on record
  await go(`/activity?scheme=${S}`);
  await page.getByText(/Lists:/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("each change on record, row by row", new RegExp(`Lists: shipment documents: added li-\\d+ «Товарителница» / «Waybill»; added li-\\d+ «Декларация ${stamp}» / «Declaration ${stamp}»`).test(journal) && /Lists: accreditation required: yes \(warns only\)/.test(journal) && /Lists: shipment documents: removed li-\d+ «Товарителница» \/ «Waybill»/.test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-scheme-lists: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
