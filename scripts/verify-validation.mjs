// Plan part 8.1 check (the acceptance criteria, Реш. 134), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-validation.mjs
// The quality manager records a signed edition for levels 1–3 → those levels are «in force», 4–5
// «no test can be recorded»; the signed file opens as the same bytes; a file that is not what it
// says is refused; the software administrator reads but has no form; a scheme role and a
// laboratory are refused; a void with its reason leaves the levels with no criteria.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const stamp = Date.now() % 100000;
const PDF = Buffer.from(`%PDF-1.4\n% Критерии за приемане ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
const levelOf = async (n) => page.locator(`[data-level="${n}"]`).getAttribute("data-level-criteria");
const refused = async (path) => { const r = await go(path); const text = await page.content(); return page.url().includes("denied") || /login\?denied=1|NEXT_REDIRECT[^"]*\/denied/.test(text) || r?.status() === 401 || r?.status() === 403; };
const record = async ({ buffer, name, levels, signedBy }) => {
  await go("/validation");
  const box = page.locator("[data-criteria-form-box]");
  if (!(await box.evaluate((d) => d.open))) await box.locator("summary").click();
  const form = page.locator("[data-criteria-form]");
  // the paper's number: the one the form suggests (after every edition in force)
  const edition = await form.locator('input[name="edition"]').inputValue();
  await form.locator('input[name="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer });
  await form.locator('input[name="signedOn"]').fill(today);
  await form.locator('input[name="signedBy"]').fill(signedBy);
  for (const l of levels) await form.locator(`input[name="level"][value="${l}"]`).check();
  await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), form.locator("[data-criteria-submit]").click()]);
  return { v: new URL(page.url()).searchParams.get("v"), edition };
};

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── the quality manager ──
  await go("/dev/persona?model=quality");
  await go("/validation");
  t("the quality manager opens «Валидиране»: the five levels, and the form", (await page.locator("[data-level]").count()) === 5 && (await page.locator("[data-criteria-form]").count()) === 1);
  const before = await page.locator("[data-criteria-edition]").count();
  // a file that is not what it says: refused, nothing recorded
  const notPdf = (await record({ buffer: Buffer.from("<html>not a pdf</html>"), name: "fake.pdf", levels: [1], signedBy: "Р. Проверка" })).v;
  t("a file that is not a real PDF: refused, said — nothing recorded", notPdf === "not-file" && (await page.locator("[data-criteria-answer=\"not-file\"]").count()) === 1 && (await page.locator("[data-criteria-edition]").count()) === before);
  // the signed edition, for levels 1–3
  const rec = await record({ buffer: PDF, name: `criteria-${stamp}.pdf`, levels: [1, 2, 3], signedBy: `Ръководител на РТ провайдъра ${stamp}` });
  const n = Number(rec.edition);
  t("recorded under the paper's number: said; a new edition", rec.v === "recorded" && n > 0 && (await page.locator("[data-criteria-edition]").count()) === before + 1);
  t("…the edition in force — the whole document: levels 1–3 judged against it; 4 and 5: «no test can be recorded» (Реш. 134)", (await levelOf(1)) === String(n) && (await levelOf(2)) === String(n) && (await levelOf(3)) === String(n) && (await levelOf(4)) === "none" && (await levelOf(5)) === "none");
  const rowId = await page.locator(`[data-criteria-edition="${n}"][data-criteria-voided="0"]`).getAttribute("data-criteria-id");
  const row = page.locator(`[data-criteria-id="${rowId}"]`);
  t("…the edition says who signed, the day and the levels", (await row.innerText()).includes(`Ръководител на РТ провайдъра ${stamp}`) && (await row.innerText()).includes("1, 2, 3"));
  const href = await row.locator("[data-criteria-file]").getAttribute("href");
  const file = await page.request.get(BASE + href);
  t("the signed document opens — the same bytes, never cached", file.status() === 200 && Buffer.from(await file.body()).equals(PDF) && /no-store/.test(file.headers()["cache-control"] ?? ""));
  const journal = await (await page.request.get(`${BASE}/activity`)).text();
  t("journalled: «Acceptance criteria edition N, signed …» — this edition's own line", new RegExp(`Acceptance criteria edition ${n}, signed ${today}`).test(journal));
  // the same scan again: refused
  t("the same scan recorded again: refused (review)", (await record({ buffer: PDF, name: `again-${stamp}.pdf`, levels: [1], signedBy: "Р. Проверка" })).v === "same-file");

  // ── the software administrator reads, never records ──
  await go("/dev/persona?model=software_admin");
  await go("/validation");
  t("the software administrator reads «Валидиране» — no form, no void", (await page.locator("[data-level]").count()) === 5 && (await page.locator("[data-criteria-form]").count()) === 0 && (await page.locator("[data-criteria-read-only]").count()) === 1 && (await page.locator("[data-criteria-void]").count()) === 0);
  t("…and the signed document", (await page.request.get(BASE + href)).status() === 200);

  // ── no one else ──
  await go("/dev/persona?model=statistics_expert@26-01-T-1");
  t("a scheme role: refused — the page and the file", (await refused("/validation")) && (await refused(href)));
  await go("/dev/persona?role=lab");
  t("a laboratory: refused", await refused("/validation"));

  // ── a void ──
  await go("/dev/persona?model=quality");
  await go("/validation");
  const r2 = page.locator(`[data-criteria-id="${rowId}"]`);
  await r2.locator("[data-criteria-void] summary").click();
  await r2.locator('input[name="reason"]').fill("Записана по грешка — проверка");
  await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), r2.locator("[data-criteria-void-submit]").click()]);
  t("voided with its reason — kept on record, marked", new URL(page.url()).searchParams.get("v") === "voided" && (await page.locator(`[data-criteria-id="${rowId}"]`).getAttribute("data-criteria-voided")) === "1" && /Записана по грешка — проверка/.test(await page.locator(`[data-criteria-id="${rowId}"] [data-criteria-void-reason]`).innerText()));
  t("…no level is judged against it any more", (await levelOf(1)) !== String(n) && (await levelOf(2)) !== String(n) && (await levelOf(3)) !== String(n));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-validation: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
