// Plan part 5.3 check (the coding act; Zadanie «Кодиране»; А2; Реш. 124), against a LOCAL
// dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-coding.mjs
// On a scheme of its own, opened, with a batch whose objects are drawn: three
// applications — provisional references (Z…), no code; A and B on the final list, C not.
// A proforma sent to A before coding. The coding act: A and B get codes at random and
// their objects at random; C keeps its reference. Everything kept by the reference follows
// the code — the row, the proforma, the notices; each told its code. Once; stage 9 done.
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
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const dialogs = [];
page.on("dialog", async (d) => { dialogs.push({ type: d.type(), text: d.message() }); await d.accept(d.type() === "prompt" ? "Нова заявка след кодирането" : undefined); });
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 97) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const A = `Код А ${stamp}`, B = `Код Б ${stamp}`, C = `Код В ${stamp}`, ENT = `Код заявител ${stamp} ООД`, LAB = `Лаб. код ${stamp}`;
const PDF = Buffer.from(`%PDF-1.4\n% proforma ${stamp}\n%%EOF\n`);
const INV = Buffer.from(`%PDF-1.4\n% invitation ${stamp}\n%%EOF\n`);
const PREFIX = `K${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // an entity with a laboratory — A is linked to it, so its notices have someone to tell
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

  // a scheme of its own: a deadline, the invitation sent, open
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Кодиране ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const NUMBER = (await page.locator("text=/PTS \\d{2}\\/\\d{2}-T-\\d+/").first().innerText()).trim();
  const resultsDue = page.locator('label:has-text("Краен срок за резултати") input[type="date"]');
  await resultsDue.waitFor();
  const saveDates = page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ });
  for (let i = 0; i < 30 && !(await saveDates.isEnabled()); i++) { await resultsDue.fill(""); await resultsDue.fill("2026-12-10"); await page.waitForTimeout(400); }
  await saveDates.click();
  await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0);
  const inv = page.locator('[data-doc-row="invitation"]');
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), inv.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await chooser.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: INV });
  await inv.locator("button", { hasText: /^📨/ }).waitFor();
  await inv.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await inv.locator('[data-edition-label="1"]').count()) === 1);
  await go(`/schemes/${S}#stages`);
  const isOpen = async () => (await page.locator("[data-lifecycle] [data-state]").filter({ hasText: /Отворена|Open/ }).count()) > 0;
  await page.locator("[data-lifecycle] [data-state]").first().waitFor();
  if (!(await isOpen())) await page.locator('[data-act="open"]').click();
  t("setup: the scheme is open", await waitFor(isOpen));

  // a batch of 12 objects, 6 of them for participants — drawn at random (3.5)
  await go(`/schemes/${S}/batches`);
  const bf = page.locator("[data-batch-new]");
  for (const [k, v] of Object.entries({ label: "P1", preparedOn: "2026-09-10", count: "12", prefix: PREFIX, material: "Едър добавъчен материал 4/8 mm", storage: "сухо", hsRecord: "" })) await bf.locator(`[name="${k}"]`).fill(v);
  await bf.locator('button[type="submit"]').click();
  const bcard = page.locator('[data-batch="P1"]');
  await waitFor(async () => (await bcard.count()) === 1);
  const draw = bcard.locator("[data-batch-draw]");
  for (const [k, v] of [["homogeneity", "2"], ["stability", "2"], ["participant", "6"], ["reserve", "2"]]) await draw.locator(`[name="${k}"]`).fill(v);
  await draw.locator('button[type="submit"]').click();
  t("setup: the batch's roles drawn — 6 objects for participants", await waitFor(async () => (await bcard.locator("[data-batch-drawn]").count()) === 1));

  // three applications: A {0:3}, B {0:2}, C {1:1}
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const sels = add.locator('[data-add-selections] input[name^="sel_"]');
  const n = await sels.count();
  const enter = async (name, counts) => {
    await add.locator('[name="labName"]').fill(name);
    for (let i = 0; i < n; i++) await sels.nth(i).fill(String(counts[i] ?? 0));
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(name));
  };
  await enter(A, [3]);
  await enter(B, [2]);
  await enter(C, [0, 1]);
  const refOf = async (name) => (await page.locator("[data-participant-row]", { hasText: name }).locator("td").first().innerText()).trim();
  const refA = await refOf(A), refB = await refOf(B), refC = await refOf(C);
  t("entered: a provisional reference each (Z…) — no code before the coding act", [refA, refB, refC].every((r) => /^Z\d{3}$/.test(r)) && new Set([refA, refB, refC]).size === 3);
  t("…shown as such: «no code until the coding act»", (await page.locator("[data-participant-row]", { hasText: A }).locator("[data-no-code]").count()) === 1 && (await page.locator(`[data-participant-row="${refA}"] td[data-provisional="1"]`).count()) === 1);
  // A linked to the laboratory
  const pidA = await page.locator(`[data-participant-row="${refA}"]`).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);

  // the first and the second announcement: A and B on the list (5 on the first characteristic), C not
  await go(`/schemes/${S}#stages`);
  t("before the announcements: no coding yet — the act waits for the final list", (await page.locator("[data-coding-run]").count()) === 0);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await textOf(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  const form = page.locator("[data-second-announcement]");
  await form.waitFor();
  await form.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "2");

  // a proforma to A — before coding, under its reference
  await go(`/schemes/${S}/participants/${encodeURIComponent(refA)}`);
  const up = page.getByRole("button", { name: /Качи проформа|Upload proforma/ });
  await up.waitFor();
  // its number from the accounting software first (5.8; Реш. 36)
  await page.locator('[data-doc-number="proforma"]').fill(`ПФ-${stamp}`);
  const [pc] = await Promise.all([page.waitForEvent("filechooser"), up.click()]);
  await pc.setFiles({ name: `proforma-${stamp}.pdf`, mimeType: "application/pdf", buffer: PDF });
  t("setup: a proforma sent to A under its reference", await waitFor(async () => (await page.getByText(`proforma-${stamp}.pdf`).count()) > 0));

  // the notices so far: never the provisional reference in their words
  await go("/notices");
  const heldOfScheme = page.locator("[data-held]", { hasText: NUMBER });
  await waitFor(async () => (await heldOfScheme.count()) >= 2);
  const wordsBefore = (await heldOfScheme.locator("[data-exact-text]").allInnerTexts()).join("\n");
  t("before coding, a notice's words never carry the provisional reference", wordsBefore.length > 0 && !wordsBefore.includes(refA) && !wordsBefore.includes(refB));

  // ── the coding act ──
  await go(`/schemes/${S}#stages`);
  const panel = page.locator("[data-coding]");
  await panel.waitFor();
  t("the coding panel: the two on the final list wait for a code", (await panel.locator("[data-coding-waiting]").getAttribute("data-coding-waiting")) === "2");
  await panel.locator("[data-coding-run]").click();
  t("coded: what was drawn is shown", await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1));
  const codeOfRef = async (ref) => page.locator(`[data-coded-from="${ref}"]`).getAttribute("data-coded");
  const codeA = await codeOfRef(refA), codeB = await codeOfRef(refB);
  t("…A and B each a laboratory code — digits, different, never a reference; C not coded", /^\d{6,}$/.test(codeA ?? "") && /^\d{6,}$/.test(codeB ?? "") && codeA !== codeB && (await page.locator(`[data-coded-from="${refC}"]`).count()) === 0);
  const objsOf = async (ref) => ((await page.locator(`[data-coded-from="${ref}"] [data-coded-objects]`).getAttribute("data-coded-objects")) ?? "").split(" ").filter(Boolean);
  const oA = await objsOf(refA), oB = await objsOf(refB);
  t("…their objects drawn: A 3, B 2 — from the batch, never one twice", oA.length === 3 && oB.length === 2 && new Set([...oA, ...oB]).size === 5 && [...oA, ...oB].every((o) => o.startsWith(PREFIX)));
  t("…once: nothing waits, the act is not offered again; stage 9 done", (await page.locator("[data-coding-run]").count()) === 0 && (await page.locator('[data-stage="9"]').getAttribute("data-done")) === "1");

  // everything kept by the reference follows the code
  await go(`/schemes/${S}/participants`);
  t("the rows: A and B under their codes, C keeps its reference", (await page.locator(`[data-participant-row="${codeA}"]`).count()) === 1 && (await page.locator(`[data-participant-row="${codeB}"]`).count()) === 1 && (await page.locator(`[data-participant-row="${refA}"]`).count()) === 0 && (await page.locator(`[data-participant-row="${refC}"]`).count()) === 1);
  t("…A's objects with it", (await page.locator(`[data-participant-row="${codeA}"]`).innerText()).includes(oA[0]));
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeA)}`);
  t("…A's proforma follows its code", await waitFor(async () => (await page.getByText(`proforma-${stamp}.pdf`).count()) > 0));
  await go("/notices");
  await waitFor(async () => (await page.locator("[data-held]", { hasText: NUMBER }).count()) >= 3);
  const heldA = page.locator("[data-held]", { hasText: NUMBER }).filter({ hasText: codeA });
  const wordsA = (await heldA.locator("[data-exact-text]").allInnerTexts()).join("\n");
  t("A is told its code and its objects — and its earlier notices follow the code", new RegExp(`кодът на участието ви е ${codeA}`).test(wordsA) && wordsA.includes(oA[0]) && (await heldA.count()) >= 3);
  t("…no notice of the scheme left under A's reference", (await page.locator("[data-held]", { hasText: NUMBER }).filter({ hasText: refA }).count()) === 0);

  // ── a step back, a new application, a new run: its reference is a new one (never one a
  //    coded participation had), and the next act codes it alone (review) ──
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="back"]').click();
  await waitFor(isOpen);
  await go(`/schemes/${S}/participants`);
  await enter(`Код Г ${stamp}`, [1]);
  const refD = await refOf(`Код Г ${stamp}`);
  t("a new application after a coding: a NEW reference — never one given before", /^Z\d{3}$/.test(refD) && ![refA, refB, refC].includes(refD), refD);
  await go(`/schemes/${S}#stages`);
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => /В процес|In progress/.test(await textOf(page.locator("[data-lifecycle] [data-state]"))));
  await go(`/schemes/${S}#stages`);
  await page.locator("[data-second-announcement] [data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "3");
  t("…the next act: only the new one waits", (await page.locator("[data-coding] [data-coding-waiting]").getAttribute("data-coding-waiting")) === "1");
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 2);
  const codeD = await codeOfRef(refD);
  const oD = await objsOf(refD);
  t("…coded: a code never given before, its object the one left; the others keep theirs", /^\d{6,}$/.test(codeD ?? "") && ![codeA, codeB].includes(codeD) && oD.length === 1 && ![...oA, ...oB].includes(oD[0]) && (await codeOfRef(refA)) === codeA);

  // on record — counts, never the mapping
  await go("/activity");
  await page.getByText(/Coding act/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record: the act by its counts — never the mapping or a name", /Coding act: 2 participation\(s\) coded at random from \d+ free numbers; 5 object\(s\) drawn at random/.test(journal) && !journal.includes(A) && !journal.includes(LAB));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-coding: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
