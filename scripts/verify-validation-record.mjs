// Plan part 8.6 check (the validation record), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-validation-record.mjs
// «Протокол от валидирането» opens for the quality manager and the software administrator: the criteria,
// the coverage of every level and kind, every test recorded (date, scope, checker, result, conclusion),
// the D1 computation — every pair of the representative set agreeing — and the CSV of the set for an
// independent tool; a laboratory is refused. (Run after the level checks, the record holds their tests.)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/dev/persona?model=quality");
  await go("/validation");
  t("«Валидиране» links the record", (await page.locator('a[href="/validation/record"]').count()) >= 1);
  await go("/validation/record");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" }).split("-").reverse().join(".");
  t("the record opens: its title, the portal's version and the day printed", (await page.locator("[data-validation-record]").count()) === 1 && /Протокол от валидирането|validation record/.test(await page.locator("h1").innerText()) && /версия на портала|the portal's version/.test(await page.locator("[data-validation-record]").innerText()) && (await page.locator("[data-validation-record]").innerText()).includes(today));
  t("…the coverage: level 1, level 2 per kind, level 3 per kind", (await page.locator("[data-record-cover]").count()) === 7);
  const tests = await page.locator("[data-record-test]").count();
  const cards = tests > 0 ? await page.locator("[data-record-test]").allInnerTexts() : [];
  t("…every test recorded — each with who recorded it, a checker's signature line, the scope (or «not given»), the conclusion (or «no tests» on a fresh server)", tests > 0 ? cards.every((c) => /Записано от|Recorded by/.test(c) && /Проверил|Checked by/.test(c) && /Обхват|Scope/.test(c) && /Заключение|Conclusion/.test(c)) : (await page.locator("[data-record-no-tests]").count()) === 1);
  t("…D1: the portal's self-check — every row agrees, named as the self-check; the checker's own lines for the independent tool", (await page.locator('[data-d1-all="1"]').count()) === 1 && Number(await page.locator("[data-d1-rows]").getAttribute("data-d1-rows")) >= 20 && (await page.locator('[data-d1-agree="0"]').count()) === 0 && /Самопроверка на портала|self-check/.test(await page.locator('[data-d1-all]').innerText()) && (await page.locator("[data-d1-checker]").count()) === 1);
  // printed: the page alone — no panel, no controls (8.6 review)
  await page.emulateMedia({ media: "print" });
  t("printed: the record alone — the panel and the controls hidden", await page.evaluate(() => getComputedStyle(document.querySelector("[data-admin-rail]")).display === "none" && getComputedStyle(document.querySelector("[data-d1-csv]").parentElement).display === "none"));
  await page.emulateMedia({ media: "screen" });
  const csvRes = await page.request.get(`${BASE}/validation/record/d1.csv`);
  const csvText = await csvRes.text();
  t("the D1 set as a CSV — the typed and the plain values, the portal's, the self-check's, the checker's empty column", csvRes.status() === 200 && /reference_typed,measured_typed,reference_plain,measured_plain,portal_error,self_check,form_refuses,checker_result/.test(csvText) && /"20,000"/.test(csvText) && /attachment/.test(csvRes.headers()["content-disposition"] ?? ""));
  await go("/dev/persona?model=software_admin");
  await go("/validation/record");
  t("the software administrator reads the record", (await page.locator("[data-validation-record]").count()) === 1);
  await go("/dev/persona?role=lab");
  const r = await go("/validation/record");
  t("a laboratory: refused — the page and the CSV", (page.url().includes("denied") || /login\?denied=1/.test(await page.content()) || r?.status() === 403) && (await page.request.get(`${BASE}/validation/record/d1.csv`, { maxRedirects: 0 })).status() !== 200);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-validation-record: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
