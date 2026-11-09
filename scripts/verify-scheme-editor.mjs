// Live end-to-end for the reworked scheme editor, against a LOCAL dev server
// (in-memory store):  BASE=http://localhost:3000 node scripts/verify-scheme-editor.mjs
// add a date + a standard → they reach the documents; a laboratory registered for
// that standard keeps pointing at ITS standard through a reorder (remap); deleting
// the standard drops the reference instead of misrouting it; a laboratory left with
// no standard at all blocks the deletion (stranding guard).
//
// Updated 2026-11-05: online applications are closed until part 9.2 (part 0.4,
// Реш. 1, 145–146) — /apply/<id> shows the PDF route, never the wizard, so no lab
// can apply here. PTS enters laboratories under «Участници» and ticks their
// standards in the row's edit form; participants' standards are remapped by the
// same code as applications' (lib/param-remap.ts), so the remap, the clean drop
// and the stranding guard are now driven through that path. The new standard is
// looked for in the заявка document (Ф 7.2.1-3 §2) instead of the wizard's step 3.
// The standard cards no longer contain the word «Стандарт», so standards are found
// by their BG-standard field. Every add / move / remove is confirmed in the editor
// before saving: a click that lands before React hydrates is lost silently while
// «Запази промените» still posts natively — the old single «Remove» click saved the
// list unchanged that way.
// Rerunnable: the laboratories get unique names; the standards are found by text.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = "26-01-T-1";
const RUN = Date.now();
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
const saveScheme = async () => {
  await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
};
// The editor's buttons work only once React has hydrated the page; a click before
// that is lost silently while «Запази промените» still posts the form natively —
// saving the list UNCHANGED. So: open, let it settle, and confirm every add/remove
// took effect in the editor before saving.
const goEdit = async () => {
  await go(`${BASE}/schemes/${S}/edit`);
  await page.waitForLoadState("networkidle").catch(() => {});
};
const stdValues = () => page.locator('input[id$="-stdBg"]').evaluateAll((els) => els.map((e) => e.value));
// The standard's own card: the innermost .card holding its BG-standard field.
async function stdCard(text) {
  const id = await page.locator('input[id$="-stdBg"]').evaluateAll((els, s) => els.find((e) => e.value.includes(s))?.id, text);
  if (!id) throw new Error(`no standard "${text}" in the editor`);
  return page.locator(".card", { has: page.locator(`[id="${id}"]`) }).last();
}
async function addStandard() {
  const before = (await stdValues()).length;
  for (let i = 0; i < 10 && (await stdValues()).length === before; i++) {
    await page.getByRole("button", { name: /Добави стандарт|Add standard/ }).click();
    await page.waitForTimeout(400);
  }
  if ((await stdValues()).length !== before + 1) throw new Error("«Добави стандарт» added no standard");
}
async function removeStandard(text) {
  for (let i = 0; i < 10 && (await stdValues()).some((v) => v.includes(text)); i++) {
    await (await stdCard(text)).getByRole("button", { name: "Remove", exact: true }).click();
    await page.waitForTimeout(400);
  }
  if ((await stdValues()).some((v) => v.includes(text))) throw new Error(`«Remove» left "${text}" in the editor`);
}

