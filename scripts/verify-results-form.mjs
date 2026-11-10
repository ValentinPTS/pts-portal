// Plan part 6.1 check (the results form — testing; Zadanie §5, §7; К22; Реш. 88), against a
// LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-results-form.mjs
// A running testing scheme; participation A of a legal entity, B another. The entity's user
// opens A's form from its page: a row per characteristic with its method, determinations, the
// mean, U, k prefilled with 2. What is typed is autosaved and comes back exactly as typed after a
// reload; a field that is not a number is named, neutrally. B's form is not reachable for this
// user. PTS's pages show no draft.
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
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
// the acts ask to confirm (and some for a note): accepted, the note left empty
page.on("dialog", async (d) => { await d.accept(d.type() === "prompt" ? "" : undefined); });
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 149) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Резултати ${stamp} ООД`, LAB = `Лаб. резултати ${stamp}`, USER = `Потребител резултати ${stamp}`, NAME_A = `Резултати А ${stamp}`, NAME_B = `Резултати Б ${stamp}`;
const D1 = `12,${stamp % 10}4`, MEAN = `12,${stamp % 10}5`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory, a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 13" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Бургас 5");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`res${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a testing scheme from a sample (open), A of the entity and B another; announced — running
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Резултати ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  for (const n of [NAME_A, NAME_B]) {
    await add.locator('[name="labName"]').fill(n);
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(n));
  }
  const refA = (await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("td").first().innerText()).trim();
  const pidOf = (n) => page.locator("[data-participant-row]", { hasText: n }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const pidA = await pidOf(NAME_A), pidB = await pidOf(NAME_B);
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
  await waitFor(async () => /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()));
  const running = await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  t("setup: a running testing scheme; A of the entity, B another", !!S && !!pidA && !!pidB && running);

  // ── the entity's user: A's form, from its page ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  t("A's page links to its results form", (await page.locator("[data-open-results]").count()) === 1);
  await go(`/lab/p/${pidA}/results`);
  const rows = page.locator("[data-result-row]");
  const n = await rows.count();
  t("the form: a row per characteristic applied for — each with its method beside its name", n >= 1 && (await rows.first().locator("legend").innerText()).includes("—"), String(n));
  const first = rows.first();
  const key = await first.getAttribute("data-result-row");
  t("…the determinations, the mean, U and k — k prefilled with 2 (К22)", (await first.locator(`[data-field="d_${key}_0"]`).count()) === 1 && (await first.locator(`[data-field="mean_${key}"]`).count()) === 1 && (await first.locator(`[data-field="U_${key}"]`).count()) === 1 && (await first.locator(`[data-field="k_${key}"]`).inputValue()) === "2");
  t("…the portal does not compute the mean: it stays empty while the determinations are typed (Реш. 88)", await (async () => { await first.locator(`[data-field="d_${key}_0"]`).fill(D1); await page.waitForTimeout(300); return (await first.locator(`[data-field="mean_${key}"]`).inputValue()) === ""; })());
  await first.locator(`[data-field="mean_${key}"]`).fill(MEAN);
  await first.locator(`[data-field="U_${key}"]`).fill("abc");
  t("autosaved a moment after typing stops", await waitFor(async () => (await attr(page.locator("[data-draft-state]"), "data-draft-state")) === "saved", 30));
  t("…a field that is not a number is named — neutrally, nothing about a value", (await attr(page.locator("[data-not-numbers]"), "data-not-numbers")) === "1" && (await first.locator(`[data-field="U_${key}"]`).getAttribute("aria-invalid")) === "true");
  await go(`/lab/p/${pidA}/results`);
  const again = page.locator(`[data-result-row="${key}"]`);
  t("after a reload: exactly as typed — «abc» too, k still 2", (await again.locator(`[data-field="d_${key}_0"]`).inputValue()) === D1 && (await again.locator(`[data-field="mean_${key}"]`).inputValue()) === MEAN && (await again.locator(`[data-field="U_${key}"]`).inputValue()) === "abc" && (await again.locator(`[data-field="k_${key}"]`).inputValue()) === "2");
  t("…and it says when it was saved", /записана|saved/i.test(await page.locator("[data-draft-state]").innerText()));
  await again.locator(`[data-field="U_${key}"]`).fill("0,3");
  await page.locator("[data-save-draft]").click();
  t("«Запази черновата» saves at once; the field a number now — no longer named", await waitFor(async () => (await attr(page.locator("[data-draft-state]"), "data-draft-state")) === "saved" && (await page.locator("[data-not-numbers]").count()) === 0, 30));

  // ── two tabs on one draft: the older never writes over the newer (review) ──
  const tab2 = await context.newPage();
  await tab2.goto(`${BASE}/lab/p/${pidA}/results`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await tab2.locator(`[data-field="U_${key}"]`).fill("0,4");
  await tab2.locator("[data-save-draft]").click();
  for (let i = 0; i < 30 && (await tab2.locator("[data-draft-state]").getAttribute("data-draft-state")) !== "saved"; i++) await tab2.waitForTimeout(400);
  // the first tab still holds the revision before it: its next save is refused, said so
  await again.locator(`[data-field="mean_${key}"]`).fill("99");
  await page.locator("[data-save-draft]").click();
  t("two tabs: the one holding an older draft is refused — «saved elsewhere, reload» — nothing written over the newer", await waitFor(async () => (await attr(page.locator("[data-draft-state]"), "data-draft-state")) === "stale", 30));
  await go(`/lab/p/${pidA}/results`);
  t("…the newer draft stands: U «0,4», the mean not «99»", (await page.locator(`[data-field="U_${key}"]`).inputValue()) === "0,4" && (await page.locator(`[data-field="mean_${key}"]`).inputValue()) === MEAN);
  await tab2.close();

  // ── B is not this user's ──
  await go(`/lab/p/${pidB}/results`);
  t("another participation's form: not reachable for this user", (await page.locator("[data-results-page]").count()) === 0 && (await page.locator("[data-results-form]").count()) === 0);

  // ── a laboratory's account: its own form too; a calibration scheme: no testing form ──
  await go("/dev/persona?role=manager");
  await go("/files/calibration");
  const dlgC = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dlgC.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dlgC.locator('select[name="sample"]').selectOption("weights-m1");
  await dlgC.locator('input[name="number"]').fill(`PTS 26/12-C-${20000 + (stamp % 70000)}`);
  await dlgC.locator('input[name="name"]').fill(`Резултати калибриране ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dlgC.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const C = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${C}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${C}`); return /В процес|In progress/.test(await page.locator("[data-lifecycle] [data-state]").innerText()); }, 10);
  await go(`/dev/persona?role=lab&join=${S}`);
  await go(`/dev/persona?role=lab&join=${C}`);
  await go("/lab");
  const hrefT = await page.locator(`[data-lab-card="${S}"] a[href^="/lab/p/"]`).first().getAttribute("href").catch(() => null);
  const hrefC = await page.locator(`[data-lab-card="${C}"] a[href^="/lab/p/"]`).first().getAttribute("href").catch(() => null);
  await go(`${hrefT}/results`);
  const labRow = page.locator("[data-result-row]").first();
  const lk = await labRow.getAttribute("data-result-row").catch(() => null);
  if (lk) await labRow.locator(`[data-field="mean_${lk}"]`).fill("7,7");
  if (lk) await page.locator("[data-save-draft]").click();
  t("a laboratory's account: its own participation's form, saved", !!hrefT && !!lk && await waitFor(async () => (await attr(page.locator("[data-draft-state]"), "data-draft-state")) === "saved", 30));
  // ── a calibration participation: the form per M2 (6.2) ──
  await go(`${hrefC}/results`);
  const calForm = page.locator('[data-results-form][data-results-kind="C"]');
  const calRows = page.locator("[data-cal-row]");
  t("a calibration scheme: the M2 form — general info, a row per point × direction, the units row", !!hrefC && (await calForm.count()) === 1 && (await page.locator("[data-general]").count()) === 1 && (await calRows.count()) >= 1 && (await page.locator("[data-units]").count()) === 1);
  const r0 = calRows.first(), k0 = await r0.getAttribute("data-cal-row");
  await page.locator('[data-field="g_labName"]').fill(`Калибровъчна лаб. ${stamp}`);
  await r0.locator(`[data-field="ref_${k0}"]`).fill("20,00");
  await r0.locator(`[data-field="meas_${k0}"]`).fill("20,03");
  t("…the error computed and shown as the two are typed — measured minus reference, exactly (D1)", await waitFor(async () => (await r0.locator("[data-error]").getAttribute("data-error")) === "0.03", 10));
  const r1 = (await calRows.count()) > 1 ? calRows.nth(1) : null;
  if (r1) await r1.locator('input[type="checkbox"]').check();
  t("…a point outside the scope: N/A declared — never an arithmetic error", !!r1 && (await r1.getAttribute("data-na")) === "1" && (await r1.locator("[data-error]").getAttribute("data-error")) === "N/A");
  await page.locator("[data-save-draft]").click();
  t("…saved", await waitFor(async () => (await attr(page.locator("[data-draft-state]"), "data-draft-state")) === "saved", 30));
  await go(`${hrefC}/results`);
  const back0 = page.locator(`[data-cal-row="${k0}"]`);
  t("…after a reload: as typed — the readings, the laboratory's name, N/A; the error computed again, a comma in Bulgarian", (await back0.locator(`[data-field="meas_${k0}"]`).inputValue()) === "20,03" && (await page.locator('[data-field="g_labName"]').inputValue()) === `Калибровъчна лаб. ${stamp}` && (await back0.locator("[data-error]").getAttribute("data-error")) === "0.03" && /0[,.]03/.test(await back0.locator("[data-error]").innerText()) && (await page.locator("[data-cal-row]").nth(1).getAttribute("data-na")) === "1");
  // the participation's page asks a calibration laboratory to fill it in once its device has arrived (review)
  await go(hrefC);
  t("…the participation's page: no «fill in the results» call before the device has arrived here", (await page.locator("[data-open-results]").count()) === 0);

  // ── PTS sees no draft ──
  await go("/dev/persona?role=manager");
  const staff = [await (await page.request.get(`${BASE}/schemes/${S}/participants/${encodeURIComponent(refA)}`)).text(), await (await page.request.get(`${BASE}/schemes/${S}/results`)).text(), await (await page.request.get(`${BASE}/schemes/${S}`)).text()].join("\n");
  t("PTS's pages: no draft — only what is submitted (6.4)", !staff.includes(D1) && !staff.includes(MEAN));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-results-form: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
