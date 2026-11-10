// Plan part 8.3 check (level 1 — the replay test record), against a LOCAL dev server (in-memory store,
// login off):
//   BASE=http://localhost:3000 node scripts/verify-level1.mjs
// A replay round (8.2, the synthetic fixture) → exported to 2.0 → a stand-in 2.0 report imported →
// the transfer check «the same» → criteria for level 1 signed (8.1) → the quality manager records the
// level-1 test with every item matching: PASSES; one item «не съвпада» (with why): FAILS; the criteria
// edition the tests rest on cannot be voided; «Валидиране» lists the tests; the software administrator
// has no form.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const stamp = Date.now() % 100000;
const dir = mkdtempSync(join(tmpdir(), "level1-"));
execFileSync(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", "scripts/replay-fixture.ts", dir, String(stamp)], { stdio: "ignore" });
const GOOD = readFileSync(join(dir, "replay-good.xlsx"));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 60) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(500); } return false; };
const record = async (S, mismatch) => {
  await go(`/schemes/${S}#level-test`);
  const box = page.locator("[data-level-form-box]");
  if (!(await box.evaluate((d) => d.open))) await box.locator("summary").click();
  const form = page.locator("[data-level-form]");
  for (const item of await form.locator("[data-level-item]").all()) {
    const key = await item.getAttribute("data-level-item");
    if (key === mismatch) { await item.locator('input[value="mismatch"]').check(); await item.locator(`input[name="note_${key}"]`).fill("z за 126301 / ch-1: 1,2 срещу 1,3"); }
    else await item.locator('input[value="match"]').check();
  }
  await form.locator('textarea[name="conclusion"]').fill(mismatch ? "Разлика в z — вижте точката" : "Повторението възпроизвежда издадения доклад");
  await Promise.all([page.waitForURL(/vt=/, { timeout: 90000 }), form.locator("[data-level-submit]").click()]);
  return new URL(page.url()).searchParams.get("vt");
};

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── the replay round ──
  await go("/dev/persona?model=software_admin");
  await go("/validation");
  const box = page.locator("[data-replay-import]");
  await box.locator('input[name="file"]').setInputFiles({ name: "replay.xlsx", mimeType: XLSX, buffer: GOOD });
  await box.locator("[data-replay-submit]").click();
  await waitFor(async () => (await box.locator("[data-replay-done]").count()) > 0);
  const S = await box.locator("[data-replay-done]").getAttribute("data-replay-done");
  t("setup: a replay round", !!S);
  await go("/dev/persona?model=quality");
  await go(`/schemes/${S}#level-test`);
  t("the level-1 card: the reference round's replay; not ready — no export, no 2.0 report, no check, nothing sent to compare; no form", (await page.locator('[data-level-test="1"][data-level-ready="no"]').count()) === 1 && (await page.locator('[data-ready-item="reference"][data-ready="1"]').count()) === 1 && (await page.locator('[data-ready-item="export"][data-ready="0"]').count()) === 1 && (await page.locator('[data-ready-item="check"][data-ready="0"]').count()) === 1 && (await page.locator('[data-ready-item="compared"][data-ready="0"]').count()) === 1 && (await page.locator("[data-level-form]").count()) === 0);

  // ── export → a stand-in 2.0 report → the transfer check (as the build: every right) ──
  await go("/dev/persona?role=manager");
  t("exported to 2.0", (await page.request.get(`${BASE}/schemes/${S}/export/analysis`)).status() === 200);
  await go(`/schemes/${S}#analysis-import`);
  const form = page.locator("[data-import-form]");
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="report-bg"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: pdf("2.0 report") });
  await form.locator("[data-import-submit]").click();
  t("a stand-in 2.0 report imported", await waitFor(async () => /imp=ok/.test(page.url()), 30));
  await go(`/schemes/${S}#processing-record`);
  await page.locator('[data-transfer-form] input[value="yes"]').check();
  await page.locator("[data-transfer-form] [data-transfer-submit]").click();
  t("the transfer check: «the same»", await waitFor(async () => /tc=ok/.test(page.url()), 30));

  // ── the criteria for level 1, signed today ──
  await go("/dev/persona?model=quality");
  await go("/validation");
  const cbox = page.locator("[data-criteria-form-box]");
  if (!(await cbox.evaluate((d) => d.open))) await cbox.locator("summary").click();
  const cf = page.locator("[data-criteria-form]");
  await cf.locator('input[name="file"]').setInputFiles({ name: `criteria-${stamp}.pdf`, mimeType: "application/pdf", buffer: pdf("criteria") });
  await cf.locator('input[name="signedOn"]').fill(today);
  await cf.locator('input[name="signedBy"]').fill("Ръководител на РТ провайдъра");
  for (const l of [1, 2, 3, 4, 5]) await cf.locator(`input[name="level"][value="${l}"]`).check();
  await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), cf.locator("[data-criteria-submit]").click()]);
  const edition = Number(await page.locator('[data-level="1"]').getAttribute("data-level-criteria"));
  t("setup: criteria for every level signed today", edition > 0);

  // ── the test ──
  await go(`/schemes/${S}#level-test`);
  t("ready — one chain: the export, 2.0's report after it, the check «the same», the file SENT compared (0 unexpected); the criteria in force — the form for the quality manager", (await page.locator('[data-level-test="1"][data-level-ready="yes"]').count()) === 1 && (await page.locator('[data-ready-item="criteria"][data-ready="1"]').count()) === 1 && /— 0 неочаквани разлики|— 0 unexpected/.test(await page.locator('[data-ready-item="compared"]').innerText()) && (await page.locator("[data-level-form]").count()) === 1);
  t("the result is never chosen — the form has no field for it", (await page.locator('[data-level-form] [name="result"]').count()) === 0);
  const p1 = await record(S, null);
  t("every item matching, nothing unexpected, the report in: recorded — PASSES", p1 === "recorded-pass" && (await page.locator('[data-level-test-row][data-test-result="pass"]').count()) >= 1);
  // «не съвпада» without why: refused
  await go(`/schemes/${S}#level-test`);
  const box2 = page.locator("[data-level-form-box]");
  if (!(await box2.evaluate((d) => d.open))) await box2.locator("summary").click();
  for (const item of await page.locator("[data-level-form] [data-level-item]").all()) await item.locator('input[value="match"]').check();
  await page.locator('[data-level-form] [data-level-item="z"] input[value="mismatch"]').check();
  await page.locator('[data-level-form] textarea[name="conclusion"]').fill("Без причина");
  await Promise.all([page.waitForURL(/vt=/, { timeout: 90000 }), page.locator("[data-level-form] [data-level-submit]").click()]);
  t("«не съвпада» without why: refused, said", new URL(page.url()).searchParams.get("vt") === "item-note");
  const p2 = await record(S, "z");
  t("one item «не съвпада» (with why): recorded — FAILS", p2 === "recorded-fail" && (await page.locator('[data-level-test-row][data-test-result="fail"]').count()) >= 1);
  const journal = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: «Level 1 test … PASSES / FAILS, against acceptance criteria edition N»", new RegExp(`Level 1 test on [^<]* — PASSES, against acceptance criteria edition ${edition}`).test(journal) && /— FAILS, against acceptance criteria edition/.test(journal));

  // ── «Валидиране»: the tests; the criteria they rest on cannot be voided ──
  await go("/validation#tests");
  t("«Валидиране» lists the tests — the round, the result, the edition", (await page.locator(`[data-test-row][data-test-result="pass"]`).count()) >= 1 && (await page.locator(`[data-test-row][data-test-result="fail"]`).count()) >= 1);
  const crow = page.locator(`[data-criteria-edition="${edition}"][data-criteria-voided="0"]`);
  await crow.locator("[data-criteria-void] summary").click();
  await crow.locator('input[name="reason"]').fill("Опит за анулиране — проверка");
  await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), crow.locator("[data-criteria-void-submit]").click()]);
  t("the criteria edition the tests rest on: its void refused, said", new URL(page.url()).searchParams.get("v") === "rests" && (await page.locator(`[data-criteria-edition="${edition}"][data-criteria-voided="0"]`).count()) === 1);

  // ── a new export after 2.0's report: the chain broken — not ready (8.3 review) ──
  await go("/dev/persona?role=manager");
  await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  await go("/dev/persona?model=quality");
  await go(`/schemes/${S}#level-test`);
  t("a new export after 2.0's report: not ready — the report is not of the file in force; no form", (await page.locator('[data-level-test="1"][data-level-ready="no"]').count()) === 1 && (await page.locator("[data-level-form]").count()) === 0);

  // ── the software administrator: no form ──
  await go("/dev/persona?model=software_admin");
  const ra = await go(`/schemes/${S}#level-test`);
  const deniedPage = page.url().includes("denied") || /login\?denied=1/.test(await page.content()) || ra?.status() === 403;
  t("the software administrator: no way to record a test — the round's page is not his (codes), and no form", deniedPage && (await page.locator("[data-level-form]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-level1: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