// A laboratory PTS enters itself (made-up name, example.test address).
async function addLab(name) {
  await go(`${BASE}/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"])').last();
  await add.locator('input[name="labName"]').fill(name);
  await add.locator('input[name="email"]').fill(`lab-${RUN}@example.test`);
  await add.locator('button[type="submit"]').click();
  await page.locator("tr", { hasText: name }).first().waitFor();
}
// The participant's collapsed edit row (the first edit <tr> after its data row), opened.
async function editRow(name) {
  await go(`${BASE}/schemes/${S}/participants`);
  const row = page.locator("tr", { hasText: name }).first().locator("xpath=following-sibling::tr[@data-edit-row][1]");
  await row.locator("summary").click();
  return row;
}
// Labels of the standards the participant takes, in the order shown (since 5.1 a count
// per characteristic — taken is a count above 0).
async function tickedFor(name) {
  const row = await editRow(name);
  return row.locator('input[name^="sel_"]').evaluateAll((els) =>
    els.filter((e) => Number(e.value) > 0).map((e) => e.closest("label").innerText.trim()));
}
// Take exactly these positions once (0-based; negative = from the end), none of the others; save the row.
async function registerFor(name, positions) {
  const row = await editRow(name);
  const boxes = row.locator('input[name^="sel_"]');
  const n = await boxes.count();
  const want = new Set(positions.map((p) => (p < 0 ? n + p : p)));
  for (let i = 0; i < n; i++) await boxes.nth(i).fill(want.has(i) ? "1" : "0");
  // the action redirects back to this same address, so wait for its POST to answer
  // (the write is done by then) rather than for a URL the page already has
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/schemes/${S}/participants`)),
    row.locator('button[type="submit"]').click(),
  ]);
}

await go(`${BASE}/dev/persona?role=manager`);

// ── 1. New editor renders; add a date + a standard; save ──
await goEdit();
await page.getByRole("button", { name: /Добави дата|Add date/ }).waitFor();
t("editor: new view with add buttons renders", true);

// the new (last) schedule row: three visible inputs after the existing rows —
// fill via the last row's inputs by walking the schedule grid. The row must really
// be NEW (a click lost before hydration would make "last" an existing date).
const schedRows = page.locator("div.flex.items-end");
const rowsBefore = await schedRows.count();
for (let i = 0; i < 10 && (await schedRows.count()) === rowsBefore; i++) {
  await page.getByRole("button", { name: /Добави дата|Add date/ }).click();
  await page.waitForTimeout(400);
}
t("editor: «Добави дата» adds a schedule row", (await schedRows.count()) === rowsBefore + 1);
const newRow = schedRows.last();
const rowInputs = newRow.locator("input:not([type=hidden])");
await rowInputs.nth(0).fill("01.08.2026");
await rowInputs.nth(1).fill("Тестова дата");
await rowInputs.nth(2).fill("Test date");

await addStandard();
// the freshly added standard is the LAST card on the page (the header text
// changes while typing, so a hasText filter would go stale mid-fill)
const newCard = page.locator(".card").last();
const cardInputs = newCard.locator("input:not([type=hidden])");
await cardInputs.nth(0).fill("БДС TEST 9999");      // standard BG
await cardInputs.nth(1).fill("EN TEST 9999");       // standard EN
await cardInputs.nth(2).fill("Тестова характеристика"); // characteristic BG
await cardInputs.nth(3).fill("Test characteristic");    // characteristic EN

await saveScheme();
await page.waitForURL(new RegExp(`/schemes/${S}$`));
t("editor: saved and returned to the scheme page", true);

// ── 2. Round-trip: reopen shows the new rows; the documents get them ──
await goEdit();
const html = await page.content();
t("round-trip: new date kept", html.includes("01.08.2026"));
t("round-trip: new standard kept", html.includes("TEST 9999"));

await go(`${BASE}/schemes/${S}/doc/invitation/print?lang=bg`);
t("invitation: new schedule date rendered", (await page.content()).includes("01.08"));

await go(`${BASE}/schemes/${S}/doc/application/print?lang=bg`);
t("заявка document: new standard listed (§2)", (await page.content()).includes("TEST 9999"));

await go(`${BASE}/apply/${S}`);
t("apply: no online wizard while applications are closed (part 0.4)",
  (await page.locator('input[name="labName"]').count()) === 0);

// ── 3. PTS registers a laboratory for the NEW standard and the first one ──
const REMAP = `Ремап Лаб ${RUN}`;
await addLab(REMAP);
const labels0 = await (await editRow(REMAP)).locator('input[name^="sel_"]').evaluateAll((els) =>
  els.map((e) => e.closest("label").innerText.trim()));
