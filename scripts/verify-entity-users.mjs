// Plan part 4.3 check (a legal entity's users), against a LOCAL dev server (in-memory
// store, login off):   BASE=http://localhost:3000 node scripts/verify-entity-users.mjs
// Under a legal entity: a login that does not read refused, the typing kept; the first
// user its profile's administrator, «поканен»; a second, a user; the same login again
// refused; the last administrator not made inactive; the user made inactive and back;
// on record without names or e-mails.
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
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 71) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Хора ${stamp} ООД`, A = `Админ ${stamp}`, B = `Потребител ${stamp}`;
const mailA = `admin${stamp}@lab-test.bg`, mailB = `user${stamp}@lab-test.bg`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, mol: "", address: "София, ул. Хора 3" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const box = card.locator("[data-entity-users]");
  const addUser = async (name, email) => {
    for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
    const f = box.locator('[data-user-form="new"]');
    await f.locator('[name="name"]').fill(name);
    await f.locator('[name="email"]').fill(email);
    await f.locator('button[type="submit"]').click();
  };
  // an address the browser lets through but the portal does not read (no domain ending)
  await addUser(A, `admin${stamp}@lab`);
  t("a login that does not read refused — the typing kept", await waitFor(async () => /не се разчита|does not read/.test(await textOf(box.locator("[data-user-error]")))) && (await box.locator('[data-user-form="new"] [name="name"]').inputValue()) === A);
  await box.locator('[data-user-form="new"] [name="email"]').fill(mailA);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  const ua = box.locator("[data-user]", { hasText: A });
  t("the first user: the profile's administrator, «поканен»", await waitFor(async () => (await ua.count()) === 1) && (await ua.getAttribute("data-user-role")) === "admin" && (await ua.getAttribute("data-user-state")) === "invited");
  await addUser(B, mailB);
  const ub = box.locator("[data-user]", { hasText: B });
  t("a second: a user", await waitFor(async () => (await ub.count()) === 1) && (await ub.getAttribute("data-user-role")) === "user");
  await addUser(`${B} 2`, mailA.toUpperCase());
  t("the same login again — in any case — refused", await waitFor(async () => /вече е вход|already another user/.test(await textOf(box.locator("[data-user-error]")))));
  await ua.locator('[data-user-to="inactive"]').click();
  t("the last administrator not made inactive", await waitFor(async () => /поне с един активен администратор|at least one active profile administrator/.test(await textOf(box.locator("[data-user-error]")))) && (await ua.getAttribute("data-user-state")) === "invited");
  await ub.locator('[data-user-to="inactive"]').click();
  t("a user made inactive — still there", await waitFor(async () => (await ub.getAttribute("data-user-state")) === "inactive"));
  await ub.locator('[data-user-to="active"]').click();
  t("…and back — «поканен», no sign-in yet", await waitFor(async () => (await ub.getAttribute("data-user-state")) === "invited"));
  await go("/activity");
  await page.getByText(/Participant's user/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — entered, the states — never a name or an e-mail", /Participant's user entered — profile administrator/.test(journal) && /Participant's user: invited → inactive/.test(journal) && !journal.includes(A) && !journal.includes(mailA) && !journal.includes(mailB));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-entity-users: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
