// Plan part 3.9 check (the accreditation mark), against a LOCAL dev server (in-memory
// store, login off):   BASE=http://localhost:3000 node scripts/verify-accreditation-mark.mjs
// On a scheme of its own: in scope, its report and certificate carry the ILAC-MRA and
// SNAS marks with the registration number and the report says it runs under
// accreditation; renumbered NA, the editor says so and the documents carry no mark and
// the explicit sentence instead; a calibration scheme in scope carries the marks.
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
const get = async (path) => (await page.request.get(BASE + path)).text();
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };

try {
  await go("/dev/persona?role=manager");
  const sys = await get("/system");
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Знак ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="number"]').waitFor();
  t("the editor: in scope — the documents carry the marks", (await page.locator('[data-mark-state="mark"]').count()) === 1);
  const repA = await get(`/schemes/${S}/doc/report/print?lang=bg`);
  const certA = await get(`/schemes/${S}/doc/certificate/print?lang=bg`);
  t("in scope: the report carries the ILAC-MRA and SNAS marks with «Рег. №», and says «при акредитация»", repA.includes("/brand/snas.png") && repA.includes("/brand/ilac-mra.jpg") && /Рег\. № 752\/T-008/.test(repA) && repA.includes("се провежда при акредитация от SNAS"));
  t("…and the certificate the marks", certA.includes("/brand/snas.png") && certA.includes("/brand/ilac-mra.jpg"));

  // renumbered NA
  const num = await page.locator('input[name="number"]').inputValue();
  const naNum = num.replace(/-(T|S)-/, "-NA-$1-");
  await type(page.locator('input[name="number"]'), naNum);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="number"]').waitFor();
  t("renumbered NA: the editor says no mark, the sentence instead", (await page.locator('input[name="number"]').inputValue()) === naNum && (await page.locator('[data-mark-state="na"]').count()) === 1, naNum);
  const repB = await get(`/schemes/${S}/doc/report/print?lang=bg`);
  const certB = await get(`/schemes/${S}/doc/certificate/print?lang=bg`);
  t("NA: the report has no mark and no «при акредитация» — the explicit sentence instead", !repB.includes("snas.png") && !repB.includes("ilac-mra") && !repB.includes("се провежда при акредитация") && repB.includes("извън обхвата на акредитацията"));
  t("…the certificate neither — the sentence instead", !certB.includes("snas.png") && !certB.includes("ilac-mra") && certB.includes("извън обхвата на акредитацията"));

  // calibration in scope
  const repC = await get(`/schemes/25-06-C-1/doc/report/print?lang=bg`);
  t("a calibration scheme in scope: the marks too", repC.includes("/brand/snas.png") && repC.includes("/brand/ilac-mra.jpg"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-accreditation-mark: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
