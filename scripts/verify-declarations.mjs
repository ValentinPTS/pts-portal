// Plan part 2.8 check (E17, Ф 4.2-1), against a LOCAL dev server (in-memory store,
// login off):   BASE=http://localhost:3000 node scripts/verify-declarations.mjs
// The head records a person's signed confidentiality declaration — the date and the
// scan — on «Потребители»; the scan opens through its gated route, and not for a
// staff member; a fake PDF is refused; signed again, the earlier one stays; the system
// check names who holds a role with none on record; all of it in the journal.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SCHEME = process.env.SCHEME ?? "26-01-T-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 30) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(300); } return false; };
const settle = async (el, set, want) => { for (let i = 0; i < 20; i++) { await set(); await page.waitForTimeout(150); if ((await el.inputValue()) === want) return; await page.waitForTimeout(300); } };

const stamp = Date.now();
const P = `decl-${stamp}@example.test`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const people = () => page.locator("[data-provider-people]");
const alert = async () => (await people().locator('[role="alert"]').count()) ? people().locator('[role="alert"]').innerText() : "";

try {
  await go("/dev/persona?role=manager");
  await go("/users");
  const add = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  await add.waitFor();
  const mail = add.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(P); if ((await mail.inputValue()) === P) break; await page.waitForTimeout(400); }
  await add.locator("input").nth(1).fill("Декларация Проверка");
  await add.locator('button[type="submit"]').click();
  const row = () => page.locator(`[data-person="${P}"]`);
  await waitFor(async () => (await row().count()) === 1);
  t("a new person: no declaration on record", (await row().locator("[data-declaration]").getAttribute("data-declaration")) === "none");

  // a role from the Order — so the system check asks for the declaration
  await go("/users");
  const f = page.locator("[data-assign-role]");
  const [who, scheme, what, ord] = [f.locator("select").nth(0), f.locator("select").nth(1), f.locator("select").nth(2), f.locator("input")];
  await settle(who, () => who.selectOption(P), P);
  await settle(scheme, () => scheme.selectOption(SCHEME), SCHEME);
  await settle(what, () => what.selectOption("statistics_expert"), "statistics_expert");
  await settle(ord, () => ord.fill("№ 8 от 04.11.2026"), "№ 8 от 04.11.2026");
  await f.locator('button[type="submit"]').click();
  await waitFor(async () => (await row().locator(`[data-held-role="${SCHEME}:statistics_expert"]`).count()) === 1);
  await go("/system");
  t("the system check names one with a role and no declaration", await waitFor(async () => (await page.locator("[data-no-declaration]").innerText().catch(() => "")).includes(P)));
  const rowLabel = /С роля, без декларация Ф 4\.2-1|With a role, no declaration Ф 4\.2-1/;

  const record = async (signedOn, file) => {
    await go("/users");
    const form = page.locator("[data-record-declaration]");
    await form.waitFor();
    const sel = form.locator("select");
    await settle(sel, () => sel.selectOption(P), P);
    const date = form.locator('input[type="date"]');
    await settle(date, () => date.fill(signedOn), signedOn);
    await form.locator('input[type="file"]').setInputFiles(file);
    await form.locator('button[type="submit"]').click();
  };
  // a "PDF" that is not one
  await record(day(30), { name: "f.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
  t("a file that is not a real PDF is refused", await waitFor(async () => /не е истински/.test(await alert())));

  await record(day(30), { name: "Ф-4-2-1.pdf", mimeType: "application/pdf", buffer: PDF });
  t("the head records it: the date shows on the person's row", await waitFor(async () => { await go("/users"); return (await row().locator("[data-declaration]").getAttribute("data-declaration")) === day(30); }, 10));
  const href = await row().locator("[data-declaration-scan]").getAttribute("href");
  const scan = await page.request.get(BASE + href);
  t("…its scan opens through the portal's route, the same bytes", scan.status() === 200 && /application\/pdf/.test(scan.headers()["content-type"] ?? "") && (await scan.body()).subarray(0, 8).toString() === "%PDF-1.4" && /no-store/.test(scan.headers()["cache-control"] ?? ""), `status ${scan.status()}`);

  await record(day(1), { name: "Ф-4-2-1-again.pdf", mimeType: "application/pdf", buffer: PDF });
  t("signed again: the new date in force, the earlier one kept", await waitFor(async () => { await go("/users"); const c = row().locator("[data-declaration]"); return (await c.getAttribute("data-declaration")) === day(1) && /по-ранни: 1|earlier: 1/.test(await c.innerText()); }, 10));
  await go("/system");
  t("…and the system check no longer names them (its row still there)", await waitFor(async () => { const m = await page.locator("main").innerText(); return rowLabel.test(m) && !m.includes(P); }));

  // not for anyone else
  for (const persona of ["role=staff", "role=auditor", `model=scheme_manager@${SCHEME}`]) {
    await go(`/dev/persona?${persona}`);
    const other = await page.request.get(BASE + href);
    t(`${persona}: cannot open someone's declaration`, other.status() === 403 || other.url().includes("denied"), `status ${other.status()}`);
  }
  // one who manages laboratory accounts but not PTS's people: no declaration dates at all
  const users = await page.request.get(BASE + "/users");
  t("a scheme manager on «Потребители» sees no declarations column", users.status() === 200 && !(await users.text()).includes("data-declaration="));
  await go("/dev/persona?role=manager");

  // voided when recorded by mistake: in force for nobody, the earlier one is
  await go("/users");
  page.once("dialog", (d) => d.accept("Записана с грешна дата."));
  await row().locator("[data-void-declaration]").click();
  t("the head voids the one in force, with a reason: the earlier one is in force again", await waitFor(async () => { await go("/users"); const c = row().locator("[data-declaration]"); return (await c.getAttribute("data-declaration")) === day(30) && /анулирани: 1|voided: 1/.test(await c.innerText()); }, 10));

  // on record
  await go("/activity");
  t("the journal: each record, each opening of the scan, and the voiding with its reason", await waitFor(async () => { const m = await page.locator("main").innerText(); return m.includes(`Ф 4.2-1 of ${P}`) && m.includes(`The signed Ф 4.2-1 of ${P} opened`) && m.includes("voided: Записана с грешна дата."); }));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-declarations: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
