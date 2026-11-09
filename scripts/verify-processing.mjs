// Plan part 2.5 check (Реш. 140; П 7.4.1 т. 3), against a LOCAL dev server
// (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-processing.mjs
// The head gives the roles from the Order, then designates on the scheme's page who
// processes, reviews and approves. Two acts on one person ask for a written
// justification; the quality manager processing is reviewed by the authorised person
// from the Order, never by themselves. An expert sees it and cannot change it. On
// record: the journal and the change register.
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
page.on("dialog", (d) => d.accept());
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 30) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(300); } return false; };
const settle = async (el, set, want) => { for (let i = 0; i < 20; i++) { await set(); await page.waitForTimeout(150); if ((await el.inputValue()) === want) return; await page.waitForTimeout(300); } };

const stamp = Date.now();
const SCHEME = "26-01-T-1";
const ORDER = `№ ${String(stamp).slice(-3)} от 04.11.2026`;
const P = (k) => `${k}-${stamp}@example.test`;
const [QM, STAT, SM, AUTH] = [P("qm"), P("stat"), P("sm"), P("auth")];
const WHY = "В Заповедта е само един статистик за тази схема.";

try {
  await go("/dev/persona?role=manager");
  await go("/users");

  // 1. the people, and their roles from the Order
  const add = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  for (const [email, name] of [[QM, "Качество Проверка"], [STAT, "Статистик Проверка"], [SM, "Ръководител Проверка"], [AUTH, "Упълномощен Проверка"]]) {
    await add.waitFor();
    const mail = add.locator('input[type="email"]');
    for (let i = 0; i < 20; i++) { await mail.fill(email); if ((await mail.inputValue()) === email) break; await page.waitForTimeout(400); }
    await add.locator("input").nth(1).fill(name);
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-person="${email}"]`).count()) === 1);
  }
  await page.locator(`[data-person="${QM}"] [data-permanent]`).selectOption("quality");
  await page.waitForTimeout(1200);
  const assign = async (email, role) => {
    await go("/users");
    const f = page.locator("[data-assign-role]");
    await f.waitFor();
    const [who, scheme, what, ord] = [f.locator("select").nth(0), f.locator("select").nth(1), f.locator("select").nth(2), f.locator("input")];
    await settle(who, () => who.selectOption(email), email);
    await settle(scheme, () => scheme.selectOption(SCHEME), SCHEME);
    await settle(what, () => what.selectOption(role), role);
    await settle(ord, () => ord.fill(ORDER), ORDER);
    await f.locator('button[type="submit"]').click();
    return waitFor(async () => (await page.locator(`[data-person="${email}"] [data-held-role="${SCHEME}:${role}"]`).count()) === 1);
  };
  t("the Order: an authorised person for the review is a scheme role", await assign(AUTH, "reviewer"));
  await assign(STAT, "statistics_expert");
  await assign(SM, "scheme_manager");
  await assign(SM, "statistics_expert");
  t("…the others too", await assign(QM, "statistics_expert"));

  // 2. on the scheme's page: designate
  const panel = () => page.locator("[data-processing]");
  const designate = async (processor, reviewer, approver, why) => {
    await go(`/schemes/${SCHEME}`);
    await panel().locator("[data-processing-edit]").click();
    const form = panel().locator("[data-processing-form]");
    await form.waitFor();
    for (const [act, email] of [["process", processor], ["review", reviewer], ["approve", approver]]) {
      const sel = form.locator(`[data-pick="${act}"]`);
      await settle(sel, () => sel.selectOption(email), email);
    }
    if (why !== undefined) await form.locator("[data-justification]").fill(why);
    return form;
  };
  const designated = async (act) => (await panel().locator(`[data-act="${act}"] [data-designated]`).getAttribute("data-designated").catch(() => null));
  await go(`/schemes/${SCHEME}`);
  t("the scheme's page has the three acts", (await panel().count()) === 1);
  const offered = async (act) => panel().locator(`[data-pick="${act}"] option`).allTextContents();
  await panel().locator("[data-processing-edit]").click();
  await panel().locator("[data-processing-form]").waitFor();
  t("…offers to process only the experts of this scheme", (await offered("process")).some((o) => o.includes(STAT)) && !(await offered("process")).some((o) => o.includes(AUTH)));
  t("…to review the quality manager and the authorised person, each with the ground", (await offered("review")).some((o) => o.includes(QM) && /отговорник по качеството|quality manager/.test(o)) && (await offered("review")).some((o) => o.includes(AUTH) && /Заповедта|the Order/.test(o)));
  t("…to approve only the scheme manager", (await offered("approve")).some((o) => o.includes(SM)) && !(await offered("approve")).some((o) => o.includes(STAT)));

  let form = await designate(STAT, QM, SM);
  t("three different people: no warning, no justification asked", (await form.locator("[data-coincide-warning]").count()) === 0);
  await form.locator('button[type="submit"]').click();
  t("the head designates the three", await waitFor(async () => (await designated("process")) === STAT && (await designated("review")) === QM && (await designated("approve")) === SM));

  // 3. two acts on one person
  form = await designate(SM, QM, SM);
  t("one person processes and approves: the warning shows as it is chosen", (await form.locator("[data-coincide-warning]").count()) === 1 && /обработка и одобряване|processing and approval/.test(await form.locator("[data-coincide-warning]").innerText()));
  await form.locator("[data-justification]").fill("кратко");
  // past the browser's own length check: the portal's rule answers
  await form.locator("[data-justification]").evaluate((el) => { el.removeAttribute("minlength"); el.removeAttribute("required"); });
  await form.locator('button[type="submit"]').click();
  t("…too short a justification is refused by the portal", await waitFor(async () => /напишете обосновка/.test(await panel().locator('[role="alert"]').innerText().catch(() => ""))));
  t("…and nothing is saved", (await panel().locator("[data-processing-form]").count()) === 1);
  await form.locator("[data-justification]").fill(WHY);
  await form.locator('button[type="submit"]').click();
  t("…with a written justification it is, and the page shows it", await waitFor(async () => (await panel().locator("[data-processing-coincide]").count()) === 1 && (await panel().locator("[data-processing-coincide]").innerText()).includes(WHY)));
  t("…the earlier designation (this run's) stays on record", ((await panel().locator("[data-processing-history]").textContent().catch(() => "")) ?? "").includes(STAT));

  // 4. the quality manager processes
  form = await designate(QM, QM, SM, WHY);
  await form.locator('button[type="submit"]').click();
  t("the quality manager processes and reviews: refused, justification or not", await waitFor(async () => /Отговорникът по качеството обработва/.test(await panel().locator('[role="alert"]').innerText().catch(() => ""))));
  form = await designate(QM, AUTH, SM);
  await form.locator('button[type="submit"]').click();
  t("…the authorised person from the Order reviews", await waitFor(async () => (await designated("process")) === QM && (await designated("review")) === AUTH));
  t("…and the page says on what ground", /упълномощен със Заповедта|authorised by the Order/.test(await panel().locator('[data-act="review"]').innerText()));

  // 5. an expert sees it, and cannot change it
  await go(`/dev/persona?model=statistics_expert@${SCHEME}`);
  await go(`/schemes/${SCHEME}`);
  t("the statistics expert sees who processes, reviews and approves", await waitFor(async () => (await designated("review")) === AUTH));
  t("…and cannot change it", (await panel().locator("[data-processing-edit]").count()) === 0);

  // 6. a role from the Order ends: the designation no longer holds
  await go("/dev/persona?role=manager");
  await go("/users");
  await page.locator(`[data-person="${AUTH}"] [data-held-role="${SCHEME}:reviewer"] [data-end-role]`).click();
  await waitFor(async () => (await page.locator(`[data-person="${AUTH}"] [data-held-role="${SCHEME}:reviewer"]`).count()) === 0);
  await go(`/schemes/${SCHEME}`);
  t("the reviewer's role ended: the scheme's page says to designate again", await waitFor(async () => (await panel().locator("[data-processing-stale]").count()) === 1));
  await go("/system");
  t("…and so does the system check", await waitFor(async () => (await page.locator("span[data-processing-stale]").count()) === 1));

  // 7. on record
  await go(`/activity?scheme=${SCHEME}`);
  t("the journal has each designation (this run's)", await waitFor(async () => { const m = await page.locator("main").innerText(); return /Определени обработка, преглед и одобряване/.test(m) && m.includes(`processes ${QM}, reviews ${AUTH}`); }));
  await go("/changes");
  t("…and the change register, with the coincidence (this run's)", await waitFor(async () => (await page.locator("main").innerText()).includes(`обработва ${SM}, преглежда ${QM}, одобрява ${SM} — съвпадат обработка и одобряване`)));

  // 8. the same three again: nothing new on record
  await go("/dev/persona?role=manager");
  const count = async () => { await go(`/schemes/${SCHEME}`); return (await panel().locator("[data-processing-history] li").count()); };
  const n = await count();
  form = await designate(QM, QM, SM, WHY); // refused: changes nothing
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(800);
  t("a refused designation adds nothing to the record", (await count()) === n);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-processing: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
