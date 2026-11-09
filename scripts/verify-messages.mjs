// Plan part 5.10 check (one-way messages; К11 → Реш. 116), against a LOCAL dev server
// (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-messages.mjs
// On a scheme of its own, participation A of a legal entity and B another:
// - a message to A from its page reaches the entity's user on «Начало» and on A's page, at
//   once (released by its writer), with the one-way footer;
// - a message to everyone goes to each participation going on;
// - a message to the organisation reaches its user;
// - the histories; the journal names the target, never the text;
// - a message without its Bulgarian text is refused;
// - who does not work with the participants sees no composer.
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
// a navigation interrupted by a form's in-place redirect still loading: once more (ERR_ABORTED)
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
// a closed <details> hides its content from innerText — the history is read whole
const allText = async (loc) => ((await loc.count()) ? await loc.first().evaluate((el) => el.textContent ?? "") : "");
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(typeof a === "string" ? a : undefined); });
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 131) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Съобщения ${stamp} ООД`, LAB = `Лаб. съобщения ${stamp}`, USER = `Потребител съобщения ${stamp}`, NAME_A = `Съобщения А ${stamp}`, NAME_B = `Съобщения Б ${stamp}`;
const TO_A = `Лично до А ${stamp}: резултатите ви закъсняват.`, TO_ALL = `До всички ${stamp}: срокът е удължен.`, TO_ORG = `До организацията ${stamp}: нов адрес за фактури.`;
// a server action's redirect may navigate in place: watch the address (5.6 gotcha)
// a form posted natively with what it held — a second press, a stale tab, a direct call (5.9 gotcha)
const postNative = (f) => page.evaluate(({ f }) => { const form = document.createElement("form"); form.method = "post"; form.action = location.pathname + location.search; form.enctype = "multipart/form-data"; document.body.append(form); for (const [k, v] of Object.entries(f)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.append(i); } form.submit(); }, { f });
const formOf = (composer) => composer.locator("form").evaluate((f) => Object.fromEntries(new FormData(f)));
const send = async (composer, bg, until) => {
  await composer.locator("[data-message-bg]").fill(bg);
  await composer.locator("[data-message-send] button").click();
  return waitFor(async () => until.test(page.url()), 40);
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory, a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 12" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const E = await card.getAttribute("data-entity");
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Плевен 3");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`msg${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a scheme (from a sample — it starts open); A of the entity, B another
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Съобщения ${stamp}`);
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
  const pidA = await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);
  t("setup: the scheme open; A of the entity, B another", !!S && !!E && !!pidA && !!refA);

  // ── to A, from its page ──
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#message`);
  const toA = page.locator('[data-message-composer="participation"]');
  t("the participant's page: «Съобщение до участието», with the warning against names", (await toA.count()) === 1 && /не пишете имена|Write no laboratory's name/i.test(await toA.innerText()));
  // no Bulgarian text: refused, said so (the browser's own minimum lifted, to reach the server)
  await toA.locator("[data-message-bg]").evaluate((x) => { x.removeAttribute("required"); x.removeAttribute("minlength"); });
  await send(toA, "аб", /msg=bg/);
  t("…a message without its Bulgarian text: refused, said so — nothing sent", /msg=bg/.test(page.url()) && (await page.locator('[data-message-answer="bg"]').count()) === 1 && (await page.locator("[data-message-history]").count()) === 0);
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#message`);
  await page.locator('[data-message-composer="participation"] [data-message-bg]').fill(TO_A);
  const formA = await formOf(page.locator('[data-message-composer="participation"]'));
  t("…sent: «Изпратено»", await send(page.locator('[data-message-composer="participation"]'), TO_A, /msg=sent/) && (await page.locator('[data-message-answer="sent"]').count()) === 1);
  // the same form again (a double click, a resent tab): its one-time token is spent — nothing sent twice
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}`);
  await postNative(formA);
  t("…the same form posted again: «вече е изпратено» — not sent a second time", await waitFor(async () => /msg=twice/.test(page.url()), 30) && (await page.locator('[data-message-answer="twice"]').count()) === 1);
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#message`);
  t("…in its history", (await attr(page.locator("[data-message-history]"), "data-message-history")) === "1" && (await allText(page.locator("[data-message-history]"))).includes(refA) && (await allText(page.locator("[data-message-history]"))).includes(TO_A), await allText(page.locator("[data-message-history]")));

  // ── to everyone going on ──
  await go(`/schemes/${S}#message`);
  const toAll = page.locator('[data-message-composer="scheme"]');
  t("the scheme's page: «Съобщение до всички участници»", (await toAll.count()) === 1);
  t("…sent to each participation going on (2)", await send(toAll, TO_ALL, /msg=sent&n=2/));
  await go(`/schemes/${S}#message`);
  t("…in the scheme's history: both messages, «до всички участия (2)» and A's", (await attr(page.locator("[data-message-history]"), "data-message-history")) === "2" && /до всички участия \(2\)|to every participation \(2\)/.test(await allText(page.locator("[data-message-history]"))));

  // ── to the organisation ──
  await go(`/organizations?entity=${E}#message-${E}`);
  const det = page.locator(`[data-entity-message="${E}"]`);
  if (!(await det.evaluate((d) => d.open))) await det.locator("summary").click();
  t("«Организации»: the organisation's own composer", (await det.locator('[data-message-composer="entity"]').count()) === 1);
  t("…sent to the organisation", await send(det.locator('[data-message-composer="entity"]'), TO_ORG, /msg=sent/));
  await go(`/organizations?entity=${E}#message-${E}`);
  t("…in its history", (await attr(page.locator(`[data-entity-message="${E}"] [data-message-history]`), "data-message-history")) === "1");

  // ── the entity's user: all three, out at once, with the footer ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const feed = page.locator("[data-notices]");
  const items = page.locator('[data-notices] [data-notice-kind="message"]');
  t("«Начало»: A's message, the message to all (A's copy) and the organisation's — at once, no one had to release them", (await items.count()) === 3 && (await textOf(feed)).includes(TO_A) && (await textOf(feed)).includes(TO_ALL) && (await textOf(feed)).includes(TO_ORG));
  t("…each says it is one-way — questions by e-mail (Реш. 54)", (await items.filter({ hasText: /еднопосочно съобщение|one-way message/ }).count()) === 3);
  t("…unread for this user until they read them", (await page.locator('[data-notices] [data-notice-kind="message"][data-notice-read="0"]').count()) === 3);
  await go(`/lab/p/${pidA}`);
  t("A's page: its own two messages — never the organisation's, never B's", (await page.locator('[data-participation-notice="message"]').count()) === 2 && !(await textOf(page.locator("[data-participation-notices]"))).includes(TO_ORG));

  // ── another organisation's user: never this one's message ──
  await go("/dev/persona?role=manager");
  await go("/organizations");
  const ENT2 = `Друга ${stamp} ООД`, USER2 = `Друг потребител ${stamp}`;
  const eik2 = (() => { const d = String(10000000 + (stamp * 137 + 7) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
  for (const [k, v] of Object.entries({ name: ENT2, country: "BG", eik: eik2, address: "Видин 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card2 = page.locator("[data-entity]", { hasText: ENT2 });
  await waitFor(async () => (await card2.count()) === 1);
  const box2 = card2.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box2.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box2.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box2.locator('[data-user-form="new"] [name="name"]').fill(USER2);
  await box2.locator('[data-user-form="new"] [name="email"]').fill(`msg2${stamp}@lab-test.bg`);
  await box2.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box2.locator("[data-user]", { hasText: USER2 }).count()) === 1);
  const uid2 = await box2.locator("[data-user]", { hasText: USER2 }).getAttribute("data-user");
  await go(`/dev/persona?role=participant&user=${uid2}`);
  await go("/lab/overview");
  t("another organisation's user: none of these messages", !(await page.content()).includes(TO_ORG) && !(await page.content()).includes(TO_A));

  // ── the journal: the target, never the text ──
  await go("/dev/persona?role=manager");
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: the target — never the text", /One-way message to|Еднопосочно съобщение/.test(act) && !act.includes(TO_A) && !act.includes(TO_ALL));
  const actAll = await (await page.request.get(`${BASE}/activity`)).text();
  t("…the organisation's too — never its text", /One-way message to an organisation|Еднопосочно съобщение/.test(actAll) && !actAll.includes(TO_ORG));

  // ── who does not work with the participants: no composer, and a direct post sends nothing ──
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#message`);
  await page.locator('[data-message-composer="participation"] [data-message-bg]').fill(`Не бива ${stamp}`);
  const formStaff = await formOf(page.locator('[data-message-composer="participation"]'));
  await go("/dev/persona?role=staff");
  await go(`/schemes/${S}`);
  t("staff without «participants»: no composer on the scheme's page", (await page.locator('[data-message-composer="scheme"]').count()) === 0);
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}`);
  t("…nor on the participant's page", (await page.locator('[data-message-composer="participation"]').count()) === 0);
  await postNative(formStaff);
  await page.waitForTimeout(2500);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}#message`);
  t("…a direct post of the participation's form: refused — nothing sent", !(await allText(page.locator("[data-message-history]"))).includes(`Не бива ${stamp}`) && (await attr(page.locator("[data-message-history]"), "data-message-history")) === "2");
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-messages: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
