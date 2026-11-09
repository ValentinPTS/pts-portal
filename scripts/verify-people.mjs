// Plan part 1.6 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-people.mjs
// office@ptsbg.eu is a shared mailbox (Реш. 139): neither it nor any sub-address of
// it can be added as a team member or a laboratory; one address is one role; the 2FA
// reset (Реш. 95) is not offered without login.
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

try {
  await go("/dev/persona?role=manager");
  const text = async () => page.locator("main").innerText();
  // one add form, fresh each time (a refusal stays on the page until a reload)
  const tryAdd = async (kind, email, expect) => {
    await go("/users");
    // the add forms: the first is a team member, the second a laboratory (controlled inputs)
    const form = page.locator("form").filter({ has: page.locator('input[type="email"]') }).nth(kind === "staff" ? 0 : 1);
    await form.waitFor();
    const mail = form.locator('input[type="email"]');
    for (let i = 0; i < 20; i++) { await mail.fill(email); if ((await mail.inputValue()) === email) break; await page.waitForTimeout(400); }
    await form.locator("input").nth(1).fill("Check");
    await form.locator('button[type="submit"]').click();
    let said = "";
    for (let i = 0; i < 30 && !expect.test(said); i++) { await page.waitForTimeout(300); said = await text(); }
    return expect.test(said);
  };
  const SHARED = /общ адрес|shared mailbox/;
  // office@ — and any sub-address of it — as a team member, then as a laboratory: refused
  for (const email of ["office@ptsbg.eu", "office+lab@ptsbg.eu"]) {
    for (const kind of ["staff", "lab"]) {
      t(`${email} is refused as ${kind === "staff" ? "a team member" : "a laboratory"}`, await tryAdd(kind, email, SHARED));
    }
  }
  await go("/users");
  t("no account was made for it", !/office(\+lab)?@ptsbg\.eu/.test(await page.locator("[data-users-table]").innerText()));
  // one address, one role: a team member's address is no laboratory, and the other way round
  const stamp = Date.now();
  t("a team member is added", await tryAdd("staff", `member-${stamp}@example.test`, new RegExp(`member-${stamp}@example\\.test`)));
  t("…and that address is refused as a laboratory", await tryAdd("lab", `member-${stamp}@example.test`, /team member|служител|PTS team/));
  t("a laboratory is added", await tryAdd("lab", `lab-${stamp}@example.test`, new RegExp(`lab-${stamp}@example\\.test`)));
  t("…and that address is refused as a team member", await tryAdd("staff", `lab-${stamp}@example.test`, /belongs to a laboratory/));
  t("no 2FA reset without login (it is the head's, signed in)", (await page.locator("[data-reset-2fa]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-people: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
