// Plan part 3.5 check (batches; Реш. 151 / А18; D3), against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-batches.mjs
// On a testing scheme of its own (the aggregates sample, with its characteristics): a
// batch without its material refused, the typing kept; a whole one recorded with its
// fields and its objects' codes; one whose codes are taken refused; the roles drawn at
// random once; homogeneity values pasted — one on a participant's object refused with
// its line, the right ones kept in the contract's columns; the H&S record linked; a
// calibration scheme has no batch; «Обекти и партиди» lists it; a statistics expert
// adds values but records no batch; all on record.
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
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");

  // a testing scheme of its own, from the aggregates sample (it has characteristics)
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Партиди ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  await go(`/schemes/${S}/batches`);
  t("a new scheme has no batch yet", (await page.locator("[data-batches-none]").count()) === 1);
  const nf = page.locator("[data-batch-new]");
  const fill = async (over = {}) => {
    const v = { label: "P1", preparedOn: "2026-09-10", count: "20", prefix: `1${stamp}`, material: "Едър добавъчен материал 4/8 mm, кариера Х", storage: "сухо, 20 °C", hsRecord: "", ...over };
    for (const [k, val] of Object.entries(v)) await nf.locator(`[name="${k}"]`).fill(val);
  };
  await fill({ material: "" });
  await nf.locator('[name="material"]').evaluate((el) => el.removeAttribute("required"));
  await nf.locator('button[type="submit"]').click();
  t("a batch without its material is refused", await waitFor(async () => /Материалът|material/.test(await nf.locator("[data-batch-error]").innerText())));
  t("…the typing kept", (await nf.locator('[name="label"]').inputValue()) === "P1");
  await fill();
  await nf.locator('button[type="submit"]').click();
  const card = page.locator('[data-batch="P1"]');
  t("a whole batch is recorded with its fields", await waitFor(async () => (await card.count()) === 1) && /Едър добавъчен материал 4\/8 mm/.test(await card.innerText()) && /10\.09\.2026/.test(await card.innerText()));
  t("…its 20 objects' codes, the prefix and the number", new RegExp(`1${stamp}01 … 1${stamp}20`).test(await card.innerText()));

  // an object is in exactly one batch
  await fill({ label: "P2", count: "5" });
  await nf.locator('button[type="submit"]').click();
  t("a second batch with the same codes is refused", await waitFor(async () => /вече има|already exist/.test(await nf.locator("[data-batch-error]").innerText())));

  // corrected before the draw: 22 objects, not 20 (review)
  await card.locator("[data-batch-edit] summary").click();
  await card.locator('[data-batch-edit] [name="count"]').fill("22");
  await card.locator('[data-batch-edit] button[type="submit"]').click();
  t("a batch corrected before its draw: 22 objects now", await waitFor(async () => new RegExp(`1${stamp}01 … 1${stamp}22`).test(await card.innerText())));

  // the draw: at random, once
  const draw = card.locator("[data-batch-draw]");
  for (const [k, v] of [["homogeneity", "5"], ["stability", "2"], ["participant", "10"], ["reserve", "3"]]) await draw.locator(`[name="${k}"]`).fill(v);
  await draw.locator('button[type="submit"]').click();
  t("the roles drawn at random: 5 · 2 · 10 · 3", await waitFor(async () => (await card.locator("[data-batch-drawn]").count()) === 1)
    && /за хомогенност \(5\)/.test(await card.innerText()) && /за стабилност \(2\)/.test(await card.innerText()) && /за участници \(10\)/.test(await card.innerText()) && /резерва \(3\)/.test(await card.innerText()));
  t("…once: the draw is not offered again", (await card.locator("[data-batch-draw]").count()) === 0);
  const homCodes = (await card.locator('[data-role="homogeneity"] .font-mono').innerText()).split(", ");
  const partCode = (await card.locator('[data-role="participant"] .font-mono').innerText()).split(", ")[0];

  // homogeneity values in the contract's columns
  const vals = card.locator("[data-batch-values]");
  await vals.locator("textarea").fill(`H1;${homCodes[0]};1;1;12,4\nH1;${partCode};1;1;12,5`);
  await vals.locator('button[type="submit"]').click();
  t("a participant's object is no homogeneity object — refused, its line named", await waitFor(async () => /Ред 2|Line 2/.test(await card.locator("[data-batch-error]").innerText())));
  await vals.locator("textarea").fill(`series;sample_code;characteristic_id;replicate_number;value\nH1;${homCodes[0]};1;1;12,4\nH1;${homCodes[0]};1;2;12,6\nH1;${homCodes[1]};1;1;12,5`);
  await vals.locator('button[type="submit"]').click();
  t("the values kept, in the contract's columns", await waitFor(async () => (await card.locator('[data-homogeneity="3"]').count()) === 1) && /12\.6/.test(await card.locator("[data-homogeneity]").innerText()));
  t("…the box cleared once they are in", (await vals.locator("textarea").inputValue()) === "");
  // review: the same pasted again adds nothing; a different value is a correction
  await vals.locator("textarea").fill(`H1;${homCodes[0]};1;1;12,4`);
  await vals.locator('button[type="submit"]').click();
  t("the same value again: nothing added", await waitFor(async () => /Добавени: 0; вече ги имаше: 1/.test(await card.innerText())) && (await card.locator('[data-homogeneity="3"]').count()) === 1);
  await vals.locator("textarea").fill(`H1;${homCodes[0]};1;1;12,9`);
  await vals.locator('button[type="submit"]').click();
  t("a correction: the earlier value kept, struck through", await waitFor(async () => (await card.locator('[data-homogeneity="4"]').count()) === 1) && (await card.locator('[data-homogeneity] tr[data-corrected="1"]').count()) === 1 && /поправени: 1/.test(await card.innerText()));

  // the record of the H&S assessment
  const rec = card.locator("[data-batch-record-form]");
  await rec.locator('[name="record"]').fill("Ф 7.3.2-2 от 15.09.2026");
  await rec.locator('button[type="submit"]').click();
  t("the H&S record linked", await waitFor(async () => /Ф 7\.3\.2-2 от 15\.09\.2026/.test(await card.locator("[data-batch-record]").innerText())));

  // a calibration scheme has no batch
  await go("/schemes/25-06-C-1/batches");
  t("a calibration scheme: no batch (Реш. 151)", (await page.locator("[data-no-batch]").count()) === 1 && (await page.locator("[data-batch-new]").count()) === 0);

  // «Обекти и партиди»
  await go("/batches");
  t("«Обекти и партиди» lists the scheme with its batch", /Партиди \(1\)|Batches \(1\)/.test(await page.locator(`[data-batches-scheme="${S}"]`).innerText()) && /P1 · Едър добавъчен/.test(await page.locator(`[data-batches-scheme="${S}"]`).innerText()));

  // a statistics expert of the scheme: adds values, records no batch
  await go(`/dev/persona?model=statistics_expert@${S}`);
  await go(`/schemes/${S}/batches`);
  t("a statistics expert adds values but records no batch, draws nothing", (await page.locator('[data-batch="P1"] [data-batch-values]').count()) === 1 && (await page.locator("[data-batch-new]").count()) === 0 && (await page.locator("[data-batch-record-form]").count()) === 0);
  await go("/dev/persona?role=manager");

  // on record
  await go(`/activity?scheme=${S}`);
  await page.getByText(/objects drawn at random/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("the journal: the batch, the draw, the values, the record", /Batch P1: 20 objects of Едър добавъчен/.test(journal) && /Batch P1: objects drawn at random — homogeneity 5, stability 2, participant 10, reserve 3/.test(journal) && /Batch P1: 3 homogeneity\/stability values entered/.test(journal) && /Batch P1 corrected/.test(journal) && /Batch record of the homogeneity and stability assessment: Ф 7\.3\.2-2/.test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-batches: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
