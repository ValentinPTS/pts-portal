// Plan part 4.5 check (a frozen copy per participation, J12), against a LOCAL dev
// server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-participation-snapshot.mjs
// On a scheme of its own: a participation entered from the PDF is linked to its
// laboratory (and a contact) — the copy taken, shown with its date; the participation's
// laboratory fields follow it. The laboratory's address changed afterwards: the copy
// keeps the old one. The copy cannot be taken twice (no form any more). On record
// without a name; the round's export carries identity/participation_snapshots.csv.
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
const eik = (() => { const d = String(10000000 + (stamp * 61) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Копие ${stamp} ООД`, LAB = `Лаб. копие ${stamp}`, A = `Контакт ${stamp}`, PDF = `От PDF ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // the organisation, its laboratory and a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Копие 5" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Пловдив, ул. Стара 7");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(A);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`contact${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: A }).count()) === 1);

  // a scheme of its own, and a participation entered from the PDF
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Копие ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(PDF);
  await add.locator('[name="deliveryAddress"]').fill("адрес от PDF");
  await Promise.all([page.waitForLoadState("domcontentloaded"), add.locator('button[type="submit"]').click()]);
  const open = page.locator("[data-freeze-open] button").first();
  t("a participation not yet linked: «Свържи с лабораторията» — its choices not opened before it is asked (review)", await waitFor(async () => (await open.count()) === 1) && (await page.locator("[data-freeze-form]").count()) === 0);
  await open.click();
  const freeze = page.locator("[data-freeze-form]").first();
  await waitFor(async () => (await freeze.count()) === 1);
  // link it: the laboratory, the contact — what will be copied shown, then confirmed
  const opt = await freeze.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value");
  await freeze.locator('select[name="laboratoryId"]').selectOption(opt);
  t("…what will be copied, shown before it is taken (review)", await waitFor(async () => (await textOf(freeze.locator("[data-freeze-preview]"))).includes(eik)) && (await textOf(freeze.locator("[data-freeze-preview]"))).includes("Пловдив, ул. Стара 7"));
  const uopt = await freeze.locator('select[name="contactUserId"] option', { hasText: A }).getAttribute("value");
  await freeze.locator('select[name="contactUserId"]').selectOption(uopt);
  await freeze.locator("[data-freeze-confirm]").check();
  await freeze.locator('button[type="submit"]').click();
  const snap = page.locator("[data-snapshot]").first();
  t("the copy taken: the entity, its ЕИК, the laboratory and its address then, the contact — with its date", await waitFor(async () => (await snap.count()) === 1) && (await textOf(snap)).includes(ENT) && (await textOf(snap)).includes(eik) && (await textOf(snap)).includes("Пловдив, ул. Стара 7") && (await textOf(snap)).includes(A) && (await page.locator("[data-frozen]").count()) === 1);
  t("…the participation's laboratory name follows the copy; to change it: «Поправи връзката»", (await page.locator("tbody").innerText()).includes(LAB) && /Поправи връзката|Correct the link/.test(await textOf(page.locator("[data-freeze-open]").first())));
  // the edit form cannot overwrite the frozen name — even forced past its read-only field
  const edit = page.locator('form:has(input[name="id"]):has(input[name="labName"])').first();
  await edit.locator("xpath=ancestor::details[1]/summary").click();
  await edit.locator('[name="labName"]').evaluate((el) => { el.removeAttribute("readonly"); el.value = "Подменено име"; });
  await Promise.all([page.waitForURL(/err=frozen/, { timeout: 60000 }).catch(() => {}), edit.locator('button[type="submit"]').click()]);
  t("the edit form cannot overwrite a frozen laboratory name — refused in words, nothing saved (review)", /err=frozen/.test(page.url()) && (await page.locator("[data-err-frozen]").count()) === 1 && !(await page.locator("tbody").innerText()).includes("Подменено име"));

  // the laboratory's address changes afterwards — the copy keeps the old one
  await go("/organizations");
  const labRow = page.locator("[data-entity]", { hasText: ENT }).locator("[data-lab]", { hasText: LAB });
  await labRow.locator("details summary").first().click();
  await labRow.locator('[data-lab-form] [name="deliveryAddress"]').fill("Пловдив, ул. Нова 8");
  await labRow.locator('[data-lab-form] button[type="submit"]').click();
  await waitFor(async () => (await textOf(page.locator("[data-entity]", { hasText: ENT }).locator("[data-entity-labs]"))).includes("Нова 8"));
  await go(`/schemes/${S}/participants`);
  const snap2 = await textOf(page.locator("[data-snapshot]").first());
  t("a later change never reaches the copy (J12)", snap2.includes("Стара 7") && !snap2.includes("Нова 8"));

  // a wrong link corrected: a new version, with its reason — the first kept
  await page.locator("[data-freeze-open] button").first().click();
  const fix = page.locator("[data-freeze-form]").first();
  await waitFor(async () => (await fix.count()) === 1);
  await fix.locator('select[name="laboratoryId"]').selectOption(opt);
  await fix.locator("[data-freeze-confirm]").check();
  await fix.locator('button[type="submit"]').click();
  t("a correction without its reason: refused by the form", (await page.locator("[data-snapshot-version]").first().getAttribute("data-snapshot-version")) === "1");
  await fix.locator('[name="reason"]').fill("адресът е сменен по молба на лабораторията");
  await fix.locator('button[type="submit"]').click();
  t("…with its reason: version 2 in force, today's address, the reason shown (review)", await waitFor(async () => (await page.locator("[data-snapshot-version]").first().getAttribute("data-snapshot-version")) === "2") && (await textOf(page.locator("[data-snapshot]").first())).includes("Нова 8") && (await textOf(page.locator("[data-snapshot]").first())).includes("по молба"));

  // the export carries it
  const zip = Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/export`)).body());
  t("the round's export carries identity/participation_snapshots.csv", zip.includes(Buffer.from("identity/participation_snapshots.csv")));
  await go("/activity");
  await page.getByText(/copy of its legal entity/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — never a name", /The participation's copy of its legal entity and laboratory taken/.test(journal) && !journal.includes(ENT) && !journal.includes(LAB) && !journal.includes(A));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-participation-snapshot: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
