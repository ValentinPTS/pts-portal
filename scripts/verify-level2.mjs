// Plan part 8.4 check (level 2 — calibration, ILC and sampling), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-level2.mjs
// A sampling round by an old number that does not say its kind («PTS 20/10» — sampling given at the
// load) → a level-2 sampling replay, its number read as an old form; criteria for level 2 in force; the
// quality manager records the test — no 2.0 asked (А9) — and it PASSES; «Валидиране» shows sampling
// covered. An old ILC number («PTS 25/08-NA-1») → an ILC replay at level 2, not ready until 2.0 has run
// it. A kind given against the number is refused.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const stamp = Date.now() % 100000;
const dir = mkdtempSync(join(tmpdir(), "level2-"));
execFileSync(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", "scripts/replay-fixture.ts", dir, String(stamp)], { stdio: "ignore" });
const SAMPLING = readFileSync(join(dir, "replay-sampling.xlsx")), ILC = readFileSync(join(dir, "replay-ilc.xlsx")), GOOD = readFileSync(join(dir, "replay-good.xlsx"));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 60) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(500); } return false; };
const load = async (buffer, kind) => {
  await go("/validation");
  const box = page.locator("[data-replay-import]");
  await box.locator('input[name="file"]').setInputFiles({ name: "round.xlsx", mimeType: XLSX, buffer });
  await box.locator('select[name="kind"]').selectOption(kind);
  await box.locator("[data-replay-submit]").click();
  await waitFor(async () => (await box.locator("[data-replay-done], [data-replay-problem]").count()) > 0);
  return { id: await box.locator("[data-replay-done]").getAttribute("data-replay-done").catch(() => null), problem: await box.locator("[data-replay-problem]").getAttribute("data-replay-problem").catch(() => null) };
};

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/dev/persona?model=software_admin");
  const against = await load(GOOD, "S");
  t("a kind given against the number («PTS 26/03-T-1» as sampling): refused, said — nothing loaded", against.problem === "kind" && !against.id);
  const sam = await load(SAMPLING, "S");
  t("«PTS 20/10» loaded as sampling — the kind given at the load", !!sam.id);
  const ilc = await load(ILC, "");
  t("«PTS 25/08-NA-1» loaded — an ILC by its old number", !!ilc.id);

  // ── the sampling replay ──
  await go("/dev/persona?model=quality");
  await go(`/schemes/${sam.id}#replay`);
  t("the card: the kind «пробовземане»; the number read as an old form, the kind not in it — given at the load", (await page.locator('[data-replay-kind="sampling"]').count()) === 1 && (await page.locator('[data-replay-reading="old"]').count()) === 1 && /посочен при внасянето|given at the load/.test(await page.locator("[data-replay-reading]").innerText()));
  // the criteria for level 2 — signed today, unless already in force
  await go("/validation");
  if ((await page.locator('[data-level="2"]').getAttribute("data-level-criteria")) === "none") {
    const cbox = page.locator("[data-criteria-form-box]");
    if (!(await cbox.evaluate((d) => d.open))) await cbox.locator("summary").click();
    const cf = page.locator("[data-criteria-form]");
    await cf.locator('input[name="file"]').setInputFiles({ name: `criteria2-${stamp}.pdf`, mimeType: "application/pdf", buffer: pdf("criteria 2") });
    await cf.locator('input[name="signedOn"]').fill(today);
    await cf.locator('input[name="signedBy"]').fill("Ръководител на РТ провайдъра");
    for (const l of [1, 2, 3, 4, 5]) await cf.locator(`input[name="level"][value="${l}"]`).check();
    await Promise.all([page.waitForURL(/\/validation\?v=/, { timeout: 90000 }), cf.locator("[data-criteria-submit]").click()]);
  }
  t("setup: criteria for level 2 in force", (await page.locator('[data-level="2"]').getAttribute("data-level-criteria")) !== "none");
  await go(`/schemes/${sam.id}#level-test`);
  t("the level-2 card for sampling: ready with no 2.0 run (А9) — only the comparison; its own items, the number among them", (await page.locator('[data-level-test="2"][data-level-ready="yes"]').count()) === 1 && (await page.locator('[data-level-kind="sampling"]').count()) === 1 && (await page.locator('[data-ready-item="export"]').count()) === 0 && (await page.locator('[data-level-form] [data-level-item="number"]').count()) === 1 && (await page.locator('[data-level-form] [data-level-item="xpt"]').count()) === 0);
  const form = page.locator("[data-level-form]");
  for (const item of await form.locator("[data-level-item]").all()) await item.locator('input[value="match"]').check();
  await form.locator('textarea[name="conclusion"]').fill("Моделът на данните и номерът — както в приключилия кръг");
  await Promise.all([page.waitForURL(/vt=/, { timeout: 90000 }), form.locator("[data-level-submit]").click()]);
  t("recorded — PASSES", new URL(page.url()).searchParams.get("vt") === "recorded-pass");
  await go("/validation#tests");
  t("«Валидиране»: level 2 — sampling covered", (await page.locator('[data-coverage="2-sampling"][data-covered="1"]').count()) === 1);
  const journal = await (await page.request.get(`${BASE}/activity?scheme=${sam.id}`)).text();
  t("journalled: «Level 2 test (sampling) … PASSES»", /Level 2 test \(sampling\) on [^<]* — PASSES/.test(journal));

  // ── the ILC replay: level 2, not ready until 2.0 has run it ──
  await go(`/schemes/${ilc.id}#level-test`);
  t("the ILC replay: level 2, kind ILC; not ready — the export, 2.0's report and the check asked; no form", (await page.locator('[data-level-test="2"][data-level-ready="no"]').count()) === 1 && (await page.locator('[data-level-kind="ilc"]').count()) === 1 && (await page.locator('[data-ready-item="export"][data-ready="0"]').count()) === 1 && (await page.locator('[data-ready-item="reference"]').count()) === 0 && (await page.locator("[data-level-form]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-level2: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
