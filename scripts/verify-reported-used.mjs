// Plan part 6.5 check (reported and used values; D3; К22), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-reported-used.mjs
// A lab submits a mean typed ten times too big and U at k = 3. PTS (the coding expert's right)
// records the used mean and the used U (at k = 2) — each with its reason, the submitted value kept;
// the lab sees both; a withdrawal returns to the submitted value, the history kept; a later version
// starts clean and a form drawn for the old one is refused. Journalled without a value.
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
const ENT = `Корекции ${stamp} ООД`, LAB = `Лаб. корекции ${stamp}`, USER = `Потребител корекции ${stamp}`, NAME_A = `Корекции А ${stamp}`;
const WHY_MEAN = `Десетичната запетая е изместена ${stamp}`, WHY_U = `k = 3 → U при k = 2, изчислено от експерта ${stamp}`;

// fills the form: the first characteristic reported, the rest N/R; the test period one day
const fillForm = async (mean) => {
  const rows = page.locator("[data-result-row]");
  const n = await rows.count();
  const first = rows.first(), k0 = await first.getAttribute("data-result-row");
  for (const d of await first.locator(`[data-field^="d_${k0}_"]`).all()) await d.fill(mean);
  await first.locator(`[data-field="mean_${k0}"]`).fill(mean);
  await first.locator(`[data-field="U_${k0}"]`).fill("0,3");
  await first.locator(`[data-field="k_${k0}"]`).fill("3");
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
  await box.locator('[data-user-form="new"] [name="email"]').fill(`cor${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a running testing scheme; A of the entity
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Корекции ${stamp}`);
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

  // ── the lab submits: the mean typed ten times too big, U at k = 3 ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  const K = await fillForm("5,1");
  await page.locator("[data-result-row]").first().locator(`[data-field="mean_${K}"]`).fill("51,0");
  t("the lab submits version 1 (mean 51,0, k = 3)", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "1", 40));

  // ── PTS: the version as submitted; k ≠ 2 flagged ──
  await go("/dev/persona?role=manager");
  const staffUrl = `/schemes/${S}/participants/${encodeURIComponent(refA)}`;
  await go(`${staffUrl}#corrections`);
  t("PTS: «Подадено и използвано — версия 1»; every field «= подаденото»; k = 3 flagged (D3) — information, not a block", (await attr(page.locator("[data-corrections]"), "data-corrections")) === "0" && (await page.locator(`[data-k-flag="${K}"]`).count()) === 1 && (await attr(page.locator(`[data-correction-row="${K}::mean"]`), "data-used")) === "");
  t("…U at k = 3 is never called the U at k = 2: «k = 3 по доклада», the used one «не е записана» (6.5 review)", /k = 3 (по доклада|as reported)/.test(await page.locator(`[data-correction-row="${K}::U"]`).innerText()) && (await page.locator(`[data-correction-row="${K}::U"] [data-used-missing]`).count()) === 1);
  const record = async (field, used, reason, stripMin = false) => {
    await go(`${staffUrl}#corrections`); // a clean URL: the answer read is this one's
    const f = page.locator("[data-correction-form]");
    await f.locator('select[name="target"]').selectOption(`${K}::${field}`);
    await f.locator('input[name="used"]').fill(used);
    await f.locator('input[name="reason"]').fill(reason);
    if (stripMin) await f.locator('input[name="reason"]').evaluate((x) => x.removeAttribute("minlength"));
    await f.locator("[data-correction-submit]").click();
    await waitFor(async () => /corr=/.test(page.url()), 30);
    return new URL(page.url()).searchParams.get("corr");
  };
  t("a correction without its reason: refused — said", (await record("mean", "5,10", "аб", true)) === "reason" && (await page.locator('[data-correction-answer="reason"]').count()) === 1);
  t("…a used value that is not a number: refused — said", (await record("mean", "пет", WHY_MEAN)) === "value");
  t("the used mean recorded with its reason — the submitted one kept beside it", (await record("mean", "5,10", WHY_MEAN)) === "ok" && (await attr(page.locator(`[data-correction-row="${K}::mean"]`), "data-used")) === "5,10" && (await page.locator(`[data-correction-row="${K}::mean"]`).innerText()).includes("51,0") && (await page.locator(`[data-correction-row="${K}::mean"]`).innerText()).includes(WHY_MEAN));
  t("the used U (at k = 2) typed by the expert — the portal computes nothing; the k flag gone", (await record("U", "0,2", WHY_U)) === "ok" && (await attr(page.locator(`[data-correction-row="${K}::U"]`), "data-used")) === "0,2" && (await page.locator("[data-k-flags]").count()) === 0);
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled — «Used value recorded», the field — never the value, never the reason", /Used value recorded|Използвана стойност/.test(act) && !act.includes("5,10") && !act.includes(WHY_MEAN));
  await go("/notices");
  const held = page.locator("[data-held]", { hasText: /записа корекция|recorded a correction/ });
  t("the lab's notice: held for a person, naming the version — never a value", (await held.count()) >= 1 && !/5,10|51,0|0,2\b/.test(await held.first().innerText()));
  // a double press: the same form twice — recorded once (6.5 review)
  await go(`${staffUrl}#corrections`);
  const twice = page.locator("[data-correction-form]");
  await twice.locator('select[name="target"]').selectOption(`${K}::d1`);
  await twice.locator('input[name="used"]').fill("5,0");
  await twice.locator('input[name="reason"]').fill(`Определяне 1 — грешка при преписване ${stamp}`);
  const fd = await twice.evaluate((f) => Object.fromEntries(new FormData(f)));
  await twice.locator("[data-correction-submit]").click();
  await waitFor(async () => /corr=ok/.test(page.url()), 30);
  // …then the very same form, posted natively with what it held (the 5.9 way): «recorded», nothing new
  await go(`${staffUrl}`);
  await page.evaluate(({ f }) => { const form = document.createElement("form"); form.method = "post"; form.action = location.pathname + location.search; form.enctype = "multipart/form-data"; document.body.append(form); for (const [k, v] of Object.entries(f)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.append(i); } form.submit(); }, { f: fd });
  const answered = await waitFor(async () => /corr=ok/.test(page.url()), 30);
  await go(`${staffUrl}#corrections`);
  t("the same form posted twice: recorded once — «recorded», one record for it", answered && (await attr(page.locator("[data-correction-history]"), "data-correction-history")) === "3" && (await attr(page.locator(`[data-correction-row="${K}::d1"]`), "data-used")) === "5,0");

  // ── the lab sees both ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  const lm = page.locator(`[data-lab-correction="${K}::mean"]`);
  t("the lab: «submitted 51,0 · used 5,10 — reason …», and U the same; its version unchanged", (await lm.count()) === 1 && /51,0/.test(await lm.innerText()) && /5,10/.test(await lm.innerText()) && (await lm.innerText()).includes(WHY_MEAN) && (await page.locator(`[data-lab-correction="${K}::U"]`).count()) === 1 && (await page.locator("[data-submitted-version]").count()) === 1);

  // ── withdrawn: the submitted value used again; the history kept ──
  await go("/dev/persona?role=manager");
  await go(`${staffUrl}#corrections`);
  t("withdrawn (no used value, a reason): «= подаденото» again — every record kept", (await record("mean", "", `Оттеглено — подаденото е вярно ${stamp}`)) === "ok" && (await attr(page.locator(`[data-correction-row="${K}::mean"]`), "data-used")) === "" && (await attr(page.locator("[data-correction-history]"), "data-correction-history")) === "4");

  // ── a later version starts clean; a form drawn for the old one refused ──
  const stale = await context.newPage();
  await stale.goto(`${BASE}${staffUrl}#corrections`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}/results`);
  await page.locator("[data-result-row]").first().locator(`[data-field="mean_${K}"]`).fill("5,1");
  t("the lab submits version 2", await submit() && await waitFor(async () => (await attr(page.locator("[data-receipt]"), "data-receipt-version")) === "2", 40));
  await go("/dev/persona?role=manager");
  const sf = stale.locator("[data-correction-form]");
  await sf.locator('select[name="target"]').selectOption(`${K}::mean`);
  await sf.locator('input[name="used"]').fill("5,2");
  await sf.locator('input[name="reason"]').fill(WHY_MEAN);
  await sf.locator("[data-correction-submit]").click();
  t("a correction drawn for version 1 after version 2 came in: refused — «a newer version was submitted»", await (async () => { for (let i = 0; i < 40; i++) { if (/corr=version/.test(stale.url())) return true; await stale.waitForTimeout(400); } return false; })());
  await stale.close();
  await go(`${staffUrl}#corrections`);
  t("…version 2 starts clean: nothing carried; the earlier records kept and said; k = 3 flagged again", /версия 2|version 2/.test(await page.locator("#corrections h3").innerText()) && (await attr(page.locator("[data-corrections]"), "data-corrections")) === "0" && (await attr(page.locator("[data-corrections-earlier]"), "data-corrections-earlier")) === "4" && (await page.locator(`[data-k-flag="${K}"]`).count()) === 1);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-reported-used: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
