// Plan part 9.3 check (the waiting list), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-waitlist.mjs
// A scheme with a maximum of one; an active organisation with two laboratories. The first applies —
// in; the scheme now «Запълнена» for the laboratory (a label, applying still open); the second applies
// — on the waiting list: the laboratory sees «В списъка на изчакващите», PTS its place. PTS closes the
// applications by hand — none taken — and opens them again. The second announcement keeps the second
// off the list, on the waiting list; with a reserve object free and the minimum days, PTS admits it — it
// joins the final list. On record without a name.
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
const eik = (() => { const d = String(10000000 + (stamp * 79) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Чака ${stamp} ООД`, LA = `Лаб. Първа ${stamp}`, LB = `Лаб. Втора ${stamp}`, USER = `Изчакващ ${stamp}`;

const apply = async (S, labName) => {
  await go(`/lab/apply/${S}`);
  const form = page.locator(`[data-apply-form="${S}"]`);
  await form.waitFor();
  const value = await form.locator("[data-apply-lab] option", { hasText: labName }).getAttribute("value");
  for (let i = 0; i < 20; i++) { await form.locator("[data-apply-lab]").selectOption(value); if ((await form.locator("[data-apply-lab]").inputValue()) === value) break; await page.waitForTimeout(400); }
  await Promise.all([page.waitForURL(/\/lab\/apply\?done=/, { timeout: 90000 }).catch(() => {}), form.locator("[data-apply-submit]").click()]);
  return value;
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── a scheme with a maximum of one ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Изчакване ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  const box = page.locator("[data-commercial]");
  for (let i = 0; i < 20 && !(await box.isVisible().catch(() => false)); i++) { await page.locator("details.mt-8 summary").first().click(); await page.waitForTimeout(400); }
  await box.locator('[name="minParticipants"]').fill("1");
  await type(box.locator('[name="com_max"]'), "1");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }), page.locator('button[type="submit"].btn-primary').first().click()]);

  // ── an active organisation, two laboratories, a user ──
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Чака 1", officialEmail: `office${stamp}@lab-test.bg` })) { const f = nf.locator(`[name="${k}"]`); if (await f.count()) await f.fill(v); }
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (const [name, addr] of [[LA, "Русе 1"], [LB, "Бургас 2"]]) {
    for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
    await labs.locator('[data-lab-form="new"] [name="name"]').fill(name);
    await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill(addr);
    await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
    await waitFor(async () => (await labs.locator("[data-lab]", { hasText: name }).count()) === 1);
  }
  const ubox = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await ubox.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await ubox.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await ubox.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await ubox.locator('[data-user-form="new"] [name="email"]').fill(`wait${stamp}@lab-test.bg`);
  await ubox.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await ubox.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await ubox.locator("[data-user]", { hasText: USER }).getAttribute("data-user");
  await card.locator('[data-entity-proof] input[type="file"]').setInputFiles({ name: "extract.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% entity ${stamp}\n%%EOF\n`) });
  await card.locator('[data-entity-proof] button[type="submit"]').click();
  await waitFor(async () => (await card.locator("[data-proof-link]").count()) === 1);
  promptAnswer = "проверено";
  await card.locator("[data-manual-check]").click();
  await waitFor(async () => (await card.locator('[data-manual="1"]').count()) === 1);
  promptAnswer = "";
  await card.locator('[data-state-to="active"]').click();
  await waitFor(async () => (await card.locator('[data-entity-state="active"]').count()) === 1);

  // ── the first applies — in; then «Запълнена» (a label); the second — on the waiting list ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/apply");
  t("before the maximum: not «Запълнена»", (await page.locator(`[data-apply-scheme="${S}"] [data-apply-full]`).count()) === 0);
  await apply(S, LA);
  await go("/lab/apply");
  t("the maximum reached: «Запълнена» — a label; the scheme still offered (Реш. 120)", (await page.locator(`[data-apply-scheme="${S}"]`).count()) === 1 && (await page.locator(`[data-apply-scheme="${S}"] [data-apply-full]`).count()) === 1);
  await go(`/lab/apply/${S}`);
  t("…the form says an application goes on the waiting list — never the maximum (3.7)", (await page.locator("[data-apply-full]").count()) === 1 && !/максимал|maximum/i.test(await text(page.locator("main"))));
  const labB = await apply(S, LB);
  await go(`/lab/overview?lab=${labB}`);
  t("the second laboratory's participation: «В списъка на изчакващите» — never its place", await waitFor(async () => (await page.locator('[data-participations-table="active"] tr[data-row-state="waitlisted"]').count()) === 1) && !/№\s*1|#1/.test(await text(page.locator('[data-participations-table="active"]'))));

  // ── PTS: the place; closed by hand, opened again ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  const rowB = page.locator("tr", { hasText: LB }).first();
  await waitFor(async () => (await rowB.locator("[data-waitlisted]").count()) === 1);
  t("PTS's «Участници»: the second on the waiting list, its place; the panel lists it", (await rowB.locator('[data-waitlisted="1"]').count()) === 1 && (await page.locator("[data-waitlist] [data-waitlist-row]").count()) === 1 && (await text(page.locator("[data-waitlist]"))).includes(LB));
  await page.locator("[data-applications-close]").click();
  await waitFor(async () => (await page.locator('[data-applications-state="closed"]').count()) === 1);
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/apply");
  t("closed by hand: the scheme not offered; its page says PTS closed it", (await page.locator(`[data-apply-scheme="${S}"]`).count()) === 0);
  await go(`/lab/apply/${S}`);
  t("…the reason said", /PTS затвори заявяването|PTS has closed the applications/.test(await text(page.locator("[data-apply-closed]"))));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  await page.locator("[data-applications-open]").click();
  t("…and opened again", await waitFor(async () => (await page.locator('[data-applications-state="open"]').count()) === 1));

  // ── a batch with participant and reserve objects; a results deadline far enough ──
  await go(`/schemes/${S}/batches`);
  const bf = page.locator("[data-batch-new]");
  for (const [k, v] of Object.entries({ label: "P1", preparedOn: "2026-09-10", count: "10", prefix: `7${stamp}`, material: "Материал", storage: "сухо", hsRecord: "" })) await bf.locator(`[name="${k}"]`).fill(v);
  await bf.locator('button[type="submit"]').click();
  const bcard = page.locator('[data-batch="P1"]');
  await waitFor(async () => (await bcard.count()) === 1);
  const draw = bcard.locator("[data-batch-draw]");
  for (const [k, v] of [["homogeneity", "2"], ["stability", "1"], ["participant", "3"], ["reserve", "2"]]) await draw.locator(`[name="${k}"]`).fill(v);
  await draw.locator('button[type="submit"]').click();
  await waitFor(async () => (await bcard.locator("[data-batch-drawn]").count()) === 1);
  await go(`/schemes/${S}`);
  const rd = page.locator('[data-date-key="resultsDue"]');
  const far = new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10);
  for (let i = 0; i < 30 && !(await rd.locator('input[type="time"]').isEnabled()); i++) { await rd.locator('input[type="date"]').fill(""); await rd.locator('input[type="date"]').fill(far); await page.waitForTimeout(400); }
  await page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ }).click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);

  // ── the final list leaves the waiting list out ──
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await text(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form2 = page.locator("[data-second-announcement]");
  await form2.waitFor();
  t("review: the counts for the second announcement leave the waiting one out — said", (await page.locator("[data-counts-without-waiting]").count()) === 1);
  if (!(await form2.locator('input[name="run_0"]').isChecked())) await form2.locator('input[name="run_0"]').check();
  await form2.locator("[data-second-submit]").click();
  t("the second announcement: one on the final list — the waiting one off it", await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "1"));
  await go(`/schemes/${S}/participants`);
  const rowB2 = page.locator("tr", { hasText: LB }).first();
  t("…kept on the waiting list — its place, «в списъка на изчакващите» (never «does not go on»); not admitted before the coding act", (await rowB2.locator('[data-waitlisted="1"]').count()) === 1 && /в списъка на изчакващите|on the waiting list/.test(await text(rowB2.locator("[data-final]"))) && /кодирането|coding act/.test(await text(page.locator("[data-waitlist-why]"))));
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/overview?lab=${labB}`);
  t("…the laboratory still sees «В списъка на изчакващите» — not «not on the final list»", await waitFor(async () => (await page.locator('[data-participations-table="active"] tr[data-row-state="waitlisted"]').count()) === 1));

  // ── the coding act; the object sent and received ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-coding] [data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1);
  await go(`/schemes/${S}/participants`);
  t("coded — now the receipt protocols wait", /протоколите за получаване|receipt protocols/.test(await text(page.locator("[data-waitlist-why]"))));
  await go(`/deliveries?scheme=${S}`);
  const drow = page.locator("[data-delivery-row]").first();
  await drow.waitFor();
  if (!(await drow.locator('[data-dispatch-form="dispatch"]').isVisible())) await drow.locator("[data-dispatch-forms] summary").click();
  await drow.locator('[data-dispatch-form="dispatch"] input[name="waybill"]').fill(`WL-${stamp}`);
  await drow.locator('[data-dispatch-form="dispatch"] input[name="carrier"]').fill("Спиди");
  await drow.locator('[data-dispatch-form="dispatch"] button[type="submit"]').click();
  await waitFor(async () => (await page.locator('[data-deliveries-ok="dispatch"]').count()) === 1);
  const pidA = await drow.getAttribute("data-delivery-row");
  await go(`/schemes/${S}/participants`);
  const dossier = await page.locator("tr", { hasText: LA }).first().locator("a").first().getAttribute("href");
  await go(dossier);
  const addStep = page.locator('form:has(input[name="ref"])');
  await addStep.locator('select[name="kind"]').selectOption("receipt_confirmed");
  await addStep.locator('input[name="ref"]').fill(`RC-${stamp}`);
  await addStep.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=RC-${stamp}`).catch(() => {});
  void pidA;

  // ── admitted: a reserve object free, the minimum days ──
  await go(`/schemes/${S}/participants`);
  t("the receipt in, a reserve object free, the minimum days: «Допусни» offered for the first in line", /свободни: 2|free: 2/.test(await text(page.locator("[data-waitlist-facts]"))) && await page.locator("[data-waitlist-admit]").isEnabled(), await text(page.locator("[data-waitlist-panel]")));
  await page.locator("[data-waitlist-admit]").click();
  t("admitted: off the waiting list — ON the final list", await waitFor(async () => (await page.locator("[data-waitlist]").count()) === 0 && (await page.locator("tr", { hasText: LB }).first().locator('[data-final="1"]').count()) === 1));
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-coding] [data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1);
  await go(`/schemes/${S}/participants`);
  t("review: the coding act codes the admitted one (its objects from the reserve — the unit test proves the pool)", !/^Z\d{3}/.test((await text(page.locator("tr", { hasText: LB }).first().locator("td").first())).trim()));
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go(`/lab/overview?lab=${labB}`);
  t("…the laboratory: no longer waiting", await waitFor(async () => (await page.locator('[data-participations-table="active"] tr[data-row-state="waitlisted"]').count()) === 0 && (await page.locator('[data-participations-table="active"] tr[data-participation-id]').count()) === 1));

  await go("/dev/persona?role=manager");
  await go("/activity");
  await page.getByText(/admitted from the waiting list/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await text(page.locator("main"));
  t("on record — closed and opened by hand, the waiting one in the announcement, the admission — never a name", /Applications closed by hand/.test(journal) && /Applications opened again/.test(journal) && /1 on the waiting list/.test(journal) && /admitted from the waiting list/.test(journal) && !journal.includes(LB) && !journal.includes(USER));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-waitlist: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
