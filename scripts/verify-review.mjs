// Plan part 6.7 check (PTS's review after the deadline; Реш. 88; D1), against a LOCAL dev server
// (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-review.mjs
// Testing: a lab submits a mean off its determinations and a determination finer than the step →
// both findings on PTS's review page (the determinations' mean shown there only); the lab's pages
// show none of it; PTS writes the individual note; an auditor reads it. Calibration: the criteria
// set in the design; a submission off the nominal beyond the tolerance, U with three figures and
// below its CMC, the temperature outside the range → four findings; N/A points listed.
import { chromium } from "playwright";

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
const ENT = `Преглед ${stamp} ООД`, LAB = `Лаб. преглед ${stamp}`, USER = `Потребител преглед ${stamp}`, NAME_A = `Преглед А ${stamp}`;
const NOTE = `Средната не следва определянията; определяне 1 извън стъпката ${stamp}`;
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };
const saveEditor = async () => { await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.searchParams.has("err") || u.searchParams.has("chars") || u.searchParams.has("rev"), { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]); await page.waitForLoadState("domcontentloaded"); };

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
  await box.locator('[data-user-form="new"] [name="email"]').fill(`rev${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Преглед ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  // the first characteristic: the reporting step 0,1, two determinations (3.6)
  await go(`/schemes/${S}/edit`);
  const r0 = page.locator('[data-char-row="0"]');
  await r0.waitFor();
  await type(r0.getByLabel(/^Стъпка на докладване|^Reporting step/), "0,1");
  await r0.getByLabel(/^Брой определяния|^Determinations/).selectOption("2");
  await saveEditor();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  // (the review lists the participation by its code)
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

  // ── the lab submits: the mean off its determinations; a determination finer than the step ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  const K = await fillForm("5,2");
  const row0 = page.locator("[data-result-row]").first();
  await row0.locator(`[data-field="d_${K}_0"]`).fill("5,12");
  await row0.locator(`[data-field="d_${K}_1"]`).fill("5,5");
  // typed until the controlled field holds it — a fill before hydration is not seen (under load)
  await type(row0.locator(`[data-field="mean_${K}"]`), "5,2");
  await type(row0.locator(`[data-field="d_${K}_0"]`), "5,12");
  t("the lab submits (determinations 5,12 and 5,5; the mean 5,2)", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));

  // ── PTS's review ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  t("the scheme's page links to «Преглед след срока»", (await page.locator("[data-review-link] a").count()) === 1);
  await go(`/schemes/${S}/review`);
  const item = page.locator("[data-review-item]").first();
  t("the review: the participation by code — its latest version (not locked yet)", (await page.locator("[data-review-item]").count()) === 1 && /версия 1|version 1/.test(await item.innerText()) && /последната|the latest/.test(await item.innerText()));
  const mean = item.locator('[data-finding="mean-dets"]');
  t("…the declared mean against the determinations: a finding — their mean shown HERE, exactly (5,31 against 5,2)", (await mean.count()) === 1 && /5,31/.test(await mean.innerText()) && /5,2\b/.test(await mean.innerText()));
  t("…the resolution: 5,12 with the step 0,1 — a finding", /5,12/.test(await item.locator('[data-finding="resolution"]').first().innerText().catch(() => "")) && (await attr(item, "data-review-findings")) === "2");
  // the lab sees none of it
  await go(`/dev/persona?role=participant&user=${uid}`);
  const labTexts = [(await (await page.request.get(`${BASE}/lab/p/${pidA}`)).text()), (await (await page.request.get(`${BASE}/lab/p/${pidA}/results`)).text())].join("");
  t("the lab's pages: nothing of the review — no determinations' mean, no finding, no note (Реш. 88)", !/5,31|5\.31|Преглед след срока|Review after the deadline|средно от определянията|резолюция на представяне|Индивидуална забележка/.test(labTexts));
  t("…its own review page: not reachable", !/data-review-page/.test(await (await page.request.get(`${BASE}/schemes/${S}/review`)).text()));

  // ── the individual note ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/review`);
  await page.locator("[data-note-form] textarea").first().fill(NOTE);
  await page.locator("[data-note-submit]").first().click();
  t("the individual note recorded — who, when", await waitFor(async () => /note=ok/.test(page.url()), 30) && (await attr(page.locator("[data-review-note]").first(), "data-review-note")) === "1");
  await page.locator("[data-note-submit]").first().click();
  t("…the same again: «nothing new»", await waitFor(async () => /note=same/.test(page.url()), 30));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("…journalled without its text", /Review note written/.test(act) && !act.includes(NOTE));
  await go("/dev/persona?role=auditor");
  await go(`/schemes/${S}/review`);
  t("an auditor (who reads the results): the review and the note — no form to write one", (await page.locator("[data-review-item]").count()) === 1 && (await page.locator("[data-note-form]").count()) === 0 && (await page.locator("[data-review-page]").innerText()).includes(NOTE));

  // ── calibration: the criteria in the design; four findings ──
  await go("/dev/persona?role=manager");
  await go("/files/calibration");
  const dlgC = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dlgC.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dlgC.locator('select[name="sample"]').selectOption("weights-m1");
  await dlgC.locator('input[name="number"]').fill(`PTS 26/12-C-${40000 + (stamp % 50000)}`);
  await dlgC.locator('input[name="name"]').fill(`Преглед калибриране ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dlgC.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const C = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${C}`);
  t("a calibration scheme in «open» (labs submit while it circulates): the review is linked", (await page.locator("[data-review-link] a").count()) === 1);
  const tolL = /^Допуск на реализираната референтна стойност|^Tolerance of the realised reference value/, fromL = /^Температура в измервателния обем — от|^Temperature in the measurement volume — from/, toL = /^Температура в измервателния обем — до|^Temperature in the measurement volume — to/;
  await go(`/schemes/${C}/edit`);
  await page.getByLabel(tolL).waitFor();
  await type(page.getByLabel(tolL), "±0,02");
  await saveEditor();
  await go(`/schemes/${C}/edit`);
  t("the tolerance typed «±0,02»: kept as 0,02", (await page.getByLabel(tolL).inputValue()) === "0,02");
  await type(page.getByLabel(tolL), "0,3 kN");
  await type(page.getByLabel(fromL), "25");
  await type(page.getByLabel(toL), "20");
  await saveEditor();
  t("…«0,3 kN» and a range the wrong way round (25 → 20): refused, named — the saved ones kept, never wiped in silence", /tolerance/.test((await page.locator("[data-review-criteria-refused]").getAttribute("data-review-criteria-refused").catch(() => "")) ?? "") && /tempRange/.test((await page.locator("[data-review-criteria-refused]").getAttribute("data-review-criteria-refused").catch(() => "")) ?? "") && (await (async () => { await go(`/schemes/${C}/edit`); return (await page.getByLabel(tolL).inputValue()) === "0,02" && (await page.getByLabel(fromL).inputValue()) === ""; })()));
  await go(`/schemes/${C}/edit`);
  const tol = page.getByLabel(tolL);
  await tol.waitFor();
  await type(tol, "0,01");
  await type(page.getByLabel(/^Температура в измервателния обем — от|^Temperature in the measurement volume — from/), "20");
  await type(page.getByLabel(/^Температура в измервателния обем — до|^Temperature in the measurement volume — to/), "25");
  await saveEditor();
  await go(`/schemes/${C}/edit`);
  t("the calibration design: the review's criteria kept (tolerance, the temperature range)", (await page.getByLabel(/^Допуск на реализираната референтна стойност|^Tolerance of the realised reference value/).inputValue()) === "0,01" && (await page.getByLabel(/^Температура в измервателния обем — до|^Temperature in the measurement volume — to/).inputValue()) === "25");
  await go(`/schemes/${C}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${C}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  await go(`/dev/persona?role=lab&join=${C}`);
  await go("/lab");
  const hrefC = await page.locator(`[data-lab-card="${C}"] a[href^="/lab/p/"]`).first().getAttribute("href").catch(() => null);
  await go(`${hrefC}/results`);
  const gen = { manufacturer: "Mettler", model: "M1", serial: `S${stamp}`, dateFrom: today, dateTo: today, tempMin: "19,5", tempMax: "21", method: "Пряко сравнение", signedOn: today, signedBy: "Лице за проверка" };
  for (const [k, v] of Object.entries(gen)) await page.locator(`[data-field="g_${k}"]`).fill(v);
  const cr = page.locator("[data-cal-row]"), cn = await cr.count(), c0 = cr.first(), ck = await c0.getAttribute("data-cal-row");
  await c0.locator(`[data-field="ref_${ck}"]`).fill("999");
  await c0.locator(`[data-field="meas_${ck}"]`).fill("999,01");
  await c0.locator(`[data-field="U_${ck}"]`).fill("0,123");
  await c0.locator(`[data-field="cmc_${ck}"]`).fill("0,5");
  for (let i = 1; i < cn; i++) await cr.nth(i).locator('input[type="checkbox"]').check();
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator('[data-confirm="errors"]').check();
  await page.locator("[data-submit]").click();
  t("a calibration lab submits (reference far off the nominal; U = 0,123 with CMC 0,5; 19,5–21 °C)", await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${C}/review`);
  const ci = page.locator("[data-review-item]").first();
  const kinds = await ci.locator("[data-finding]").evaluateAll((els) => els.map((e) => e.getAttribute("data-finding")).sort().join(","));
  t("the calibration review: the reference beyond the tolerance, U's three figures, U below the CMC, the temperature outside the range — four findings", kinds === "env,ref-nominal,u-cmc,u-sigfigs", kinds);
  t("…the points declared N/A listed for information; the error not re-checked", (await ci.locator('[data-info="na"]').count()) === cn - 1 && !/грешката не съвпада|error does not match/.test(await ci.innerText()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-review: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
