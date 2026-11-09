// Plan part 1.11 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-changes.mjs
// «Регистър на промените»: a release proposed with its commit, then authorised; an
// update rejected with a reason; a setting changed in the portal (a person's role)
// in the register by itself; the system check links it and says there is no commit
// locally. (Authorising is the head's with login on; locally the build persona.)
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

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
const stamp = Date.now().toString(16).slice(-7);
const commit = randomBytes(20).toString("hex"); // a whole commit, 40 characters

try {
  await go("/dev/persona?role=manager");
  await go("/changes");
  await page.locator("[data-propose] summary").click();
  const form = page.locator("[data-propose] form");
  // a release without its commit is refused
  await form.locator('input[name="title"]').fill(`Портал ${stamp}`);
  await form.locator('textarea[name="what"]').fill("Регистърът на промените");
  await form.locator('textarea[name="validation"]').fill("типове, lint, 40 набора, build");
  await form.getByRole("button", { name: /Предложи|Propose/ }).click();
  await page.waitForURL(/error=commit/, { timeout: 20000 }).catch(() => {});
  t("a release without its commit is refused", /error=commit/.test(page.url()), page.url());

  await page.locator("[data-propose] summary").click();
  await form.locator('input[name="title"]').fill(`Портал ${stamp}`);
  await form.locator('textarea[name="what"]').fill("Регистърът на промените");
  await form.locator('textarea[name="validation"]').fill("типове, lint, 40 набора, build");
  await form.locator('input[name="ref"]').fill(commit);
  await form.getByRole("button", { name: /Предложи|Propose/ }).click();
  await page.waitForURL(/proposed=1/, { timeout: 20000 }).catch(() => {});
  const row = page.locator("tr", { hasText: `Портал ${stamp}` });
  await row.waitFor();
  t("a release proposed: «предложена», with its whole commit", /предложена|proposed/.test(await row.innerText()) && (await row.innerText()).includes(commit));
  await row.locator("[data-authorise]").click();
  await page.waitForURL(/authorised=1/, { timeout: 20000 }).catch(() => {});
  const after = page.locator("tr", { hasText: `Портал ${stamp}` });
  await after.waitFor();
  t("…authorised: «разрешена», by whom", /разрешена|authorised/.test(await after.innerText()) && /build/.test(await after.innerText()));
  t("…and it can no longer be decided again", (await after.locator("[data-authorise]").count()) === 0);

  // a setting changed in the portal: in the register by itself
  await go("/users");
  const add = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  const mail = add.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(`reg-${stamp}@example.test`); if ((await mail.inputValue()) === `reg-${stamp}@example.test`) break; await page.waitForTimeout(400); }
  await add.locator("input").nth(1).fill("Register Check");
  await add.locator('button[type="submit"]').click();
  await page.locator("[data-users-table] tr", { hasText: `reg-${stamp}@example.test` }).waitFor(); // the accounts table (2.2)
  await go("/changes");
  await page.locator("[data-changes] tbody tr").first().waitFor();
  const setting = page.locator("tr", { hasText: `reg-${stamp}@example.test` });
  t("a person added: in the register by itself, as a setting «в употреба»", (await setting.count()) >= 1 && /настройка|setting/.test(await setting.first().innerText()) && /в употреба|in use/.test(await setting.first().innerText()));

  // the system check links it; locally there is no commit
  await go("/system");
  await page.locator("[data-system=\"flags\"]").waitFor();
  const sys = await page.locator("main").innerText();
  t("the system check: the release, and a link to the register", /(Версия на портала|The portal's release)\s*(локално — без commit|local — no commit)/.test(sys) && (await page.getByRole("link", { name: /Отвори|Open/ }).count()) >= 1);

  // not for staff to propose or decide
  await go("/dev/persona?role=staff");
  await go("/changes");
  await page.locator("[data-changes]").waitFor();
  t("staff read the register, but cannot propose or decide", (await page.locator("[data-propose]").count()) === 0 && (await page.locator("[data-authorise]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-changes: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
