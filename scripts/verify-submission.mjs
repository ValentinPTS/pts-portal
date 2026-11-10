// Plan part 6.4 check (submission; Zadanie §7; Реш. 111), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-submission.mjs
// A running testing scheme; participation A of a legal entity. The entity's user fills the form,
// reviews it (the summary, no blocking problem), confirms and submits — a receipt; submits again — a
// second version; PTS sees both. The results deadline set to yesterday: the form is closed. PTS
// unlocks it with a reason until today: the lab submits again, and the version names the unlock.
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
const today = sofia(Date.now()), yesterday = sofia(Date.now() - 86_400_000);
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 157) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Подаване ${stamp} ООД`, LAB = `Лаб. подаване ${stamp}`, USER = `Потребител подаване ${stamp}`, NAME_A = `Подаване А ${stamp}`;
const REASON = `Техническа грешка ${stamp} — по писмо`;

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
  await box.locator('[data-user-form="new"] [name="email"]').fill(`sub${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Подаване ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  const refA = (await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("td").first().innerText()).trim();
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

  // ── the lab: fill, review, confirm, submit ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  await fillForm("5,1");
  // the review refuses without the confirmation — said
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  t("the review: the draft saved, the checks pass, a summary of what is submitted (N/R named)", (await page.locator("[data-submit]").count()) === 1 && /5,1/.test(await page.locator("[data-submit-summary]").innerText()) && /N\/R/.test(await page.locator("[data-submit-summary]").innerText()));
  await page.locator("[data-submit]").click();
  t("…without «the results are ours, as entered»: not submitted — said", await waitFor(async () => /Потвърдете|Confirm/.test(await page.locator("[data-submit-error]").innerText().catch(() => "")), 30));
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator("[data-submit]").click();
  t("submitted: a receipt — version 1, its number, the date and hour", await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40) && /\d{2}[./]\d{2}[./]\d{4}/.test(await page.locator("[data-receipt]").innerText()));
  // a second version, until the deadline — from the receipt, without a reload (6.4 review)
  await page.locator("[data-submit-again]").click();
  t("«Подай нова версия» from the receipt: back to the form", await waitFor(async () => (await page.locator("[data-review]").count()) === 1, 20));
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  await page.locator('[data-confirm="truthful"]').check();
  // typed during the review: what was confirmed is no longer what is there — the review again (6.4 review)
  await page.locator("[data-result-row]").first().locator('[data-field^="mean_"]').fill("5,3");
  await page.locator("[data-submit]").click();
  t("changed during the review: not submitted — «look at the summary again, confirm again», the confirmation cleared", await waitFor(async () => /променен след прегледа|changed after the review/.test(await page.locator("[data-submit-error]").innerText().catch(() => "")), 40) && !(await page.locator('[data-confirm="truthful"]').isChecked()) && /5,3/.test(await page.locator("[data-submit-summary]").innerText()));
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator("[data-submit]").click();
  t("submitted again: version 2 — the first kept", await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "2", 40));
  await go(`/lab/p/${pidA}/results`);
  t("…after a reload: both listed, each with its receipt", (await page.locator("[data-submitted-version]").count()) === 2 && (await page.locator('[data-submitted-version="1"]').count()) === 1);

  // ── PTS sees the versions ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  t("PTS: both versions on the participant's page — when, the account's kind, the receipt, the values", (await attr(page.locator("[data-staff-submissions]"), "data-staff-submissions")) === "2" && /5\.3|5,3/.test(await page.locator('[data-staff-version="2"]').innerText()) && /потребител на организацията|a user of the organisation/.test(await page.locator('[data-staff-version="2"]').innerText()));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("…journalled: «submitted its results online — version 2» — never a value", /submitted its results online — version 2|Подадени резултати/.test(act) && !act.includes("5,3"));

  // an unlock before the deadline means nothing — refused, said (6.4 review)
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  await page.locator('[data-unlock-form] input[name="until"]').fill(today);
  await page.locator('[data-unlock-form] input[name="reason"]').fill(REASON);
  await page.locator("[data-unlock-submit]").click();
  t("an unlock while the deadline has not passed: refused — «the form is open»", await waitFor(async () => /unlock=early/.test(page.url()), 30) && (await page.locator("[data-staff-unlocks]").count()) === 0);

  // ── the deadline passes: the form closes ──
  await go(`/schemes/${S}`);
  const rd = page.locator('[data-date-key="resultsDue"]');
  const saveDates = page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ });
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(yesterday); await page.waitForTimeout(400); }
  await saveDates.click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  t("the results deadline passed: the form is closed — said (Реш. 111); no review, the fields read-only", (await page.locator("[data-results-deadline-passed]").count()) === 1 && (await page.locator("[data-review]").count()) === 0 && (await page.locator("[data-result-row]").first().locator('[data-field^="mean_"]').getAttribute("readonly")) !== null);

  // ── PTS unlocks it, with a reason, until today ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  const uf = page.locator("[data-unlock-form]");
  await uf.locator('input[name="until"]').fill(today);
  await uf.locator('input[name="reason"]').fill("аб");
  await uf.locator('input[name="reason"]').evaluate((x) => x.removeAttribute("minlength"));
  await uf.locator("[data-unlock-submit]").click();
  t("an unlock without its reason: refused — said", await waitFor(async () => /unlock=reason/.test(page.url()), 30));
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  await page.locator('[data-unlock-form] input[name="until"]').fill(today);
  await page.locator('[data-unlock-form] input[name="reason"]').fill(REASON);
  await page.locator("[data-unlock-submit]").click();
  t("…with its reason: unlocked — recorded, until today", await waitFor(async () => /unlock=ok/.test(page.url()), 30) && (await page.locator("[data-staff-unlocks]").innerText()).includes(REASON));
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  await page.locator('[data-unlock-form] input[name="until"]').fill(today);
  await page.locator('[data-unlock-form] input[name="reason"]').fill(REASON);
  await page.locator("[data-unlock-submit]").click();
  t("…pressed again: «already unlocked» — one unlock, not two (6.4 review)", await waitFor(async () => /unlock=already/.test(page.url()), 30) && (await page.locator("[data-staff-unlocks] li").count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  t("the lab: «the deadline has passed, but PTS has unlocked the form»", (await page.locator("[data-results-unlocked]").count()) === 1 && (await page.locator("[data-review]").count()) === 1);
  await page.locator("[data-result-row]").first().locator('[data-field^="mean_"]').fill("5,4");
  await submit();
  t("…submitted under the unlock (the test period today — past the deadline, inside the unlock): version 3, the receipt says so", (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "3" && /отключено от PTS|unlocked by PTS/.test(await page.locator("[data-receipt]").innerText()));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  t("PTS: version 3 names the unlock and its reason (who, when, why — Реш. 111)", (await page.locator('[data-staff-version="3"]').innerText()).includes(REASON));

  // ── calibration (D1): the computed errors confirmed at submission ──
  await go("/files/calibration");
  const dlgC = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dlgC.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dlgC.locator('select[name="sample"]').selectOption("weights-m1");
  await dlgC.locator('input[name="number"]').fill(`PTS 26/12-C-${30000 + (stamp % 60000)}`);
  await dlgC.locator('input[name="name"]').fill(`Подаване калибриране ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dlgC.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const C = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${C}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${C}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  await go(`/dev/persona?role=lab&join=${C}`);
  await go("/lab");
  const hrefC = await page.locator(`[data-lab-card="${C}"] a[href^="/lab/p/"]`).first().getAttribute("href").catch(() => null);
  await go(`${hrefC}/results`);
  const gen = { manufacturer: "Mettler", model: "M1", serial: `S${stamp}`, dateFrom: today, dateTo: today, tempMin: "20,1", tempMax: "20,6", method: "Пряко сравнение", signedOn: today, signedBy: "Лице за проверка" };
  for (const [k, v] of Object.entries(gen)) await page.locator(`[data-field="g_${k}"]`).fill(v);
  const cr = page.locator("[data-cal-row]"), cn = await cr.count(), c0 = cr.first(), ck = await c0.getAttribute("data-cal-row");
  await c0.locator(`[data-field="ref_${ck}"]`).fill("20,00");
  await c0.locator(`[data-field="meas_${ck}"]`).fill("20,03");
  await c0.locator(`[data-field="U_${ck}"]`).fill("0,02");
  for (let i = 1; i < cn; i++) await cr.nth(i).locator('input[type="checkbox"]').check();
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  t("calibration: the review — the computed error in the summary; «I confirm the computed errors» asked (D1)", (await page.locator("[data-submit]").count()) === 1 && /0[,.]03/.test(await page.locator("[data-submit-summary]").innerText()) && (await page.locator('[data-confirm="errors"]').count()) === 1);
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator("[data-submit]").click();
  t("…without the errors confirmed: not submitted — said", await waitFor(async () => /изчислените грешки|computed errors/.test(await page.locator("[data-submit-error]").innerText().catch(() => "")), 30));
  await page.locator('[data-confirm="errors"]').check();
  await page.locator("[data-submit]").click();
  t("…confirmed: submitted — version 1", await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${C}/participants`);
  const refC = (await page.locator("[data-participant-row]").first().locator("td").first().innerText()).trim();
  await go(`/schemes/${C}/participants/${encodeURIComponent(refC)}#submissions`);
  const cv = await page.locator('[data-staff-version="1"]').innerText().catch(() => "");
  t("PTS: the calibration version — the reference, the measured value AND the error, as stored (D1)", /\b20([,.]0+)?\s*→\s*20[,.]03/.test(cv) && /0[.,]03/.test(cv) && /N\/A/.test(cv), cv.slice(0, 400));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-submission: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
