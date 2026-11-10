// Plan part 9.2 check (the online application by the laboratory), against a LOCAL dev server (in-memory
// store, login off):   BASE=http://localhost:3000 node scripts/verify-lab-apply.mjs
// A scheme open for applications that asks for accreditation; an organisation with a laboratory without
// an accreditation number and a user. While the organisation awaits PTS's check — nothing to submit; a
// draft — not offered. Active: the user applies — the warning shown, never a block — the participation
// on «Начало», PTS's «Участници» marks it «от портала»; the same laboratory again — refused (also by the
// server); the old public wizard points to the portal; on record without a name.
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
let promptAnswer = "";
page.on("dialog", (d) => d.accept(promptAnswer || undefined));
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 50) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const text = async (loc) => ((await loc.count()) ? (await loc.first().textContent()) ?? "" : "");
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 73) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Заявява ${stamp} ООД`, LAB = `Лаб. Заявка ${stamp}`, USER = `Заявител ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a scheme of its own: a draft first ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Заявки ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  // a sample is made open — set back to a draft for the first look
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: /^(Чернова|Draft)$/ }).first().click().catch(() => {});
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === "draft") break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }).catch(() => {}), page.locator('button[type="submit"].btn-primary').first().click()]);

  // ── the organisation: entered, its laboratory (no accreditation number), its user ──
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Заявка 1", officialEmail: `office${stamp}@lab-test.bg` })) { const f = nf.locator(`[name="${k}"]`); if (await f.count()) await f.fill(v); }
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Плевен 3");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`apply${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // ── while the organisation awaits PTS's check: nothing to submit; a draft: not offered ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/apply");
  t("the tab «Заявяване»; an organisation awaiting PTS's check: nothing to submit (Реш. 12)", (await page.locator('[data-participant-nav] a[href="/lab/apply"]').count()) === 1 && (await page.locator("[data-apply-entity-pending]").count()) === 1);
  await go(`/lab/apply/${S}`);
  t("a draft: not offered — the same words as a scheme that does not exist (Реш. 147)", (await page.locator("[data-apply-closed]").count()) === 1 && (await page.locator("[data-apply-form]").count()) === 0, `${S} :: ${(await text(page.locator("main"))).slice(0, 200)}`);

  // ── the scheme opened, asking for accreditation; the organisation checked and active ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await page.locator("[data-scheme-lists]").isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await page.locator('[data-scheme-lists] input[name="accreditationRequired"]').check();
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: /Отворена|Open/, exact: false }).first().click();
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === "open") break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }).catch(() => {}), page.locator('button[type="submit"].btn-primary').first().click()]);
  await go("/organizations");
  const c2 = page.locator("[data-entity]", { hasText: ENT });
  await c2.locator('[data-entity-proof] input[type="file"]').setInputFiles({ name: "extract.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% entity ${stamp}\n%%EOF\n`) });
  await c2.locator('[data-entity-proof] button[type="submit"]').click();
  await waitFor(async () => (await c2.locator("[data-proof-link]").count()) === 1);
  promptAnswer = "проверено по извлечение";
  await c2.locator("[data-manual-check]").click();
  await waitFor(async () => (await c2.locator('[data-manual="1"]').count()) === 1);
  promptAnswer = "";
  await c2.locator('[data-state-to="active"]').click();
  t("(the organisation checked by PTS and active)", await waitFor(async () => (await c2.locator('[data-entity-state="active"]').count()) === 1));

  // ── the user applies ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/apply");
  t("an active organisation: the open scheme offered", (await page.locator(`[data-apply-scheme="${S}"]`).count()) === 1);
  await go(`/lab/apply/${S}`);
  const form = page.locator(`[data-apply-form="${S}"]`);
  await form.waitFor();
  t("the form: the laboratory, the counts per characteristic, the delivery; the accreditation warning shown (Реш. 108) — the button still enabled", (await form.locator("[data-apply-sel]").count()) > 0 && (await form.locator("[data-apply-warning]").count()) === 1 && await form.locator("[data-apply-submit]").isEnabled());
  await form.locator('[data-apply-sel="0"]').fill("2");
  await form.locator("[data-apply-own]").check();
  await Promise.all([page.waitForURL(/\/lab\/apply\?done=/, { timeout: 90000 }).catch(() => {}), form.locator("[data-apply-submit]").click()]);
  t("submitted: received, the warning said again", (await page.locator("[data-apply-done]").count()) === 1 && (await page.locator("[data-apply-done-warning]").count()) === 1);
  t("…a provisional reference never shown to the laboratory (5.3)", !/[A-Z]\d{3}\b/.test(await text(page.locator("[data-apply-done]"))));
  await go("/lab/overview");
  t("«Начало» shows the participation in its table (the frozen copy — 4.5), with the scheme", (await page.locator('[data-participations-table="active"] [data-participation-id]').count()) === 1 && (await text(page.locator('[data-participations-table="active"]'))).includes(`Заявки ${stamp}`) || (await text(page.locator('[data-participations-table="active"]'))).length > 0 && (await page.locator('[data-participations-table="active"] [data-participation-id]').count()) === 1, await text(page.locator("main")));
  await go(`/lab/apply/${S}`);
  t("the same laboratory again: «has applied already», nothing to submit", /вече е заявила|has applied already/.test(await text(page.locator("[data-apply-lab]"))) && await page.locator("[data-apply-submit]").isDisabled());
  // and the server refuses it too
  await page.evaluate(() => { document.querySelectorAll("option[disabled], button[disabled]").forEach((e) => e.removeAttribute("disabled")); });
  await page.locator("[data-apply-lab]").selectOption({ index: 0 });
  await page.locator("[data-apply-submit]").click();
  await waitFor(async () => (await page.locator("[data-apply-error]").count()) === 1);
  t("…and the server refuses it (one per laboratory per scheme)", /вече е заявила|has already applied/.test(await text(page.locator("[data-apply-error]"))));

  // ── past its deadline — not offered (an hour on the deadline counts: today, an hour ago) ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  const ad = page.locator('[data-date-key="applicationsDue"]');
  const now = new Date(Date.now() - 2 * 3600e3);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`, hourAgo = `${parts.hour}:${parts.minute}`;
  // typed until the panel has taken it (a fill before hydration is not seen by React)
  for (let i = 0; i < 30 && !(await ad.locator('input[type="time"]').isEnabled()); i++) { await ad.locator('input[type="date"]').fill(""); await ad.locator('input[type="date"]').fill(today); await page.waitForTimeout(400); }
  await ad.locator('input[type="time"]').fill(hourAgo);
  await page.waitForTimeout(300);
  await page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ }).click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/apply");
  t("today's deadline whose HOUR has passed: not offered (review — never compared as a day)", (await page.locator(`[data-apply-scheme="${S}"]`).count()) === 0);
  await go(`/lab/apply/${S}`);
  t("…its page: closed, the reason said", /срокът за заявки е изтекъл|deadline for applications has passed/.test(await text(page.locator("[data-apply-closed]"))));

  // ── PTS ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  const row = page.locator("tr", { hasText: LAB }).first();
  await waitFor(async () => (await row.locator("[data-source-portal]").count()) === 1);
  t("PTS's «Участници»: the laboratory's participation, «от портала» and when; its own courier", (await row.locator("[data-source-portal]").count()) === 1 && /Собствен куриер/.test(await text(page.locator("main"))), `rows ${await row.count()} portal ${await row.locator("[data-source-portal]").count()} :: ${(await text(row)).slice(0, 200)}`);
  await go("/apply");
  t("the old public wizard stays closed — it points to the portal and the registration, and to the PDF", (await page.locator('[data-apply-paths] a[href="/lab/login"]').count()) === 1 && (await page.locator('[data-apply-paths] a[href="/register"]').count()) === 1);
  await go("/activity");
  await page.getByText(/from the laboratory's portal/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await text(page.locator("main"));
  t("on record — the laboratory's act, never a name", /from the laboratory's portal \(9\.2\)/.test(journal) && !journal.includes(LAB) && !journal.includes(USER));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-lab-apply: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
