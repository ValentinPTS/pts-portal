// Plan part 9.4 check (the price, Реш. 153), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-prices.mjs
// A scheme priced 100,00 € + 40,00 € a further characteristic, the share 40 %. Organisation 1 has two
// laboratories — one applies for 2 characteristics, the other for 3; organisation 2 one laboratory,
// counts 2·1. Before the applications close — no price; closed by PTS: organisation 1's larger one at the
// full price (180,00 €), the other at the share (56,00 €); organisation 2's first participation full,
// its second at the share (180,00 €). The billing export carries them.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 50) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const text = async (loc) => ((await loc.count()) ? (await loc.first().textContent()) ?? "" : "");
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eikOf = (k) => { const d = String(10000000 + (stamp * k) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; };
const E1 = `Цена Едно ${stamp} ООД`, E2 = `Цена Две ${stamp} ООД`, LA = `Лаб. А ${stamp}`, LB = `Лаб. Б ${stamp}`, LC = `Лаб. В ${stamp}`;

const entity = async (name, eik, labs, country = "BG") => {
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name, country, eik, address: "София 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: name });
  await waitFor(async () => (await card.count()) === 1);
  const box = card.locator("[data-entity-labs]");
  for (const lab of labs) {
    for (let i = 0; i < 20 && !(await box.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
    await box.locator('[data-lab-form="new"] [name="name"]').fill(lab);
    await box.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Пловдив 1");
    await box.locator('[data-lab-form="new"] button[type="submit"]').click();
    await waitFor(async () => (await box.locator("[data-lab]", { hasText: lab }).count()) === 1);
  }
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a scheme priced at 40 % ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Цени ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  const box = page.locator("[data-commercial]");
  for (let i = 0; i < 20 && !(await box.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await type(box.locator('[name="com_base"]'), "100");
  await type(box.locator('[name="com_step"]'), "40");
  await type(box.locator('[name="com_share"]'), "40");
  await type(box.locator('[name="com_addon"]'), "25,50");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);

  // ── two organisations; three applications entered by PTS, each linked to its laboratory (4.5) ──
  await entity(E1, eikOf(83), [LA, LB]);
  await entity(E2, `C${stamp}`, [LC], "MT");
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const nChar = await add.locator('input[name^="sel_"]').count();
  const counts = { [LA]: [1, 1], [LB]: [1, 1, 1], [LC]: [2, 1] };
  for (const [lab, c] of Object.entries(counts)) {
    await add.locator('[name="labName"]').fill(`${lab} PDF`);
    for (let i = 0; i < nChar; i++) await add.locator(`[name="sel_${i}"]`).fill(String(c[i] ?? 0));
    await Promise.all([page.waitForLoadState("domcontentloaded"), add.locator('button[type="submit"]').click()]);
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(`${lab} PDF`));
  }
  const link = async (rowText, labName) => {
    const row = page.locator("tr", { hasText: rowText }).first();
    // its code first — once linked, the row shows the copy's laboratory
    const code = decodeURIComponent(((await row.locator("td").first().locator("a").first().getAttribute("href")) ?? "").split("/").pop());
    const pid = await row.locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
    const cell = page.locator(`[data-snapshot-row="${pid}"]`);
    await cell.locator("[data-freeze-open] button").click();
    const f = cell.locator("[data-freeze-form]");
    await waitFor(async () => (await f.count()) === 1);
    await f.locator('select[name="laboratoryId"]').selectOption(await f.locator('select[name="laboratoryId"] option', { hasText: labName }).getAttribute("value"));
    await f.locator("[data-freeze-confirm]").check();
    await f.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-snapshot="${pid}"]`).count()) === 1);
    return code;
  };
  const cA = await link(`${LA} PDF`, LA), cB = await link(`${LB} PDF`, LB), cC = await link(`${LC} PDF`, LC);

  // ── before the applications close: no price ──
  await go(`/invoices?scheme=${encodeURIComponent(S)}`);
  t("before the applications close: no price — «after the deadline» (Zadanie App. В)", (await page.locator("[data-price]").count()) === 0 && /след срока за заявки|after the applications' deadline/.test(await text(page.locator("[data-invoices-scheme]"))));

  // ── closed by PTS: the prices ──
  await go(`/schemes/${S}/participants`);
  await page.locator("[data-applications-close]").click();
  await waitFor(async () => (await page.locator('[data-applications-state="closed"]').count()) === 1);
  await go(`/invoices?scheme=${encodeURIComponent(S)}`);
  const cell = (code) => page.locator(`[data-invoice-row="${code}"] [data-price]`);
  await waitFor(async () => (await page.locator("[data-price]").count()) === 3);
  t("organisation 1: the larger (3 characteristics applied for) at the full price — 180,00 € (a preview until the second announcement)", (await cell(cB).getAttribute("data-price")) === "18000" && (await cell(cB).getAttribute("data-price-lines")) === "full" && (await cell(cB).getAttribute("data-price-state")) === "preview", `${cB} ${await cell(cB).getAttribute("data-price")}`);
  t("…the other (2) at the share — 40 % of 140,00 € = 56,00 € (a share other than 50 %)", (await cell(cA).getAttribute("data-price")) === "5600" && (await cell(cA).getAttribute("data-price-lines")) === "share");
  t("organisation 2 (Malta): counts 2·1 — the first participation full (140,00 €), the second at the share (40,00 €), the MT/CY/IE add-on 25,50 € = 205,50 €", (await cell(cC).getAttribute("data-price")) === "20550" && (await cell(cC).getAttribute("data-price-lines")) === "full,share" && /доставка 25,50 €|delivery 25.50 €/.test(await text(cell(cC))));
  const csv = await (await page.request.get(`${BASE}/invoices/export?scheme=${encodeURIComponent(S)}`)).text();
  t("the billing export: each amount and how it was computed", csv.includes(",180.00,") && csv.includes(",56.00,") && csv.includes(",205.50,") && /дял 2 хар\. 56,00 €/.test(csv));

  // ── the second announcement FIXES them: a later change of the share changes no invoiced price ──
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await text(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form2 = page.locator("[data-second-announcement]");
  await form2.waitFor();
  for (const i of [0, 1, 2]) { const box2 = form2.locator(`input[name="run_${i}"]`); if ((await box2.count()) && !(await box2.isChecked())) await box2.check(); }
  await form2.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1);
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await box.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await type(box.locator('[name="com_share"]'), "50");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await go(`/invoices?scheme=${encodeURIComponent(S)}`);
  await waitFor(async () => (await page.locator("[data-price]").count()) === 3);
  t("review: fixed at the second announcement — the share changed to 50 % after it, the invoiced 56,00 € stands", (await cell(cA).getAttribute("data-price")) === "5600" && (await cell(cA).getAttribute("data-price-state")) === "fixed" && (await cell(cB).getAttribute("data-price")) === "18000");
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-prices: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
