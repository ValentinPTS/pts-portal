// Plan part 1.4 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-lab-persona.mjs
// A laboratory persona: the lab's own screens can finally be tried without a real
// sign-in, and authorisation stays real — it sees only its own participation and
// none of the provider's pages. Runs the lab's chain buttons end to end on a
// calibration scheme of its own, made from the sample and announced (part 3.2: the
// device travels only while a scheme runs — the closed demo 25-06-C-1 no longer does).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
// the manager steps write a chain: only ever against a local server
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("BASE must be a local dev server"); process.exit(2); }
let S = "";
let NUM = "";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = async (path) => {
  for (let i = 0; ; i++) {
    try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); }
    catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; await page.waitForTimeout(800); }
  }
};

try {
  // PTS makes a calibration scheme from the sample and announces it: it runs (3.2)
  await go("/dev/persona?role=manager");
  await go("/files/calibration");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("weights-m1");
  NUM = `PTS 26/12-C-${10000 + (Date.now() % 80000)}`;
  await dialog.locator('input[name="number"]').fill(NUM);
  await dialog.locator('input[name="name"]').fill("Lab persona chain");
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await page.locator("[data-lifecycle] [data-state]").filter({ hasText: /В процес|In progress/ }).waitFor();

  // the laboratory joins it (dev, memory only) and lands on /lab
  await go(`/dev/persona?role=lab&join=${S}`);
  t("the lab persona lands on the lab's own page", new URL(page.url()).pathname === "/lab", page.url());
  t("…and sees the calibration scheme it is in", (await page.locator("body").innerText()).includes(NUM));

  // authorisation stays real: no provider page for a laboratory
  for (const path of [`/schemes/${S}`, "/activity", "/users", "/system"]) {
    await go(path);
    await page.waitForURL(/\/login\?denied=1/, { timeout: 20000 }).catch(() => {});
    t(`lab: ${path} is refused (sent to the login with «not authorised»)`, /\/login\?denied=1/.test(page.url()), page.url());
  }

  // PTS: the chain = this laboratory alone, then the device goes out
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  const row = page.locator("tr", { hasText: "Демо лаборатория (dev)" }).first();
  const code = (await row.locator("td").allInnerTexts()).map((s) => s.trim()).find((s) => /^\d{6,}$/.test(s));
  t("PTS sees the laboratory as a participant, with its code (it joined)", !!code, String(code));
  await go(`/schemes/${S}`);
  const panel = page.locator('div:has(> div > span:text-is("Веригата")), div:has(> div > span:text-is("The chain"))').first();
  const rows = panel.locator("ol > li");
  const pick = panel.locator("select").first();
  for (let i = 0; i < 20 && (await rows.count()) === 0; i++) { await pick.selectOption(code).catch(() => {}); await page.waitForTimeout(500); }
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).click();
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).waitFor({ state: "detached" });
  await panel.getByRole("button", { name: /Изпратих уреда|I have sent it/ }).click();
  await panel.getByText(/изпратен|sent/).first().waitFor();
  t("PTS built the chain and sent the device", (await rows.count()) === 1);

  // the laboratory: its own buttons
  await go("/dev/persona?role=lab");
  await go("/lab");
  // its own scheme's card: another check may have left this laboratory holding a device
  const card = page.locator(`[data-lab-card="${S}"]`);
  const arrived = card.getByRole("button", { name: /Уредът пристигна при мен|The device has arrived/ });
  await arrived.waitFor();
  await arrived.click();
  const handOn = card.getByRole("button", { name: /Предадох уреда|I have sent it on/ });
  await handOn.waitFor();
  for (let i = 0; i < 20 && (await handOn.isDisabled()); i++) await page.waitForTimeout(400);
  t("the laboratory confirmed the arrival itself", !(await handOn.isDisabled()));
  await handOn.click();
  await page.waitForTimeout(1500);

  // only its own: another scheme's documents are not the laboratory's
  const other = await page.request.get(`${BASE}/lab/doc/26-01-T-1/instruction?lang=bg`);
  t("lab: a scheme it is not in gives it nothing", other.status() >= 400, String(other.status()));

  // switching persona ends the laboratory session
  await go("/dev/persona?role=staff");
  await go("/lab");
  await page.waitForURL(/\/lab\/login/, { timeout: 20000 }).catch(() => {});
  t("a staff persona is not a laboratory: /lab asks for the sign-in", /\/lab\/login/.test(page.url()), page.url());

  // PTS sees both steps, recorded by the laboratory, timed, in its case file
  await go("/dev/persona?role=manager");
  const caseFile = await (await page.request.get(`${BASE}/schemes/${S}/participants/${code}`)).text();
  t("the case file: received by the laboratory, timed", /device received \d{2}:\d{2} \(calibration chain\)/.test(caseFile));
  t("the case file: handed on by the laboratory, timed", /device handed on \d{2}:\d{2} \(calibration chain\)/.test(caseFile));
  await go(`/schemes/${S}`);
  const stop = await page.locator('div:has(> div > span:text-is("Веригата")) ol > li, div:has(> div > span:text-is("The chain")) ol > li').first().innerText();
  t("the chain shows the stop received → handed on", /→/.test(stop) && !/\(PTS,/.test(stop), stop);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-lab-persona: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
