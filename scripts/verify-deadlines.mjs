// Plan part 3.4 check (deadlines; Zadanie §9, §11; А10; Реш. 154; Q14), against a LOCAL
// dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-deadlines.mjs
// The holiday calendar: the year's official days proposed and kept, one removed, one
// added. On a calibration scheme of its own: a results deadline with its hour, shown
// with its zone; the window set while preparing (then locked); opened and announced, a
// laboratory in it, past its deadline: overdue — said, nothing blocked; an extension
// with its order refused when not later, granted otherwise; in the chain the
// laboratory's window from its receipt, moved by a day off added on its last day, and
// by an extension; all on record.
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
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(typeof a === "string" ? a : undefined); });
const sofia = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const today = sofia(Date.now());
const yesterday = sofia(Date.now() - 86_400_000);
const year = Number(today.slice(0, 4));
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");

  // ── the holiday calendar ──
  await go(`/holidays?year=${year}`);
  const proposal = page.locator(`[data-holiday-proposal="${year}"]`);
  if (await proposal.count()) {
    await proposal.locator(`[data-holiday-propose="${year}"]`).click();
    await waitFor(async () => (await page.locator(`[data-holiday-proposal="${year}"]`).count()) === 0);
  }
  t(`the official holidays of ${year} kept in the calendar`, (await page.locator(`[data-holiday="${year}-12-25"]`).count()) === 1 && (await page.locator(`[data-holiday="${year}-03-03"]`).count()) === 1);
  answers.push(true);
  await page.locator(`[data-holiday-remove="${year}-03-03"]`).click();
  t("a day removed (it stays on record)", await waitFor(async () => (await page.locator(`[data-holiday="${year}-03-03"]`).count()) === 0));
  const addForm = page.locator("[data-holiday-add]");
  await addForm.locator('input[name="day"]').fill(`${year}-03-03`);
  await addForm.locator('input[name="name"]').fill("Ден на Освобождението на България");
  await addForm.locator('button[type="submit"]').click();
  t("…and added back by hand", await waitFor(async () => (await page.locator(`[data-holiday="${year}-03-03"]`).count()) === 1));

  // ── a calibration scheme of its own, being prepared ──
  await go("/files/calibration");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('input[name="name"]').fill(`Срокове ${Date.now()}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  // a results deadline with its hour — yesterday, so it is past once open
  await go(`/schemes/${S}`);
  const rd = page.locator('[data-date-key="resultsDue"]');
  const save = page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ });
  // typed until the panel has taken it (a fill before hydration is not seen by React)
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(yesterday); await page.waitForTimeout(400); }
  await rd.locator('input[type="time"]').fill("17:00");
  await page.waitForTimeout(300);
  await save.click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);
  await go(`/schemes/${S}`);
  t("the results deadline keeps its hour, shown with its zone", /, 17:00 EE?T/.test(await page.locator('[data-date-key="resultsDue"] [data-date-shown]').innerText()));

  // the window, while preparing: 2 working days
  const winInput = page.locator("[data-chain-window-days] input");
  await winInput.fill("2");
  await winInput.press("Tab");
  await page.waitForTimeout(1500);
  await go(`/schemes/${S}`);
  t("the window is set while the scheme is prepared", (await page.locator("[data-chain-window-days] input").inputValue()) === "2");

  // open, announce: the window locks
  for (const act of ["open", "announce"]) {
    await go(`/schemes/${S}#stages`);
    const before = await page.locator("[data-lifecycle] [data-state]").innerText();
    answers.push(true);
    if (act === "announce") answers.push("");
    await page.locator(`[data-act="${act}"]`).click();
    await waitFor(async () => (await page.locator("[data-lifecycle] [data-state]").innerText()) !== before);
  }
  await go(`/schemes/${S}`);
  t("once open, the window is locked", await page.locator("[data-chain-window-days] input").isDisabled());

  // a laboratory in it
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  const code = (await page.locator("tr", { hasText: "Демо лаборатория (dev)" }).first().locator("td").allInnerTexts()).map((x) => x.trim()).find((x) => /^\d{6,}$/.test(x));
  t("(the laboratory is a participant)", !!code, String(code));
  t("past its deadline, no results: overdue — on the list", (await page.locator("tr", { hasText: code }).locator("[data-overdue]").count()) === 1);
  await go(`/schemes/${S}/participants/${code}`);
  t("…and in its case file", (await page.locator('[data-deadline="resultsDue"]').getAttribute("data-state")) === "overdue");
  await go(`/dev/persona?role=lab`);
  await go("/lab");
  t("the laboratory is told the deadline passed — and nothing is blocked", /срокът е изтекъл; свържете се с PTS/.test(await page.locator("main").innerText()));
  await go("/dev/persona?role=manager");

  // an extension with its order: refused when not later, granted otherwise
  const extend = async (key, day, hour, orderNo) => {
    await go(`/schemes/${S}/participants/${code}`);
    const f = page.locator("[data-extension-form]");
    await f.locator('select[name="key"]').selectOption(key);
    await f.locator('input[name="day"]').fill(day);
    if (hour) await f.locator('input[name="hour"]').fill(hour);
    await f.locator('input[name="orderNo"]').fill(orderNo);
    await f.locator('input[name="orderDate"]').fill(today);
    await f.locator('textarea[name="reason"]').fill("Закъснял куриер на участника");
    answers.push(true);
    await f.locator('button[type="submit"]').click();
    return f;
  };
  const early = await extend("resultsDue", sofia(Date.now() - 3 * 86_400_000), "", "5");
  t("an extension earlier than the deadline is refused, the typing kept", await waitFor(async () => /по-късен|later/.test(await early.locator("[data-extension-error]").innerText())) && (await early.locator('input[name="orderNo"]').inputValue()) === "5");
  const until = sofia(Date.now() + 7 * 86_400_000);
  await extend("resultsDue", until, "12:00", "6");
  t("granted: the deadline is its own now, open again", await waitFor(async () => (await page.locator('[data-deadline="resultsDue"]').getAttribute("data-state")) === "open") && /удължен по Заповед № 6/.test(await page.locator('[data-deadline="resultsDue"]').innerText()));
  await go(`/schemes/${S}/participants`);
  t("…the list says extended, no longer overdue", (await page.locator("tr", { hasText: code }).locator("[data-extended]").count()) === 1 && (await page.locator("tr", { hasText: code }).locator("[data-overdue]").count()) === 0);
  await go(`/dev/persona?role=lab`);
  await go("/lab");
  t("…the laboratory sees its new deadline and the order", new RegExp(`${dmy(until).replace(/\./g, "\\.")}, 12:00 EE?T — удължен по Заповед № 6`).test(await page.locator("main").innerText()));
  await go("/dev/persona?role=manager");

  // ── the chain: the window from the laboratory's own receipt ──
  await go(`/schemes/${S}`);
  const panel = page.locator('div:has(> div > span:text-is("Веригата")), div:has(> div > span:text-is("The chain"))').first();
  const rows = panel.locator("ol > li");
  for (let i = 0; i < 20 && (await rows.count()) === 0; i++) { await panel.locator("select").first().selectOption(code).catch(() => {}); await page.waitForTimeout(500); }
  answers.push(true, true, true);
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).click();
  await panel.getByRole("button", { name: /Запази реда|Save the order/ }).waitFor({ state: "detached" });
  await panel.getByRole("button", { name: /Изпратих уреда|I have sent it/ }).click();
  await panel.getByText(/изпратен|sent/).first().waitFor();
  await go(`/dev/persona?role=lab`);
  await go("/lab");
  const arrived = page.locator(`[data-lab-card="${S}"]`).getByRole("button", { name: /Уредът пристигна при мен|The device has arrived/ });
  await arrived.waitFor();
  answers.push(true);
  await arrived.click();
  await page.locator(`[data-lab-card="${S}"] [data-chain-window]`).waitFor();
  t("the laboratory holding it: its window, 2 working days from its receipt", /Срок за предаване: \d{2}\.\d{2}\.\d{4} \(2 работни дни от получаването\)/.test(await page.locator(`[data-lab-card="${S}"] [data-chain-window]`).innerText()));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  const dueText = async () => (await page.locator(`[data-chain-due="${code}"]`).innerText()).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const d1 = await dueText();
  t("PTS sees the laboratory's window in the chain", !!d1);
  // a day off added on its last day moves it to the next working day
  const lastDay = `${d1[3]}-${d1[2]}-${d1[1]}`;
  await go(`/holidays?year=${d1[3]}`);
  const af = page.locator("[data-holiday-add]");
  await af.locator('input[name="day"]').fill(lastDay);
  await af.locator('input[name="name"]').fill("Проверка: обявен почивен ден");
  await af.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-holiday="${lastDay}"]`).count()) === 1);
  await go(`/schemes/${S}`);
  const d2 = await dueText();
  t("a day off on its last day moves the window to the next working day", !!d2 && `${d2[3]}-${d2[2]}-${d2[1]}` > lastDay);
  // the window extended, with its order
  // ten days past the window as it stands (earlier runs on this server add days off)
  const winUntil = sofia(Date.UTC(Number(d2[3]), Number(d2[2]) - 1, Number(d2[1]), 12) + 10 * 86_400_000);
  await extend("chain", winUntil, "", "9");
  t("the window extended by its order", await waitFor(async () => /удължен по Заповед № 9/.test(await page.locator('[data-deadline="chain"]').innerText())));
  await go(`/dev/persona?role=lab`);
  await go("/lab");
  t("…the laboratory sees it", /удължен по Заповед № 9/.test(await page.locator(`[data-lab-card="${S}"] [data-chain-window]`).innerText()));
  await go("/dev/persona?role=manager");

  // ── on record; the laboratory's notices wait in «Известия» ──
  await go(`/activity?scheme=${S}`);
  await page.getByText(/extended to/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("the journal: the window and both extensions, by code", /Calibration window: 2 working days/.test(journal) && new RegExp(`${code}: the results deadline extended to ${until}T12:00 by Order No\\. 6`).test(journal) && new RegExp(`${code}: the calibration window extended to ${winUntil} by Order No\\. 9`).test(journal));
  await go("/notices");
  t("the laboratory's notices of its extensions wait in «Известия»", (await page.locator("[data-held]").filter({ hasText: /удължен до .* по Заповед № 6/ }).count()) > 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-deadlines: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
