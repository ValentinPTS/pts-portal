// Plan part 2.2 check (Реш. 141), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-provider-people.mjs
// The head of the PT provider adds a metrologist without the developer: adds the
// person, sets the permanent role, gives a scheme role from the Order, ends it — each
// in the journal and the change register. The refusals of the role model (2.1) show
// on the page; a deactivation ends the person's scheme roles; staff cannot open it.
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
page.on("dialog", (d) => d.accept()); // «Прекрати», «Деактивирай»: confirmed
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 30) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(300); } return false; };

const stamp = Date.now();
const EMAIL = `metrolog-${stamp}@example.test`;
const SCHEME = "26-01-T-1";
const ORDER = `№ ${String(stamp).slice(-3)} от 03.11.2026`;

try {
  await go("/dev/persona?role=manager");
  await go("/users");
  const row = () => page.locator(`[data-person="${EMAIL}"]`);
  const people = () => page.locator("[data-provider-people]");
  const alert = async () => (await people().locator('[role="alert"]').count()) ? people().locator('[role="alert"]').innerText() : "";

  // 1. the head adds the person (the team member form)
  const add = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  await add.waitFor();
  const mail = add.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(EMAIL); if ((await mail.inputValue()) === EMAIL) break; await page.waitForTimeout(400); }
  await add.locator("input").nth(1).fill("Метролог Проверка");
  await add.locator('button[type="submit"]').click();
  t("the head adds a metrologist", await waitFor(async () => (await row().count()) === 1));

  // 2. the permanent role
  await row().locator("[data-permanent]").selectOption("quality");
  await page.waitForTimeout(1200);
  await go("/users");
  t("…sets the permanent role, and it stays", (await row().locator("[data-permanent]").inputValue()) === "quality");

  // 3. a role in a scheme, from the Order
  // controlled fields: set until the value holds (a reload hydrates after the first paint)
  const settle = async (el, set, want) => { for (let i = 0; i < 20; i++) { await set(); await page.waitForTimeout(150); if ((await el.inputValue()) === want) return; await page.waitForTimeout(300); } };
  const assign = async (role, order) => {
    const f = page.locator("[data-assign-role]");
    await f.waitFor();
    const [who, scheme, what, ord] = [f.locator("select").nth(0), f.locator("select").nth(1), f.locator("select").nth(2), f.locator("input")];
    await settle(who, () => who.selectOption(EMAIL), EMAIL);
    await settle(scheme, () => scheme.selectOption(SCHEME), SCHEME);
    await settle(what, () => what.selectOption(role), role);
    await settle(ord, () => ord.fill(order), order);
    await f.locator('button[type="submit"]').click();
  };
  await assign("technical_expert", ORDER);
  const held = (role) => row().locator(`[data-held-role="${SCHEME}:${role}"]`);
  t("…gives a scheme role from the Order", await waitFor(async () => (await held("technical_expert").count()) === 1));
  t("…and the row names the Order", (await held("technical_expert").innerText()).includes(ORDER));

  // 4. the role model's refusals, on the page
  await assign("technical_expert", ORDER);
  t("a role held is not given twice", await waitFor(async () => /вече има тази роля/.test(await alert())));
  await go("/users");
  await assign("coding_expert", "   ");
  t("a role with no Order is refused", await waitFor(async () => /Посочете Заповедта/.test(await alert())));
  await go("/users");
  await row().locator("[data-permanent]").selectOption("software_admin");
  t("nobody becomes the software administrator while holding a scheme role", await waitFor(async () => /прекратете ролите/.test(await alert())));
  await go("/users");
  t("…and the permanent role is unchanged", (await row().locator("[data-permanent]").inputValue()) === "quality");

  // 5. ended, never deleted
  await held("technical_expert").locator("[data-end-role]").click();
  t("the head ends the role", await waitFor(async () => (await held("technical_expert").count()) === 0));
  await row().locator("[data-permanent]").selectOption("software_admin");
  await page.waitForTimeout(1200);
  await go("/users");
  t("…then the software administrator role is allowed", (await row().locator("[data-permanent]").inputValue()) === "software_admin");
  const options = await page.locator("[data-assign-role] select").first().locator("option").allTextContents();
  t("…and the software administrator is not offered a scheme role", !options.some((o) => o.includes(EMAIL)));
  await row().locator("[data-permanent]").selectOption("");
  await page.waitForTimeout(1200);
  await go("/users");

  // 6. a deactivation ends the person's scheme roles
  await assign("coding_expert", ORDER);
  await waitFor(async () => (await held("coding_expert").count()) === 1);
  const staffRow = page.locator("[data-users-table] tr", { hasText: EMAIL });
  await staffRow.locator("button").filter({ hasText: /Деактивирай|Deactivate/ }).click();
  t("deactivating the person ends their scheme roles", await waitFor(async () => { await go("/users"); return (await held("coding_expert").count()) === 0; }, 8));

  // 7. on record: the journal and the change register
  await go("/activity");
  // a streamed page: wait for its rows before reading
  const inJournal = async () => { const j = await page.locator("main").innerText(); return /Възложена роля в схема/.test(j) && /Прекратена роля в схема/.test(j) && /Сменена постоянна роля/.test(j); };
  t("the journal has the assignment, the ending and the permanent role", await waitFor(inJournal));
  await go("/changes");
  t("…and the change register too (rule 7)", await waitFor(async () => (await page.locator("main").innerText()).includes(`${EMAIL} — Експерт по събиране и кодиране на данните`)));

  // 8. not a staff member's page
  await go("/dev/persona?role=staff");
  await go("/users");
  await page.waitForTimeout(800);
  t("a staff member cannot open «Потребители»", !page.url().includes("/users") || (await page.locator("[data-provider-people]").count()) === 0, page.url());
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-provider-people: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
