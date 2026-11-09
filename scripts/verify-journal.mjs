// Plan part 1.9 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-journal.mjs
// What a manager does lands in «Дневник»: opening a page that shows the names
// behind the codes, a download, a role change with its before → after. (Sign-in
// and sign-out need the real login — the test environment of 1.2.)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("BASE must be a local dev server"); process.exit(2); }
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
const journal = async (action) => {
  await go(`/activity?action=${encodeURIComponent(action)}`);
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 }).catch(() => {}); // a streamed page
  return page.locator("tbody tr").allInnerTexts();
};

try {
  await go("/dev/persona?role=manager");

  // the code ↔ laboratory link: opening the participants list (a manager sees names)
  // — names are shown only when there is somebody: add one first
  await go("/schemes/26-01-T-1/participants");
  const add = page.locator('form:has(input[name="labName"])').last();
  const labName = `Journal lab ${Date.now()}`;
  await add.locator('input[name="labName"]').fill(labName);
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${labName}`);
  await go("/schemes/26-01-T-1/participants");
  await page.waitForSelector(`text=${labName}`);
  let rows = await journal("names.viewed");
  t("opening the participants list is in the journal", rows.some((r) => /participants list/.test(r) && /26-01-T-1/.test(r)), rows.slice(0, 2).join(" | "));
  t("…with its subject", rows.some((r) => /page:participants/.test(r)));

  // a download through a gate
  // 26-01-T-1: verify-data-safety archives 25-06-C-1, so it may be gone on a shared server
  const pack = await page.request.get(`${BASE}/schemes/26-01-T-1/audit-pack`);
  t("the audit pack downloads", pack.status() === 200, String(pack.status()));
  rows = await journal("file.downloaded");
  t("…and the download is in the journal", rows.some((r) => /audit pack exported/i.test(r) && /26-01-T-1/.test(r)), rows.slice(0, 2).join(" | "));

  // a role change: before → after
  await go("/users");
  const stamp = Date.now();
  const form = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  const mail = form.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(`role-${stamp}@example.test`); if ((await mail.inputValue()) === `role-${stamp}@example.test`) break; await page.waitForTimeout(400); }
  await form.locator("input").nth(1).fill("Role Check");
  await form.locator('button[type="submit"]').click();
  const row = page.locator("[data-users-table] tr", { hasText: `role-${stamp}@example.test` }); // the accounts table (2.2)
  await row.waitFor();
  await row.locator("select").selectOption("auditor");
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(300); if ((await journal("role.changed")).some((r) => r.includes(`role-${stamp}`))) break; }
  rows = await journal("role.changed");
  const mine = rows.find((r) => r.includes(`role-${stamp}`)) ?? "";
  t("a role change is in the journal", !!mine, rows.slice(0, 2).join(" | "));
  t("…with before → after", /role: staff → auditor/.test(mine), mine);
  t("…and its subject", /staff:/.test(mine), mine);

  // failed writes: none here, and the system check says so
  await go("/system");
  await page.locator("[data-journal-health]").waitFor({ timeout: 30000 }).catch(() => {}); // a streamed page
  t("the system check shows failed journal writes (none here)", /(Неуспешни записи в дневника|Journal entries that failed)\s*(няма|none)/.test(await page.locator("main").innerText()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-journal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
