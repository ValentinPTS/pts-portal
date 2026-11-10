// Plan part 7.2 check (import from PTS_Analysis 2.0; Реш. 68), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-analysis-import.mjs
// A scheme in processing; the expert imports 2.0.3 with a BG and an EN report and a chart → shown,
// each file's bytes as they came; the scheme's report file is the BG one, stamped. An import with no
// version, or a «PDF» that is not one, is refused. An auditor sees the imports, not the form.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082", "hex");
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // a testing scheme with one participation, taken to processing
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Внасяне ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(`Внасяне А ${stamp}`);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(`Внасяне А ${stamp}`));
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await state()); }, 10);
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40);
  answers.push(true);
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1, 60);
  answers.push(true, `Обработката започва — проверка ${stamp}`);
  await page.locator('[data-act="process"]').click();
  t("setup: a scheme in processing", await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await state()); }, 20));

  // ── the import ──
  await go(`/schemes/${S}#analysis-import`);
  const form = page.locator("[data-import-form]");
  t("the scheme's page: «Внесено от PTS_Analysis 2.0» — nothing yet, the form for the expert", (await page.locator("[data-import-none]").count()) === 1 && (await form.count()) === 1);
  // refused: no version (the browser's own check taken off), a «PDF» that is not one
  await form.locator('input[name="version"]').evaluate((x) => x.removeAttribute("required"));
  await form.locator('input[name="report-bg"]').setInputFiles({ name: "report-bg.pdf", mimeType: "application/pdf", buffer: pdf("BG") });
  await form.locator("[data-import-submit]").click();
  t("an import without the module's version: refused — said", await waitFor(async () => /imp=version/.test(page.url()), 30) && (await page.locator('[data-import-answer="version"]').count()) === 1);
  await go(`/schemes/${S}#analysis-import`);
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="report-bg"]').setInputFiles({ name: "report-bg.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") });
  await form.locator("[data-import-submit]").click();
  t("…a «PDF» that is not one (by its bytes): refused — said", await waitFor(async () => /imp=type/.test(page.url()), 30));
  await go(`/schemes/${S}#analysis-import`);
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="report-bg"]').setInputFiles({ name: "Доклад-БГ.pdf", mimeType: "application/pdf", buffer: pdf("BG") });
  await form.locator('input[name="report-en"]').setInputFiles({ name: "Report-EN.pdf", mimeType: "application/pdf", buffer: pdf("EN") });
  await form.locator('input[name="chart"]').setInputFiles([{ name: "chart-1.png", mimeType: "image/png", buffer: png }]);
  await form.locator("[data-import-submit]").click();
  t("imported: PTS_Analysis 2.0.3 — the BG and EN reports and the chart listed", await waitFor(async () => /imp=ok/.test(page.url()), 30) && (await page.locator('[data-import-in-force="2.0.3"]').count()) === 1 && (await page.locator("[data-import-file]").count()) === 3);
  const links = await page.locator("[data-import-file] a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const bodies = await Promise.all(links.map(async (h) => Buffer.from(await (await page.request.get(BASE + h)).body())));
  t("…each file as it came — byte for byte", bodies[0].equals(pdf("BG")) && bodies[1].equals(pdf("EN")) && bodies[2].equals(png));
  const rep = Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/uploaded/report`)).body());
  t("the scheme's report file is the BG report — for the report act", rep.equals(pdf("BG")));
  const r1 = await page.request.get(BASE + links[0]);
  t("…served under a neutral name — never the name it came with (often a laboratory's)", /report-bg-2\.0\.3-1\.pdf/.test(r1.headers()["content-disposition"] ?? "") && !/Доклад/.test(decodeURIComponent(r1.headers()["content-disposition"] ?? "")));
  // an addition: more charts, without the report — the report in force stays
  await go(`/schemes/${S}#analysis-import`);
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="chart"]').setInputFiles([{ name: "chart-2.png", mimeType: "image/png", buffer: png }, { name: "chart-3.png", mimeType: "image/png", buffer: png }]);
  await form.locator("[data-import-submit]").click();
  t("an addition (two more charts, no report): recorded — the earlier import still listed with its links; the report file unchanged", await waitFor(async () => /imp=ok/.test(page.url()), 30) && (await page.locator("[data-import-earlier-item] [data-import-file] a").count()) === 3 && Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/uploaded/report`)).body()).equals(pdf("BG")));
  // a set larger than an import takes — stopped in the browser, with the action's own words
  await go(`/schemes/${S}#analysis-import`);
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15_500_000, 32)]);
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="dossier"]').setInputFiles({ name: "dossier.pdf", mimeType: "application/pdf", buffer: big });
  await form.locator("[data-import-submit]").click();
  t("…more than 15 MB in all: stopped before it is sent — «15 MB in all per import»", await waitFor(async () => (await page.locator("[data-import-too-big]").count()) === 1, 20) && !/imp=/.test(page.url()));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled — the version and the kinds; never a file name", /Imported from PTS_Analysis 2\.0\.3: report-bg ×1, report-en ×1, chart ×1/.test(act) && !act.includes("Доклад-БГ") && !act.includes("Report-EN.pdf"));
  // an auditor: the imports, not the form
  await go("/dev/persona?role=auditor");
  await go(`/schemes/${S}#analysis-import`);
  t("an auditor: the imports listed, no form", (await page.locator('[data-import-in-force="2.0.3"]').count()) === 1 && (await page.locator("[data-import-form]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-analysis-import: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
