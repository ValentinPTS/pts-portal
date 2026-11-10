// Plan part 7.4 check (the issue act, R1/R2, D7, who received which, the software record), against a
// LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-issue.mjs
// A testing scheme with three participations — A (paid before the act), B (opened by hand) and a
// laboratory's own L (paid after the act). Processing, an export and 2.0's report, the three ticks: the
// act refused without the transfer check; with it — R1, with 2.0.3 and the software record. The report
// reaches A at the act; L only once its payment is marked (403 before, with its words) — and L is told;
// B by hand, its reason never in the journal. A correction R2 (2.0.4) with its reason, scope and code:
// the laboratory then gets R2. 7.5: the laboratory's own report card in each state — awaiting, R1
// with its version, «not opened yet», the file behind «Отвори» and «Изтегли», its first opening on
// Sofia's day; L sent nothing — N/R said instead of scores; after R2 the correction said, R1 listed as
// replaced with no link.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();
const stage = (no) => page.locator(`[data-lifecycle] [data-stage="${no}"]`);
const tick = async (S, no) => { await go(`/schemes/${S}#stages`); answers.push(""); await page.locator(`[data-tick="${no}"]`).click(); await waitFor(async () => (await stage(no).getAttribute("data-done")) === "1"); };
const NAME_A = `Издаване А ${stamp}`, NAME_B = `Издаване Б ${stamp}`;
const BG1 = pdf("BG1"), BG2 = pdf("BG2");
const importReport = async (S, version, buf) => {
  await go(`/schemes/${S}#analysis-import`);
  const f = page.locator("[data-import-form]");
  await f.locator('input[name="version"]').fill(version);
  await f.locator('input[name="report-bg"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: buf });
  await f.locator("[data-import-submit]").click();
  return waitFor(async () => /imp=ok/.test(page.url()), 30);
};
const checkSame = async (S) => {
  await go(`/schemes/${S}#processing-record`);
  await page.locator('[data-transfer-form] input[value="yes"]').check();
  await page.locator("[data-transfer-form] [data-transfer-submit]").click();
  return waitFor(async () => /tc=ok/.test(page.url()), 30);
};
const markPaid = async (S, code) => {
  await go(`/schemes/${S}/participants/${encodeURIComponent(code)}`);
  const box = page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]');
  await box.check();
  await waitFor(async () => box.isChecked());
  await page.waitForTimeout(1200);
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── a testing scheme: A and B by PTS, L a laboratory's own ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Издаване ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const refs = {};
  for (const n of [NAME_A, NAME_B]) {
    await go(`/schemes/${S}/participants`);
    const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
    await add.locator('[name="labName"]').fill(n);
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(n));
    refs[n] = (await page.locator("[data-participant-row]", { hasText: n }).locator("td").first().innerText()).trim();
  }
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
  answers.push(true);
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1, 60);
  const codeA = await page.locator(`[data-coded-from="${refs[NAME_A]}"]`).getAttribute("data-coded");
  const codeB = await page.locator(`[data-coded-from="${refs[NAME_B]}"]`).getAttribute("data-coded");
  answers.push(true, `Обработката започва — издаване ${stamp}`);
  await page.locator('[data-act="process"]').click();
  t("setup: A and B coded; the scheme in processing", !!codeA && !!codeB && await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await state()); }, 20));
  await markPaid(S, codeA);

  // ── 2.0's report (before the review — 7.2); the act refused without the transfer check ──
  t("exported to 2.0", (await page.request.get(`${BASE}/schemes/${S}/export/analysis`)).status() === 200);
  t("2.0's report imported (2.0.3)", await importReport(S, "2.0.3", BG1));
  await go(`/schemes/${S}#report-issue`);
  t("the card before the act: not approved yet ✗, 2.0.3's report ✓, the transfer check ✗ — not ready", (await page.locator('[data-ready-approved="0"]').count()) === 1 && (await page.locator('[data-ready-report="1"]').count()) === 1 && (await page.locator('[data-ready-check="no-check"]').count()) === 1 && (await page.locator('[data-issue-ready="no"]').count()) === 1);
  for (const no of [14, 15, 16]) await tick(S, no);
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="report"]').click();
  t("«Издай окончателния доклад» refused without the transfer check — said", await waitFor(async () => /проверка на преноса|transfer check/i.test(await textOf(page.locator("[data-lifecycle-error]")))) && (await state()) !== "Докладът е издаден");
  t("the transfer check «the same» recorded", await checkSame(S));
  await go(`/schemes/${S}#report-issue`);
  t("…now ready", (await page.locator('[data-issue-ready="yes"]').count()) === 1);
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="report"]').click();
  t("the act: the report issued", await waitFor(async () => { await go(`/schemes/${S}`); return (await state()) === "Докладът е издаден"; }, 20));

  // ── R1 ──
  await go(`/schemes/${S}#report-issue`);
  const sw = (await page.locator('[data-issue="R1"] [data-software-record]').textContent()) ?? "";
  t("R1 on the card — with PTS_Analysis 2.0.3 and the scheme's software record (releases, configuration, templates, 2.0)", (await page.locator('[data-issue="R1"]').count()) === 1 && /2\.0\.3/.test(await textOf(page.locator('[data-issue="R1"] [data-issue-version]'))) && /PTS_Analysis: 2\.0\.3/.test(sw) && /Издания на портала|Portal releases/.test(sw) && /Версия на конфигурацията|Configuration version/.test(sw) && /Редакции на шаблоните|Template editions/.test(sw), sw);
  const allCodes = await page.locator("[data-recipient]").evaluateAll((els) => els.map((e) => e.getAttribute("data-recipient")));
  const codeL = allCodes.find((c) => c !== codeA && c !== codeB);
  t("who received which: three on the final list; A paid at the act — received R1; B and L not yet", allCodes.length === 3 && !!codeL && (await page.locator(`[data-recipient="${codeA}"][data-recipient-access="paid"] [data-recipient-received="R1"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeB}"][data-recipient-access="none"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeL}"][data-recipient-access="none"]`).count()) === 1);
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: R1 issued, with the version", /Final report R1 issued — PTS_Analysis 2\.0\.3/.test(act));

  // ── D7: L (the laboratory's own) — not yet; its payment marked: reached, and told ──
  await go("/dev/persona?role=lab");
  const before = await page.request.get(`${BASE}/lab/doc/${S}/report`);
  const beforeText = await before.text();
  await go("/lab");
  t("the laboratory, unpaid: the report refused (403, «once your payment is marked») — its page says so too", before.status() === 403 && /payment is marked/.test(beforeText) && /плащането|payment/.test(await textOf(page.locator("[data-report-awaiting]").first())), `${before.status()} ${beforeText}`);
  const pidL = await page.locator(`[data-lab-card="${S}"] [data-open-participation]`).getAttribute("data-open-participation");
  await go(`/lab/p/${pidL}`);
  t("7.5 — its participation's page: «Окончателен доклад» awaiting the payment, nothing to open", (await page.locator('[data-lab-report="awaiting"] [data-report-awaiting]').count()) === 1 && (await page.locator("[data-lab-report-open]").count()) === 0);
  await go("/dev/persona?role=manager");
  await markPaid(S, codeL);
  await go(`/schemes/${S}#report-issue`);
  t("L marked paid after the act: the report reaches it — received R1, and it was told (a notice raised)", (await page.locator(`[data-recipient="${codeL}"][data-recipient-access="paid"] [data-recipient-received="R1"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeL}"] [data-recipient-told="R1"]`).count()) === 1);
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidL}`);
  t("7.5 — reached: the card shows R1, not opened yet", (await page.locator('[data-lab-report="reached"] [data-lab-report-current="R1"]').count()) === 1 && (await page.locator('[data-lab-report-opened="0"]').count()) === 1);
  const after = await page.request.get(`${BASE}/lab/doc/${S}/report`);
  await go("/lab");
  t("…the laboratory now reads exactly 2.0's file — listed as R1 with 2.0.3", after.status() === 200 && Buffer.from(await after.body()).equals(BG1) && /R1.*2\.0\.3/.test(await page.locator("body").innerText()));
  await go(`/lab/p/${pidL}`);
  const openHref = await page.locator("[data-lab-report-open]").getAttribute("href");
  const dlHref = await page.locator("[data-lab-report-download]").getAttribute("href");
  const viaOpen = await page.request.get(BASE + openHref), viaDl = await page.request.get(BASE + dlHref);
  t("7.5 — the card: R1 · PTS_Analysis 2.0.3, issued; «Отвори» and «Изтегли» serve exactly 2.0's file (the download as an attachment)", /PTS_Analysis 2\.0\.3/.test(await textOf(page.locator('[data-lab-report="reached"] [data-lab-report-current="R1"]'))) && Buffer.from(await viaOpen.body()).equals(BG1) && Buffer.from(await viaDl.body()).equals(BG1) && /attachment/.test(viaDl.headers()["content-disposition"] ?? ""));
  await go(`/lab/p/${pidL}`);
  const sofiaDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()).replace(/\//g, ".");
  t("…its first opening shown, on Sofia's day; L sent no results — N/R at the lock: «no scores for you», never a scores line (Реш. 135)", (await page.locator('[data-lab-report-opened="1"]').count()) === 1 && (await textOf(page.locator('[data-lab-report-opened="1"]'))).includes(sofiaDay) && (await page.locator("[data-lab-report-nr]").count()) === 1 && (await page.locator("[data-lab-report-scores]").count()) === 0 && (await page.locator("[data-lab-report-correction], [data-lab-report-earlier]").count()) === 0);

  // ── B: opened by hand, with a reason — never in the journal ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#report-issue`);
  const hand = page.locator("[data-hand-open]");
  await hand.locator('select[name="code"]').selectOption(codeB);
  await hand.locator('input[name="reason"]').fill(`Държавна институция — по бюджет ${stamp}`);
  await hand.locator("[data-hand-open-submit]").click();
  t("B opened by hand, with its reason — received R1; nobody to tell (no account), said", await waitFor(async () => /ri=opened/.test(page.url())) && (await page.locator(`[data-recipient="${codeB}"][data-recipient-access="hand"] [data-recipient-received="R1"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeB}"] [data-recipient-told=""]`).count()) === 1);
  const journal = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("…the journal says it was opened by hand — never the reason's words", /opened for .* by hand/.test(journal) && !journal.includes(`по бюджет ${stamp}`));
  t("…and L's opening is on record", (await page.locator(`[data-recipient="${codeL}"] [data-recipient-opened="R1"]`).count()) === 1);

  // ── a correction R2 ──
  t("a corrected report from 2.0 (2.0.4) imported while the report is issued", await importReport(S, "2.0.4", BG2));
  await go(`/dev/persona?role=lab`);
  t("…it reaches nobody until the correction is issued — the laboratory still gets R1", Buffer.from(await (await page.request.get(`${BASE}/lab/doc/${S}/report`)).body()).equals(BG1));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#report-issue`);
  t("…no correction before its transfer check", (await page.locator("[data-correction-form]").count()) === 0 && (await page.locator('[data-correction-waiting="no-check"]').count()) === 1);
  await checkSame(S);
  await go(`/schemes/${S}#report-issue`);
  const cf = page.locator("[data-correction-form]");
  await cf.locator('input[name="reason"]').fill("а");
  await cf.locator('input[name="scope"]').fill("Таблица 3");
  await cf.locator("[data-correction-submit]").click();
  t("a correction without its reason — refused, said", await waitFor(async () => /ri=reason/.test(page.url())) && /причината|reason/.test(await textOf(page.locator("[data-issue-answer]"))));
  await go(`/schemes/${S}#report-issue`);
  await page.locator('[data-correction-form] input[name="reason"]').fill("Грешна единица в таблица 3");
  await page.locator('[data-correction-form] input[name="scope"]').fill("Таблица 3 — kg/m³ вместо g/cm³");
  await page.locator('[data-correction-form] input[name="codes"]').fill(codeB);
  await page.locator("[data-correction-form] [data-correction-submit]").click();
  const corrected = await waitFor(async () => /ri=corrected/.test(page.url()) && (await page.locator('[data-issue="R2"]').count()) === 1);
  const r2 = await textOf(page.locator('[data-issue="R2"]'));
  t("R2 issued — with its reason, what changed, the code it concerns, 2.0.4", corrected && /Грешна единица/.test(r2) && /kg\/m³ вместо g\/cm³/.test(r2) && r2.includes(codeB) && /2\.0\.4/.test(await textOf(page.locator('[data-issue="R2"] [data-issue-version]'))), r2);
  t("who received which: every reached one received R2; L (outside R2's scope) told R1 only", (await page.locator(`[data-recipient="${codeB}"] [data-recipient-received="R1,R2"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeL}"] [data-recipient-received="R1,R2"]`).count()) === 1 && (await page.locator(`[data-recipient="${codeL}"] [data-recipient-told="R1"]`).count()) === 1);
  await go("/dev/persona?role=lab");
  t("the laboratory now gets R2 — the corrected file", Buffer.from(await (await page.request.get(`${BASE}/lab/doc/${S}/report`)).body()).equals(BG2));
  await go(`/lab/p/${pidL}`);
  t("7.5 — after the correction: R2 · 2.0.4, «Поправка R2 — заменя R1» in fixed words (never PTS's scope); R1 listed as replaced, with no link", (await page.locator('[data-lab-report-current="R2"]').count()) === 1 && /2\.0\.4/.test(await textOf(page.locator('[data-lab-report-current="R2"]'))) && /Поправка R2 на окончателния доклад — заменя R1/.test(await textOf(page.locator("[data-lab-report-correction]"))) && !/kg\/m³/.test(await textOf(page.locator("[data-lab-report-card]"))) && /R1/.test(await textOf(page.locator("[data-lab-report-earlier]"))) && (await page.locator("[data-lab-report-earlier] a").count()) === 0);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/editions?doc=report`);
  t("«Редакции» keeps both editions — the participants hold R2; the report is no longer offered for issuing there", (await page.locator('[data-edition^="report:"]').count()) >= 2 && (await page.locator('[data-edition^="report:"] [data-held]').count()) === 1 && (await page.locator('[data-issue-edition] select option[value="report"]').count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-issue: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
