// Plan part 4.7 check (retention; Zadanie §10), against a LOCAL dev server (in-memory
// store, login off):   BASE=http://localhost:3000 node scripts/verify-retention.mjs
// A profile with no participation is erased on request — the request named, confirmed
// — and nothing of it is shown after; a profile with a participation is refused, kept.
// A registration (9.1) is refused with its reason, required, and is listed with the day
// it is kept until — six years on.
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
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eikOf = (k) => { const d = String(10000000 + (stamp * k) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; };
const GONE = `Заличи ${stamp} ООД`, KEPT = `Пази ${stamp} ООД`, REQ = `Регистрация ${stamp} ЕООД`;

const entity = async (name, eik, lab) => {
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name, country: "BG", eik, address: "София, ул. Пази 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: name });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(lab);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Плевен 1");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: lab }).count()) === 1);
  return card;
};
const erase = async (card, no) => {
  await card.locator("[data-erase-entity] summary").click();
  const f = card.locator("[data-erase-entity] form");
  await f.locator('[name="requestNo"]').fill(no);
  await f.locator('[name="requestDate"]').fill(new Date().toISOString().slice(0, 10));
  await f.locator('[name="confirmed"]').check();
  await f.locator('button[type="submit"]').click();
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a profile with no participation, erased on request
  const card = await entity(GONE, eikOf(71), `Лаб. ${GONE}`);
  const id = await card.getAttribute("data-entity");
  // with its people
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(`Човек ${stamp}`);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`chovek${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]").count()) === 1);
  await erase(card, `ВХ-${stamp}`);
  const erased = page.locator(`[data-entity="${id}"][data-erased]`);
  const main = async () => page.locator("main").innerText();
  t("a profile with no participation erased on request — nothing of it shown after, not its people either; its request by number shown", await waitFor(async () => (await erased.count()) === 1) && !(await main()).includes(GONE) && !(await main()).includes(`Човек ${stamp}`) && !(await main()).includes(`chovek${stamp}@lab-test.bg`) && (await textOf(erased)).includes(`ВХ-${stamp}`));

  // a profile with a participation: kept
  const kept = await entity(KEPT, eikOf(73), `Лаб. ${KEPT}`);
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Пази ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill("от PDF");
  await Promise.all([page.waitForLoadState("domcontentloaded"), add.locator('button[type="submit"]').click()]);
  await page.locator("[data-freeze-open] button").first().click();
  const f = page.locator("[data-freeze-form]").first();
  await waitFor(async () => (await f.count()) === 1);
  await f.locator('select[name="laboratoryId"]').selectOption(await f.locator('select[name="laboratoryId"] option', { hasText: `Лаб. ${KEPT}` }).getAttribute("value"));
  await f.locator("[data-freeze-confirm]").check();
  await f.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("[data-snapshot]").count()) === 1);
  await go("/organizations");
  const keptCard = page.locator("[data-entity]", { hasText: KEPT });
  t("a profile with a participation: no erasure offered — it is kept, and says why (review)", (await keptCard.locator("[data-erase-entity]").count()) === 0 && (await keptCard.locator("[data-kept-for-rounds]").count()) === 1);
  void kept;

  // a registration (9.1), refused with its reason — kept six years
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.47.${Math.floor(stamp / 256) % 256}.${stamp % 256}` }); // its own address for the form's limit
  await go("/register");
  const rf = page.locator("[data-register-form]");
  // a cold server hydrates late: the choice is made again until the form takes it
  for (let i = 0; i < 40; i++) {
    await rf.locator("[data-register-country]").selectOption("BG");
    if (await rf.locator('button[type="submit"]').isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  for (const [k, v] of Object.entries({ orgName: REQ, eik: eikOf(83), address: "София 1", officialEmail: `office${stamp}@lab-test.bg`, labName: "Лаб.", deliveryAddress: "София 2", contactPerson: "Лице", email: `req${stamp}@lab-test.bg` })) await rf.locator(`[name="${k}"]`).fill(v);
  await Promise.all([page.waitForURL(/register\/thanks/, { timeout: 60000 }).catch(() => {}), rf.locator('button[type="submit"]').click()]);
  await go("/registrations");
  const card2 = page.locator("[data-registration]", { hasText: REQ }).first();
  await waitFor(async () => (await card2.count()) === 1);
  await card2.locator("[data-registration-reject] summary").click();
  const reason = card2.locator('[name="reason"]');
  t("refusing asks for its reason — required", (await reason.getAttribute("required")) !== null);
  await reason.fill("дублирана заявка");
  await card2.locator("[data-registration-reject-confirm]").click();
  await waitFor(async () => (await page.locator("[data-registrations-done]").count()) === 1);
  await go("/registrations");
  const list = page.locator("[data-rejected-registrations]");
  await list.locator("summary").click();
  const row = list.locator("tr", { hasText: REQ });
  const until = await textOf(row);
  const year = Number((until.match(/\b(\d{4})\b(?![\s\S]*\b\d{4}\b)/) ?? [])[1]);
  t("…listed with its reason and the day it is kept until — six years on", until.includes("дублирана заявка") && year === new Date().getFullYear() + 6 && (await row.getAttribute("data-over")) === "0", until);
  t("…none past its time: nothing to remove", (await list.locator("[data-remove-expired]").count()) === 0);
  await go("/activity");
  await page.getByText(/erased on request/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — the erasure counted, never its request or a name", /Legal entity erased on request/.test(journal) && !journal.includes(`ВХ-${stamp}`) && !journal.includes(GONE) && !journal.includes(`Човек ${stamp}`));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-retention: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
