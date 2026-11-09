// Plan part 5.1 check (applications entered by PTS), against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-pts-applications.mjs
// On a scheme of its own: an application from the PDF with its participations per
// characteristic — a participant at once, its objects computed and totalled; none
// taken is refused, nothing saved. One is refused with its category and reason — out
// of the round, its code kept, the total without it; linked to its laboratory, the
// refusal waits in «Известия» as the exact e-mail. One withdrawn with its source. On
// record without the reason.
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
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
page.on("dialog", (d) => d.accept());
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 79) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const A = `Заявка А ${stamp}`, B = `Заявка Б ${stamp}`, C = `Заявка В ${stamp}`, ENT = `Заявител ${stamp} ООД`, LAB = `Лаб. заявител ${stamp}`;
const REASON = `липсва подпис ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // an entity with a laboratory, to link one participation to (its refusal then has someone to tell)
  await go("/organizations");
  const nf = page.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = page.locator("[data-entity]", { hasText: ENT });
  await waitFor(async () => (await card.count()) === 1);
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await page.waitForTimeout(300); }
  await labs.locator('[data-lab-form="new"] [name="name"]').fill(LAB);
  await labs.locator('[data-lab-form="new"] [name="deliveryAddress"]').fill("Русе 2");
  await labs.locator('[data-lab-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);

  // a scheme of its own
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Заявки ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const sels = add.locator('[data-add-selections] input[name^="sel_"]');
  const n = await sels.count();
  const enter = async (name, counts) => {
    await add.locator('[name="labName"]').fill(name);
    for (let i = 0; i < n; i++) await sels.nth(i).fill(String(counts[i] ?? 0));
    await add.locator('button[type="submit"]').click();
    // the action redirects back to this page: wait for the new row (or the refusal) before the next
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(name) || (await page.locator("[data-err-selections]").count()) > 0);
  };
  // none taken: refused, nothing saved
  await enter(`Нищо ${stamp}`, []);
  t("an application with no characteristic taken: refused in words, nothing saved", await waitFor(async () => (await page.locator("[data-err-selections]").count()) === 1) && !(await page.locator("tbody").innerText()).includes(`Нищо ${stamp}`));
  await go(`/schemes/${S}/participants`);
  await enter(A, [2, 1]);
  await enter(B, [1]);
  await enter(C, [1, 1]);
  const rowA = page.locator("[data-participant-row]", { hasText: A });
  t("entered: a participant at once (no approval act) — its objects computed from its counts: the largest", await waitFor(async () => (await rowA.count()) === 1) && (await rowA.locator("[data-objects]").getAttribute("data-objects")) === "2" && (await rowA.getAttribute("data-in-round")) === "1");
  t("…the round's objects totalled", (await page.locator("[data-objects-total]").getAttribute("data-objects-total")) === "4");
  const codeA = (await rowA.locator("td").first().innerText()).trim();

  // link A to its laboratory (its refusal then has someone to tell)
  const pidA = await rowA.locator("xpath=following-sibling::tr[@data-standing-row][1]").getAttribute("data-standing-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);

  // refuse A — its category and reason
  const st = page.locator(`[data-standing-row="${pidA}"]`);
  await st.locator("summary").click();
  await st.locator('[data-standing-open="refused"]').click();
  const rf = st.locator('[data-standing-form="refused"]');
  await rf.locator('select[name="category"]').selectOption("incomplete");
  await rf.locator('[name="reason"]').fill(REASON);
  await rf.locator('button[type="submit"]').click();
  // by its code: linked to its laboratory, its name is now the frozen laboratory's (4.5)
  const rowA2 = page.locator(`[data-participant-row="${codeA}"]`);
  t("refused with its category and reason: out of the round, its code kept, shown why", await waitFor(async () => (await rowA2.getAttribute("data-in-round")) === "0") && (await rowA2.locator("[data-standing-state]").getAttribute("data-standing-state")) === "refused" && (await rowA2.locator("td").first().innerText()).trim() === codeA && (await textOf(page.locator(`[data-standing-row="${pidA}"] [data-standing-detail]`))).includes(REASON));
  t("…the round's objects without it", (await page.locator("[data-objects-total]").getAttribute("data-objects-total")) === "2");

  // withdraw C — its source
  const rowC = page.locator("[data-participant-row]", { hasText: C });
  const codeC = (await rowC.locator("td").first().innerText()).trim();
  const pidC = await rowC.locator("xpath=following-sibling::tr[@data-standing-row][1]").getAttribute("data-standing-row");
  const stC = page.locator(`[data-standing-row="${pidC}"]`);
  await stC.locator("summary").click();
  await stC.locator('[data-standing-open="withdrawn"]').click();
  const wf = stC.locator('[data-standing-form="withdrawn"]');
  await wf.locator('[name="source"]').fill("писмо от лабораторията вх. № 7");
  await wf.locator('button[type="submit"]').click();
  t("withdrawn with its source: out of the round too", await waitFor(async () => (await page.locator("[data-participant-row]", { hasText: C }).getAttribute("data-in-round")) === "0") && (await page.locator("[data-objects-total]").getAttribute("data-objects-total")) === "1");

  // B is not linked to a laboratory in the portal: a refusal would reach nobody — said so
  const rowB = page.locator("[data-participant-row]", { hasText: B });
  const codeB = (await rowB.locator("td").first().innerText()).trim();
  const pidB = await rowB.locator("xpath=following-sibling::tr[@data-standing-row][1]").getAttribute("data-standing-row");
  const stB = page.locator(`[data-standing-row="${pidB}"]`);
  await stB.locator("summary").click();
  await stB.locator('[data-standing-open="refused"]').click();
  t("a refusal of a participation not linked to a laboratory: PTS told to tell it themselves (review)", await waitFor(async () => (await stB.locator("[data-standing-unreachable]").count()) === 1));
  t("…the participants counted are those in the round, the others shown apart", (await page.locator("[data-in-round-count]").getAttribute("data-in-round-count")) === "1");

  // the round's documents: the coded list of participants holds those in the round only (review)
  const doc = await (await page.request.get(`${BASE}/schemes/${S}/build/registered-coded/print?lang=bg`, { timeout: 90000 })).text();
  t("the coded list of participants (F 7.2.1-5): the one in the round, never the refused or the withdrawn", doc.includes(codeB) && !doc.includes(codeA) && !doc.includes(codeC), `B ${doc.includes(codeB)} A ${doc.includes(codeA)} C ${doc.includes(codeC)}`);

  // the refusal waits for «Изпрати», as the exact e-mail
  await go("/notices");
  await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
  // this scheme's notice: a provisional reference (5.3) is Z001 in every scheme
  const held = page.locator("[data-held]").filter({ has: page.locator(`a[href="/schemes/${S}"]`) }).filter({ hasText: codeA });
  t("the refusal told to the laboratory — held for «Изпрати», its category and reason in the exact text", await waitFor(async () => (await held.count()) >= 1) && (await textOf(held.first())).includes(REASON) && /непълна заявка/.test(await textOf(held.first())));
  await go("/activity");
  await page.getByText(/refused/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record — refused with its category, withdrawn — never the reason or the source", new RegExp(`Participation ${codeA} refused — incomplete`).test(journal) && /withdrawn \(out of the round/.test(journal) && !journal.includes(REASON) && !journal.includes("вх. № 7"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-pts-applications: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
