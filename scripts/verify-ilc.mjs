// Plan part 7.9 check (the ILC comparison report), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-ilc.mjs
// An ILC scheme (outside the accreditation) with a laboratory's own participation: processing, its
// comparison report uploaded by hand (not from 2.0) BEFORE the approval — the act needs no transfer
// check and no u(x_pt) confirmation; R1 «uploaded — no module version». The laboratory, once paid, reads
// exactly that file under «Доклад от междулабораторното сравнение». A corrected file uploaded by hand
// is issued as R2 with its reason and scope.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const answers = [], alerts = [];
page.on("dialog", async (d) => { if (d.type() === "alert") alerts.push(d.message()); const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ILC ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();
const stage = (no) => page.locator(`[data-lifecycle] [data-stage="${no}"]`);
const tick = async (S, no) => { await go(`/schemes/${S}#stages`); answers.push(""); await page.locator(`[data-tick="${no}"]`).click(); await waitFor(async () => (await stage(no).getAttribute("data-done")) === "1"); };
const upload = async (S, buffer, name) => {
  await go(`/schemes/${S}`);
  const r = page.locator('[data-doc-row="report"]');
  await r.waitFor();
  // no file yet: «Качи»; a file there: «⋯» → «Замени файла»
  const direct = r.locator("button", { hasText: /^＋ (Качи|Upload)$/ });
  const opener = async () => {
    if (await direct.count()) return direct.first().click();
    await r.locator('button[aria-label="More"]').click();
    return page.locator("button", { hasText: /Замени файла|Replace file/ }).first().click();
  };
  // a click before the page is interactive opens nothing: tried again (a flake seen in the gates, 8.3)
  let chooser = null;
  for (let i = 0; i < 3 && !chooser; i++) {
    [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 20000 }).catch(() => null), opener().catch(() => null)]);
    if (!chooser) await page.waitForTimeout(1000);
  }
  if (!chooser) throw new Error("the upload's file chooser never opened");
  await chooser.setFiles({ name, mimeType: "application/pdf", buffer });
  return waitFor(async () => (await r.innerText()).includes(name));
};
const ILC1 = pdf("R1"), ILC2 = pdf("R2");

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── an ILC scheme, with a laboratory's own participation ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('select[name="kind"]').selectOption("ILC");
  await dialog.locator('input[name="name"]').fill(`ILC доклад ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  t("setup: an ILC scheme (its number «ILC …»)", /^ILC-\d{2}-\d{2}-NA-T-/.test(S), S);
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await state()); }, 10);
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40);
  if ((await page.locator("[data-coding-run]").count()) > 0) {
    answers.push(true);
    await page.locator("[data-coding-run]").click();
    await waitFor(async () => { await go(`/schemes/${S}#stages`); return (await stage(9).getAttribute("data-done")) === "1"; }, 30);
  }
  await go(`/schemes/${S}#stages`);
  answers.push(true, `Обработката започва — ILC ${stamp}`);
  await page.locator('[data-act="process"]').click();
  t("setup: the ILC in processing", await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await state()); }, 20));

  // ── the comparison report, uploaded by hand — before the approval ──
  t("the comparison report uploaded by hand (not from 2.0)", await upload(S, ILC1, `ilc-report-${stamp}.pdf`));
  await go(`/schemes/${S}#report-issue`);
  t("the card: «Издаване на доклада от междулабораторното сравнение» — the hand report accepted for an ILC; not ready before the approval", /междулабораторното сравнение/.test(await textOf(page.locator("#report-issue h2"))) && (await page.locator('[data-ready-report="hand"]').count()) === 1 && (await page.locator('[data-issue-ready="no"]').count()) === 1);
  for (const no of [14, 15, 16]) await tick(S, no);
  // a replacement under the approval: refused (7.2's rule — review)
  const a0 = alerts.length;
  await upload(S, pdf("late"), `ilc-late-${stamp}.pdf`).catch(() => false);
  t("…a report replaced under the review or approval: refused, said — the approved file stays", await waitFor(async () => alerts.slice(a0).some((m) => /одобрена|reviewed or approved/.test(m)), 20) && /ilc-report-\d+\.pdf/.test(await textOf(page.locator('[data-doc-row="report"]'))));
  await go(`/schemes/${S}#report-issue`);
  t("…approved: ready — no transfer check, no u(x_pt) asked", (await page.locator('[data-issue-ready="yes"]').count()) === 1 && (await page.locator('[data-ready-uxpt]').count()) === 0);
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="report"]').click();
  t("the act: the comparison report issued", await waitFor(async () => { await go(`/schemes/${S}`); return (await state()) === "Докладът е издаден"; }, 20));
  await go(`/schemes/${S}#report-issue`);
  t("R1 «uploaded by hand — no module version»", (await page.locator('[data-issue="R1"]').count()) === 1 && /качен на ръка|uploaded by hand/.test(await textOf(page.locator('[data-issue="R1"] [data-issue-version]'))));
  const codeL = await page.locator("[data-recipient]").first().getAttribute("data-recipient");
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: «ILC comparison report R1 issued — uploaded by hand»", /ILC comparison report R1 issued — uploaded by hand/.test(act));

  // ── the laboratory, once paid ──
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeL)}`);
  const box = page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]');
  await box.check();
  await waitFor(async () => box.isChecked());
  await page.waitForTimeout(1200);
  await go("/dev/persona?role=lab");
  const rep = await page.request.get(`${BASE}/lab/doc/${S}/report`);
  await go("/lab");
  const pid = await page.locator(`[data-lab-card="${S}"] [data-open-participation]`).getAttribute("data-open-participation");
  t("the laboratory reads exactly the uploaded file — listed as «Доклад от междулабораторното сравнение R1», no module version", rep.status() === 200 && Buffer.from(await rep.body()).equals(ILC1) && /Доклад от междулабораторното сравнение R1(?! ·)/.test(await textOf(page.locator(`[data-lab-card="${S}"]`))));
  await go(`/lab/p/${pid}`);
  t("…its participation's page: the card «Доклад от междулабораторното сравнение» — never «Окончателен доклад»", /Доклад от междулабораторното сравнение/.test(await page.locator("[data-lab-report-card]").innerText()) && !/Окончателен доклад/.test(await page.locator("[data-lab-report-card]").innerText()));

  // ── a correction: another file uploaded by hand ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#report-issue`);
  t("a correction waits for another file", (await page.locator("[data-correction-form]").count()) === 0);
  t("…the corrected report uploaded by hand", await upload(S, ILC2, `ilc-report-2-${stamp}.pdf`));
  await go(`/schemes/${S}#report-issue`);
  const cf = page.locator("[data-correction-form]");
  await cf.locator('input[name="reason"]').fill("Грешка в таблица 2");
  await cf.locator('input[name="scope"]').fill("Таблица 2 — средната стойност");
  await cf.locator("[data-correction-submit]").click();
  t("R2 issued — uploaded by hand, with its reason", await waitFor(async () => /ri=corrected/.test(page.url()) && (await page.locator('[data-issue="R2"]').count()) === 1) && /качен на ръка|uploaded by hand/.test(await textOf(page.locator('[data-issue="R2"] [data-issue-version]'))) && /Грешка в таблица 2/.test(await textOf(page.locator('[data-issue="R2"]'))));
  await go("/dev/persona?role=lab");
  t("the laboratory now gets R2 — the corrected file", Buffer.from(await (await page.request.get(`${BASE}/lab/doc/${S}/report`)).body()).equals(ILC2));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-ilc: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
