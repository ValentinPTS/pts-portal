// Plan part 5.8 check (invoices; spec Q2 — Реш. 35, 36, 98, 106), against a LOCAL dev server
// (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-invoices.mjs
// On a scheme of its own, participation A of a legal entity: the proforma uploaded with its
// number; the original invoice refused until the payment is marked, then uploaded with its
// number; «paid» not unmarked while the invoice is held; the entity's user sees both numbers
// and downloads both; «Фактури» lists them by code; the billing export carries the entity, its
// ЕИК and both numbers — to who works with the participants, never to anyone else.
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
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const alerts = [];
page.on("dialog", async (d) => { if (d.type() === "alert") alerts.push(d.message()); await d.accept(); });
const stamp = Date.now() % 100000;
const PDF = (w) => Buffer.from(`%PDF-1.4\n% ${w} ${stamp}\n%%EOF\n`);
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 107) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Фактури ${stamp} ООД`, LAB = `Лаб. фактури ${stamp}`, USER = `Потребител фактури ${stamp}`, NAME_A = `Фактури А ${stamp}`;
const PF = `ПФ-2026/${stamp}`, INV = `Ф-${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory, a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 10" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Варна 4");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`inv${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/dev/persona?role=manager");

  // a draft bills nobody — refused before anything is opened (review). A blank scheme stays a
  // draft; one made from a sample starts open
  await go("/files/testing");
  const dlg0 = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dlg0.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dlg0.locator('input[name="name"]').fill(`Чернова ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dlg0.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const D = new URL(page.url()).pathname.split("/").pop();
  const exDraft = await page.request.get(`${BASE}/invoices/export?scheme=${D}`);
  t("the billing export of a draft: refused (409), nothing opened", exDraft.status() === 409, String(exDraft.status()));

  // a scheme: opened, A entered and linked, the announcements, coded
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Фактури ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const inv = page.locator('[data-doc-row="invitation"]');
  const [ch] = await Promise.all([page.waitForEvent("filechooser"), inv.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await ch.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: PDF("invitation") });
  await inv.locator("button", { hasText: /^📨/ }).waitFor();
  await inv.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await inv.locator('[data-edition-label="1"]').count()) === 1);
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
  await waitFor(async () => /В процес|In progress/.test(await textOf(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form = page.locator("[data-second-announcement]");
  await form.waitFor();
  const run0 = form.locator('input[name^="run_"]').first();
  if ((await run0.count()) && !(await run0.isChecked())) await run0.check();
  await form.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1);
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-coding] [data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1);
  const codeA = await page.locator(`[data-coded-from="${refA}"]`).getAttribute("data-coded");
  t("setup: A on the final list, coded", !!codeA);

  // ── the proforma: its number first ──
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeA)}`);
  const up = page.getByRole("button", { name: /Качи проформа|Upload proforma/ });
  await up.waitFor();
  const before = alerts.length;
  await up.click();
  t("the proforma without its number: not sent — the number asked for first", await waitFor(async () => alerts.slice(before).some((a) => /номера|number/.test(a))));
  await page.locator('[data-doc-number="proforma"]').fill(PF);
  const [pc] = await Promise.all([page.waitForEvent("filechooser"), up.click()]);
  await pc.setFiles({ name: `proforma-${stamp}.pdf`, mimeType: "application/pdf", buffer: PDF("proforma") });
  t("the proforma sent with its number (Реш. 36)", await waitFor(async () => (await textOf(page.locator('[data-doc-number-held="proforma"]'))).includes(PF)));
  t("…the original invoice: not before the payment (Реш. 35)", (await page.locator('[data-invoice-not-yet="invoice"]').count()) === 1);

  // ── paid; the invoice with its number ──
  await page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]').check();
  t("paid: the invoice may be uploaded now", await waitFor(async () => (await page.locator('[data-doc-number="invoice"]').count()) === 1));
  await page.locator('[data-doc-number="invoice"]').fill(INV);
  const [ic] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Качи фактура|Upload invoice/ }).click()]);
  await ic.setFiles({ name: `invoice-${stamp}.pdf`, mimeType: "application/pdf", buffer: PDF("invoice") });
  t("the original invoice sent with its number", await waitFor(async () => (await textOf(page.locator('[data-doc-number-held="invoice"]'))).includes(INV)));
  const b2 = alerts.length;
  await page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]').uncheck();
  t("«paid» not unmarked while the original invoice is held — said why", await waitFor(async () => alerts.slice(b2).some((a) => /фактура|invoice/.test(a))));
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeA)}`);
  t("…still paid", await page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]').isChecked());
  await go("/notices");
  t("the participation's notices — the proforma's and the invoice's, with their numbers — held for a person", await waitFor(async () => (await page.locator("[data-held]").filter({ hasText: PF }).count()) >= 1 && (await page.locator("[data-held]").filter({ hasText: INV }).count()) >= 1));

  // ── the entity's user: both numbers, both documents ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  t("the entity's user: the proforma's and the invoice's numbers; paid", (await attr(page.locator("[data-proforma-number]"), "data-proforma-number")) === PF && (await attr(page.locator("[data-invoice-number]"), "data-invoice-number")) === INV && (await attr(page.locator("[data-payment-box]"), "data-payment-box")) === "paid");
  const gp = await page.request.get(`${BASE}/lab/labdoc/${S}/proforma?p=${pidA}`);
  const gi = await page.request.get(`${BASE}/lab/labdoc/${S}/invoice?p=${pidA}`);
  t("…downloads both — every user of the organisation (Реш. 106)", gp.status() === 200 && gi.status() === 200 && Buffer.from(await gi.body()).equals(PDF("invoice")), `${gp.status()} ${gi.status()}`);

  // ── «Фактури» and the billing export ──
  await go("/dev/persona?role=manager");
  await go(`/invoices?scheme=${S}`);
  const row = page.locator(`[data-invoice-row="${codeA}"]`);
  t("«Фактури»: A by its code — invoiced, both numbers", (await attr(row, "data-invoice-state")) === "invoiced" && (await textOf(row)).includes(PF) && (await textOf(row)).includes(INV) && !(await page.content()).includes(ENT));
  const ex = await page.request.get(`${BASE}/invoices/export?scheme=${S}`);
  const raw = Buffer.from(await ex.body());
  const csv = raw.toString("utf8");
  // one byte-order mark — Excel strips one; a second would spoil the first column's name (review)
  t("…one byte-order mark, then «№ по ред»", raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && !raw.subarray(3, 6).equals(Buffer.from([0xef, 0xbb, 0xbf])) && csv.slice(1).startsWith("№ по ред,"), JSON.stringify(csv.slice(0, 12)));
  t("the billing export: a CSV for accounting — the entity, its ЕИК, the characteristics, both numbers, the order of entry", ex.status() === 200 && /text\/csv/.test(ex.headers()["content-type"] ?? "") && csv.includes(ENT) && csv.includes(eik) && csv.includes(PF) && csv.includes(INV) && csv.includes("ЕИК") && /\n1,/.test(csv), `${ex.status()} ${csv.slice(0, 200)}`);
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("…journalled: the names shown, the export downloaded", /billing export/.test(act));
  await go("/dev/persona?role=staff");
  const exStaff = await page.request.get(`${BASE}/invoices/export?scheme=${S}`);
  t("…never to one who does not work with the participants there", exStaff.status() === 403 || /login/.test(exStaff.url()), String(exStaff.status()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-invoices: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
