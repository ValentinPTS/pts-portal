// Plan part 1.2 check. Two runs:
//   TEST environment (dev server started with PTS_ENVIRONMENT=test, e.g. the
//   «portal-dev-test» launch on :3001):   BASE=http://localhost:3001 EXPECT=test node scripts/verify-testenv.mjs
//   the real portal (plain dev server):   BASE=http://localhost:3000 EXPECT=production node scripts/verify-testenv.mjs
// The test environment says so on every page, numbers new schemes «SIM …» and its
// system check says which portal it is; the real portal shows no banner, suggests
// «PTS …» and refuses a «SIM» number.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const TEST = (process.env.EXPECT ?? "test") === "test";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => {
  for (let i = 0; ; i++) {
    try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); }
    catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; await page.waitForTimeout(800); }
  }
};
const openDialog = async (slug) => {
  await go(`/files/${slug}`);
  const open = page.getByRole("button", { name: /Нова схема|New scheme/ }).first();
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await open.click(); await page.waitForTimeout(500); }
  return dialog;
};

try {
  await go("/dev/persona?role=manager");
  for (const path of ["/", "/files/testing", "/register"]) {
    await go(path);
    const banner = await page.locator("[data-test-env]").count();
    t(`${path}: ${TEST ? "the «ТЕСТОВА СРЕДА» banner" : "no test banner"}`, TEST ? banner === 1 : banner === 0);
  }
  if (TEST) {
    const text = await page.locator("[data-test-env]").innerText();
    t("the banner says nothing here is real", /ТЕСТОВА СРЕДА|TEST ENVIRONMENT/.test(text) && /истински|real/.test(text), text);
  }

  // the suggested number for a new scheme
  const dialog = await openDialog("testing");
  const suggested = await dialog.locator('input[name="number"]').inputValue();
  t(`a new scheme is suggested ${TEST ? "«SIM …»" : "«PTS …»"}`, (TEST ? /^SIM \d{2}\/\d{2}-T-\d+$/ : /^PTS \d{2}\/\d{2}-T-\d+$/).test(suggested), suggested);

  if (TEST) {
    // a simulation scheme is created with its SIM id
    const n = `SIM 26/11-T-${1000 + (Date.now() % 9000)}`; // no collision with earlier runs
    await dialog.locator('input[name="number"]').fill(n);
    await dialog.locator('input[name="name"]').fill("Simulation check");
    await dialog.getByRole("button", { name: /Създай проект|Create project/ }).click();
    await page.waitForURL(/\/schemes\/[^/]+$/);
    t("a SIM scheme gets a SIM id", /\/schemes\/SIM-26-11-T-\d+$/.test(page.url()), page.url());
    const simId = page.url().split("/schemes/")[1];

    // its certificate: no register tick, and it prints «SIMULATION — not a certificate»
    await go(`/schemes/${simId}/participants`);
    const add = page.locator('form:has(input[name="labName"])').last();
    const labName = `Sim lab ${Date.now()}`;
    await add.locator('input[name="labName"]').fill(labName);
    await add.locator('button[type="submit"]').click();
    await page.waitForSelector(`text=${labName}`);
    // coded at once (dev): a certificate is only for a coded participation (5.3)
    await page.request.get(`${BASE}/dev/code?scheme=${simId}`);
    await go(`/schemes/${simId}/participants`);
    const code = (await page.locator("tr", { hasText: labName }).first().locator("td").allInnerTexts()).map((x) => x.trim()).find((x) => /^\d{6,}$/.test(x));
    await go(`/schemes/${simId}/doc/certificate`);
    const pick = page.locator("select").filter({ has: page.locator(`option[value="${code}"]`) }).first();
    for (let i = 0; i < 20 && (await page.locator("[data-cert-form]").count()) === 0; i++) { await pick.selectOption(code); await page.waitForTimeout(500); }
    const form = page.locator("[data-cert-form]");
    t("a SIM certificate has no «in the register» tick", (await form.locator('input[name="inRegister"]').count()) === 0
      && /Симулация — не се вписва|Simulation — never entered/.test(await form.innerText()));
    await form.locator('input[name="no"]').fill(`${n}-12345`);
    await form.getByRole("button", { name: /^(Запази и издай|Save and issue)$/ }).click();
    await form.locator('[role="status"]').waitFor();
    const cert = await (await page.request.get(`${BASE}/schemes/${simId}/doc/certificate/print?lang=bg&p=${code}`)).text();
    t("…and prints «СИМУЛАЦИЯ — не е сертификат», not «in the Register»", cert.includes("СИМУЛАЦИЯ — не е сертификат") && !cert.includes("Публикуван в Регистъра"));
  } else {
    // the real portal refuses a SIM number
    await dialog.locator('input[name="number"]').fill("SIM 26/11-T-7");
    await dialog.locator('input[name="name"]').fill("Simulation where it does not belong");
    await dialog.getByRole("button", { name: /Създай проект|Create project/ }).click();
    await page.waitForURL(/simNumber=/);
    t("the real portal refuses a «SIM» number, and says why", await page.getByText(/само в тестовата среда|only the test environment/).first().isVisible());
    // a look-alike too
    const d2 = await openDialog("testing");
    await d2.locator('input[name="number"]').fill("SIM-26/11-T-8");
    await d2.locator('input[name="name"]').fill("Look-alike");
    await d2.getByRole("button", { name: /Създай проект|Create project/ }).click();
    await page.waitForURL(/simNumber=/);
    t("…and a look-alike «SIM-26/11-T-8»", page.url().includes("simNumber="));
    // editing an existing scheme to a SIM number keeps the old number
    const d3 = await openDialog("testing");
    const real = `PTS 26/11-T-${1000 + (Date.now() % 9000)}`;
    await d3.locator('input[name="number"]').fill(real);
    await d3.locator('input[name="name"]').fill("Real scheme");
    await d3.getByRole("button", { name: /Създай проект|Create project/ }).click();
    await page.waitForURL(/\/schemes\/[^/]+$/);
    const realId = page.url().split("/schemes/")[1];
    await go(`/schemes/${realId}/edit`);
    const ef = page.locator('form:has(input[name="titleEn"])').first();
    await ef.locator('input[name="number"]').fill("SIM 26/11-T-9");
    await ef.locator('button[type="submit"]').first().click();
    await page.waitForURL(/err=simNumber/);
    t("…and an edit to a SIM number keeps the real one", (await page.locator('input[name="number"]').inputValue()) === real);
  }

  // the system check names the portal
  await go("/system");
  const sys = await page.locator("[data-system=\"db\"]").innerText();
  t(`the system check says the code is ${TEST ? "the TEST ENVIRONMENT" : "the real portal"}`, TEST ? /ТЕСТОВА СРЕДА|TEST ENVIRONMENT/.test(sys) : /истинският портал|the real portal/.test(sys), sys.slice(0, 300));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-testenv (${TEST ? "test" : "production"}): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
