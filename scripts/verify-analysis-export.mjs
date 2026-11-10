// Plan part 7.1 check (the export to PTS_Analysis 2.0, schema 2.1), against a LOCAL dev server
// (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-analysis-export.mjs
// A lab submits; PTS downloads the file — preliminary before the lock — and a strict reader
// (Python's zipfile, openpyxl) opens it: the template's sheets, the lab's mean by its code, no names.
// An auditor gets no file.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", async (d) => { await d.accept(d.type() === "prompt" ? "" : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const sofia = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const today = sofia(Date.now());
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 157) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Анализ ${stamp} ООД`, LAB = `Лаб. анализ ${stamp}`, USER = `Потребител анализ ${stamp}`, NAME_A = `Анализ А ${stamp}`;


// fills the form: the first characteristic reported, the rest N/R; the test period one day
const fillForm = async (mean) => {
  const rows = page.locator("[data-result-row]");
  const n = await rows.count();
  const first = rows.first(), k0 = await first.getAttribute("data-result-row");
  for (const d of await first.locator(`[data-field^="d_${k0}_"]`).all()) await d.fill(mean);
  await first.locator(`[data-field="mean_${k0}"]`).fill(mean);
  await first.locator(`[data-field="U_${k0}"]`).fill("0,2");
  for (let i = 1; i < n; i++) { const r = rows.nth(i), k = await r.getAttribute("data-result-row"); const box = r.locator(`[data-field="nr_${k}"]`); if (!(await box.isChecked())) await box.check(); }
  await page.locator('[data-field="p_from"]').fill(today);
  return k0;
};
const submit = async () => {
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  const ready = (await page.locator("[data-submit]").count()) === 1;
  if (!ready) { console.error("  (the review blocks:", (await page.locator("#results-check-report").innerText().catch(() => "")).slice(0, 300), ")"); return false; }
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator("[data-submit]").click();
  await waitFor(async () => (await page.locator("[data-receipt]").count()) === 1 || (await page.locator("[data-submit-error]").count()) === 1, 40);
  return ready;
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory, a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 14" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Стара Загора 6");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`an${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Анализ ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  // (the file is by code — no reference needed here)
  const pidA = await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  const running = await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  t("setup: a running testing scheme; A of the entity", !!S && !!pidA && running);

  // ── the lab submits ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  const K = await fillForm("5,1");
  t("the lab submits version 1 (mean 5,1)", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));

  // ── PTS: before the coding act — refused (provisional references, never codes) ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  const r0 = await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  t("before the coding act: not exported — the page and the answer say the references are provisional (409)", r0.status() === 409 && /provisional/.test(await r0.text()) && (await page.locator("[data-analysis-provisional]").count()) === 1);
  // the final list, then the coding act
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40);
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1, 60);
  // ── PTS: the export ──
  await go(`/schemes/${S}`);
  t("the scheme's page: «Изнеси към PTS_Analysis 2.0» — preliminary (the submission not locked)", (await page.locator("[data-analysis-export-link]").count()) === 1 && /предварително|preliminary/.test(await page.locator("[data-analysis-export]").innerText()));
  const r = await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  const disp = r.headers()["content-disposition"] ?? "";
  t("the file: an XLSX, named as preliminary", r.status() === 200 && /spreadsheetml/.test(r.headers()["content-type"] ?? "") && /_PTS_Analysis_input_v2\.1_PRELIMINARY_/.test(disp), `${r.status()} ${disp}`);
  const dir = mkdtempSync(join(tmpdir(), "analysis-")), file = join(dir, "a.xlsx");
  writeFileSync(file, await r.body());
  const py = `import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip()
import openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
res = [list(x) for x in wb["Results"].iter_rows(values_only=True)]
print(json.dumps({"bad": bad, "sheets": wb.sheetnames, "head": res[0], "row": [x for x in res[1:] if x[1] == sys.argv[2]][:1]}, ensure_ascii=False, default=str))`;
  const got = JSON.parse(execFileSync("python3", ["-c", py, file, K], { encoding: "utf8" }).trim());
  t("…a strict reader opens it: every CRC right; the template's eight sheets", got.bad === null && got.sheets.join() === "Scheme_meta,Characteristics,Participants,Results,Homogeneity,Calibration,External_providers,Указания", JSON.stringify(got.sheets));
  t("…Results: the lab's mean by its code — the used value a number, the reported one as typed", got.row.length === 1 && got.row[0][5] === 5.1 && got.row[0][10] === "5,1" && got.row[0][7] === "reported", JSON.stringify(got.row));
  t("…codes only — the laboratory's, the entity's, the participation's and the user's names nowhere in the file", !execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(any(w in z.read(n).decode('utf-8','replace') for n in z.namelist() for w in sys.argv[2:]))", file, LAB, ENT, NAME_A, USER], { encoding: "utf8" }).includes("True"));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("…journalled — the counts, PRELIMINARY, never a value", /Exported to PTS_Analysis 2\.0 \(schema 2\.1\) — PRELIMINARY/.test(act) && !act.includes("5,1"));
  // an auditor (reads the results, does not process them): refused
  await go("/dev/persona?role=auditor");
  const ra = await page.request.get(`${BASE}/schemes/${S}/export/analysis`, { maxRedirects: 0 }).catch(() => null);
  t("an auditor: no file (the statistics and the coding expert's)", !ra || ra.status() !== 200 || !/spreadsheetml/.test(ra.headers()["content-type"] ?? ""), String(ra?.status()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-analysis-export: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
