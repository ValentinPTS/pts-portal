// Plan part 5.5 check (the participation's page and the home; design §4 «Начало», §6
// «Страница на участие»; К26, К18; Реш. 128, 96), against a LOCAL dev server (in-memory
// store, login off):
//   BASE=http://localhost:3000 node scripts/verify-participation.mjs
// On a scheme of its own, opened: participation A of a legal entity registered in Turkey
// (a user of it reads A), participation B of a laboratory's account (the lab persona).
// Each is followed from the record: applied → (A: awaiting the choice of carrier until PTS
// records it) → confirmed → dispatched (through «Доставки», 5.6) → received → withdrawn,
// into the archive. The bar
// shows the stage it is in, payment beside it; the home says what needs action — the
// results deadline with its hour, the receipt to confirm, a document not opened — and an
// opened document drops out of it.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", async (d) => { await d.accept(d.type() === "prompt" ? "" : undefined); });
const stamp = Date.now() % 100000;
const ENT = `Участие ${stamp} Ltd.`, LAB = `Лаб. участие ${stamp}`, USER = `Пробен Потребител ${stamp}`, NAME_A = `Участие А ${stamp}`;
const PDF = (w) => Buffer.from(`%PDF-1.4\n% ${w} ${stamp}\n%%EOF\n`);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a legal entity registered in Turkey — outside the EU and the Balkans (Реш. 128) —, its laboratory, a user ──
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "TR", eik: `TR-${stamp}`, address: "Истанбул 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  t("setup: a legal entity in Turkey", await waitFor(async () => (await card.count()) === 1));
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Истанбул 2");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`user${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/dev/persona?role=manager");

  // ── a scheme of its own, its results deadline with an hour; opened by sending the invitation ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Участие ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const RESULTS = day(20);
  const rd = page.locator('[data-date-key="resultsDue"]');
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(RESULTS); await page.waitForTimeout(400); }
  await rd.locator('input[type="time"]').fill("17:00");
  // the applications deadline: yesterday — passed, so never «next» (review)
  await page.locator('[data-date-key="applicationsDue"] input[type="date"]').fill(day(-1));
  await page.waitForTimeout(300);
  await page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ }).click();
  t("setup: the results deadline with its hour, the applications' passed", await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0));
  const upload = async (doc, buf) => {
    const row = page.locator(`[data-doc-row="${doc}"]`);
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), row.locator("button", { hasText: /Качи|Upload/ }).click()]);
    await ch.setFiles({ name: `${doc}.pdf`, mimeType: "application/pdf", buffer: buf });
    await row.locator("button", { hasText: /^📨/ }).waitFor();
    return row;
  };
  await go(`/schemes/${S}`);
  await upload("instruction", PDF("instruction"));
  const inv = await upload("invitation", PDF("invitation"));
  await inv.locator("button", { hasText: /^📨/ }).click();
  t("setup: the invitation sent — the scheme open", await waitFor(async () => (await inv.locator('[data-edition-label="1"]').count()) === 1));

  // ── A: entered by PTS, its country Turkey, linked to the entity's laboratory ──
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('[name="country"]').fill("TR");
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  const rowA = page.locator("[data-participant-row]", { hasText: NAME_A });
  const refA = (await rowA.locator("td").first().innerText()).trim();
  const pidA = await rowA.locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  t("setup: A entered, linked to the laboratory", await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1));

  // ── B: the laboratory's account joins (coded at once, dev) ──
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/lab");
  const labCard = page.locator(`[data-lab-card="${S}"]`);
  await labCard.waitFor();
  const pidB = await labCard.locator("[data-open-participation]").getAttribute("data-open-participation");
  t("the laboratory's card: the bar, at «Заявка» — no final list yet", (await attr(labCard.locator("[data-stage-bar]"), "data-stage-bar")) === "application" && !!pidB);
  t("…payment beside the bar, not in it (К18): nothing invoiced", (await attr(labCard.locator("[data-payment]"), "data-payment")) === "none" && (await labCard.locator('[data-stage="payment"]').count()) === 0);
  t("…the old seven-step timeline is gone", !/Хронология на фазите|Phase timeline/.test(await textOf(labCard)));

  // ── the user's home: A, applied ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const rowHomeA = page.locator(`[data-participations] [data-participation-id="${pidA}"]`);
  t("the home: «Моите участия» — A, at «Заявка», its code to come", await waitFor(async () => (await rowHomeA.count()) === 1) && (await attr(rowHomeA.locator("[data-row-stage]"), "data-row-stage")) === "application" && /кодът предстои|code to come/.test(await textOf(rowHomeA)));
  t("…and «Изисква действие»: no deadline, no delivery yet — only the invitation, released and not opened", (await page.locator(`[data-action-for="${pidA}"]:not([data-action="document"])`).count()) === 0 && (await page.locator(`[data-action="document"][data-action-for="${pidA}"]`).filter({ hasText: /Покана|Invitation/ }).count()) === 1);
  await go(`/lab/p/${pidA}`);
  t("A's own page: a passed applications deadline is not «next» — the results deadline is (review)", (await attr(page.locator("[data-deadline]"), "data-deadline")) === "results");
  t("A's own page: applied, its code to come, the scheme's documents", (await attr(page.locator("[data-participation-page]"), "data-state")) === "applied" && (await page.locator("[data-code-to-come]").count()) === 1 && (await page.locator('[data-participation-docs] [data-doc="invitation"][data-doc-level="all"]').count()) === 1);
  // (a not-found page streams with 200 under the root loading.tsx — what counts is that nothing of it is there)
  const other = await page.request.get(`${BASE}/lab/p/${pidB}`);
  const otherText = await other.text();
  t("…another participation's page is not found to this user — only its own", !otherText.includes("data-participation-page") && /404|could not be found|не е намерен/i.test(otherText), String(other.status()));

  // ── the announcements: the final list (A and B), then the coding act ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await textOf(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form = page.locator("[data-second-announcement]");
  await form.waitFor();
  const run0 = form.locator('input[name^="run_"]').first();
  if ((await run0.count()) && !(await run0.isChecked())) await run0.check();
  await form.locator("[data-second-submit]").click();
  t("setup: the second announcement — A and B on the final list", await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "2"));
  await go(`/schemes/${S}/participants`);
  t("PTS: A — on the list, in Turkey, no carrier — «изчаква избор на доставчик» (Реш. 128)", (await page.locator(`[data-participant-row="${refA}"] [data-carrier-pending]`).count()) === 1);

  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  t("A's page: awaiting the choice of carrier — said why, before the proforma", (await attr(page.locator("[data-participation-page]"), "data-state")) === "carrier" && (await page.locator("[data-carrier-pending]").count()) === 1 && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "application");

  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-coding] [data-coding-run]").click();
  t("setup: coded", await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1));
  const codeA = await page.locator(`[data-coded-from="${refA}"]`).getAttribute("data-coded");
  // PTS records the carrier the participant chose (any name — free text now)
  await go(`/schemes/${S}/participants`);
  const edit = page.locator(`tr[data-edit-row="${pidA}"]`);
  await edit.locator("summary").click();
  await edit.locator('input[name="courier"]').fill("DHL Express");
  await edit.locator('button[type="submit"]').click();
  t("PTS: the carrier recorded — no longer awaiting", await waitFor(async () => (await page.locator(`[data-participant-row="${codeA}"]`).count()) === 1 && (await page.locator(`[data-participant-row="${codeA}"] [data-carrier-pending]`).count()) === 0 && (await textOf(page.locator(`[data-participant-row="${codeA}"]`))).includes("DHL Express")));

  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  t("A: confirmed — its code shown, the bar at «Изпращане»", (await attr(page.locator("[data-participation-page]"), "data-state")) === "confirmed" && (await textOf(page.locator("[data-own-code]"))) === codeA && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "dispatch");

  // ── dispatched through «Доставки» (5.6): a waybill; a proforma, paid ──
  await go("/dev/persona?role=manager");
  const WAYBILL = `WB-${stamp}`;
  const dispatch = async (pid, waybill) => {
    await go(`/deliveries?scheme=${S}`);
    const row = page.locator(`[data-delivery-row="${pid}"]`);
    await row.waitFor();
    if (!(await row.locator('[data-dispatch-form="dispatch"]').isVisible())) await row.locator("[data-dispatch-forms] summary").click();
    await row.locator('[data-dispatch-form="dispatch"] input[name="waybill"]').fill(waybill);
    await row.locator('[data-dispatch-form="dispatch"] button[type="submit"]').click();
    await waitFor(async () => (await page.locator('[data-deliveries-ok="dispatch"]').count()) === 1);
  };
  await dispatch(pidA, WAYBILL);
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeA)}`);
  const up = page.getByRole("button", { name: /Качи проформа|Upload proforma/ });
  await up.waitFor();
  const [pc] = await Promise.all([page.waitForEvent("filechooser"), up.click()]);
  await pc.setFiles({ name: `proforma-${stamp}.pdf`, mimeType: "application/pdf", buffer: PDF("proforma") });
  await waitFor(async () => (await page.getByText(`proforma-${stamp}.pdf`).count()) > 0);
  await page.locator("label", { hasText: /Платена|Paid/ }).locator('input[type="checkbox"]').check();
  await page.waitForTimeout(1500);
  // B dispatched too — by its code, as its own page shows it
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidB}`);
  const codeB = (await textOf(page.locator("[data-own-code]"))).trim();
  t("B's page: its code, confirmed — the bar at «Изпращане»", !!codeB && (await attr(page.locator("[data-participation-page]"), "data-state")) === "confirmed" && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "dispatch", codeB);
  await go("/dev/persona?role=manager");
  await dispatch(pidB, `${WAYBILL}-B`);

  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const acts = page.locator(`[data-action-for="${pidA}"]`);
  t("the home: «Изисква действие» — the results deadline, and the receipt to confirm", await waitFor(async () => (await acts.count()) >= 2) && (await page.locator(`[data-action="deadline"][data-action-what="results"][data-action-for="${pidA}"]`).count()) === 1 && (await page.locator(`[data-action="delivery"][data-action-for="${pidA}"]`).count()) === 1);
  t("…the deadline with its hour and zone, and the days left", /17:00 EE?T · остават \d+ дни|17:00 EE?T · \d+ days left/.test(await textOf(page.locator(`[data-action="deadline"][data-action-for="${pidA}"]`))));
  t("…the receipt with its waybill", (await textOf(page.locator(`[data-action="delivery"][data-action-for="${pidA}"]`))).includes(WAYBILL));
  t("…A's row: at «Получаване», its next deadline the results", (await attr(rowHomeA.locator("[data-row-stage]"), "data-row-stage")) === "receipt" && /17:00/.test(await textOf(rowHomeA)));
  await go(`/lab/p/${pidA}`);
  t("A's page: dispatched — the carrier and the waybill; the bar at «Получаване»", (await attr(page.locator("[data-participation-page]"), "data-state")) === "dispatched" && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "receipt" && (await textOf(page.locator("[data-delivery]"))).includes("DHL Express") && (await textOf(page.locator("[data-delivery]"))).includes(WAYBILL));
  t("…the results deadline: its hour, its zone in words, the days left", (await attr(page.locator("[data-deadline]"), "data-deadline")) === "results" && (await attr(page.locator("[data-deadline-at]"), "data-deadline-at")) === `${RESULTS}T17:00` && /източноевропейско (лятно )?време|Eastern European (Summer )?Time/.test(await textOf(page.locator("[data-deadline]"))) && /остават \d+ дни|\d+ days left/.test(await textOf(page.locator("[data-deadline]"))));
  t("…payment beside the bar: paid — and dispatched before it mattered (Реш. 96)", (await attr(page.locator("[data-payment]"), "data-payment")) === "paid" && (await attr(page.locator("[data-payment-box]"), "data-payment-box")) === "paid");
  t("…the proforma among its documents, the participation's", (await page.locator('[data-participation-docs] [data-doc="proforma"]').count()) === 1);
  const pf = await page.request.get(`${BASE}/lab/labdoc/${S}/proforma?p=${pidA}`);
  t("…and a user of the entity downloads it (design §6: every user of the organisation) — it was a lab account's alone (review)", pf.status() === 200 && Buffer.from(await pf.body()).equals(PDF("proforma")), String(pf.status()));
  t("…a user of the entity sends the protocol by e-mail (no upload form of a laboratory's account)", (await page.locator('[data-upload-slot="protocol"] form').count()) === 0 && /e-mail/.test(await textOf(page.locator('[data-upload-slot="protocol"]'))));
  t("…the characteristics it applied for", Number(await attr(page.locator("[data-applied-characteristics]"), "data-applied-characteristics")) >= 1);

  // ── a document released, not opened: on «Изисква действие» — until someone of it opens it ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  await page.locator('[data-doc-row="instruction"]').locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await page.locator('[data-doc-row="instruction"] [data-edition-label="1"]').count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const docAct = page.locator(`[data-action="document"][data-action-for="${pidA}"]`);
  t("a document released and not opened: on «Изисква действие», with its edition", await waitFor(async () => (await docAct.count()) >= 1) && /ред\. № 1|ed\. No\. 1/.test(await textOf(docAct.filter({ hasText: /Инструкция|Instruction/ }))));
  const got = await page.request.get(`${BASE}/lab/doc/${S}/instruction?p=${pidA}`);
  t("…opened (a download, on record)", got.status() === 200, String(got.status()));
  await go("/lab/overview");
  t("…then it drops out of «Изисква действие»", (await page.locator(`[data-action="document"][data-action-for="${pidA}"]`).filter({ hasText: /Инструкция|Instruction/ }).count()) === 0);
  await go(`/lab/p/${pidA}`);
  t("…and the page says it was opened", (await attr(page.locator('[data-participation-docs] [data-doc="instruction"]'), "data-doc-opened")) === "1");

  // ── the laboratory's account: its receipt protocol uploaded on its participation's page ──
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidB}`);
  const notMine = await (await page.request.get(`${BASE}/lab/p/${pidA}`)).text();
  t("a laboratory's account opening the entity's participation: not found — only its own", !notMine.includes("data-participation-page") && /404|could not be found/i.test(notMine));
  t("B's page (a laboratory's account): dispatched; the protocol to upload here", (await attr(page.locator("[data-participation-page]"), "data-state")) === "dispatched" && (await page.locator('[data-upload-slot="protocol"] form').count()) === 1);
  await page.locator('[data-upload-slot="protocol"] input[type="file"]').setInputFiles({ name: "protocol.pdf", mimeType: "application/pdf", buffer: PDF("protocol-b") });
  await Promise.all([page.waitForURL(new RegExp(`/lab/p/${pidB}$`), { timeout: 90000 }), page.locator('[data-upload-slot="protocol"] button[type="submit"]').click()]);
  await go(`/lab/p/${pidB}`);
  t("…uploaded, back on its page: received, the bar at «Изпитване»; the results sheet next", (await attr(page.locator("[data-participation-page]"), "data-state")) === "received" && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "work" && (await page.locator('[data-upload-slot="results"] form').count()) === 1);
  await go("/lab");
  t("…its card says so too", (await attr(page.locator(`[data-lab-card="${S}"] [data-stage-bar]`), "data-stage-bar")) === "work");

  // ── withdrawn: over — into the archive ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  for (const pid of [pidA, pidB]) {
    const st = page.locator(`[data-standing-row="${pid}"]`);
    await st.locator("summary").click();
    await st.locator('[data-standing-open="withdrawn"]').click();
    const wf = st.locator('[data-standing-form="withdrawn"]');
    await wf.locator('[name="source"]').fill(`писмо вх. № ${stamp}`);
    await wf.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-standing-row="${pid}"]`).count()) === 1 && (await page.locator("[data-participant-row][data-in-round='0']").count()) >= 1);
    await go(`/schemes/${S}/participants`);
  }
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  t("withdrawn: no longer among the active ones, nothing asked of it", (await page.locator(`[data-participations] [data-participation-id="${pidA}"]`).count()) === 0 && (await page.locator(`[data-action-for="${pidA}"]`).count()) === 0);
  await page.locator("[data-view-archive]").click();
  await page.waitForURL(/view=archive/);
  t("…in the archive, as withdrawn", (await attr(page.locator(`[data-participations-table="archive"] [data-participation-id="${pidA}"]`), "data-row-state")) === "withdrawn");
  await go(`/lab/p/${pidA}`);
  t("…its page: the state instead of a bar — it is not somewhere it is not", (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "ended" && (await page.locator("[data-ended-state='withdrawn']").count()) === 1 && (await page.locator("[data-finished]").count()) === 1);
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidB}`);
  t("B (the laboratory's account): withdrawn, no upload offered", (await attr(page.locator("[data-participation-page]"), "data-state")) === "withdrawn" && (await page.locator("[data-upload-slot] form").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-participation: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
