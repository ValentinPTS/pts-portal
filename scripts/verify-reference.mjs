// Plan part 5.7 check (the reference values per point; Zadanie X_ref = (X_ref1 + X_ref2)/2,
// u_stab = |X_ref1 − X_ref2|/(2√3); D3: 2.0's «Calibration» sheet), against a LOCAL dev
// server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-reference.mjs
// A calibration scheme of its own with two points: a value that is not a number is refused,
// naming the point and the field, nothing saved; a table saved is version 1, X_ref and u_stab
// shown; the same table again is no new version; a stale form after someone else's save is
// refused; the journal has it; a testing scheme has no reference values.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", async (d) => { await d.accept(); });
const stamp = Date.now() % 100000;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a calibration scheme with two points
  await go("/files/calibration");
  const dialog = page.locator('form:has(select[name="sample"]), form:has(input[name="name"])').filter({ has: page.getByRole("button", { name: /Създай проект|Create project/ }) });
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('input[name="name"]').fill(`Референтни ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  const pts = page.locator("#cal-pts");
  await pts.waitFor();
  for (let i = 0; i < 20 && (await pts.inputValue()) !== "20, 40"; i++) { await pts.fill(""); await pts.fill("20, 40"); await page.waitForTimeout(300); }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");

  await go(`/schemes/${S}`);
  t("the scheme's page links its reference values", (await page.locator(`[data-reference-link] a[href="/schemes/${S}/reference"]`).count()) === 1);
  await go(`/schemes/${S}/reference`);
  const rows = page.locator("[data-reference-row]");
  t("the table: one row per calibration point", await waitFor(async () => (await rows.count()) === 2));
  const k1 = await rows.nth(0).getAttribute("data-reference-row"), k2 = await rows.nth(1).getAttribute("data-reference-row");
  t("…nothing yet: everything missing for 2.0", (await attr(page.locator("[data-reference-missing]"), "data-reference-missing")) === "2/2/2");
  t("…what «u (other)» holds is asked of PTS, said so", (await page.locator("[data-u-other-note]").count()) === 1);

  // a value that is not a number: refused, naming the point and the field — nothing saved,
  // what was typed kept (review)
  const form = page.locator("[data-reference-form]");
  await form.locator(`input[name="xBefore__${k1}"]`).fill("0,012");
  await form.locator(`input[name="xAfter__${k2}"]`).fill("1,234.5");
  await form.locator('button[type="submit"]').click();
  await page.locator("[data-reference-err]").waitFor();
  t("a value that is not a number: refused, the point and the field named, nothing saved", (await attr(page.locator("[data-reference-err]"), "data-reference-err")) === "value" && /40/.test(await page.locator("[data-reference-err]").innerText()) && /Грешка след|Error after/.test(await page.locator("[data-reference-err]").innerText()) && (await page.locator("[data-reference-versions]").count()) === 0);
  t("…what was typed stays; the field marked", (await page.locator(`input[name="xBefore__${k1}"]`).inputValue()) === "0,012" && (await page.locator(`input[name="xAfter__${k2}"]`).getAttribute("aria-invalid")) === "true");
  // k other than 2 without its reason: refused
  await page.locator(`input[name="xAfter__${k2}"]`).fill("");
  await page.locator(`input[name="k__${k1}"]`).fill("3");
  await page.locator('[data-reference-form] button[type="submit"]').click();
  t("k other than 2 without its reason: refused (Zadanie: k = 2 unless justified)", await waitFor(async () => (await attr(page.locator("[data-reference-err]"), "data-reference-err")) === "kreason"));

  // the table saved: version 1; X_ref and u_stab shown (in errors)
  await go(`/schemes/${S}/reference`);
  const f2 = page.locator("[data-reference-form]");
  for (const [n, v] of [[`xBefore__${k1}`, "0,012"], [`xAfter__${k1}`, "0,018"], [`uCal__${k1}`, "0,004"], [`k__${k1}`, "2"], [`xBefore__${k2}`, "-0,02"]]) await f2.locator(`input[name="${n}"]`).fill(v);
  // a second tab, opened now — its form will be stale after this save
  const page2 = await context.newPage();
  await page2.goto(`${BASE}/schemes/${S}/reference`, { waitUntil: "domcontentloaded" });
  await Promise.all([page.waitForURL(/ok=1/, { timeout: 90000 }), f2.locator('button[type="submit"]').click()]);
  t("saved as version 1", (await attr(page.locator("[data-reference-ok]"), "data-reference-ok")) === "1" && (await attr(page.locator("[data-reference-versions]"), "data-reference-versions")) === "1");
  t("…X_ref = (before + after)/2 and u_stab = |before − after|/(2√3), in errors — for PTS's eye", (await attr(page.locator(`[data-reference-row="${k1}"] [data-xref]`), "data-xref")) === "0.015" && Math.abs(Number(await attr(page.locator(`[data-reference-row="${k1}"] [data-ustab]`), "data-ustab")) - 0.006 / (2 * Math.sqrt(3))) < 1e-6);
  t("…a negative error kept as such", (await page.locator(`input[name="xBefore__${k2}"]`).inputValue()) === "-0.02");
  t("…still missing for 2.0: the second point's «after» and u (calibration)", (await attr(page.locator("[data-reference-missing]"), "data-reference-missing")) === "0/1/1");
  // the same again: no new version
  await Promise.all([page.waitForURL(/ok=same/, { timeout: 90000 }), page.locator('[data-reference-form] button[type="submit"]').click()]);
  t("the same table again: no new version", (await attr(page.locator("[data-reference-versions]"), "data-reference-versions")) === "1");
  // the stale tab: refused, nothing overwritten
  await page2.locator(`[data-reference-form] input[name="xBefore__${k2}"]`).fill("99");
  await page2.locator('[data-reference-form] button[type="submit"]').click();
  t("a stale form after someone else's save: refused — nothing overwritten", await (async () => { for (let i = 0; i < 40; i++) { if ((await page2.locator('[data-reference-err="moved"]').count()) === 1) return true; await page2.waitForTimeout(400); } return false; })());
  await page2.close();
  await go(`/schemes/${S}/reference`);
  t("…the values stand as saved", (await page.locator(`input[name="xBefore__${k2}"]`).inputValue()) === "-0.02");

  // a point changed in the scheme's editor: its values kept, shown as no longer in the scheme
  await go(`/schemes/${S}/edit`);
  const pts2 = page.locator("#cal-pts");
  await pts2.waitFor();
  for (let i = 0; i < 20 && (await pts2.inputValue()) !== "20, 50"; i++) { await pts2.fill(""); await pts2.fill("20, 50"); await page.waitForTimeout(300); }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");
  await go(`/schemes/${S}/reference`);
  t("a point changed in the editor: its values kept and shown «no longer in the scheme» — never moved onto the new point", (await page.locator(`[data-orphan="${k2}"]`).count()) === 1 && (await page.locator(`[data-reference-row="${k1}"]`).count()) === 1 && (await page.locator(`input[name="xBefore__${k1}"]`).inputValue()) === "0.012");

  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("the journal: the version and how many points changed", /Reference values per point: version 1 — 2 point\(s\) changed/.test(act));
  const tScheme = await (await page.request.get(`${BASE}/schemes/26-01-T-1/reference`)).text();
  t("a testing scheme has no reference values", tScheme.includes("data-no-reference"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-reference: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
