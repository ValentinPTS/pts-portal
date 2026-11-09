// Plan part 0.10 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-chain.mjs
// PTS stamps every stop of a calibration chain itself — the reference laboratory
// before the round, two laboratories, the reference laboratory after — with the
// date, the time and how it knows. Each arrival is offered only at the stop that is
// due, every step lands in the laboratory's case file with its time, and once the
// device is back nothing more can be stamped. On a calibration scheme of its own (the
// compression sample): the demo scheme is past processing, and a chain no longer
// changes then (3.2).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let S = "";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const get = async (path) => (await page.request.get(BASE + path, { timeout: 90000 })).text();
const TIME = /\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/;

try {
  await go("/dev/persona?role=manager");
  await go("/files/calibration");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("compression-machine");
  await dialog.locator('input[name="name"]').fill(`Верига ${Date.now() % 100000}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  S = new URL(page.url()).pathname.split("/").pop();

  // two laboratories in the scheme
  const codes = [];
  for (const n of [1, 2]) {
    await go(`/schemes/${S}/participants`);
    const add = page.locator('form:has(input[name="labName"])').last();
    const NAME = `Chain lab ${n} ${Date.now()}`;
    await add.locator('input[name="labName"]').fill(NAME);
    await add.locator('button[type="submit"]').click();
    await page.waitForSelector(`text=${NAME}`);
    const row = page.locator("tr", { hasText: NAME }).first();
    const code = (await row.locator("td").allInnerTexts()).map((s) => s.trim()).find((s) => /^\d{6,}$/.test(s));
    codes.push(code);
  }
  t("two participants to route the device through", codes.every(Boolean), codes.join(","));
  const [A, B] = codes;

  // the chain: reference before, A, B, reference after
  await go(`/schemes/${S}`);
  const panel = page.locator('div:has(> div > span:text-is("Веригата")), div:has(> div > span:text-is("The chain"))').first();
  const rows = panel.locator("ol > li");
  const refBtn = panel.getByRole("button", { name: /реферативна лаборатория|reference laboratory/ });
  // retried until the page has hydrated — an early click does nothing
  for (let i = 0; i < 20 && (await rows.count()) === 0; i++) { await refBtn.click(); await page.waitForTimeout(500); }
  for (const c of [A, B]) await panel.locator("select").first().selectOption(c);
  await refBtn.click();
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).click();
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).waitFor({ state: "detached" });
  t("four stops: reference, A, B, reference", (await rows.count()) === 4);
  t("the first reference stop says «before the round»", /преди кръга|before the round/.test(await rows.nth(0).innerText()));
  t("the last reference stop says «after the round»", /след кръга|after the round/.test(await rows.nth(3).innerText()));

  const arrive = panel.getByRole("button", { name: /Отбележи получаване|Record arrival/ });
  const handOn = panel.getByRole("button", { name: /Отбележи предаване|Record handover/ });
  t("nothing can be stamped before PTS has sent the device", (await arrive.count()) === 0 && (await handOn.count()) === 0);

  await panel.getByRole("button", { name: /Изпратих уреда|I have sent it/ }).click();
  await arrive.first().waitFor();
  t("once sent, an arrival is offered — at the leading reference stop only",
    (await arrive.count()) === 1 && (await rows.nth(0).getByRole("button", { name: /Отбележи получаване|Record arrival/ }).count()) === 1);

  // stamp one step through the inline form
  const stamp = async (rowIdx, which, source, note = "") => {
    const row = rows.nth(rowIdx);
    await row.getByRole("button", { name: which === "in" ? /Отбележи получаване|Record arrival/ : /Отбележи предаване|Record handover/ }).click();
    const form = row.locator("[data-chain-stamp]");
    await form.locator('select[name="source"]').selectOption(source);
    if (note) await form.locator('input[name="note"]').fill(note);
    await form.getByRole("button", { name: /^(Запиши|Record)$/ }).click();
    await form.waitFor({ state: "detached" });
  };

  // a form without a source is refused in the browser, before anything is sent
  await rows.nth(0).getByRole("button", { name: /Отбележи получаване|Record arrival/ }).click();
  let alerted = "";
  page.once("dialog", (d) => { alerted = d.message(); });
  await rows.nth(0).locator("[data-chain-stamp]").getByRole("button", { name: /^(Запиши|Record)$/ }).click();
  await page.waitForTimeout(300);
  t("a stamp needs to say how PTS knows", /откъде|how you know/i.test(alerted), alerted);
  await rows.nth(0).locator("[data-chain-stamp]").getByRole("button", { name: /Откажи|Cancel/ }).click();

  const back = panel.getByRole("button", { name: /Уредът се върна при мен|The device is back with me/ });
  t("the device cannot be marked back while stops are open", await back.isDisabled());

  let confirmed = "";
  page.once("dialog", (d) => { confirmed = d.message(); });
  await stamp(0, "in", "phone");
  t("before recording, PTS is shown the exact time, as Bulgarian time",
    /\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} \((българско време|Bulgarian time)\)/.test(confirmed), confirmed);
  const r0 = await rows.nth(0).innerText();
  t("the reference stop is stamped, with date AND time", TIME.test(r0), r0);
  t("…and shows it was PTS, by phone", /PTS, по телефона|PTS, by phone/.test(r0), r0);
  t("while the reference holds it, the next lab cannot be stamped as arrived",
    (await rows.nth(1).getByRole("button", { name: /Отбележи получаване|Record arrival/ }).count()) === 0);

  await stamp(0, "out", "courier", "waybill 4711");
  t("the reference stop handed on — arrival → handover", /→/.test(await rows.nth(0).innerText()));
  await stamp(1, "in", "email");
  await stamp(1, "out", "phone");
  await stamp(2, "in", "protocol");
  await stamp(2, "out", "in_person");
  await stamp(3, "in", "phone");
  await stamp(3, "out", "courier");
  t("all four stops stamped — the trailing reference included",
    (await Promise.all([0, 1, 2, 3].map(async (i) => /→/.test(await rows.nth(i).innerText())))).every(Boolean));
  t("nothing left to stamp", (await arrive.count()) === 0 && (await handOn.count()) === 0);
  t("…and now the device can be marked back", !(await back.isDisabled()));

  // the case files carry each step with its time
  const caseA = await get(`/schemes/${S}/participants/${A}`);
  t("A's case file: the device was sent on to it, timed", /device sent on to this laboratory \d{2}:\d{2}/.test(caseA));
  t("A's case file: it received the device, timed, recorded by PTS by e-mail",
    /device received \d{2}:\d{2} \(calibration chain\) — recorded by PTS, by e-mail/.test(caseA));
  t("A's case file: it handed the device on, timed", /device handed on \d{2}:\d{2}/.test(caseA));
  t("A's case file never names the next laboratory's code", !caseA.includes(B));
  const caseB = await get(`/schemes/${S}/participants/${B}`);
  t("B's case file never names the previous laboratory's code", !caseB.includes(A));
  t("PTS's own note stays on the stamped stop only", !caseA.includes("waybill 4711") && !caseB.includes("waybill 4711"));

  // the journal
  const act = await get(`/activity`);
  t("the journal records PTS's stamps", /PTS отбеляза спирка от веригата|PTS recorded a chain stop/.test(act));

  // the device comes back: the chain closes
  await back.click();
  await panel.getByText(/върнат на|returned/).first().waitFor();
  t("the return is shown with date and time", TIME.test(await panel.getByText(/върнат на|returned/).first().innerText()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-chain: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
