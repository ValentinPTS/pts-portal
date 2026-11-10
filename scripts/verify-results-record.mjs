// Plan part 6.8 check (the record replaces the Results Sheet Ф 7.2.1-7), against a LOCAL dev server
// (in-memory store, login off; Gate B off — its texts are checked by results-record.test):
//   BASE=http://localhost:3000 node scripts/verify-results-record.mjs
// A lab submits and opens its record (another participation's refused); PTS opens it by code. A
// calibration version: the laboratory's name, the person and the subcontracted part typed by the lab —
// the lab and the manager see them, an auditor (results, not names) does not.
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
const ENT = `Запис ${stamp} ООД`, LAB = `Лаб. запис ${stamp}`, USER = `Потребител запис ${stamp}`, NAME_A = `Запис А ${stamp}`;
const TYPED_LAB = `Тайна Калибровъчна Лаб ${stamp}`, TYPED_PERSON = `Тайно Лице ${stamp}`, SUB = `Сестринска лаб ${stamp}`;

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
  await box.locator('[data-user-form="new"] [name="email"]').fill(`rec${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Запис ${stamp}`);
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

  // ── the lab submits; its record ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  const K = await fillForm("5,1");
  t("the lab submits version 1", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));
  await go(`/lab/p/${pidA}/results`);
  t("its versions link to the record", (await page.locator('[data-record-link="1"]').count()) === 1);
  await page.locator('[data-record-link="1"]').click();
  await page.waitForURL(/\/results\/v\/1$/, { timeout: 60000 }).catch(() => {});
  const rec = page.locator("[data-results-record]");
  t("the record (it replaces the Results Sheet Ф 7.2.1-7): version 1, the receipt, the values as submitted, N/R as declared; printable", (await attr(rec, "data-results-record")) === "1" && /Ф 7\.2\.1-7|F 7\.2\.1-7/.test(await rec.innerText()) && /5,1/.test(await page.locator(`[data-record-row="${K}"]`).innerText()) && /N\/R/.test(await rec.innerText()) && (await page.locator("[data-print]").count()) === 1);
  await go(`/lab/p/00000000-0000-4000-8000-000000000000/results/v/1`);
  t("…another participation's record: not reachable", (await page.locator("[data-results-record]").count()) === 0);
  await go(`/lab/p/${pidA}/results/v/9`);
  t("…a version that does not exist: none", (await page.locator("[data-results-record]").count()) === 0);
  // ── PTS ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#submissions`);
  await page.locator('[data-staff-record-link="1"]').click();
  await page.waitForURL(/\/v\/1$/, { timeout: 60000 }).catch(() => {});
  t("PTS: the same record, by code", (await attr(page.locator("[data-results-record]"), "data-results-record")) === "1" && (await page.locator("[data-record-code]").innerText()).trim() === refA);

  // ── calibration: the typed laboratory and person — to names only ──
  await go("/files/calibration");
  const dlgC = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dlgC.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dlgC.locator('select[name="sample"]').selectOption("weights-m1");
  await dlgC.locator('input[name="number"]').fill(`PTS 26/12-C-${50000 + (stamp % 40000)}`);
  await dlgC.locator('input[name="name"]').fill(`Запис калибриране ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dlgC.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const C = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${C}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${C}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  await go(`/dev/persona?role=lab&join=${C}`);
  await go("/lab");
  const hrefC = await page.locator(`[data-lab-card="${C}"] a[href^="/lab/p/"]`).first().getAttribute("href").catch(() => null);
  await go(`${hrefC}/results`);
  const gen = { labName: TYPED_LAB, manufacturer: "Mettler", model: "M1", serial: `S${stamp}`, dateFrom: today, dateTo: today, tempMin: "20,1", tempMax: "20,6", method: "Пряко сравнение", signedOn: today, signedBy: TYPED_PERSON };
  for (const [k, v] of Object.entries(gen)) await page.locator(`[data-field="g_${k}"]`).fill(v);
  const cr = page.locator("[data-cal-row]"), cn = await cr.count(), c0 = cr.first(), ck = await c0.getAttribute("data-cal-row");
  await c0.locator(`[data-field="ref_${ck}"]`).fill("20,00");
  await c0.locator(`[data-field="meas_${ck}"]`).fill("20,03");
  await c0.locator(`[data-field="U_${ck}"]`).fill("0,02");
  for (let i = 1; i < cn; i++) await cr.nth(i).locator('input[type="checkbox"]').check();
  await page.locator("[data-review]").click();
  await waitFor(async () => (await attr(page.locator("[data-submit-panel]"), "data-submit-panel")) === "review", 40);
  await page.locator('[data-confirm="truthful"]').check();
  await page.locator('[data-confirm="errors"]').check();
  await page.locator('[data-confirm="subcontracted"]').check();
  await page.locator('[data-confirm="part"]').fill(SUB);
  await page.locator("[data-submit]").click();
  t("a calibration lab submits — its name and the person typed, a part subcontracted", await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));
  await go(`${hrefC}/results/v/1`);
  const own = await page.locator("[data-results-record]").innerText().catch(() => "");
  t("…its own record: all of it — the name, the person, the part, the error computed", own.includes(TYPED_LAB) && own.includes(TYPED_PERSON) && own.includes(SUB) && /0,03/.test(own));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${C}/participants`);
  const codeC = (await page.locator("[data-participant-row]").first().locator("td").first().innerText()).trim();
  await go(`/schemes/${C}/participants/${encodeURIComponent(codeC)}/v/1`);
  const mgr0 = await page.locator("[data-results-record]").innerText().catch(() => "");
  t("PTS, the manager (may see the names): hidden until revealed — «Покажи имената» offered", !mgr0.includes(TYPED_LAB) && !mgr0.includes(TYPED_PERSON) && (await page.locator("[data-record-reveal]").count()) === 1);
  await page.locator("[data-record-reveal]").click();
  await page.waitForURL(/reveal=1/, { timeout: 60000 }).catch(() => {});
  const mgr = await page.locator("[data-results-record]").innerText().catch(() => "");
  const jr = await (await page.request.get(`${BASE}/activity?scheme=${C}`)).text();
  t("…revealed: the name, the person, the part — the opening on record (2.3)", mgr.includes(TYPED_LAB) && mgr.includes(TYPED_PERSON) && mgr.includes(SUB) && /Names typed in a submitted version shown for one code/.test(jr));
  await go("/dev/persona?role=auditor");
  await go(`/schemes/${C}/participants/${encodeURIComponent(codeC)}/v/1`);
  const aud = await page.locator("[data-results-record]").innerText().catch(() => "");
  t("an auditor (reads the results, not the names): the record — the name, the person and the part «—», never shown", aud.length > 100 && !aud.includes(TYPED_LAB) && !aud.includes(TYPED_PERSON) && !aud.includes(SUB) && /0,03/.test(aud));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-results-record: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
