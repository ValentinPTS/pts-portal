// Plan part 3.13 check (design data and external providers), against a LOCAL dev
// server (in-memory store, login off):  BASE=http://localhost:3000 node scripts/verify-scheme-meta.mjs
// On a scheme of its own: the dates from the lifecycle shown, not typed; the period
// and a provider kept; a provider without a name refused with its own notice, the
// rest saved; the plan's point 3 is the list; on record.
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
const get = async (path) => (await page.request.get(BASE + path)).text();
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const save = async () => {
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");
};
const box = () => page.locator("[data-meta]");
const openEdit = async (S) => {
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  for (let i = 0; i < 20 && !(await box().isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await get("/system"))) throw new Error("not a memory-only server");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Мета ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  await openEdit(S);
  t("the dates from the lifecycle are shown — not typed (none yet)", /още няма|not yet/.test(await box().locator("[data-design-approved]").innerText()) && (await box().locator('[data-design-approved] input').count()) === 0);
  await box().locator('[name="period"]').fill(`март – май 2026 ${stamp}`);
  for (let i = 0; i < 20 && (await box().locator("[data-provider-row]").count()) === 0; i++) { await box().getByRole("button", { name: /Добави доставчик|Add a provider/ }).click(); await page.waitForTimeout(400); }
  await box().locator('[name="prov_0_address"]').fill("Pieštany, SK");
  const title = `Kept ${stamp}`;
  await page.locator('input[name="titleEn"]').fill(title);
  await save();
  t("a provider without a name refused, its row named — its own notice", /Ред 1|Row 1/.test(await page.locator("[data-meta-refused]").innerText().catch(() => "")));
  await openEdit(S);
  t("…the providers stay as they were — the period, typed right, and the other change are saved (each on its own; review)", (await box().locator("[data-provider-row]").count()) === 0 && (await box().locator('[name="period"]').inputValue()) === `март – май 2026 ${stamp}` && (await page.locator('input[name="titleEn"]').inputValue()) === title);

  for (let i = 0; i < 20 && (await box().locator("[data-provider-row]").count()) === 0; i++) { await box().getByRole("button", { name: /Добави доставчик|Add a provider/ }).click(); await page.waitForTimeout(400); }
  await box().locator('[name="prov_0_name"]').fill(`Пробовземач ${stamp}`);
  await box().locator('[name="prov_0_svcBg"]').fill("Вземане на проби");
  await box().locator('[name="prov_0_svcEn"]').fill("Sampling");
  await save();
  await openEdit(S);
  t("kept: the period and the provider", (await box().locator('[name="period"]').inputValue()) === `март – май 2026 ${stamp}` && (await box().locator('[name="prov_0_name"]').inputValue()) === `Пробовземач ${stamp}`);
  const plan = await get(`/schemes/${S}/doc/plan/print?lang=bg`);
  t("the plan's point 3 is the list", plan.includes(`Пробовземач ${stamp}`) && plan.includes("Вземане на проби"));

  await go(`/activity?scheme=${S}`);
  await page.getByText(/Design data/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — every field of the provider, the period on its own save", new RegExp(`Design data: period: «—» → «март – май 2026 ${stamp}»`).test(journal) && new RegExp(`Design data: external provider added: «Пробовземач ${stamp}» / «—» / «Вземане на проби» / «Sampling»`).test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-scheme-meta: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
