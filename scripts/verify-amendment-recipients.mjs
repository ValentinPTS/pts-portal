// Plan part 5.1 check of the 3.3 amendment notice («checked in 5.1, once applications
// exist»), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-amendment-recipients.mjs
// On a scheme of its own, opened: two applications entered by PTS, both linked to a
// laboratory; one refused. An order of amendment then tells the participation still in
// the round — held for «Изпрати» by its code — and never the refused one.
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
const eik = (() => { const d = String(10000000 + (stamp * 83) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const X = `Изм. отказана ${stamp}`, Y = `Изм. в кръга ${stamp}`, ENT = `Изм. заявител ${stamp} ООД`, LAB = `Лаб. изм. ${stamp}`;
const INV = Buffer.from(`%PDF-1.4\n% invitation ${stamp}\n%%EOF\n`);

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // an entity with a laboratory, to link both participations to
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Русе 2");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);

  // a scheme of its own: a deadline, the invitation sent, opened
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Изменение и заявки ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const resultsDue = page.locator('label:has-text("Краен срок за резултати") input[type="date"]');
  await resultsDue.waitFor();
  const saveDates = page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ });
  for (let i = 0; i < 30 && !(await saveDates.isEnabled()); i++) { await resultsDue.fill(""); await resultsDue.fill("2026-12-10"); await page.waitForTimeout(400); }
  await saveDates.click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);
  const row = page.locator('[data-doc-row="invitation"]');
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), row.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await chooser.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: INV });
  await row.locator("button", { hasText: /^📨/ }).waitFor();
  await row.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await row.locator('[data-edition-label="1"]').count()) === 1);
  await go(`/schemes/${S}#stages`);
  const isOpen = async () => (await page.locator("[data-lifecycle] [data-state]").filter({ hasText: /Отворена|Open/ }).count()) > 0;
  await page.locator("[data-lifecycle] [data-state]").first().waitFor();
  if (!(await isOpen())) await page.locator('[data-act="open"]').click(); // the invitation sent may have opened it already
  t("setup: the scheme is open", await waitFor(isOpen));

  // two applications from the PDF, both linked to the laboratory
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const sels = add.locator('[data-add-selections] input[name^="sel_"]');
  const n = await sels.count();
  const enter = async (name) => {
    await add.locator('[name="labName"]').fill(name);
    for (let i = 0; i < n; i++) await sels.nth(i).fill(i === 0 ? "1" : "0");
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(name));
  };
  await enter(X);
  await enter(Y);
  const codeOf = async (name) => (await page.locator("[data-participant-row]", { hasText: name }).locator("td").first().innerText()).trim();
  const pidOf = async (name) => page.locator("[data-participant-row]", { hasText: name }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const codeX = await codeOf(X), codeY = await codeOf(Y);
  const pidX = await pidOf(X), pidY = await pidOf(Y);
  t("setup: both entered, each with its code", !!codeX && !!codeY && codeX !== codeY && !!pidX && !!pidY);
  for (const pid of [pidX, pidY]) {
    const cell = page.locator(`[data-snapshot-row="${pid}"]`);
    await cell.locator("[data-freeze-open] button").click();
    const ff = cell.locator("[data-freeze-form]");
    await waitFor(async () => (await ff.count()) === 1);
    await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
    await ff.locator("[data-freeze-confirm]").check();
    await ff.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-snapshot="${pid}"]`).count()) === 1);
  }

  // refuse X
  const st = page.locator(`[data-standing-row="${pidX}"]`);
  await st.locator("summary").click();
  await st.locator('[data-standing-open="refused"]').click();
  const rf = st.locator('[data-standing-form="refused"]');
  await rf.locator('select[name="category"]').selectOption("conditions");
  await rf.locator('[name="reason"]').fill(`извън обхвата ${stamp}`);
  await rf.locator('button[type="submit"]').click();
  t("setup: X refused — out of the round", await waitFor(async () => (await page.locator(`[data-participant-row="${codeX}"]`).getAttribute("data-in-round")) === "0"));

  // an order of amendment: a new results deadline
  await go(`/schemes/${S}/amendments`);
  const af = page.locator("[data-amendment-form]");
  await af.waitFor();
  await af.locator('input[name="orderNo"]').fill(`31-${stamp % 1000}`);
  await af.locator('input[name="orderDate"]').fill("2026-11-06");
  await af.locator('textarea[name="reason"]').fill("Забавена доставка на обектите");
  await af.locator('textarea[name="points"]').fill("т. 10 — график");
  await af.locator('textarea[name="validity"]').fill("Не засяга валидността: срокът е еднакъв за всички");
  await af.locator('input[name="date_resultsDue"]').fill("2026-12-20");
  await af.locator('button[type="submit"]').click();
  t("the amendment is recorded", await waitFor(async () => (await page.locator('[data-amendment="1"]').count()) === 1), await textOf(af.locator("[data-amendment-error]")));

  // who is told: the one in the round, never the refused one
  await go("/notices");
  await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
  const amendedTo = async (code) => {
    const held = page.locator("[data-held]").filter({ has: page.locator(`a[href="/schemes/${S}"]`) }).filter({ hasText: code }); // this scheme's — a reference (5.3) is Z001 in every scheme
    const texts = [];
    for (let i = 0; i < (await held.count()); i++) texts.push(await held.nth(i).innerText());
    return texts.filter((x) => /е изменена|has been amended/.test(x)).length;
  };
  t("the participation in the round is told of the amendment — by its code, held for «Изпрати»", await waitFor(async () => (await amendedTo(codeY)) === 1));
  t("…the refused one is told nothing more", (await amendedTo(codeX)) === 0 && (await page.locator("[data-held]").filter({ has: page.locator(`a[href="/schemes/${S}"]`) }).filter({ hasText: codeX }).count()) >= 1);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-amendment-recipients: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
