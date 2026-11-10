// Plan part 3.2 check (the lifecycle; Zadanie §3; О9 / Реш. 129, 140), against a LOCAL
// dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-lifecycle.mjs
// On schemes of its own: the 19 stages shown; a tick dated and by whom, withdrawn on
// record; the acts move the scheme draft → open → running → processing → report →
// closed, each refused out of order (the report without PTS's file or the approval;
// the review before the processing); the report act keeps the report as an edition
// and the laboratory reads it; a step back needs its reason; the edit page no longer
// changes a later state; «не се състои» tells the laboratory, skips the later stages
// and invoices nothing; a statistics expert has no acts; everything is in the journal.
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
const stamp = Date.now();

// the answers to the page's dialogs, in order (confirm → true; prompt → its text)
const answers = [];
page.on("dialog", async (d) => {
  const a = answers.shift();
  if (a === false) await d.dismiss();
  else await d.accept(typeof a === "string" ? a : undefined);
});

const newScheme = async (name) => {
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.locator("button", { hasText: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('input[name="name"]').fill(name);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.locator('button[type="submit"]').click()]);
  return new URL(page.url()).pathname.split("/").pop();
};
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();
const stage = (no) => page.locator(`[data-lifecycle] [data-stage="${no}"]`);
// an act: confirm, then its note when it takes one
const act = async (S, key, note) => {
  await go(`/schemes/${S}#stages`);
  const before = await state();
  const btn = page.locator(`[data-act="${key}"]`);
  await btn.waitFor();
  answers.push(true);
  if (note !== undefined) answers.push(note);
  await btn.click();
  await waitFor(async () => (await state()) !== before || (await page.locator("[data-lifecycle-error]").count()) > 0);
  await page.waitForTimeout(300);
};
const tick = async (S, no, note = "") => {
  await go(`/schemes/${S}#stages`);
  answers.push(note);
  await page.locator(`[data-tick="${no}"]`).click();
  await waitFor(async () => (await stage(no).getAttribute("data-done")) === "1");
};

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");

  // ── 1. the 19 stages, a draft ──
  const S = await newScheme(`Етапи ${stamp}`);
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-lifecycle] [data-stage]").nth(18).waitFor();
  t("the scheme page shows the 19 stages", (await page.locator("[data-lifecycle] [data-stage]").count()) === 19);
  t("…a new scheme is a draft, and may only be opened", (await state()) === "Чернова" && (await page.locator("[data-act]").count()) === 1 && (await page.locator('[data-act="open"]').count()) === 1);
  t("…each says how it is done: 7 an act, 12 from the portal, 4 a tick by the scheme manager", /акт/.test(await stage(7).innerText()) && /от портала/.test(await stage(12).innerText()) && /отметка — ръководителят на схемата/.test(await stage(4).innerText()));
  t("…a processing act cannot be ticked before processing", (await page.locator('[data-tick="14"]').isDisabled()));

  // a tick: dated, by whom, with its note; withdrawn, on record
  await tick(S, 4, "Одобрен на съвещание");
  t("stage 4 ticked: its date and its note", /\d{2}\.\d{2}\.\d{4}/.test(await stage(4).innerText()) && /Одобрен на съвещание/.test(await stage(4).innerText()));
  await tick(S, 1);
  answers.push(true);
  await page.locator('[data-untick="1"]').click();
  t("a tick withdrawn", await waitFor(async () => (await stage(1).getAttribute("data-done")) === "0"));

  // ── 2. open → the first announcement → running ──
  await act(S, "open");
  t("«Отвори»: the scheme is open, stage 7 done", (await state()) === "Отворена" && (await stage(7).getAttribute("data-done")) === "1");
  const offered = [];
  for (const k of ["announce", "not_held", "back"]) offered.push((await page.locator(`[data-act="${k}"]`).count()) === 1);
  t("…an open scheme: it runs, it is not held, or back to draft", offered.every(Boolean) && (await page.locator("[data-act]").count()) === 3);
  await act(S, "announce", "");
  t("first announcement: it runs — stage 8 done", (await state()) === "В процес" && (await stage(8).getAttribute("data-done")) === "1");
  // the second announcement (5.2): its own form — a participation in the round, a characteristic that runs
  await go(`/schemes/${S}/participants`);
  const addP = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await addP.locator('[name="labName"]').fill(`Етапи лаб ${stamp}`);
  await addP.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(`Етапи лаб ${stamp}`));
  // a laboratory's own participation, on the final list — it reads the report later (7.4: the final list's only)
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  t("…the second announcement is its own form, not a plain act", (await page.locator('[data-act="announce2"]').count()) === 0 && (await page.locator("[data-second-announcement]").count()) === 1);
  const second = page.locator("[data-second-announcement]");
  await second.locator('input[name="run_0"]').check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1);
  t("second announcement: recorded on stage 8, offered once", /Второ обявяване/.test(await stage(8).innerText()) && (await page.locator("[data-second-announcement]").count()) === 0 && (await page.locator("[data-final-list]").count()) === 1);
  // processing waits for the coding (5.3): refused while one on the list has no code
  t("processing waits for the coding act", /кодиране|coding/i.test(await textOf(page.locator('[data-act-blocked="process"]'))));
  // the coding act — no batch here, so codes only; stage 9 done by it
  answers.push(true);
  await page.locator("[data-coding-run]").click();
  // (the laboratory's own participation was coded on joining — wait for the act itself: stage 9)
  await waitFor(async () => { await go(`/schemes/${S}#stages`); return (await stage(9).getAttribute("data-done")) === "1"; }, 30);
  t("the coding act: stage 9 done by it, no longer ticked by hand", (await stage(9).getAttribute("data-done")) === "1" && (await page.locator('[data-untick="9"]').count()) === 0);

  // the edit page changes no later state
  await go(`/schemes/${S}/edit`);
  t("the edit page no longer offers the later states", (await page.locator("[data-state-elsewhere]").count()) === 1);
  await page.locator('input[name="status"]').evaluate((el) => { el.value = "closed"; });
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await go(`/schemes/${S}#stages`);
  t("…a posted «closed» from it changes nothing", (await state()) === "В процес");

  // ── 3. processing, in Реш. 140's order ──
  await act(S, "process", "Заключено за проверката на етапите"); // 6.6: a form still open for one with nothing in — a reason
  t("«Заключи подаването и започни обработката»: processing", (await state()) === "Обработка");
  t("the report act is refused without PTS's file and the approval", (await page.locator('[data-act="report"]').isDisabled()) && /качете|upload/.test(await page.locator('[data-act-blocked="report"]').innerText()));
  t("the review cannot be ticked before the processing", await page.locator('[data-tick="15"]').isDisabled());
  // 2.0's report, before the review (7.2), and its transfer check (7.3) — what the report act needs (7.4)
  const REPORT = Buffer.from(`%PDF-1.4\n% lifecycle report ${stamp}\n%%EOF\n`);
  await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  await go(`/schemes/${S}#analysis-import`);
  await page.locator('[data-import-form] input[name="version"]').fill("2.0.3");
  await page.locator('[data-import-form] input[name="report-bg"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: REPORT });
  await page.locator("[data-import-form] [data-import-submit]").click();
  await waitFor(async () => /imp=ok/.test(page.url()), 30);
  await go(`/schemes/${S}#processing-record`);
  await page.locator('[data-transfer-form] input[value="yes"]').check();
  await page.locator("[data-transfer-form] [data-transfer-submit]").click();
  t("2.0's report imported and its transfer check «the same» recorded", await waitFor(async () => /tc=ok/.test(page.url()), 30));
  await tick(S, 14);
  await tick(S, 15);
  await tick(S, 16);
  const dated = [];
  for (const no of [14, 15, 16]) dated.push((await stage(no).getAttribute("data-done")) === "1" && /\d{2}\.\d{2}\.\d{4}/.test(await stage(no).innerText()));
  t("processed, reviewed and approved — each dated", dated.every(Boolean));
  await go(`/schemes/${S}#stages`);
  t("…the processing tick cannot be withdrawn under the review", (await page.locator('[data-untick="14"]').count()) === 0);

  // ── 4. the report: 2.0's file (7.2–7.4), kept as an edition (R1), read by the laboratory it reaches (D7) ──
  await act(S, "report", "");
  t("«Издай окончателния доклад»: the report is issued, stage 17 done", (await state()) === "Докладът е издаден" && (await stage(17).getAttribute("data-done")) === "1");
  await go(`/schemes/${S}/editions?doc=report`);
  t("…kept as the report's edition 1", (await page.locator('[data-edition="report:1"]').count()) === 1);
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/dev/persona?role=manager");
  // the laboratories are not marked paid: opened by hand, with a reason (D7)
  for (let i = 0; i < 4 && (await page.goto(`${BASE}/schemes/${S}#report-issue`).then(() => page.locator("[data-hand-open]").count())) > 0; i++) {
    await page.locator('[data-hand-open] input[name="reason"]').fill("Държавна институция — проверка на етапите");
    await page.locator("[data-hand-open] [data-hand-open-submit]").click();
    await waitFor(async () => /ri=/.test(page.url()));
  }
  await go(`/dev/persona?role=lab`);
  const rep = await page.request.get(`${BASE}/lab/doc/${S}/report`);
  t("…and the laboratory reads exactly that file", rep.status() === 200 && Buffer.from(await rep.body()).equals(REPORT), `status ${rep.status()}`);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  t("a report issued is never taken back: no step back from it", (await page.locator('[data-act="back"]').count()) === 0);

  // ── 5. closing, and a step back with its reason ──
  await act(S, "close", "");
  t("«Приключи записите»: closed, stage 19 done", (await state()) === "Приключена" && (await stage(19).getAttribute("data-done")) === "1");
  await act(S, "back", "");
  t("a step back without its reason is refused", (await state()) === "Приключена" && /основанието|reason/.test(await page.locator("[data-lifecycle-error]").innerText()));
  await act(S, "back", "Забравен протокол за досието");
  t("…with it: back to the report issued", (await state()) === "Докладът е издаден");
  // (a collapsed list: its text, not what is drawn)
  t("the changes of state are listed with who and the reason", /Забравен протокол за досието/.test(await page.locator("[data-state-history]").textContent()));

  // ── 6. «не се състои» (О9): the laboratory told, nothing later, nothing invoiced ──
  const N = await newScheme(`Не се състои ${stamp}`);
  await go(`/schemes/${N}/edit`);
  const numN = await page.locator('input[name="number"]').inputValue();
  await act(N, "open");
  await go(`/dev/persona?role=lab&join=${N}`); // a laboratory in it
  await go("/dev/persona?role=manager");
  await act(N, "not_held", "Не се събра минималният брой участници");
  t("«не се състои»: the state, with its reason on stage 8", (await state()) === "Не се състои" && /Не се състои/.test(await stage(8).innerText()));
  t("…the later stages will not happen", (await stage(9).getAttribute("data-skipped")) === "1" && (await stage(19).getAttribute("data-skipped")) === "1" && (await stage(8).getAttribute("data-skipped")) === "0");
  // the notice waits in «Известия» for a person, as every notice to a laboratory (1.8)
  await go("/notices");
  const card = page.locator("[data-held]").filter({ hasText: `Схема ${numN} не се състои` }).last();
  t("…the laboratory's notice is recorded, waiting to be sent («Известия», 1.8)", (await card.count()) > 0 && /Нищо не се фактурира/.test(await card.innerText()));
  await card.getByRole("button", { name: /^(Изпрати|Send)$/ }).click();
  // released once it leaves the held list (the action finishes before we move on)
  await waitFor(async () => (await page.locator("[data-held]").filter({ hasText: `Схема ${numN} не се състои` }).count()) === 0);
  // the persona lands on /lab, where the unread notices are shown (and then read)
  await go(`/dev/persona?role=lab&join=${N}`);
  t("…released: the laboratory is told", await waitFor(async () => (await page.getByText(`Схема ${numN} не се състои`).count()) > 0, 20));
  t("…and the scheme is over for it", await waitFor(async () => (await page.getByText(/Не се състои/).count()) > 0));
  await go("/dev/persona?role=manager");
  // nothing is invoiced
  await go(`/schemes/${N}/participants`);
  const href = await page.locator(`a[href^="/schemes/${N}/participants/"]`).first().getAttribute("href");
  await go(href);
  t("…and nothing is invoiced: no proforma to upload", (await page.locator("[data-not-invoiced]").count()) === 1 && (await page.getByRole("button", { name: /Качи проформа|Upload proforma/ }).count()) === 0);

  // ── 7. a statistics expert of the scheme has no acts ──
  await go(`/dev/persona?model=statistics_expert@${S}`);
  await go(`/schemes/${S}#stages`);
  t("a statistics expert sees the stages but no act", (await page.locator("[data-lifecycle] [data-stage]").count()) === 19 && (await page.locator("[data-act]").count()) === 0);
  await go("/dev/persona?role=manager");

  // ── 8. on record ──
  await go(`/activity?scheme=${S}`);
  await page.getByText(/Close the records/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  const want = [/Open the scheme \(invitation and applications\): Draft → Open/, /First announcement: the scheme will run: Open → In progress/, /Lock the submission and start processing: In progress → Processing/, /Issue the final report: Processing → Report issued/, /Close the records: Report issued → Closed/, /Step back to the previous state: Closed → Report issued — Забравен протокол за досието/, /Stage ticked: 4\. Statistical design/, /Tick withdrawn: 1\. Initiation/];
  const missing = want.filter((re) => !re.test(journal)).map(String);
  t("the journal: every act and every tick", !missing.length, `missing ${missing.join(" | ")}`);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-lifecycle: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
