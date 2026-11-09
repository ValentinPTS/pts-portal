// Plan part 5.2 check (the two announcements; Реш. 24, 65, 66, 129), against a LOCAL
// dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-announcements.mjs
// On a scheme of its own, opened: three applications — A and B on the first
// characteristic (5 participations together), A and C on the second (2). A proforma is
// not offered before the second announcement. The first announcement warns below the
// scheme's minimum, runs by decision and is on record with the count; the participations
// are told. The second: the first characteristic runs (ticked by its five), the second
// drops — A and B on the final list, C not; each told from what it applied for; no new
// application after it. Then a proforma to A, never to C.
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
const dialogs = [];
page.on("dialog", async (d) => { dialogs.push({ type: d.type(), text: d.message() }); await d.accept(d.type() === "prompt" ? "" : undefined); });
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 89) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const A = `Обяв. А ${stamp}`, B = `Обяв. Б ${stamp}`, C = `Обяв. В ${stamp}`, ENT = `Обяв. заявител ${stamp} ООД`, LAB = `Лаб. обяв. ${stamp}`;
const PDF = Buffer.from(`%PDF-1.4\n% proforma ${stamp}\n%%EOF\n`);
const INV = Buffer.from(`%PDF-1.4\n% invitation ${stamp}\n%%EOF\n`);

