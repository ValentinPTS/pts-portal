// Plan part 6.6 check («Заключи подаването»; Реш. 21, 22, 91), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-submission-lock.mjs
// Two participations of one entity, each its laboratory; A submits, B does not. The scheme's page says
// what the lock will record; the act «Заключи подаването и започни обработката» records it — A's
// version 1, B N/R; B is told; the forms are locked and no unlock is offered; «Върни» reopens; A submits
// version 2; locked again — version 2 taken.
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
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const sofia = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const today = sofia(Date.now());
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 157) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Заключване ${stamp} ООД`, LAB = `Лаб. заключване ${stamp}`, USER = `Потребител заключване ${stamp}`, NAME_A = `Заключване А ${stamp}`;
const LAB2 = `Лаб. заключване Б ${stamp}`, NAME_B = `Заключване Б ${stamp}`, NAME_C = `Заключване В ${stamp}`;
const tomorrow = sofia(Date.now() + 86_400_000);

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
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB2);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Пловдив 9");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB2 }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`lock${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Заключване ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  // (the code is read again after the coding act)
  const pidA = await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);
  // B: a second participation of the entity, its other laboratory — it will submit nothing
  await add.locator('[name="labName"]').fill(NAME_B);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_B));
  const pidB = await page.locator("[data-participant-row]", { hasText: NAME_B }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cellB = page.locator(`[data-snapshot-row="${pidB}"]`);
  await cellB.locator("[data-freeze-open] button").click();
  const fb = cellB.locator("[data-freeze-form]");
  await waitFor(async () => (await fb.count()) === 1);
  await fb.locator('select[name="entityId"]').selectOption({ label: ENT }).catch(() => {});
  await fb.locator('select[name="laboratoryId"]').selectOption(await fb.locator('select[name="laboratoryId"] option', { hasText: LAB2 }).getAttribute("value"));
  await fb.locator("[data-freeze-confirm]").check();
  await fb.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidB}"]`).count()) === 1);
  // C: a third, whose Results Sheet comes outside the form (recorded by PTS)
  await add.locator('[name="labName"]').fill(NAME_C);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_C));
  const pidC = await page.locator("[data-participant-row]", { hasText: NAME_C }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  const running = await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  t("setup: a running testing scheme; A and B of the entity, each its laboratory", !!S && !!pidA && !!pidB && running);

  // ── the second announcement: the final list (the coding act needs it, 5.3) ──
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  t("the final list settled — A, B and C on it", await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40));

  // ── A submits; B does not ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  await fillForm("5,1");
  t("A submits version 1; B submits nothing", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));

  // ── the coding act (processing waits for it, 5.3) ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  answers.push(true);
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1, 60);
  await go(`/schemes/${S}/participants`);
  // coded: the rows show codes, not names — each row found by its participation's own next row
  const codeOf = async (pid) => (await page.locator(`[data-snapshot-row="${pid}"]`).locator("xpath=preceding-sibling::tr[@data-participant-row][1]").locator("td").first().innerText({ timeout: 10000 }).catch(() => "")).trim();
  const codeA = await codeOf(pidA), codeB = await codeOf(pidB), codeC = await codeOf(pidC);
  t("coded: A, B and C have their codes", /^\d{5,}$/.test(codeA) && /^\d{5,}$/.test(codeB) && /^\d{5,}$/.test(codeC), `${codeA} ${codeB} ${codeC}`);
  // C's sheet came by e-mail: PTS records «results returned» on its case file
  await go(`/schemes/${S}/participants/${codeC}`);
  const step = page.locator('form:has(input[name="ref"])');
  await step.locator('select[name="kind"]').selectOption("results_returned");
  await step.locator('input[name="ref"]').fill(`SHEET-${stamp}`);
  await step.locator('button[type="submit"]').click();
  await page.waitForLoadState("domcontentloaded");
  // the results deadline: tomorrow — still running for B
  await go(`/schemes/${S}`);
  const rd = page.locator('[data-date-key="resultsDue"]');
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(tomorrow); await page.waitForTimeout(400); }
  await page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ }).click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);

  // ── before the act: what the lock will record ──
  await go(`/schemes/${S}#stages`);
  const warn = await page.locator('[data-act-warn="process"]').innerText().catch(() => "");
  t("the scheme's page says what the lock will record: 1 with a version, 1 outside the form (C's sheet — not N/R), 1 without — N/R: B; B's deadline still running", /1 с подадена версия, 1 получени извън формуляра \(лист\), 1 без резултат|1 with a submitted version, 1 received outside the form \(a sheet\), 1 without results/.test(warn) && /N\/R: \d+\./.test(warn) && warn.includes(codeB) && !/N\/R: [^.]*\b(${codeA}|${codeC})\b/.test(warn) && /Формулярът още е отворен за|The form is still open for/.test(warn), warn);
  t("…the act is «Заключи подаването и започни обработката»", /Заключи подаването и започни обработката|Lock the submission and start processing/.test(await page.locator('[data-act="process"]').innerText()));
  answers.push(true, "");
  await page.locator('[data-act="process"]').click();
  t("…while B's deadline runs, the lock without a reason: refused — said (6.6 review)", await waitFor(async () => /още е отворен за|still open for/.test(await page.locator("[data-lifecycle-error]").innerText().catch(() => "")), 30) && /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()));
  answers.push(true, `B не е подал до заключването — решение на PTS ${stamp}`);
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="process"]').click();
  t("locked: the scheme is in processing", await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 20));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: «Submission locked — 1 with a submitted version, 1 outside the form, 1 without (N/R): B» — never a value", /Submission locked at the start of processing — 1 with a submitted version, 1 received outside the form, 1 without \(N\/R\)/.test(act) && act.includes(codeB) && !act.includes("5,1"));

  // ── PTS's pages: the version processed, or N/R; no unlock after it ──
  await go(`/schemes/${S}/participants/${codeA}#submissions`);
  t("PTS, A: «locked — version 1 is processed»; no unlock offered", (await attr(page.locator("[data-staff-lock]"), "data-staff-lock")) === "1" && (await page.locator("[data-unlock-form]").count()) === 0);
  await go(`/schemes/${S}/participants/${codeB}#submissions`);
  t("PTS, B: «no version submitted — N/R»", (await attr(page.locator("[data-staff-lock]"), "data-staff-lock")) === "nr");
  await go(`/schemes/${S}/participants/${codeC}#submissions`);
  t("PTS, C: «the results were received outside the form (a sheet)» — not N/R", (await attr(page.locator("[data-staff-lock]"), "data-staff-lock")) === "outside");
  await go("/notices");
  t("B is told, personally — «your participation is N/R» — held for a person (Реш. 22, 91)", (await page.locator("[data-held]", { hasText: /участието ви е N\/R|your participation is N\/R/ }).count()) >= 1);

  // ── the lab: locked, read-only ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  t("the lab, A: «the submission is locked — processing has started; version 1 is processed»; no review, read-only", (await attr(page.locator("[data-results-locked]"), "data-results-locked")) === "1" && (await page.locator("[data-review]").count()) === 0 && (await page.locator("[data-result-row]").first().locator('[data-field^="mean_"]').getAttribute("readonly")) !== null);
  await go(`/lab/p/${pidB}/results`);
  t("the lab, B: «no results were received from you — N/R»", (await attr(page.locator("[data-results-locked]"), "data-results-locked")) === "nr");

  // ── «Върни»: reopened; locked again: a new record ──
  await go("/dev/persona?role=manager");
  answers.push(true, `Забравен участник — обработката върната ${stamp}`);
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="back"]').click();
  t("«Върни»: in progress again — the reopening recorded with its note", await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 20) && /Submission reopened/.test(await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text()));
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  t("…the lab's form follows the deadline again — no lock note, the review offered", (await page.locator("[data-results-locked]").count()) === 0 && (await page.locator("[data-review]").count()) === 1);
  await page.locator("[data-result-row]").first().locator('[data-field^="mean_"]').fill("5,2");
  t("…A submits version 2", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "2", 40));
  await go("/dev/persona?role=manager");
  await go("/notices");
  t("…B, recorded N/R, is told the submission is open again", (await page.locator("[data-held]", { hasText: /отново отворено|open again/ }).count()) >= 1);
  await go(`/schemes/${S}#stages`);
  answers.push(true, `Второ заключване — B пак без резултат ${stamp}`);
  await page.locator('[data-act="process"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 20);
  await go(`/schemes/${S}/participants/${codeA}#submissions`);
  t("locked again: a new record — version 2 now processed", (await attr(page.locator("[data-staff-lock]"), "data-staff-lock")) === "2");
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-submission-lock: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
