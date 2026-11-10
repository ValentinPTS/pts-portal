// Plan part 0.15 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-cert.mjs
// The certificate number is the one the ptsbg.eu register holds, typed by PTS — the
// portal makes none up (PTS, 02.11.2026, condition 1). Without the «in the register»
// tick nothing is saved; a malformed or another participant's number is refused;
// the saved number is what the certificate prints. 7.7: recording the number is step 1 only — the
// laboratory gets nothing, and the journal says «number recorded», never «issued».
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = "26-01-T-1", NUMBER = "PTS 26/01-T-1";
// a fresh five-digit number per run: the in-memory scheme keeps earlier runs' numbers
const N5 = String(10000 + (Date.now() % 90000));
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  if (r.status() !== 200) throw new Error(`${path} → HTTP ${r.status()}`);
  return r.text();
};

const addLab = async () => {
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"])').last();
  const name = `Cert lab ${Date.now()}`;
  await add.locator('input[name="labName"]').fill(name);
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${name}`);
  // a certificate is only for a coded participation (5.3): coded at once here (dev only)
  await page.request.get(`${BASE}/dev/code?scheme=${S}`);
  await go(`/schemes/${S}/participants`);
  const coded = page.locator("tr", { hasText: name }).first();
  return (await coded.locator("td").allInnerTexts()).map((s) => s.trim()).find((s) => /^\d{6,}$/.test(s));
};

try {
  await go("/dev/persona?role=manager");
  const A = await addLab(), B = await addLab();
  t("two participants", !!A && !!B, `${A} ${B}`);

  const openFor = async (code) => {
    await go(`/schemes/${S}/doc/certificate`);
    const pick = page.locator("select").filter({ has: page.locator(`option[value="${code}"]`) }).first();
    // retried until the page has hydrated — an early pick does nothing
    for (let i = 0; i < 20 && (await page.locator("[data-cert-form]").count()) === 0; i++) { await pick.selectOption(code); await page.waitForTimeout(500); }
    return page.locator("[data-cert-form]");
  };
  const save = async (form, no, tick) => {
    await form.locator('input[name="no"]').fill(no);
    const box = form.locator('input[name="inRegister"]');
    if (tick) await box.check(); else await box.uncheck();
    await form.getByRole("button", { name: /^(Запиши номера|Record the number)$/ }).click();
  };
  // the message that answers THIS save — the previous one stays until it is replaced
  const says = async (form, re) => {
    const a = form.locator('[role="alert"], [role="status"]');
    for (let i = 0; i < 40; i++) {
      if ((await a.count()) && re.test(await a.innerText())) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };

  let form = await openFor(A);
  t("no «Издай № (авт.)» — the number is typed", (await page.getByRole("button", { name: /Издай № \(авт\.\)|Issue № \(auto\)/ }).count()) === 0);
  await save(form, `${NUMBER}-${N5}`, false);
  t("without the «in the register» tick nothing is saved", await says(form, /регистъра на ptsbg\.eu|ptsbg\.eu register/));
  await save(form, `${NUMBER}-4821`, true);
  t("a number without five digits is refused", await says(form, /пет цифри|five digits/));
  await save(form, `PTS 26/02-T-1-${N5}`, true);
  t("another scheme's number is refused", await says(form, /номера на тази схема|this scheme's number/));
  t("…and what was typed is still there, ticked", (await form.locator('input[name="no"]').inputValue()) === `PTS 26/02-T-1-${N5}`
    && (await form.locator('input[name="inRegister"]').isChecked()));

  // typed loosely, stored as the scheme's number; a double click saves once
  await form.locator('input[name="no"]').fill(`pts 26/01-т-1-${N5}`);
  await form.locator('input[name="inRegister"]').check();
  await form.getByRole("button", { name: /^(Запиши номера|Record the number)$/ }).dblclick();
  t("saved — and said so, in the scheme's spelling, «not released yet»", await says(form, new RegExp(`(Номерът е записан|Number recorded): ${NUMBER.replace(/[/]/g, "\\/")}-${N5}`)));
  await page.waitForTimeout(1000);
  const certA = await get(`/schemes/${S}/doc/certificate/print?lang=bg&p=${A}`);
  t("the typed number is saved and printed", certA.includes(`${NUMBER}-${N5}`));

  form = await openFor(B);
  await save(form, `PTS 26/01-Т-1-${N5}`, true); // same number, Cyrillic Т
  t("another participant's number is refused, either alphabet", await says(form, /друг участник|Another participant/));
  const certB = await get(`/schemes/${S}/doc/certificate/print?lang=bg&p=${B}`);
  t("…and B has no number", !certB.includes(N5));

  const act = await get("/activity");
  t("the journal says it is in the register", /in the ptsbg\.eu register/.test(act));
  // counted in the visible page — the raw HTML repeats each row in Next's page data
  await go("/activity?action=certificate.numbered");
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 }).catch(() => {}); // a streamed page
  const shown = await page.locator("main").innerText();
  // the journal names no certificate number beside a code (part 1.10, Реш. 115)
  const once = (shown.match(new RegExp(`Certificate number recorded for ${A}\\b`, "g")) ?? []).length;
  t("…once, though the button was clicked twice", once === 1, `${once} lines`);
  t("…and never the certificate's number", !shown.includes(`${NUMBER}-${N5}`));

  // saving the same number again (a date correction) adds no case-file step
  // the steps of the case file, counted by their kind's label
  const steps = async () => (await (await page.request.get(`${BASE}/schemes/${S}/participants/${A}`)).text()).split(/Издаден доклад \/ сертификат|Report \/ certificate issued/).length;
  const caseBefore = await steps();
  form = await openFor(A);
  await form.locator('input[name="date"]').fill("03.11.2026");
  await save(form, `${NUMBER}-${N5}`, true);
  await says(form, /Номерът е записан|Number recorded/);
  const caseAfter = await steps();
  t("a date correction adds no case-file step", caseAfter === caseBefore, `${caseBefore} → ${caseAfter}`);
  await form.locator('input[name="date"]').fill("3.11.2026");
  await save(form, `${NUMBER}-${N5}`, true);
  t("a date not as dd.mm.yyyy is refused", await says(form, /дд\.мм\.гггг|dd\.mm\.yyyy/));

  // staff see the certificate but cannot issue one
  await go("/dev/persona?role=staff");
  await go(`/schemes/${S}/doc/certificate`);
  await page.waitForTimeout(1500);
  t("staff: no issue form", (await page.locator("[data-cert-form]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-cert: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