// a proforma uploaded on the participation's page — the refusal, if any, comes as an alert
const proforma = async (S, code) => {
  await go(`/schemes/${S}/participants/${encodeURIComponent(code)}`);
  const btn = page.getByRole("button", { name: /Качи проформа|Upload proforma/ });
  await btn.waitFor();
  const before = dialogs.length;
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), btn.click()]);
  await chooser.setFiles({ name: `proforma-${code}.pdf`, mimeType: "application/pdf", buffer: PDF });
  await waitFor(async () => dialogs.slice(before).some((d) => d.type === "alert") || (await page.getByText(`proforma-${code}.pdf`).count()) > 0);
  return dialogs.slice(before).find((d) => d.type === "alert")?.text ?? null;
};

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // an entity with a laboratory, to link the participations to (their notices then have someone to tell)
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
  await dialog.locator('input[name="name"]').fill(`Обявявания ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
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

  // three applications: A {0:3, 1:1}, B {0:2}, C {1:1}
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  const sels = add.locator('[data-add-selections] input[name^="sel_"]');
  const n = await sels.count();
  t("setup: the scheme has two characteristics or more", n >= 2, String(n));
  const enter = async (name, counts) => {
    await add.locator('[name="labName"]').fill(name);
    for (let i = 0; i < n; i++) await sels.nth(i).fill(String(counts[i] ?? 0));
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(name));
  };
  await enter(A, [3, 1]);
  await enter(B, [2]);
  await enter(C, [0, 1]);
  const codeOf = async (name) => (await page.locator("[data-participant-row]", { hasText: name }).locator("td").first().innerText()).trim();
  const codeA = await codeOf(A), codeB = await codeOf(B), codeC = await codeOf(C);
  // link A and C to the laboratory
  for (const name of [A, C]) {
    const pid = await page.locator("[data-participant-row]", { hasText: name }).locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
    const cell = page.locator(`[data-snapshot-row="${pid}"]`);
    await cell.locator("[data-freeze-open] button").click();
    const ff = cell.locator("[data-freeze-form]");
    await waitFor(async () => (await ff.count()) === 1);
    await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
    await ff.locator("[data-freeze-confirm]").check();
    await ff.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator(`[data-snapshot="${pid}"]`).count()) === 1);
  }

  // a proforma before the second announcement: not offered — and why (Реш. 65)
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeA)}`);
  t("a proforma before the second announcement: not offered, and why (Реш. 65)", await waitFor(async () => (await page.locator('[data-not-invoiced-yet="before-second"]').count()) === 1) && (await page.getByRole("button", { name: /Качи проформа|Upload proforma/ }).count()) === 0);

  // ── the first announcement: below the minimum — a warning; it runs by decision, on record ──
  await go(`/schemes/${S}#stages`);
  t("the first announcement warns below the scheme's minimum (Реш. 129) — and is still offered", /3 от 5|3 of 5/.test(await textOf(page.locator('[data-act-warn="announce"]'))) && (await page.locator('[data-act="announce"]').isEnabled()));
  const before = dialogs.length;
  await page.locator('[data-act="announce"]').click();
  t("…its confirmation says so", await waitFor(async () => dialogs.slice(before).some((d) => d.type === "confirm" && /под минималния брой|below the scheme's minimum/.test(d.text))));
  t("…it runs: the scheme in progress", await waitFor(async () => /В процес|In progress/.test(await textOf(page.locator("[data-lifecycle] [data-state]")))));

  // ── the second: its form, the counts against the five ──
  await go(`/schemes/${S}#stages`);
  const form = page.locator("[data-second-announcement]");
  await form.waitFor();
  t("the second announcement: its own form, no plain act", (await page.locator('[data-act="announce2"]').count()) === 0);
  t("…each characteristic with the participations applied for it, by those in the round", (await form.locator('[data-run-row="0"]').getAttribute("data-count")) === "5" && (await form.locator('[data-run-row="1"]').getAttribute("data-count")) === "2");
  t("…ticked to run by default at five (Реш. 66), the other not", (await form.locator('input[name="run_0"]').isChecked()) && !(await form.locator('input[name="run_1"]').isChecked()));
  await form.locator("[data-second-submit]").click();
  t("the final list: A and B on it — C, whose only characteristic drops, not", await waitFor(async () => (await page.locator("[data-final-list]").getAttribute("data-final-count")) === "2") && (await page.locator("[data-second-announcement]").count()) === 0);
  t("…what runs and what drops, shown", (await textOf(page.locator("[data-final-runs]"))).length > 0 && (await textOf(page.locator("[data-final-dropped]"))).length > 0);

  // the list names its characteristics by their places: no reorder while it stands (review)
  await go(`/schemes/${S}/edit`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const stdVals = () => page.locator('input[id$="-stdBg"]').evaluateAll((els) => els.map((e) => e.value));
  const before2 = await stdVals();
  const secondId = await page.locator('input[id$="-stdBg"]').nth(1).getAttribute("id");
  const card2 = page.locator(".card", { has: page.locator(`[id="${secondId}"]`) }).last();
  for (let i = 0; i < 10 && (await stdVals())[0] === before2[0]; i++) { await card2.getByRole("button", { name: "Move up" }).click(); await page.waitForTimeout(300); }
  const moved = (await stdVals())[0] === before2[1];
  await page.getByRole("button", { name: /Запази промените|Save changes/ }).click();
  t("after the final list, a reorder of the characteristics is refused — nothing saved", moved && await waitFor(async () => (await page.locator("[data-err-list-final]").count()) === 1) && /err=list-final/.test(page.url()));
  await go(`/schemes/${S}/edit`);
  t("…the order as it was", JSON.stringify(await stdVals()) === JSON.stringify(before2));

  // the participants page under the final list
  await go(`/schemes/${S}/participants`);
  const row = (code) => page.locator(`[data-participant-row="${code}"]`);
  t("the participants: A and B marked on the list, C not", (await row(codeA).locator("[data-final]").getAttribute("data-final")) === "1" && (await row(codeB).locator("[data-final]").getAttribute("data-final")) === "1" && (await row(codeC).locator("[data-final]").getAttribute("data-final")) === "0");
  t("…the objects for the characteristics that run: A 3, B 2, C none — 5 in all", (await row(codeA).locator("[data-objects]").getAttribute("data-objects")) === "3" && (await row(codeC).locator("[data-objects]").getAttribute("data-objects")) === "0" && (await page.locator("[data-objects-total]").getAttribute("data-objects-total")) === "5");
  t("…no new application after the final list: the form gives way to why", (await page.locator("[data-list-final]").count()) === 1 && (await page.locator('[data-add-selections]').count()) === 0);

  // a proforma: to A on the list; never to C
  const toA = await proforma(S, codeA);
  t("after it: a proforma to a participation on the final list", toA === null && (await page.getByText(`proforma-${codeA}.pdf`).count()) > 0, String(toA));
  await go(`/schemes/${S}/participants/${encodeURIComponent(codeC)}`);
  t("…never to one not on it — not offered, and why", await waitFor(async () => (await page.locator('[data-not-invoiced-yet="not-final"]').count()) === 1) && (await page.getByRole("button", { name: /Качи проформа|Upload proforma/ }).count()) === 0);

  // the notices, held for «Изпрати», by code — the second from what each applied for
  await go("/notices");
  await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
  // this scheme's notices — a provisional reference (5.3) is Z001 in every scheme
  const heldOf = async (code) => { const h = page.locator("[data-held]").filter({ has: page.locator(`a[href="/schemes/${S}"]`) }).filter({ hasText: code }); const out = []; for (let i = 0; i < (await h.count()); i++) out.push(await h.nth(i).innerText()); return out.join("\n"); };
  const hA = await heldOf(codeA), hC = await heldOf(codeC);
  t("the first announcement told: it runs", /ще се проведе|will run/.test(hA));
  t("the second told A from what it applied for: on the list — what runs, what drops", /в окончателния списък/.test(hA) && /Провеждат се:/.test(hA) && /Отпадат:/.test(hA));
  t("…and C: none of its characteristics runs — it goes no further, nothing invoiced", /нито една от заявените от вас характеристики не се провежда/.test(hC) && /нищо не се фактурира/.test(hC));

  // on record — counts and characteristics, never a name
  await go("/activity");
  await page.getByText(/Second announcement/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record: the first with the count against the minimum, the second with the list's size", /3 in the round, minimum 5 \(BELOW the minimum — runs by decision\)/.test(journal) && /2 of 3 participation\(s\) on the final list/.test(journal) && !journal.includes(A) && !journal.includes(LAB));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-announcements: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
