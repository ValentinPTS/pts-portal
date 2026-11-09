// Plan part 4.6 check (the laboratory switcher; recipients per person; X1), against a
// LOCAL dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-lab-switcher.mjs
// An entity with two laboratories (one with its accreditation body), an administrator
// and a user who does not take the notices by e-mail. On an open scheme of its own,
// one participation linked to each laboratory. The administrator's home: both
// laboratories to switch between, each with its own participation — an id that is
// not one of its laboratories shows none of another's. Its own «receives the notices»
// unticked on its data page: shown so on «Организации».
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
const eik = (() => { const d = String(10000000 + (stamp * 67) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Превключи ${stamp} ООД`, LA = `Лаб. Север ${stamp}`, LB = `Лаб. Юг ${stamp}`, A = `Админ ${stamp}`, B = `Колега ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Превключи 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  const addLab = async (name, addr, body) => {
    for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
    const f = labs.locator('[data-lab-form="new"]');
    await f.locator('[name="name"]').fill(name);
    await f.locator('[name="deliveryAddress"]').fill(addr);
    if (body) { await f.locator('[name="accreditationNo"]').fill("55 ЛИ"); await f.locator('[name="accreditationBody"]').fill(body); }
    await f.locator('button[type="submit"]').click();
    await waitFor(async () => (await labs.locator("[data-lab]", { hasText: name }).count()) === 1);
  };
  await addLab(LA, "Русе 1", "ИА „БСА“");
  await addLab(LB, "Бургас 2");
  t("X1: a laboratory's accreditation body kept with it", (await textOf(labs.locator("[data-lab]", { hasText: LA }))).includes("ИА „БСА“"));
  const box = card.locator("[data-entity-users]");
  const addUser = async (name, email, notices) => {
    for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
    const f = box.locator('[data-user-form="new"]');
    await f.locator('[name="name"]').fill(name);
    await f.locator('[name="email"]').fill(email);
    if (!notices) await f.locator('[name="receivesNotices"]').uncheck();
    await f.locator('button[type="submit"]').click();
    await waitFor(async () => (await box.locator("[data-user]", { hasText: name }).count()) === 1);
  };
  await addUser(A, `admin${stamp}@lab-test.bg`, true);
  await addUser(B, `user${stamp}@lab-test.bg`, false);
  const idA = await box.locator("[data-user]", { hasText: A }).getAttribute("data-user");
  t("recipients per person: one takes the notices by e-mail, the other not", (await box.locator("[data-user]", { hasText: A }).locator("[data-user-notices]").getAttribute("data-user-notices")) === "1" && (await box.locator("[data-user]", { hasText: B }).locator("[data-user-notices]").getAttribute("data-user-notices")) === "0");

  // an open scheme of its own, a participation for each laboratory
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Превключвател ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: /Отворена|Open/, exact: false }).first().click();
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === "open") break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }).catch(() => {}), page.locator('button[type="submit"].btn-primary').first().click()]);
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  for (const n of ["Север от PDF", "Юг от PDF"]) {
    await add.locator('[name="labName"]').fill(n);
    await Promise.all([page.waitForLoadState("domcontentloaded"), add.locator('button[type="submit"]').click()]);
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(n));
  }
  const link = async (rowText, labName) => {
    const row = page.locator("tr", { hasText: rowText }).first();
    const pid = await row.locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
    const cell = page.locator(`[data-snapshot-row="${pid}"]`);
    await cell.locator("[data-freeze-open] button").click();
    const f = cell.locator("[data-freeze-form]");
    await waitFor(async () => (await f.count()) === 1);
    await f.locator('select[name="laboratoryId"]').selectOption(await f.locator('select[name="laboratoryId"] option', { hasText: labName }).getAttribute("value"));
    await f.locator("[data-freeze-confirm]").check();
    await f.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-snapshot="${pid}"]`).count()) === 1);
    return pid;
  };
  const pA = await link("Север от PDF", LA);
  const pB = await link("Юг от PDF", LB);
  const rows = await page.locator("tbody tr").allInnerTexts();
  const codeOf = (lab) => (rows.find((r) => r.includes(lab)) ?? "").trim().split(/\s+/)[0];
  const [cA, cB] = [codeOf(LA), codeOf(LB)];

  // the administrator's home — the laboratory switcher
  await go(`/dev/persona?role=participant&user=${idA}`);
  await page.waitForURL(/\/lab\/confirm/, { timeout: 60000 });
  await go("/lab/overview");
  const sw = page.locator("[data-lab-switcher] [data-switch-lab]");
  t("the switcher: every laboratory of its entity (К5)", await waitFor(async () => (await sw.count()) === 2) && (await textOf(page.locator("[data-lab-switcher]"))).includes(LA) && (await textOf(page.locator("[data-lab-switcher]"))).includes(LB));
  // by the row's own key — before the coding act (5.3) the page says «кодът предстои», never the reference
  // by the participation's id: before the coding act (5.3) it has no code to show, and its reference stays out of the page
  const shown = async (c) => (await page.locator(`[data-participations] [data-participation-id="${c === cA ? pA : pB}"]`).count()) === 1;
  const parts = async () => textOf(page.locator("[data-participations]"));
  const firstShown = await parts();
  t("…one laboratory chosen: its participation only, its accreditation shown", ((await shown(cA)) && !(await shown(cB)) && (await textOf(page.locator("[data-chosen-lab]"))).includes("ИА „БСА“")) || ((await shown(cB)) && !(await shown(cA))), `${cA} ${cB} | ${firstShown}`);
  t("…an application not yet coded: «code to come», never its provisional reference — not even in the page", !/^Z\d{3}$/.test(cA) || (!firstShown.includes(cA) && !firstShown.includes(cB) && /кодът предстои|code to come/.test(firstShown) && !(await page.content()).includes(`"${cA}"`)));
  await page.locator("[data-switch-lab]", { hasText: LB }).click();
  await page.waitForURL(/lab=/, { timeout: 60000 });
  t("…switched: the other laboratory's participation", await waitFor(async () => (await shown(cB)) && !(await shown(cA))));
  await go("/lab/overview?lab=00000000-0000-4000-8000-000000000000");
  const ownIds = await sw.evaluateAll((els) => els.map((e) => e.getAttribute("data-switch-lab")));
  t("…an id that is not one of its laboratories: one of its own shown, nothing else", (await sw.count()) === 2 && ownIds.includes(await page.locator("[data-chosen-lab]").getAttribute("data-chosen-lab")));

  // its own «receives the notices», on its data page
  await go("/lab/confirm");
  const form = page.locator("[data-profile-form]");
  await form.locator("[data-own-notices]").uncheck();
  await form.locator('button[value="save"]').click();
  t("a user says for themself whether the notices come by e-mail", await waitFor(async () => /Записано|Saved/.test(await textOf(form.locator("[data-profile-done]")))));
  await go("/dev/persona?role=manager");
  await go("/organizations");
  t("…«Организации» shows it", (await page.locator("[data-entity]", { hasText: ENT }).locator("[data-user]", { hasText: A }).locator("[data-user-notices]").getAttribute("data-user-notices")) === "0");
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-lab-switcher: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
