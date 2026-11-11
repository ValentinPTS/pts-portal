// Plan part 5.6 check (delivery and receipt; spec §5.3, §8.4, Q8; Реш. 79, 127, 154; D18),
// against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-delivery.mjs
// On a testing scheme of its own, its shipment documents and receipt checks listed:
// participation B (a laboratory's account) is sent its object with a waybill — told —, files
// its online receipt protocol with one check failed («негоден», Реш. 79); a replacement is
// refused while fewer than the minimum working days remain (Реш. 127) and goes once the
// minimum allows it; B files a fit protocol and signals a problem, which PTS resolves.
// Participation A (entered by PTS) is handed to its own courier on Ф 7.3.4-1 (Реш. 154).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
// one context: a second tab shares the sign-in (the stale-form check)
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const attr = async (loc, a) => ((await loc.count()) ? await loc.first().getAttribute(a) : null);
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
// a form posted: by the time the page is hydrated its server action navigates in place —
// so the address is watched, then the page loaded afresh to read what the server says now
const submit = async (pg, button, re) => {
  await button.click();
  for (let i = 0; i < 225 && !re.test(pg.url()); i++) await pg.waitForTimeout(400);
  if (!re.test(pg.url())) throw new Error(`no ${re} after the submit: ${pg.url()}`);
  await pg.goto(pg.url(), { waitUntil: "domcontentloaded", timeout: 90000 });
};
page.on("dialog", async (d) => { await d.accept(d.type() === "prompt" ? "" : undefined); });
const stamp = Date.now() % 100000;
const NAME_A = `Доставка А ${stamp}`;
const PDF = (w) => Buffer.from(`%PDF-1.4\n% ${w} ${stamp}\n%%EOF\n`);
// a day in Bulgaria, as the portal counts it — never UTC's, a day behind just after midnight
const day = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a testing scheme: its results deadline; its shipment documents and receipt checks (3.8) ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Доставки ${stamp}`);
  await submit(page, dialog.getByRole("button", { name: /Създай проект|Create project/ }), /\/schemes\/[^/]+$/);
  const S = new URL(page.url()).pathname.split("/").pop();
  const rd = page.locator('[data-date-key="resultsDue"]');
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(day(40)); await page.waitForTimeout(400); }
  await rd.locator('input[type="time"]').fill("17:00");
  await page.waitForTimeout(300);
  await page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ }).click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);

  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  const lists = page.locator("[data-scheme-lists]");
  for (let i = 0; i < 20 && !(await lists.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  const ship = lists.locator('[data-list="ship"]');
  for (let i = 0; i < 20 && (await ship.locator("[data-list-row]").count()) === 0; i++) { await ship.locator('[data-suggest="Waybill"]').click(); await page.waitForTimeout(400); }
  await ship.getByRole("button", { name: /Добави ред|Add a row/ }).click();
  await ship.locator('input[name="ship_1_bg"]').fill(`Декларация ${stamp}`);
  await ship.locator('input[name="ship_1_en"]').fill(`Declaration ${stamp}`);
  const rc = lists.locator('[data-list="rcpt"]');
  for (const [i, bg, en] of [[0, "Без видими повреди", "No visible damage"], [1, `Етикетът се чете ${stamp}`, `The label is legible ${stamp}`]]) {
    await rc.getByRole("button", { name: /Добави ред|Add a row/ }).click();
    await rc.locator(`input[name="rcpt_${i}_bg"]`).fill(bg);
    await rc.locator(`input[name="rcpt_${i}_en"]`).fill(en);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);
  await page.waitForLoadState("domcontentloaded");
  await go(`/schemes/${S}/edit`);
  for (let i = 0; i < 20 && !(await lists.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  t("setup: two shipment documents and two receipt checks on the scheme's lists", (await ship.locator("[data-list-row]").count()) === 2 && (await rc.locator("[data-list-row]").count()) === 2);

  // opened: the invitation sent
  await go(`/schemes/${S}`);
  const inv = page.locator('[data-doc-row="invitation"]');
  const [ch] = await Promise.all([page.waitForEvent("filechooser"), inv.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await ch.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: PDF("invitation") });
  await inv.locator("button", { hasText: /^📨/ }).waitFor();
  await inv.locator("button", { hasText: /^📨/ }).click();
  t("setup: the scheme open", await waitFor(async () => (await inv.locator('[data-edition-label="1"]').count()) === 1));

  // a legal entity, its laboratory and a user — A will be theirs
  const ENT = `Доставки ${stamp} ООД`, LAB = `Лаб. доставки ${stamp}`, USER = `Потребител доставки ${stamp}`;
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
  const eik = (() => { const d = String(10000000 + (stamp * 103) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const ecard = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await ecard.count()) === 1);
  const elabs = ecard.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await elabs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await elabs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await elabs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await elabs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Пловдив 3");
  await elabs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await elabs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const ebox = ecard.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await ebox.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await ebox.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await ebox.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await ebox.locator('[data-user-form="new"] [name="email"]').fill(`deliv${stamp}@lab-test.bg`);
  await ebox.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await ebox.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await ebox.locator("[data-user]", { hasText: USER }).getAttribute("data-user");
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/dev/persona?role=manager");

  // A — entered by PTS, linked to the entity's laboratory
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(NAME_A);
  await add.locator('[name="deliveryAddress"]').fill(`ул. Доставка ${stamp}`).catch(() => {});
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(NAME_A));
  const pidA = await page.locator("[data-participant-row]", { hasText: NAME_A }).locator("xpath=following-sibling::tr[@data-standing-row][1]").getAttribute("data-standing-row");
  {
    const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
    await cell.locator("[data-freeze-open] button").click();
    const ff = cell.locator("[data-freeze-form]");
    await waitFor(async () => (await ff.count()) === 1);
    await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
    await ff.locator("[data-freeze-confirm]").check();
    await ff.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);
  }
  // B — a laboratory's account (coded at once, dev)
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/lab");
  const pidB = await page.locator(`[data-lab-card="${S}"] [data-open-participation]`).getAttribute("data-open-participation");
  t("setup: A entered by PTS, B a laboratory's account", !!pidA && !!pidB);

  // the announcements, the final list, the coding act
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
  await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "2");
  await go(`/schemes/${S}#stages`);
  if (await page.locator("[data-coding] [data-coding-run]").count()) {
    await page.locator("[data-coding] [data-coding-run]").click();
    await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1);
  }
  t("setup: both on the final list, coded", true);

  // ── «Доставки»: B to send — its address shown to who sees names; dispatch with a waybill and documents ──
  await go(`/deliveries?scheme=${S}`);
  const rowB = page.locator(`[data-delivery-row="${pidB}"]`);
  await rowB.waitFor();
  t("«Доставки»: B — to send", (await rowB.getAttribute("data-delivery-state")) === "to-send");
  t("…the address shown to who sees names (an opening for dispatch, on record)", (await rowB.locator("[data-dispatch-address]").count()) === 1);
  t("…the scheme's shipment documents offered, ticked", (await rowB.locator('[data-dispatch-form="dispatch"] input[name="doc"]').count()) === 2 || (await rowB.locator("summary").click().then(() => rowB.locator('[data-dispatch-form="dispatch"] input[name="doc"]').count())) === 2);
  const W1 = `W1-${stamp}`;
  if (!(await rowB.locator('[data-dispatch-form="dispatch"]').isVisible())) await rowB.locator("[data-dispatch-forms] summary").click();
  await rowB.locator('[data-dispatch-form="dispatch"] input[name="waybill"]').fill(W1);
  await rowB.locator('[data-dispatch-form="dispatch"] input[name="carrier"]').fill("Спиди");
  await rowB.locator('[data-dispatch-form="dispatch"] button[type="submit"]').click();
  t("dispatched: recorded, the participation told", await waitFor(async () => (await page.locator('[data-deliveries-ok="dispatch"]').count()) === 1));
  // a notice to a laboratory waits for a person to release it (send control, 1.8; Zadanie §12)
  await go("/notices");
  t("…its notice — the waybill and the carrier — held in «Известия» for a person to release", await waitFor(async () => (await page.locator("[data-held]").filter({ hasText: W1 }).count()) >= 1) && /Спиди/.test(await textOf(page.locator("[data-held]").filter({ hasText: W1 }).first())));
  await go(`/deliveries?scheme=${S}`);
  t("…B: sent — awaiting the protocol; its documents with it; no second dispatch offered", (await page.locator(`[data-delivery-row="${pidB}"]`).getAttribute("data-delivery-state")) === "sent" && (await textOf(page.locator(`[data-delivery-row="${pidB}"] [data-shipment="dispatch"]`))).includes(W1) && (await textOf(page.locator(`[data-delivery-row="${pidB}"] [data-shipment="dispatch"]`))).includes(`Декларация ${stamp}`) && (await page.locator(`[data-delivery-row="${pidB}"] [data-dispatch-form="dispatch"]`).count()) === 0);

  // ── A: handed to its own courier (Реш. 154) ──
  const rowA = page.locator(`[data-delivery-row="${pidA}"]`);
  if (!(await rowA.locator('[data-dispatch-form="handover"]').isVisible())) await rowA.locator("[data-dispatch-forms] summary").click();
  const ho = rowA.locator('[data-dispatch-form="handover"]');
  await ho.locator('input[name="time"]').fill("14:30");
  await ho.locator('input[name="carrier"]').fill("DHL Express");
  await ho.locator('input[name="receiver"]').fill(`Куриер ${stamp}`);
  await ho.locator('button[type="submit"]').click();
  t("A: handed to its own courier on Ф 7.3.4-1 — the day, the hour, the carrier, who took it", await waitFor(async () => (await page.locator('[data-deliveries-ok="handover"]').count()) === 1) && /14:30 · DHL Express/.test(await textOf(page.locator(`[data-delivery-row="${pidA}"] [data-shipment="handover"]`))));

  // ── B, the laboratory: told; its online protocol — one check failed: «негоден» (Реш. 79) ──
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidB}`);
  t("B's page: dispatched — the waybill and the carrier shown", (await page.locator("[data-participation-page]").getAttribute("data-state")) === "dispatched" && (await textOf(page.locator("[data-delivery]"))).includes(W1));
  const rf = page.locator("[data-receipt-form]");
  t("…the online protocol: the packaging and the scheme's two checks, each yes/no", (await rf.count()) === 1 && (await rf.locator("[data-check]").count()) === 3);
  const checkIds = await rf.locator("fieldset[data-check]:not([data-check='undamaged'])").evaluateAll((els) => els.map((e) => e.getAttribute("data-check")));
  const fill = async (f, dayIso, answers) => {
    await f.locator('input[name="day"]').fill(dayIso);
    await f.locator('input[name="time"]').fill("11:24");
    await f.locator('input[name="receivedBy"]').fill(`Мария ${stamp}`);
    await f.locator('input[name="undamaged"][value="yes"]').check();
    for (let i = 0; i < checkIds.length; i++) await f.locator(`input[name="check_${checkIds[i]}"][value="${answers[i]}"]`).check();
  };
  // a day before the object left: refused (review)
  // the form offers no day before the dispatch (the security sweep, UL-3) — the server's own refusal is
  // checked with the browser's limits taken off
  t("…the day of receipt: no day before the dispatch offered", /^\d{4}-\d{2}-\d{2}$/.test(await rf.locator('input[name="day"]').getAttribute("min") ?? ""));
  await fill(rf, day(-2), ["yes", "no"]);
  await rf.evaluate((f) => { f.querySelector('input[name="day"]').removeAttribute("max"); f.querySelector('input[name="day"]').removeAttribute("min"); });
  await submit(page, rf.locator('button[type="submit"]'), /e=receipt-before/);
  t("…a day of receipt before the dispatch: refused", (await attr(page.locator("[data-page-err]"), "data-page-err")) === "receipt-before");
  // a second tab with the same form, kept open: its protocol after the first is refused (review)
  const page2 = await page.context().newPage();
  await page2.goto(`${BASE}/lab/p/${pidB}`, { waitUntil: "domcontentloaded" });
  const rf2stale = page2.locator("[data-receipt-form]");
  await fill(rf2stale, day(0), ["yes", "yes"]);
  await go(`/lab/p/${pidB}`);
  await fill(page.locator("[data-receipt-form]"), day(0), ["yes", "no"]);
  await submit(page, page.locator("[data-receipt-form] button[type='submit']"), /ok=receipt/);
  await submit(page2, rf2stale.locator('button[type="submit"]'), /e=receipt-twice/);
  t("…a second protocol for the same shipment, from a stale form: refused — one protocol", /e=receipt-twice/.test(page2.url()));
  await page2.close();
  await go(`/lab/p/${pidB}?ok=receipt`);
  t("…filed: «негоден» — one check failed (Реш. 79); received", (await attr(page.locator("[data-receipt]"), "data-receipt")) === "unfit" && (await page.locator("[data-participation-page]").getAttribute("data-state")) === "received" && (await page.locator("[data-receipt-form]").count()) === 0);
  const journal = await (await page.request.get(`${BASE}/lab/p/${pidB}`)).text();
  t("…the protocol is filed once — no form for the same shipment", !journal.includes("data-receipt-form"));

  // ── PTS: unfit — a replacement only with the minimum working days left (Реш. 127) ──
  await go("/dev/persona?role=manager");
  await go(`/deliveries?scheme=${S}`);
  t("«Доставки»: B — received, NOT fit; the failed check named", (await page.locator(`[data-delivery-row="${pidB}"]`).getAttribute("data-delivery-state")) === "unfit" && (await attr(page.locator(`[data-delivery-row="${pidB}"] [data-receipt]`), "data-receipt")) === "unfit" && (await textOf(page.locator(`[data-delivery-row="${pidB}"] [data-receipt]`))).includes(`✗ Етикетът се чете ${stamp}`));
  const md = page.locator("[data-min-days-form]");
  await md.locator('input[name="days"]').fill("60");
  await md.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator('[data-deliveries-ok="days"]').count()) === 1);
  t("the minimum set to 60 working days: the replacement refused — how many are left said", (await attr(page.locator("[data-min-days]"), "data-min-days")) === "60" && await (async () => { await page.locator(`[data-delivery-row="${pidB}"] [data-dispatch-forms] summary`).click(); return (await page.locator(`[data-delivery-row="${pidB}"] [data-replacement-refused="too-late"]`).count()) === 1 && /Остават \d+ работни дни, нужни са 60|\d+ working days are left, 60 are needed/.test(await textOf(page.locator(`[data-delivery-row="${pidB}"] [data-replacement-refused]`))); })());
  await md.locator('input[name="days"]').fill("1");
  await md.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator('[data-deliveries-ok="days"]').count()) === 1 && (await attr(page.locator("[data-min-days]"), "data-min-days")) === "1");
  const repl = page.locator(`[data-delivery-row="${pidB}"] [data-dispatch-form="replacement"]`);
  if (!(await repl.isVisible().catch(() => false))) await page.locator(`[data-delivery-row="${pidB}"] [data-dispatch-forms] summary`).click();
  await repl.locator('input[name="waybill"]').fill(`W2-${stamp}`);
  await repl.locator('input[name="reason"]').fill("негоден при получаване");
  await repl.locator('button[type="submit"]').click();
  t("…with the minimum allowing it: a replacement sent, told", await waitFor(async () => (await page.locator('[data-deliveries-ok="replacement"]').count()) === 1) && (await page.locator(`[data-delivery-row="${pidB}"]`).getAttribute("data-delivery-state")) === "sent" && (await page.locator(`[data-delivery-row="${pidB}"] [data-shipment="replacement"]`).count()) === 1);

  t("…and no second replacement offered for the same unfit protocol", (await page.locator(`[data-delivery-row="${pidB}"] [data-dispatch-form="replacement"]`).count()) === 0);

  // ── B: the replacement on its way — «изпратено» again, its protocol awaited (review); then fit; a problem ──
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pidB}`);
  t("B: the replacement on its way — dispatched again, the bar at «Получаване»", (await page.locator("[data-participation-page]").getAttribute("data-state")) === "dispatched" && (await attr(page.locator("[data-stage-bar]"), "data-stage-bar")) === "receipt");
  await go("/lab");
  t("…«Изисква действие» asks for its receipt", (await page.locator(`[data-action="delivery"][data-action-for="${pidB}"]`).count()) === 1);
  await go(`/lab/p/${pidB}`);
  const rf2 = page.locator("[data-receipt-form]");
  t("B: a protocol awaited for the replacement", (await rf2.count()) === 1);
  await rf2.locator('input[name="time"]').fill("09:05");
  await rf2.locator('input[name="receivedBy"]').fill(`Мария ${stamp}`);
  await rf2.locator('input[name="undamaged"][value="yes"]').check();
  for (const id of checkIds) await rf2.locator(`input[name="check_${id}"][value="yes"]`).check();
  await submit(page, rf2.locator('button[type="submit"]'), /ok=receipt/);
  t("…every check passed: «годен»", (await page.locator('[data-receipt="fit"]').count()) === 1);
  await page.locator("[data-problem-box] summary").click();
  await page.locator('[data-problem-box] textarea[name="text"]').fill(`Липсва етикет на кутия 2 (${stamp})`);
  await submit(page, page.locator('[data-problem-box] button[type="submit"]'), /ok=problem/);
  t("…a problem signalled — with PTS", (await page.locator('[data-problem-open="1"]').count()) === 1);

  // the laboratory's account cannot reach A — the entity's (only its own)
  const notMine = await (await page.request.get(`${BASE}/lab/p/${pidA}`)).text();
  t("a laboratory's account: another participation's page — not found", !notMine.includes("data-participation-page") && /404|could not be found/i.test(notMine));

  // ── A, a user of the entity: its protocol for the hand-over ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/p/${pidA}`);
  const rfA = page.locator("[data-receipt-form]");
  t("A (an entity's user): handed to its courier — the protocol awaited", (await page.locator("[data-participation-page]").getAttribute("data-state")) === "dispatched" && (await rfA.count()) === 1);
  await fill(rfA, day(0), ["yes", "yes"]);
  await submit(page, rfA.locator('button[type="submit"]'), /ok=receipt/);
  t("…filed by the entity's user: fit, received", (await page.locator('[data-receipt="fit"]').count()) === 1 && (await page.locator("[data-participation-page]").getAttribute("data-state")) === "received");

  // ── PTS: the problem, resolved; the record kept ──
  await go("/dev/persona?role=manager");
  await go(`/deliveries?scheme=${S}`);
  const rowB2 = page.locator(`[data-delivery-row="${pidB}"]`);
  t("«Доставки»: B — fit, one problem open", (await rowB2.getAttribute("data-delivery-state")) === "fit" && (await rowB2.getAttribute("data-delivery-problems")) === "1");
  await rowB2.locator('[data-problem-open="1"] input[name="note"]').fill("изпратен нов етикет");
  await rowB2.locator('[data-problem-open="1"] button[type="submit"]').click();
  t("…resolved, with its note — the problem kept", await waitFor(async () => (await page.locator('[data-deliveries-ok="resolved"]').count()) === 1) && (await page.locator(`[data-delivery-row="${pidB}"]`).getAttribute("data-delivery-problems")) === "0" && /изпратен нов етикет/.test(await textOf(page.locator(`[data-delivery-row="${pidB}"] [data-problem-open="0"]`))));
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("the journal: the dispatches, the protocols, the problem and its resolution — never the received-by name, the resolution's note or the carrier", /Receipt protocol of [^<]* NOT fit|Протокол за получаване/.test(act) && !act.includes(`Мария ${stamp}`) && !act.includes("изпратен нов етикет") && !act.includes("DHL Express"));
  const texts = await (await page.request.get(`${BASE}/notices/texts`)).text();
  t("the receipt reminder's words — PTS's to approve (1.8)", texts.includes('data-template="receipt.due"'));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-delivery: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
