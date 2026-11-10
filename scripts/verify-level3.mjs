// Plan part 8.5 check (level 3 — the dry run), against a LOCAL dev server (in-memory store, login off —
// where any round that is not a replay may stand for a simulation round; the test environment numbers
// them SIM):
//   BASE=http://localhost:3000 node scripts/verify-level3.mjs
// A round, exported whole once → its level-3 card shows the export happened and the other scenarios not
// yet (no mail, no clock moved, no reminder, no unlock, no extension, no R2); the quality manager ticks
// every scenario → recorded, and it FAILS: a scenario ticked that never happened is never a pass.
// «Валидиране» shows level 3 for PT testing: the latest failed.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── a round (the build: every right) ──
  await go("/dev/persona?role=manager");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Пробно изпълнение ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  t("setup: a round", !!S);
  // a coded-only export proves nothing; the WHOLE export (both parts) does (8.5 review)
  await page.request.get(`${BASE}/schemes/${S}/export?part=coded`);
  const ex = await page.request.get(`${BASE}/schemes/${S}/export`);
  t("setup: the round exported whole once (both parts)", ex.status() === 200);

  // ── the criteria for level 3 ──
  await go("/dev/persona?model=quality");
  await go("/validation");
  if ((await page.locator('[data-level="3"]').getAttribute("data-level-criteria")) === "none") {
    const cbox = page.locator("[data-criteria-form-box]");
    if (!(await cbox.evaluate((d) => d.open))) await cbox.locator("summary").click();
    const cf = page.locator("[data-criteria-form]");
    await cf.locator('input[name="file"]').setInputFiles({ name: `criteria3-${stamp}.pdf`, mimeType: "application/pdf", buffer: pdf("criteria 3") });
    await cf.locator('input[name="signedOn"]').fill(today);
    await cf.locator('input[name="signedBy"]').fill("Ръководител на РТ провайдъра");
    for (const l of [1, 2, 3, 4, 5]) await cf.locator(`input[name="level"][value="${l}"]`).check();
    await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), cf.locator("[data-criteria-submit]").click()]);
  }
  t("setup: criteria for level 3 in force", (await page.locator('[data-level="3"]').getAttribute("data-level-criteria")) !== "none");

  // ── the level-3 card ──
  await go(`/schemes/${S}#level-test`);
  t("the level-3 card on the round: PT testing; the scenarios, each with what the round's records show", (await page.locator('[data-level-test="3"]').count()) === 1 && (await page.locator('[data-level-kind="pts-t"]').count()) === 1 && (await page.locator("[data-scenario]").count()) === 7);
  t("…the export happened (the journal); the mail, the clock, the reminder, the unlock, the extension, the R2 — not yet", (await page.locator('[data-scenario="export"][data-happened="1"]').count()) === 1 && (await Promise.all(["mail", "deadlines", "reminder", "late", "extension", "reissued"].map((k) => page.locator(`[data-scenario="${k}"][data-happened="0"]`).count()))).every((n) => n === 1));
  const form = page.locator("[data-level-form]");
  for (const item of await form.locator("[data-level-item]").all()) await item.locator('input[value="match"]').check();
  await form.locator('textarea[name="conclusion"]').fill("Всички сценарии — отметнати");
  await Promise.all([page.waitForURL(/vt=/, { timeout: 90000 }), form.locator("[data-level-submit]").click()]);
  t("every scenario ticked — recorded, and it FAILS: a scenario ticked that never happened is never a pass", new URL(page.url()).searchParams.get("vt") === "recorded-fail");
  await go("/validation#tests");
  t("«Валидиране»: level 3, PT testing — the latest failed", (await page.locator('[data-coverage="3-pts-t"][data-covered="0"]').count()) === 1 && /НЕ премина|FAILED/.test(await page.locator('[data-coverage="3-pts-t"]').innerText()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-level3: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
