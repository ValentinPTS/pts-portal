// Plan part 4.2 check (laboratories), against a LOCAL dev server (in-memory store,
// login off):   BASE=http://localhost:3000 node scripts/verify-laboratories.mjs
// Under a legal entity: a laboratory without a delivery address refused, the typing
// kept; two added, one a mobile office; one made inactive — still
// there; the entity inactive — no laboratory added or made active under it; on record
// without names.
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
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 53) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Лаб-ентитет ${stamp} ООД`, LAB1 = `Изпитвателна лаборатория ${stamp}`, LAB2 = `Подвижна лаборатория ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, mol: "", address: "София, ул. Тест 2" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  const addLab = async (name, address, mobile = false) => {
    for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
    const f = labs.locator('[data-lab-form="new"]');
    await f.locator('[name="name"]').fill(name);
    await f.locator('[name="deliveryAddress"]').fill(address);
    if (mobile) await f.locator('[name="mobileOffice"]').check();
    await f.locator('button[type="submit"]').click();
  };
  await addLab(LAB1, " ");
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').evaluate((el) => el.removeAttribute("required"));
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  t("a laboratory without its delivery address refused — the typing kept", await waitFor(async () => /адресът за доставка|delivery address/.test(await labs.locator("[data-lab-error]").innerText())) && (await labs.locator('[data-lab-form="new"] [name="name"]').inputValue()) === LAB1);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Пловдив, ул. Лаб 1");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB1 }).count()) === 1);
  await addLab(LAB2, "Варна, ул. Лаб 2", true);
  t("two laboratories under the entity, one a mobile office", await waitFor(async () => (await labs.locator("[data-lab]").count()) === 2) && /мобилен офис|mobile office/.test(await labs.locator("[data-lab]", { hasText: LAB2 }).innerText()));
  // one made inactive — still there
  await labs.locator("[data-lab]", { hasText: LAB1 }).locator('[data-lab-to="inactive"]').click();
  t("one made inactive — still there, nothing deleted", await waitFor(async () => (await labs.locator('[data-lab][data-lab-state="inactive"]', { hasText: LAB1 }).count()) === 1) && (await labs.locator("[data-lab]").count()) === 2);
  // the entity inactive: no laboratory added or made active under it
  await card.locator('[data-state-to="inactive"]').click();
  await waitFor(async () => (await card.locator('[data-entity-state="inactive"]').count()) === 1);
  t("the entity inactive: no new laboratory offered; none made active under it", (await labs.locator("[data-lab-new]").count()) === 0 && await labs.locator("[data-lab]", { hasText: LAB1 }).locator('[data-lab-to="active"]').isDisabled());
  await go("/activity");
  await page.getByText(/Laboratory added/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — added, made inactive — never a name", /Laboratory added to a legal entity/.test(journal) && /Laboratory: active → inactive/.test(journal) && !journal.includes(LAB1) && !journal.includes(LAB2));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-laboratories: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
