// Plan part 0.13 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-uhint.mjs
// The staff scoring screen says under «u(xᵢ)» that it takes the STANDARD
// uncertainty, U/k (finding N16) — labs report the expanded U at k = 2, and ζ is
// fed this column. Calibration's «U_lab» is the expanded U Eₙ wants: no hint there.
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

const addLab = async (scheme) => {
  await go(`/schemes/${scheme}/participants`);
  const add = page.locator('form:has(input[name="labName"])').last();
  const name = `U hint lab ${Date.now()}`;
  await add.locator('input[name="labName"]').fill(name);
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${name}`);
};

try {
  await go("/dev/persona?role=manager");

  await addLab("26-01-T-1");
  await go("/schemes/26-01-T-1/results");
  const hint = page.locator("[data-u-hint]").first();
  await hint.waitFor();
  t("testing: «стандартна, = U/k» under u(xᵢ)", /стандартна, = U\/k|standard, = U\/k/.test(await hint.innerText()));
  const th = page.locator("th", { has: page.locator("[data-u-hint]") }).first();
  t("…with the full explanation on hover", /u = U\/2.*по-добра|u = U\/2.*looks better/.test((await th.getAttribute("title")) ?? ""));

  await addLab("25-06-C-1");
  await go("/schemes/25-06-C-1/results");
  await page.getByText("U_lab").first().waitFor();
  t("calibration: no hint under U_lab (Eₙ takes the expanded U)", (await page.locator("[data-u-hint]").count()) === 0);
  const uLab = page.locator("th", { hasText: "U_lab" }).first();
  t("…and its hover says: expanded, do not divide", /не я делете|do not divide/.test((await uLab.getAttribute("title")) ?? ""));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-uhint: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
