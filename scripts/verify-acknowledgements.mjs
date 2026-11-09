// Plan part 5.9 check (the declaration Ф 4.2-2 as a tick — Реш. 118; «изисква потвърждение»
// on any document — Реш. 117), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-acknowledgements.mjs
// On a scheme of its own: the instruction and the declaration sent; the manager sets the
// instruction to ask for an acknowledgement. A user of participation A's legal entity sees both
// asked on «Начало» and on the participation's page; acknowledges the instruction (recorded once);
// the declaration is refused without its tick, then signed — the edition's hash recorded. Another
// participation's id posted on A's form records nothing. A new edition of the instruction asks
// again. The scheme's page counts; the participant's page lists the records — never a name.
import { chromium } from "playwright";
import { createHash } from "node:crypto";

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
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
// the answers to the page's dialogs, in order (confirm → true; prompt → its text)
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(typeof a === "string" ? a : undefined); });
const stamp = Date.now() % 100000;
const PDF = (w) => Buffer.from(`%PDF-1.4\n% ${w} ${stamp}\n%%EOF\n`);
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 113) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Потвърждения ${stamp} ООД`, LAB = `Лаб. потвърждения ${stamp}`, USER = `Потребител потвърждения ${stamp}`, NAME_A = `Потвърждения А ${stamp}`, NAME_B = `Потвърждения Б ${stamp}`;
// a server action's redirect may navigate in place: watch the address, then reload (5.6 gotcha)
const submitIn = async (formLoc, until) => { await formLoc.locator('button[type="submit"]').click(); await waitFor(async () => until.test(page.url())); await page.waitForTimeout(300); };

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory, a user
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 11" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Русе 2");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`ack${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // a scheme (from a sample — it starts open), the instruction and the declaration sent
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Потвърждения ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const row = (doc) => page.locator(`[data-doc-row="${doc}"]`);
  const upload = async (doc, buffer, replace = false) => {
    const r = row(doc);
    const click = replace
      ? async () => { await r.locator('button[aria-label="More"]').click(); await r.locator("button", { hasText: /Замени файла|Replace file/ }).click(); }
      : () => r.locator("button", { hasText: /Качи|Upload/ }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), click()]);
    await chooser.setFiles({ name: `${doc}.pdf`, mimeType: "application/pdf", buffer });
  };
  for (const doc of ["instruction", "declaration"]) {
    await go(`/schemes/${S}`);
    await upload(doc, PDF(doc));
    await row(doc).locator("button", { hasText: /^📨/ }).waitFor();
    answers.push(true);
    await row(doc).locator("button", { hasText: /^📨/ }).click();
    await waitFor(async () => (await row(doc).locator('[data-edition-label="1"]').count()) === 1);
  }

  // A — of the entity (its copy frozen with the laboratory); B — another participation
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  for (const n of [NAME_A, NAME_B]) {
    await add.locator('[name="labName"]').fill(n);
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(n));
  }
  const refOf = async (n) => (await page.locator("[data-participant-row]", { hasText: n }).locator("td").first().innerText()).trim();
  const pidOf = (n) => page.locator("[data-participant-row]", { hasText: n }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const refA = await refOf(NAME_A), refB = await refOf(NAME_B);
  const pidA = await pidOf(NAME_A), pidB = await pidOf(NAME_B);
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);
  t("setup: the scheme open, the two documents sent, A of the entity, B another", !!S && !!pidA && !!pidB && pidA !== pidB);

  // ── the setting: the instruction asks; the declaration always does ──
  await go(`/schemes/${S}#acknowledgements`);
  const ackRow = (doc) => page.locator(`[data-ack-row="${doc}"]`);
  t("the scheme's page: the declaration asks always — no setting", (await attr(ackRow("declaration"), "data-ack-required")) === "1" && (await ackRow("declaration").locator("[data-ack-toggle]").count()) === 0);
  await ackRow("instruction").locator("[data-ack-toggle]").click();
  t("…the instruction set to ask (who edits the scheme)", await waitFor(async () => { await go(`/schemes/${S}#acknowledgements`); return (await attr(ackRow("instruction"), "data-ack-required")) === "1"; }, 15));
  t("…counted: nobody yet, of the two participations it reaches", (await attr(ackRow("instruction"), "data-ack-done")) === "0" && (await attr(ackRow("instruction"), "data-ack-of")) === "2");

  // ── the entity's user: both asked, on «Начало» and on the page ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const asked = page.locator(`[data-action="acknowledge"][data-action-for="${pidA}"]`);
  t("«Начало»: the declaration to sign and the instruction to acknowledge — listed (Реш. 117)", (await asked.count()) === 2 && (await page.locator(`[data-action="acknowledge"][data-action-what="declaration"][data-action-for="${pidA}"]`).count()) === 1);
  t("…an asked document is not listed twice as «not opened»", (await page.locator(`[data-action="document"][data-action-for="${pidA}"]`).filter({ hasText: /Инструкция|Instruction/ }).count()) === 0);
  await go(`/lab/p/${pidA}`);
  const docRow = (doc) => page.locator(`[data-participation-docs] [data-doc-row="${doc}"]`);
  t("the participation's page: both asked; the instruction with its button", (await attr(docRow("instruction"), "data-doc-ack")) === "asked" && (await attr(docRow("declaration"), "data-doc-ack")) === "asked" && (await page.locator('[data-ack-form="instruction"]').count()) === 1);
  t("never a block: the documents still open", (await page.request.get(`${BASE}/lab/doc/${S}/instruction?p=${pidA}`)).status() === 200);

  // ── acknowledge the instruction — once ──
  const staleForm = await page.locator('[data-ack-form="instruction"]').evaluate((f) => Object.fromEntries(new FormData(f)));
  await submitIn(page.locator('[data-ack-form="instruction"]'), /ok=ack/);
  await go(`/lab/p/${pidA}`);
  t("«Запознах се»: recorded — the row says so, with the day and the hour", (await attr(docRow("instruction"), "data-doc-ack")) === "done" && /Потвърдено на|Acknowledged on/.test(await textOf(docRow("instruction").locator("[data-ack-done]"))));
  // the same form posted again (a second press, a stale tab): no second record — said so
  await page.evaluate(({ f }) => { const form = document.createElement("form"); form.method = "post"; form.action = location.pathname; form.enctype = "multipart/form-data"; document.body.append(form); for (const [k, v] of Object.entries(f)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.append(i); } form.submit(); }, { f: staleForm });
  await waitFor(async () => /e=ack-twice/.test(page.url()), 30);
  t("…the same form again (a second press, a stale tab): no second record — said so", /e=ack-twice/.test(page.url()) && (await page.locator('[data-page-err="ack-twice"]').count()) === 1);
  await go(`/lab/p/${pidA}`);

  // ── the declaration: refused without the tick, then signed ──
  const decl = page.locator('form[data-declaration="asked"]');
  t("the declaration's box: the edition named, the tick, «Подписвам»", (await decl.count()) === 1 && /редакция № 1|edition No\. 1/.test(await decl.innerText()));
  // another participation's id on A's form: not A's own — nothing recorded for B (only a participation's own)
  const declForm = await decl.evaluate((f) => Object.fromEntries(new FormData(f)));
  await page.evaluate(({ f }) => { const form = document.createElement("form"); form.method = "post"; form.action = location.pathname; form.enctype = "multipart/form-data"; document.body.append(form); for (const [k, v] of Object.entries(f)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.append(i); } form.submit(); }, { f: { ...declForm, participantId: pidB, tick: "on" } });
  await waitFor(async () => !page.url().includes(`/lab/p/${pidA}`), 30);
  t("another participation's id on A's form: sent back to the portal's start — not its own", !page.url().includes(`/lab/p/${pidA}`) && !page.url().includes(`/lab/p/${pidB}`), page.url());
  await go(`/lab/p/${pidA}`);
  await decl.locator('input[name="tick"]').evaluate((i) => { i.required = false; i.checked = false; });
  await submitIn(decl, /e=ack-tick/);
  t("without the tick: not signed — said so", /e=ack-tick/.test(page.url()) && /Отбележете|Tick that/.test(await textOf(page.locator('[data-page-err="ack-tick"]'))));
  await go(`/lab/p/${pidA}`);
  await decl.locator('input[name="tick"]').check();
  await submitIn(decl, /ok=declaration/);
  await go(`/lab/p/${pidA}`);
  t("signed by the tick: the account, the day and the hour, the edition (Реш. 118)", (await page.locator('[data-declaration="signed"]').count()) === 1 && /Подписана на|Signed on/.test(await textOf(page.locator('[data-declaration="signed"]'))) && /№ 1|No\. 1/.test(await textOf(page.locator('[data-declaration="signed"]'))));
  await go("/lab/overview");
  t("«Начало»: nothing left to acknowledge for A", (await page.locator(`[data-action="acknowledge"][data-action-for="${pidA}"]`).count()) === 0);

  // ── the staff: counts on the scheme, the records on A's page; nothing for B ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#acknowledgements`);
  t("the scheme's page counts: the instruction 1 of 2, the declaration 1 of 2", (await attr(ackRow("instruction"), "data-ack-done")) === "1" && (await attr(ackRow("declaration"), "data-ack-done")) === "1" && (await attr(ackRow("declaration"), "data-ack-of")) === "2");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}`);
  const recs = page.locator("[data-participant-acks]");
  // the declaration was sent as an uploaded file: its edition's hash is the file's own (3.0)
  const fileSha = createHash("sha256").update(PDF("declaration")).digest("hex");
  t("A's page: the two records — the document, the edition, the moment, the account's kind; the hash IS the declaration file's", (await attr(recs, "data-participant-acks")) === "2" && (await textOf(recs)).includes(`sha-256 ${fileSha.slice(0, 12)}`) && /потребител на организацията|a user of the organisation/.test(await textOf(recs)) && !(await textOf(recs)).includes(USER), `${fileSha.slice(0, 12)} :: ${await textOf(recs)}`);
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}?reveal=1`);
  t("…with the names revealed (who sees names here): the account by its name", (await textOf(page.locator("[data-participant-acks] [data-ack-account]").first())).includes(USER));
  await go(`/schemes/${S}/participants/${encodeURIComponent(refB)}`);
  t("B's page: nothing — another's form recorded nothing for it", (await page.locator("[data-participant-acks]").count()) === 0);
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: the declaration signed, the document acknowledged, the setting — never the user's name", /signed the Confidentiality Declaration|Подписана декларация/.test(act) && /acknowledged the|Потвърдено запознаване/.test(act) && !act.includes(USER));

  // ── a new edition of the instruction asks again; the old record stays ──
  await go(`/schemes/${S}`);
  await upload("instruction", PDF("instruction-2"), true);
  await page.waitForTimeout(1500);
  await go(`/schemes/${S}`);
  answers.push(true);
  await row("instruction").locator('button[aria-label="More"]').click();
  await row("instruction").locator("button", { hasText: /Спри споделянето|Stop sharing/ }).click();
  await row("instruction").locator("button", { hasText: /^📨/ }).waitFor();
  answers.push(true, "Нова редакция — сменен срок", "т. 3");
  await row("instruction").locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await row("instruction").locator('[data-edition-label="2"]').count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  t("edition 2 sent: the instruction asks again", (await attr(docRow("instruction"), "data-doc-ack")) === "asked");
  // the form drawn for edition 1, posted now: refused — the edition is the one to acknowledge
  // (posted natively — a hydrated form re-renders its hidden fields from the page)
  await page.evaluate(({ f }) => { const form = document.createElement("form"); form.method = "post"; form.action = location.pathname; form.enctype = "multipart/form-data"; document.body.append(form); for (const [k, v] of Object.entries(f)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.append(i); } form.submit(); }, { f: staleForm });
  await waitFor(async () => /e=ack-edition/.test(page.url()), 30);
  t("…a form drawn for edition 1, posted after edition 2: refused, said so", /e=ack-edition/.test(page.url()));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}`);
  t("…and edition 1's record stays", (await attr(page.locator("[data-participant-acks]"), "data-participant-acks")) === "2");
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-acknowledgements: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
