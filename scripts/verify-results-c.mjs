// Plan part 0.12 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-results-c.mjs
// A calibration scheme WITHOUT load directions — here one started from the
// built-in "weights" sample (mass: five points, no directions) — gets its Results
// Sheet table, and the force demo keeps one table per direction.
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
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  if (r.status() !== 200) throw new Error(`${path} → HTTP ${r.status()}`);
  return r.text();
};
const tables = (h) => (h.match(/<table class="rtable">/g) ?? []).length;

try {
  await go("/dev/persona?role=manager");

  // a new calibration scheme from the weights sample
  await go("/files/calibration");
  const open = page.getByRole("button", { name: /Нова схема|New scheme/ }).first();
  const dialog = page.locator('form:has(select[name="sample"])');
  // retried until the page has hydrated — an early click does nothing
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await open.click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("weights-m1");
  const number = `PTS 26/12-C-${Date.now() % 900 + 100}`;
  await dialog.locator('input[name="number"]').fill(number);
  await dialog.locator('input[name="name"]').fill("Weights check");
  await dialog.getByRole("button", { name: /Създай проект|Create project/ }).click();
  await page.waitForURL(/\/schemes\/[^/]+$/);
  const id = page.url().split("/schemes/")[1];
  t("a calibration scheme from the weights sample", !!id, page.url());

  const w = await get(`/schemes/${id}/doc/results/print?lang=bg`);
  t("its Results Sheet has a table — without any load direction", tables(w) === 1);
  t("…one row per point, five", (w.match(/data-ff="t:result_0_\d+"/g) ?? []).length === 5);
  t("…captioned by the quantity, not «сила»", w.includes("Таблица 1 — Маса") && !/сила|ISO 376/.test(w));
  t("…no «not set yet» note", !w.includes("още не са зададени"));
  // the fill view — where the inputs actually are
  const fill = await get(`/schemes/${id}/fill/results?lang=bg`);
  t("the fill view offers an input per point", [0, 1, 2, 3, 4].every((j) => fill.includes(`name="result_0_${j}"`) && fill.includes(`name="unc_0_${j}"`)), fill.slice(0, 200));

  const f = await get(`/schemes/25-06-C-1/doc/results/print?lang=en`);
  t("the force demo keeps one table per direction", tables(f) === 2 && f.includes("Table 2 — Force, compression"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-results-c: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
