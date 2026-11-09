// Plan part 4.1 check (legal entities), against a LOCAL dev server (in-memory store,
// login off):   BASE=http://localhost:3000 node scripts/verify-entities.mjs
// A legal entity entered from a PDF application: a ЕИК that fails its check digit
// refused, the typing kept; entered, «чака проверка»; PTS's check needs VIES or a
// document first; a real PDF attached, opened only through the gated route; checked
// and made active; inactive — never deleted; on record without its name.
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
let promptAnswer = "";
page.on("dialog", (d) => (d.type() === "prompt" ? d.accept(promptAnswer) : d.accept()));
const stamp = Date.now() % 100000;
// a valid 9-digit ЕИК: the 8 digits of the stamp and their check digit
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 37) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const bad = eik.slice(0, 8) + ((Number(eik[8]) + 1) % 10);
const NAME = `Тест Лаб ${stamp} ООД`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  await nf.waitFor();
  const fill = async (o = {}) => { const v = { name: NAME, country: "BG", eik: bad, vat: "", mol: "Иван Иванов", address: "София, ул. Тест 1", ...o }; for (const [k, val] of Object.entries(v)) await nf.locator(`[name="${k}"]`).fill(val); };
  await fill();
  await nf.locator('button[type="submit"]').click();
  t("a ЕИК that fails its check digit refused — the typing kept", await waitFor(async () => /ЕИК не е валиден|not valid/.test(await page.locator("[data-entity-new] [data-entity-error]").innerText())) && (await nf.locator('[name="name"]').inputValue()) === NAME);
  await nf.locator('[name="eik"]').fill(eik);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: NAME });
  t("entered — «чака проверка»", await waitFor(async () => (await card.count()) === 1) && (await card.locator('[data-entity-state="pending"]').count()) === 1);
  t("…PTS's check needs VIES or a document first", await card.locator("[data-manual-check]").isDisabled());
  t("…and it cannot be made active before", await card.locator('[data-state-to="active"]').isDisabled());
  const pdf = Buffer.from(`%PDF-1.4\n% entity ${stamp}\n%%EOF\n`);
  await card.locator('[data-entity-proof] input[type="file"]').setInputFiles({ name: "extract.pdf", mimeType: "application/pdf", buffer: pdf });
  await card.locator('[data-entity-proof] button[type="submit"]').click();
  t("a document attached", await waitFor(async () => (await card.locator("[data-proof-link]").count()) === 1));
  const href = await card.locator("[data-proof-link]").getAttribute("href");
  const r = await page.request.get(BASE + href);
  t("…opened only through the gated route: the same bytes, private, not cached", r.status() === 200 && Buffer.from(await r.body()).equals(pdf) && /no-store/.test(r.headers()["cache-control"] ?? ""));
  promptAnswer = "проверено по извлечение";
  await card.locator("[data-manual-check]").click();
  t("PTS's check: who and when, with its note", await waitFor(async () => (await card.locator('[data-manual="1"]').count()) === 1 && /проверено по извлечение/.test(await card.innerText())));
  await card.locator('[data-state-to="active"]').click();
  t("…then active", await waitFor(async () => (await card.locator('[data-entity-state="active"]').count()) === 1));
  await card.locator('[data-state-to="inactive"]').click();
  t("inactive — and still there, nothing deleted", await waitFor(async () => (await card.locator('[data-entity-state="inactive"]').count()) === 1));
  // the same ЕИК again: the same company
  await fill({ eik, name: `${NAME} 2` });
  await nf.locator('button[type="submit"]').click();
  t("the same ЕИК again refused — the same company", await waitFor(async () => /вече има юридическо лице|already a legal entity/.test(await page.locator("[data-entity-new] [data-entity-error]").innerText())));
  await go("/activity");
  await page.getByText(/Legal entity/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — entered, the document, the check, the states — never its name", /Legal entity entered \(from a PDF application\)/.test(journal) && /Legal entity: a document attached/.test(journal) && /Legal entity: checked by PTS/.test(journal) && /Legal entity: pending → active/.test(journal) && !journal.includes(NAME));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-entities: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