// since 3.6 a characteristic is shown with its method («name — method»; the names repeat)
const FIRST = labels0[0], NEW = labels0.find((l) => l.startsWith("Тестова характеристика")) ?? "Тестова характеристика";
t("setup: the new standard is the last one offered", labels0[labels0.length - 1] === NEW && NEW.startsWith("Тестова характеристика"), JSON.stringify(labels0));
await registerFor(REMAP, [0, labels0.length - 1]);
const before = await tickedFor(REMAP);
t("register: the laboratory holds the first and the new standard",
  before.length === 2 && before.includes(FIRST) && before.includes(NEW), JSON.stringify(before));

// ── 4. Reorder: move the new standard from last to first → the laboratory must
//       still hold IT (remapped index), not whatever sits last now ──
await goEdit();
for (let i = 0; i < 30 && !(await stdValues())[0].includes("TEST 9999"); i++) {
  await (await stdCard("TEST 9999")).getByRole("button", { name: "Move up" }).click();
  await page.waitForTimeout(150);
}
await saveScheme();
await page.waitForURL(new RegExp(`/schemes/${S}$`));

await goEdit();
// the standard cards no longer carry the word «Стандарт»; their BG-standard field does
const firstStd = page.locator('input[id$="-stdBg"]').first();
t("reorder: new standard now first", (await firstStd.inputValue()).includes("TEST 9999"), await firstStd.inputValue());

const afterMove = await tickedFor(REMAP);
t("REMAP: the laboratory still holds its two standards after the reorder",
  afterMove.length === 2 && afterMove[0] === NEW && afterMove.includes(FIRST), JSON.stringify(afterMove));

// ── 5. Delete the standard → the reference is dropped cleanly, the other kept ──
await goEdit();
await removeStandard("TEST 9999");
await saveScheme();
await page.waitForURL(new RegExp(`/schemes/${S}$`));
t("delete: saved (the laboratory still has a standard)", true);

const afterDelete = await tickedFor(REMAP);
t("delete: dropped reference, no misrouting",
  afterDelete.length === 1 && afterDelete[0] === FIRST, JSON.stringify(afterDelete));

await go(`${BASE}/schemes/${S}/doc/application/print?lang=bg`);
t("delete: standard gone from the заявка document", !(await page.content()).includes("TEST 9999"));

// ── 6. Stranding guard: a laboratory registered ONLY for a standard blocks
//       that standard's deletion (else the empty scope would read as "ALL") ──
await goEdit();
await addStandard();
const strandCard = page.locator(".card").last();
const strandInputs = strandCard.locator("input:not([type=hidden])");
await strandInputs.nth(0).fill("БДС STRAND 1");
await strandInputs.nth(1).fill("EN STRAND 1");
await strandInputs.nth(2).fill("Странд характеристика");
await strandInputs.nth(3).fill("Strand characteristic");
await saveScheme();
await page.waitForURL(new RegExp(`/schemes/${S}$`));

const STRAND = `Странд Лаб ${RUN}`;
await addLab(STRAND);
await registerFor(STRAND, [-1]); // ONLY the strand standard (appended last)
const strandTicks = await tickedFor(STRAND);
t("stranding setup: the laboratory holds only the strand standard",
  strandTicks.length === 1 && strandTicks[0].startsWith("Странд характеристика"), JSON.stringify(strandTicks)); // «name — method» since 3.6

await goEdit();
await removeStandard("STRAND 1");
await saveScheme();
await page.waitForURL(/err=stranded/);
t("stranding guard: save refused with the banner", (await page.content()).includes("НЕ са запазени") || (await page.content()).includes("NOT saved"));
await goEdit();
t("stranding guard: standard still there (nothing saved)", (await page.content()).includes("STRAND 1"));

await browser.close();
console.log(`verify-scheme-editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
