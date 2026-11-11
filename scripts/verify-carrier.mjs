// Plan part 9.5 check (carrier offers, Реш. 128), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-carrier.mjs
// An organisation in the US, its laboratory on the final list: «изчаква избор на доставчик». PTS enters
// two offers and sends them (the notice held for release); the laboratory sees both and picks one — once;
// its carrier recorded, PTS's «Участници» shows it; «Фактури» — the price with the chosen delivery.
import { chromium } from "playwright";
import { inflateRawSync } from "node:zlib";

// the round export's files (9.6) — a ZIP read by its central directory
const unzip = (buf) => {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  let at = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < n && buf.readUInt32LE(at) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(at + 10), csize = buf.readUInt32LE(at + 20), nlen = buf.readUInt16LE(at + 28), elen = buf.readUInt16LE(at + 30), clen = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nlen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    at += 46 + nlen + elen + clen;
  }
  return out;
};

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
const OFFER_NOTE = `опаковка-сух-лед-${stamp}`, CANCEL_REASON = `поиска друг превозвач ${stamp}`;

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
  for (const [c, p, d, n] of [["DHL Express", "85,50", "4", OFFER_NOTE], ["UPS", "99,00", "6", ""]]) {
    const fa = panel.locator(`[data-carrier-add="${pid}"]`);
    await fa.locator('[name="carrier"]').fill(c);
    await fa.locator('[name="price"]').fill(p);
    await fa.locator('[name="days"]').fill(d);
    if (n) await fa.locator('[name="note"]').fill(n);
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
  await panel2.locator("[data-carrier-cancel] input").fill(CANCEL_REASON);
  await panel2.locator("[data-carrier-cancel] button").click();
  t("review: PTS cancels the choice with its reason — the participation waits for its carrier again; the cancelled choice kept", await waitFor(async () => (await page.locator("[data-carrier-pending]").count()) >= 1) && /отменен избор|choice cancelled/.test(await text(page.locator(`[data-carrier-offers="${pid}"] [data-carrier-history]`))));
  // ── 9.6: the round export — Phase 9's tables; the carriers only in identity/ ──
  const zipAll = unzip(Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/export`)).body()));
  const zipCoded = unzip(Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/export?part=coded`)).body()));
  t("9.6: the round export carries Phase 9's tables — the prices fixed, the carriers' offers (with the cancelled choice), the source in codes.csv", zipCoded.has("coded/prices.csv") && zipCoded.has("coded/carrier_offers.csv") && zipCoded.has("coded/waitlist.csv") && zipCoded.has("coded/applications_closed.csv") && /,99\.00,/.test(zipCoded.get("coded/carrier_offers.csv") ?? "") && /source/.test((zipCoded.get("coded/codes.csv") ?? "").split("\n")[0] ?? ""), [...zipCoded.keys()].filter((k) => k.startsWith("coded/") && k.endsWith(".csv")).join(" "));
  const codedText = [...zipCoded.values()].join("\n");
  const codedLeaks = ["DHL Express", OFFER_NOTE, CANCEL_REASON].filter((x) => codedText.includes(x)).concat(/\bUPS\b/.test(codedText) ? ["UPS"] : []);
  t("9.6: …the coded part never names a carrier, an offer's note or the reason of a cancelled choice; identity/ has them", codedLeaks.length === 0 && (zipAll.get("identity/carrier_offers.csv") ?? "").includes("DHL Express") && (zipAll.get("identity/carrier_offers.csv") ?? "").includes(CANCEL_REASON) && /README/.test([...zipAll.keys()].join(" ")) && /Самообслужването|Self-service/.test(zipAll.get("README.md") ?? ""), codedLeaks.join(", "));
  const words = zipAll.get("identity/carrier_offer_words.csv") ?? "";
  t("9.6 review: the words the offers' notice carried — out of coded/notices.csv (a placeholder), whole in identity/carrier_offer_words.csv (the carriers, the prices, the note)", /carrier_offer_words/.test(zipCoded.get("coded/notices.csv") ?? "") && words.includes("DHL Express") && words.includes("UPS") && words.includes(OFFER_NOTE) && /85,50|85\.50/.test(words));

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
