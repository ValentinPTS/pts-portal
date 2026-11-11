// Plan part 9.5 check (carrier offers, Реш. 128), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-carrier.mjs
// An organisation in the US, its laboratory on the final list: «изчаква избор на доставчик». PTS enters
// two offers and sends them (the notice held for release); the laboratory sees both and picks one — once;
// its carrier recorded, PTS's «Участници» shows it; «Фактури» — the price with the chosen delivery.
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
const ENT = `Превоз ${stamp} Inc`, LAB = `Lab US ${stamp}`, USER = `Carrier User ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a scheme with prices ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Превозвачи ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  const box = page.locator("[data-commercial]");
  for (let i = 0; i < 20 && !(await box.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await type(box.locator('[name="com_base"]'), "100");
  await box.locator('[name="minParticipants"]').fill("1");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);

  // ── an organisation in the US, its laboratory and user ──
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "US", eik: `US${stamp}`, address: "New York 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Boston 2");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const ubox = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await ubox.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await ubox.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await ubox.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await ubox.locator('[data-user-form="new"] [name="email"]').fill(`carrier${stamp}@lab-test.bg`);
  await ubox.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await ubox.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await ubox.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // ── its application, linked to the laboratory; the two announcements ──
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const nChar = await add.locator('input[name^="sel_"]').count();
  await add.locator('[name="labName"]').fill(`${LAB} PDF`);
  for (let i = 0; i < nChar; i++) await add.locator(`[name="sel_${i}"]`).fill(i === 0 ? "1" : "0");
  await Promise.all([page.waitForLoadState("domcontentloaded"), add.locator('button[type="submit"]').click()]);
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(`${LAB} PDF`));
  const row0 = page.locator("tr", { hasText: `${LAB} PDF` }).first();
  const pid = await row0.locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pid}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const f = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await f.count()) === 1);
  await f.locator('select[name="laboratoryId"]').selectOption(await f.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await f.locator("[data-freeze-confirm]").check();
  await f.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pid}"]`).count()) === 1);
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await text(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form2 = page.locator("[data-second-announcement]");
  await form2.waitFor();
  if (!(await form2.locator('input[name="run_0"]').isChecked())) await form2.locator('input[name="run_0"]').check();
  await form2.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1);

  // ── PTS: two offers, sent ──
  await go(`/schemes/${S}/participants`);
  const panel = page.locator(`[data-carrier-offers="${pid}"]`);
  t("on the final list, outside the EU and the Balkans: «изчаква избор на доставчик», the offers' panel", (await page.locator("[data-carrier-pending]").count()) >= 1 && (await panel.count()) === 1);
  const openPanel = async () => { if (!(await panel.evaluate((el) => el.open))) await panel.locator("summary").click(); };
  await openPanel();
  for (const [c, p, d] of [["DHL Express", "85,50", "4"], ["UPS", "99,00", "6"]]) {
    const fa = panel.locator(`[data-carrier-add="${pid}"]`);
    await fa.locator('[name="carrier"]').fill(c);
    await fa.locator('[name="price"]').fill(p);
    await fa.locator('[name="days"]').fill(d);
    await fa.locator('button[type="submit"]').click();
    await waitFor(async () => (await panel.locator("[data-carrier-offer]", { hasText: c }).count()) === 1);
    await openPanel();
  }
  t("two offers entered", (await panel.locator("[data-carrier-offer]").count()) === 2);
  await panel.locator(`[data-carrier-send="${pid}"]`).click();
  t("…sent — the notice to the laboratory held for release (1.8)", await waitFor(async () => (await page.locator(`[data-carrier-offers="${pid}"] [data-carrier-sent]`).count()) === 1));
  await go("/notices");
  const heldOffers = page.locator("[data-held]", { hasText: /DHL Express/ });
  t("«Известия»: the offers' notice waits for a person, with the carriers and the prices", await waitFor(async () => (await heldOffers.count()) >= 1));

  // ── before a person releases it: the laboratory sees no offer (1.8; review) ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pid}`);
  t("review: the notice still held — the laboratory sees no offer, nothing to choose", (await page.locator("[data-participation-page]").getAttribute("data-state")) === "carrier" && (await page.locator("[data-carrier-choice]").count()) === 0);
  await go("/dev/persona?role=manager");
  // released by a person (the page streams: pressed again until the notice is no longer held)
  for (let i = 0; i < 8; i++) {
    await go("/notices");
    await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
    if ((await heldOffers.count()) === 0) break;
    await Promise.all([page.waitForURL(/\/notices/, { timeout: 30000 }).catch(() => {}), heldOffers.first().getByRole("button", { name: /^(Изпрати|Send)$/ }).click()]);
    await page.waitForTimeout(1500);
  }
  t("…released by a person in «Известия»", (await heldOffers.count()) === 0);

  // ── released: the laboratory picks one ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pid}`);
  const choice = page.locator(`[data-carrier-choice="${pid}"]`);
  await choice.waitFor({ timeout: 60000 }).catch(() => {});
  t("the laboratory's page: «изчаква избор на доставчик» — the two offers", (await page.locator("[data-participation-page]").getAttribute("data-state")) === "carrier" && (await choice.locator("[data-carrier-option]").count()) === 2);
  const ups = await choice.locator("[data-carrier-option]", { hasText: "UPS" }).getAttribute("data-carrier-option");
  await choice.locator(`[data-carrier-pick="${ups}"]`).click();
  t("chosen — once: the carrier shown, the offers gone, the state moved on", await waitFor(async () => (await page.locator("[data-carrier-chosen-lab]").count()) === 1) && /UPS/.test(await text(page.locator("[data-carrier-chosen-lab]"))) && (await page.locator("[data-carrier-choice]").count()) === 0 && (await page.locator("[data-participation-page]").getAttribute("data-state")) !== "carrier");

  // ── PTS: the choice; the price with the delivery ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  t("PTS's «Участници»: the carrier chosen, no longer awaiting", /превозвач: UPS|carrier: UPS/.test(await text(page.locator(`[data-carrier-offers="${pid}"] summary`))) && (await page.locator("[data-carrier-pending]").count()) === 0);
  const code = decodeURIComponent(((await page.locator("tr", { hasText: LAB }).first().locator("td").first().locator("a").first().getAttribute("href")) ?? "").split("/").pop());
  await go(`/invoices?scheme=${encodeURIComponent(S)}`);
  await waitFor(async () => (await page.locator(`[data-invoice-row="${code}"] [data-price]`).count()) === 1);
  t("«Фактури»: the price with the chosen delivery — 100,00 € + 99,00 €", (await page.locator(`[data-invoice-row="${code}"] [data-price]`).getAttribute("data-price")) === "19900" && /доставка по оферта 99,00 €|delivery by the offer 99.00 €/.test(await text(page.locator(`[data-invoice-row="${code}"] [data-price]`))));
  // ── a change through PTS: the choice cancelled with its reason — waiting again ──
  await go(`/schemes/${S}/participants`);
  const panel2 = page.locator(`[data-carrier-offers="${pid}"]`);
  if (!(await panel2.evaluate((el) => el.open))) await panel2.locator("summary").click();
  await panel2.locator("[data-carrier-cancel] input").fill("лабораторията поиска друг превозвач");
  await panel2.locator("[data-carrier-cancel] button").click();
  t("review: PTS cancels the choice with its reason — the participation waits for its carrier again; the cancelled choice kept", await waitFor(async () => (await page.locator("[data-carrier-pending]").count()) >= 1) && /отменен избор|choice cancelled/.test(await text(page.locator(`[data-carrier-offers="${pid}"] [data-carrier-history]`))));
  await go("/activity");
  await page.getByText(/chose its carrier/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await text(page.locator("main"));
  t("on record — the offers, their sending, the choice — never a name", /carrier's offer entered/.test(journal) && /offers for .* put for release/.test(journal) && /The laboratory chose its carrier/.test(journal) && !journal.includes(LAB) && !journal.includes(ENT));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-carrier: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
