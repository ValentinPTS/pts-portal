// Plan part 3.10 check (the calibration documents on M1), against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-m1-templates.mjs
// A new calibration scheme: its plan, invitation and instruction on M1's structure —
// M1's headings, its constant text with the fields filled, the decided wording, the
// scheme-specific points marked to fill; the instruction saved in the editor is not
// issued while marks are left; an older calibration scheme keeps its documents.
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
const get = async (path) => (await page.request.get(BASE + path)).text();
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;

try {
  await go("/dev/persona?role=manager");
  const sys = await get("/system");
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");
  await go("/files/calibration");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption({ index: 0 }); // a blank scheme
  await dialog.locator('input[name="name"]').fill(`М1 ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();

  const plan = await get(`/schemes/${S}/doc/plan/print?lang=bg`);
  t("the plan: M1's headings (1, 5, 13, 22)", ["1.</span> Вид на схемата за изпитване за пригодност", "5.</span> Брой и вид на очакваните участници", "13.</span> Докладване на резултатите", "22.</span> Контакти"].every((h) => plan.includes(h)));
  t("…M1's constant text, the late-results sentence as decided (Реш. 111)", plan.includes("Всеки участник получава <b>Окончателен доклад (Ф 7.4.3-1)</b>") && plan.includes("се приемат само чрез РТ провайдъра и това се записва") && !plan.includes("не се приемат корекции"));
  t("…a blank scheme's specific points marked to fill — not the testing sample's texts", (plan.match(/\[за попълване:/g) ?? []).length >= 5);
  const inv = await get(`/schemes/${S}/doc/invitation/print?lang=bg`);
  t("the invitation: 7 points, «Информация за услуги, доставени от външни доставчици» among them", inv.includes("7.</span> Контакти") && inv.includes("3.</span> Информация за услуги, доставени от външни доставчици"));
  t("…payment no condition for dispatch; the share the scheme's", inv.includes("Плащането не е условие за изпращане") && !inv.includes("Само участниците, които са платили") && inv.includes("50 % от обявената цена"));
  const ins = await get(`/schemes/${S}/doc/instruction/print?lang=bg`);
  t("the instruction: 11 points; the window the scheme's (3 days)", ins.includes("11.</span> Контакти") && ins.includes("максимум 3 работни дни"));

  t("the invitation's fee: the scheme's price, or a mark to fill — never the old «50 %» fee sentence", inv.includes("[за попълване: цената за участие") && !inv.includes("за всеки допълнителен лабораторен код"));

  // the scheme's own texts, in «Редактирай данните» (review)
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  const blocks = page.locator("[data-m1-texts]");
  for (let i = 0; i < 20 && !(await blocks.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await blocks.locator('[name="m1c_m1.instruction.3_bg"]').fill(`Манипулира се с ръкавици ${stamp}`);
  await blocks.locator('[name="m1c_m1.instruction.3_en"]').fill(`Handle with gloves ${stamp}`);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  const ins2 = await get(`/schemes/${S}/doc/instruction/print?lang=bg`);
  t("a point's text written in «Редактирай данните» is the instruction's point 3 — its mark gone", ins2.includes(`Манипулира се с ръкавици ${stamp}`) && (ins2.match(/\[за попълване:/g) ?? []).length === (ins.match(/\[за попълване:/g) ?? []).length - 1);

  // saved in the editor, then «Издай редакция»: refused while marks are left
  await go(`/schemes/${S}/build/instruction`);
  const ed = page.locator('[contenteditable="true"]').first();
  const starter = page.getByRole("button", { name: /Шаблон по подразбиране|Default template/ });
  await ed.or(starter).first().waitFor();
  if (await starter.isVisible()) await starter.click();
  await ed.waitFor();
  await page.waitForFunction(() => (document.querySelector('[contenteditable="true"]')?.innerText ?? "").trim().length > 0);
  await ed.click({ position: { x: 200, y: 40 } });
  await page.keyboard.type(" ");
  await page.getByRole("button", { name: /^Запази$/ }).click();
  await page.getByText(/Всичко е запазено|Запазено ✓/).first().waitFor();
  await go(`/schemes/${S}/editions?doc=instruction`);
  const form = page.locator("[data-issue-edition]");
  await form.locator("select").selectOption("instruction");
  await form.locator('button[type="submit"]').click();
  t("not issued while «за попълване» marks are left — said so", await waitFor(async () => /не е готов за издаване|not ready to issue/.test(await form.innerText())) && (await page.locator('[data-edition="instruction:1"]').count()) === 0, await form.innerText().catch(() => "?"));

  // an older calibration scheme keeps its documents
  const old = await get(`/schemes/25-06-C-1/doc/plan/print?lang=en`);
  t("a calibration scheme from before keeps its plan as it was", old.includes("Selection of method, measured quantity and calibration points") && !old.includes("[to be filled in:"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-m1-templates: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
