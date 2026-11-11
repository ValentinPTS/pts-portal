// Plan part 10.1 check (the catalogue; D15, Реш. 147, К1, К19, К25), against a LOCAL dev server (in-memory
// store, login off):   BASE=http://localhost:3000 node scripts/verify-catalogue.mjs
// A scheme with a price and an object of its own; a draft. The public catalogue (no session): the started
// scheme with its state, never the draft, never a count or a place; its page: the state, the catalogue.
// The portal's «Каталог»: the price to an approved organisation; PTS closes the applications → «Уведоми
// ме при следваща» offered and recorded. A new scheme of the same object STARTED → a notice to the
// organisation held in «Известия»; released → the organisation sees it; the wish used. On record, no name.
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
let promptAnswer = "";
page.on("dialog", (d) => d.accept(promptAnswer || undefined));
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 50) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const text = async (loc) => ((await loc.count()) ? (await loc.first().textContent()) ?? "" : "");
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 61) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Каталожна ${stamp} ООД`, LAB = `Лаб. Каталог ${stamp}`, USER = `Читател ${stamp}`, OBJ = `Обект каталог ${stamp}`;

// a new scheme from the aggregates sample, its object set; `status` the state it is saved in
async function newScheme(name, status, price) {
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(name);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const id = new URL(page.url()).pathname.split("/").pop();
  await saveScheme(id, status, price);
  return id;
}
async function saveScheme(id, status, price) {
  await go(`/schemes/${id}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  await type(page.locator('input[name="objectBg"]').first(), OBJ);
  if (price) {
    const box = page.locator("[data-commercial]");
    for (let i = 0; i < 20 && !(await box.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
    await type(box.locator('[name="com_base"]'), "120");
    await type(box.locator('[name="com_step"]'), "40,50");
    await type(box.locator('[name="com_max"]'), "7");
  }
  const want = status === "draft" ? /^(Чернова|Draft)$/ : /Отворена|Open/;
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: want }).first().click().catch(() => {});
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === status) break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }).catch(() => {}), page.locator('button[type="submit"].btn-primary').first().click()]);
}

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a started scheme with a price; a draft ──
  const S = await newScheme(`Каталог ${stamp}`, "open", true);
  const D = await newScheme(`Чернова ${stamp}`, "draft", false);
  const numberOf = async (id) => { await go(`/schemes/${id}/edit`); await page.locator('input[name="titleEn"]').waitFor(); return (await page.locator('input[name="number"]').first().inputValue()).trim(); };
  const SN = await numberOf(S), DN = await numberOf(D);

  // ── the public catalogue — no session at all ──
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(`${BASE}/catalogue`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const pubText = (await pub.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  const row = pub.locator(`[data-catalogue-scheme="${S}"]`);
  t("the public catalogue opens with no sign-in; the started scheme listed, taking applications, with its object", (await row.count()) === 1 && (await row.getAttribute("data-catalogue-state")) === "accepting" && (await row.innerText()).includes(OBJ) && (await pub.locator('[data-catalogue-group="taking"]').count()) === 1);
  t("…never the draft — no row, no number, no title (Реш. 147)", (await pub.locator(`[data-catalogue-scheme="${D}"]`).count()) === 0 && !pubText.includes(`Чернова ${stamp}`) && !pubText.includes(`/schemes/${D}`));
  t("…never a count, free places, the maximum or a price (К1, 3.7)", !/свободни места|free places|максим|maximum|120,00|120\.00/i.test(pubText));
  t("…the ways in: the portal, the registration, the PDF; «Уведоми ме при следваща» only in the portal (К25) — no e-mail field", (await pub.locator('[data-catalogue-paths] a[href="/lab/login"]').count()) === 1 && (await pub.locator('[data-catalogue-paths] a[href="/register"]').count()) === 1 && (await pub.locator("[data-catalogue-wish-note]").count()) === 1 && (await pub.locator('input[type="email"], input[name="email"]').count()) === 0);
  await pub.goto(`${BASE}/apply/${S}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  t("its public page: the state in words and the way back to the catalogue", (await pub.locator('[data-public-state="accepting"]').count()) === 1 && (await pub.locator('[data-catalogue-link]').count()) >= 1);
  const inv = await anon.request.get(`${BASE}/apply/${S}/invitation`);
  t("the invitation not released — not public (the released edition only, D15)", inv.status() === 404, `status ${inv.status()}`);
  await pub.goto(`${BASE}/apply`, { waitUntil: "domcontentloaded", timeout: 90000 });
  t("«/apply» links the catalogue", (await pub.locator('a[href="/catalogue"]').count()) >= 1);
  await anon.close();

  // ── the organisation: entered, a laboratory, a user ──
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Каталог 1", officialEmail: `office${stamp}@lab-test.bg` })) { const f = nf.locator(`[name="${k}"]`); if (await f.count()) await f.fill(v); }
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Русе 7");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`catalogue${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");

  // ── awaiting PTS's check: the catalogue, no price ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/catalogue");
  t("the portal's tab «Каталог»: the started scheme, its plan and invitation where released — no price before PTS's check", (await page.locator('[data-participant-nav] a[href="/lab/catalogue"]').count()) === 1 && (await page.locator(`[data-catalogue-scheme="${S}"]`).count()) === 1 && (await page.locator("[data-catalogue-price]").count()) === 0 && (await page.locator("[data-catalogue-price-pending]").count()) === 1 && (await page.locator(`[data-catalogue-scheme="${D}"]`).count()) === 0);

  // ── the organisation checked and active ──
  await go("/dev/persona?role=manager");
  await go("/organizations");
  const c2 = page.locator("[data-entity]", { hasText: ENT });
  await c2.locator('[data-entity-proof] input[type="file"]').setInputFiles({ name: "extract.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% entity ${stamp}\n%%EOF\n`) });
  await c2.locator('[data-entity-proof] button[type="submit"]').click();
  await waitFor(async () => (await c2.locator("[data-proof-link]").count()) === 1);
  promptAnswer = "проверено по извлечение";
  await c2.locator("[data-manual-check]").click();
  await waitFor(async () => (await c2.locator('[data-manual="1"]').count()) === 1);
  promptAnswer = "";
  await c2.locator('[data-state-to="active"]').click();
  await waitFor(async () => (await c2.locator('[data-entity-state="active"]').count()) === 1);

  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/catalogue");
  const mine = page.locator(`[data-catalogue-scheme="${S}"]`);
  const priceText = await text(mine.locator("[data-catalogue-price]"));
  t("approved: the announced price — one characteristic, each further one, the share, the delivery; never the maximum (3.7)", /120,00 €/.test(priceText) && /40,50 €/.test(priceText) && /50 %/.test(priceText) && /Доставка|Delivery/.test(priceText) && !/7 участ|максим|maximum/i.test(await text(mine)));
  t("…taking applications: «Заяви»; no «Уведоми ме» on a scheme that simply takes an application", (await mine.locator(`[data-catalogue-apply="${S}"]`).count()) === 1 && (await mine.locator("[data-catalogue-wish]").count()) === 0);

  // ── PTS closes the applications: «Уведоми ме при следваща» offered ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  await page.locator("[data-applications-close]").click();
  await waitFor(async () => (await page.locator('[data-applications-state="closed"]').count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/catalogue");
  const wish = page.locator(`[data-catalogue-wish="${S}"]`);
  t("closed by hand: «Заявяването е затворено» in the current ones; «Уведоми ме при следваща» offered", (await page.locator(`[data-catalogue-group="current"] [data-catalogue-scheme="${S}"]`).getAttribute("data-catalogue-state")) === "closed" && (await wish.count()) === 1 && (await wish.getAttribute("data-wished")) === "0");
  await wish.locator("button").click();
  await waitFor(async () => (await wish.getAttribute("data-wished")) === "1");
  await go("/lab/catalogue");
  t("…asked: recorded — the button turned, the subject among the organisation's wishes", (await page.locator(`[data-catalogue-wish="${S}"]`).getAttribute("data-wished")) === "1" && (await text(page.locator("[data-catalogue-wishes]"))).includes(OBJ));

  // ── a new scheme of the same object STARTED — a draft opened by the scheme page's act «open» (10.1 review) ──
  await go("/dev/persona?role=manager");
  const N = await newScheme(`Следваща ${stamp}`, "draft", false);
  const NN = await numberOf(N);
  await go(`/schemes/${N}#stages`);
  await page.locator('[data-act="open"]').click();
  await waitFor(async () => (await page.locator('[data-act="open"]').count()) === 0);
  // decided by THAT scheme's manager — a role of the model, not the open build (10.1 review)
  await go(`/dev/persona?model=scheme_manager@${N}`);
  await go("/notices");
  const held = page.locator("[data-held]", { hasText: NN });
  t("the start told the organisation — a notice held in «Известия» for the scheme's manager (1.8), the scheme and the object in its words, never the organisation", await waitFor(async () => { await go("/notices"); return (await held.count()) >= 1; }, 10) && /Поискахте|You asked/.test(await text(held)) && !(await text(held)).includes(ENT) && (await held.first().getByRole("button", { name: /^(Изпрати|Send)$/ }).count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  t("…held: the organisation does not see it yet", !(await text(page.locator("main"))).includes(NN));
  await go(`/dev/persona?model=scheme_manager@${N}`);
  for (let i = 0; i < 8; i++) {
    await go("/notices");
    await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
    if ((await held.count()) === 0) break;
    await Promise.all([page.waitForURL(/\/notices/, { timeout: 30000 }).catch(() => {}), held.first().getByRole("button", { name: /^(Изпрати|Send)$/ }).click()]);
    await page.waitForTimeout(1500);
  }
  t("…released by the scheme's manager", (await held.count()) === 0);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const seen = page.locator('[data-notice-kind="catalogue.next"]', { hasText: NN });
  t("…the organisation sees it, with the way to apply", await waitFor(async () => { await go("/lab/overview"); return (await seen.count()) === 1; }, 10));
  await go("/lab/catalogue");
  t("…the wish used — the next one only", (await page.locator("[data-catalogue-wishes]").count()) === 0 && (await page.locator(`[data-catalogue-wish="${S}"]`).getAttribute("data-wished")) === "0");

  // ── asked again, cancelled by its own button in the standing list (10.1 review) ──
  await page.locator(`[data-catalogue-wish="${S}"] button`).click();
  await waitFor(async () => (await page.locator("[data-catalogue-wish-standing]").count()) === 1);
  const standing = page.locator("[data-catalogue-wish-standing]").first();
  await standing.locator("button").click();
  t("a standing wish cancelled from the list — by its id; the scheme's button turns back", await waitFor(async () => (await page.locator("[data-catalogue-wish-standing]").count()) === 0) && await waitFor(async () => (await page.locator(`[data-catalogue-wish="${S}"]`).getAttribute("data-wished")) === "0"), `standing ${await page.locator("[data-catalogue-wish-standing]").count()} :: ${await page.locator(`[data-catalogue-wish="${S}"]`).getAttribute("data-wished")} :: ${await text(page.locator('[role="alert"]'))}`);

  // ── a held notice of a scheme taken back to draft is never released (Реш. 147; 10.1 review) ──
  await page.locator(`[data-catalogue-wish="${S}"] button`).click();
  await waitFor(async () => (await page.locator(`[data-catalogue-wish="${S}"]`).getAttribute("data-wished")) === "1");
  await go("/dev/persona?role=manager");
  const N2 = await newScheme(`Върната ${stamp}`, "draft", false);
  const N2N = await numberOf(N2);
  await go(`/schemes/${N2}#stages`);
  await page.locator('[data-act="open"]').click();
  await waitFor(async () => (await page.locator('[data-act="open"]').count()) === 0);
  await saveScheme(N2, "draft", false);
  await go("/notices");
  const held2 = page.locator("[data-held]", { hasText: N2N });
  await waitFor(async () => { await go("/notices"); return (await held2.count()) >= 1; }, 10);
  t("…the scheme back in draft: its notice held, «Изпрати» not offered — only «Не изпращай»", (await held2.count()) >= 1 && (await held2.first().locator("[data-notice-unstarted]").count()) === 1 && (await held2.first().getByRole("button", { name: /^(Изпрати|Send)$/ }).count()) === 0);
  await held2.first().getByRole("button", { name: /^(Не изпращай|Do not send)$/ }).click();
  await waitFor(async () => { await go("/notices"); return (await held2.count()) === 0; }, 10);

  // ── on record, never a name ──
  await go("/dev/persona?role=manager");
  await go("/activity");
  await page.getByText(/Notify me of the next/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await text(page.locator("main"));
  t("on record — the wish and the telling; never the organisation's name", /«Notify me of the next» asked/.test(journal) && /organisation told that/.test(journal) && !journal.includes(ENT) && !journal.includes(USER), `${SN} ${DN}`);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-catalogue: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
