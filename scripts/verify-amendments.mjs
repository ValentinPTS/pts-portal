// Plan part 3.3 check (amendments to a running scheme; Zadanie §3; Реш. 154), against a
// LOCAL dev server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-amendments.mjs
// On a scheme of its own: a draft's deadlines are set freely; once open they are locked
// and point to «Изменения»; the invitation sent as edition 1 cannot go out changed by
// «Изпрати» or «Издай нова редакция»; an order of amendment with a missing field is
// refused and keeps what was typed; a whole one records the new deadline, issues the
// invitation as edition 2 «Изменение № 1 … по Заповед № … ; заменя редакцията от …»,
// which the laboratory now gets while edition 1 still opens; the notice to the
// participants waits in «Известия»; a statistics expert has no form; on record.
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
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(typeof a === "string" ? a : undefined); });
const INV1 = Buffer.from(`%PDF-1.4\n% invitation one ${stamp}\n%%EOF\n`);
const INV2 = Buffer.from(`%PDF-1.4\n% invitation two ${stamp}\n%%EOF\n`);

try {
  await go("/dev/persona?role=manager");
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");

  // a scheme of its own, a draft
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.locator("button", { hasText: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('input[name="name"]').fill(`Изменения ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.locator('button[type="submit"]').click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/edit`);
  const NUM = await page.locator('input[name="number"]').inputValue();

  // a draft: the deadlines are set freely
  await go(`/schemes/${S}`);
  const resultsDue = page.locator('label:has-text("Краен срок за резултати") input[type="date"]');
  await resultsDue.waitFor();
  // typed until the panel has taken it (a fill before hydration is not seen by React)
  const saveDates = page.locator("[data-scheme-dates]").getByRole("button", { name: /^(Запази|Save)$/ });
  for (let i = 0; i < 30 && !(await saveDates.isEnabled()); i++) { await resultsDue.fill(""); await resultsDue.fill("2026-12-10"); await page.waitForTimeout(400); }
  await saveDates.click();
  t("a draft's deadline is set freely", await waitFor(async () => (await page.getByText(/✓ (Запазено|Saved)/).count()) > 0));

  // the invitation goes out as edition 1, and the scheme opens
  const row = page.locator('[data-doc-row="invitation"]');
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), row.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await chooser.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: INV1 });
  await row.locator("button", { hasText: /^📨/ }).waitFor();
  answers.push(true);
  await row.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await row.locator('[data-edition-label="1"]').count()) === 1);
  await go(`/schemes/${S}#stages`);
  answers.push(true);
  await page.locator('[data-act="open"]').click();
  await page.locator("[data-lifecycle] [data-state]").filter({ hasText: /Отворена|Open/ }).waitFor();
  await go(`/dev/persona?role=lab&join=${S}`); // a laboratory in it
  await go("/dev/persona?role=manager");

  // ── open: the deadlines are locked and point to «Изменения» ──
  await go(`/schemes/${S}`);
  t("open: the deadlines are changed by an order of amendment", (await page.locator("[data-dates-by-amendment]").count()) === 1 && (await page.locator('label:has-text("Краен срок за резултати") input[type="date"]').isDisabled()));

  // the invitation changed: «Изпрати» and «Издай нова редакция» refuse it
  const [ch2] = await Promise.all([page.waitForEvent("filechooser"), (async () => { await row.locator('button[aria-label="More"]').click(); await row.locator("button", { hasText: /Замени файла|Replace file/ }).click(); })()]);
  await ch2.setFiles({ name: "invitation.pdf", mimeType: "application/pdf", buffer: INV2 });
  await page.waitForTimeout(1500);
  await go(`/schemes/${S}/editions?doc=invitation`);
  const form = page.locator("[data-issue-edition]");
  await form.locator("select").selectOption("invitation");
  await form.locator('textarea[name="reason"]').fill("Нова версия на поканата");
  await form.locator('button[type="submit"]').click();
  t("«Издай нова редакция»: a changed invitation only by an amendment", await waitFor(async () => /заповед за изменение|order of amendment/.test(await form.innerText())) && (await page.locator('[data-edition="invitation:2"]').count()) === 0);

  // ── the order of amendment ──
  await go(`/schemes/${S}/amendments`);
  const af = page.locator("[data-amendment-form]");
  await af.waitFor();
  await af.locator('input[name="orderNo"]').fill(`12-${stamp % 1000}`);
  await af.locator('input[name="orderDate"]').fill("2026-11-04");
  await af.locator('textarea[name="reason"]').fill("Забавена доставка на обектите");
  await af.locator('textarea[name="points"]').fill("т. 10 — график; т. 3 от поканата");
  await af.locator('textarea[name="validity"]').fill("xx"); // too short
  await af.locator('input[name="date_resultsDue"]').fill("2026-12-20");
  await af.locator('input[name="docs"][value="invitation"]').check();
  t("the form says an uploaded invitation must carry the amendment in its own file", /качен файл|uploaded file/.test(await af.locator("[data-amendment-uploaded]").innerText()));
  answers.push(true);
  await af.locator('button[type="submit"]').click();
  t("an order without its assessment of validity is refused", await waitFor(async () => /валидността|validity/.test(await af.locator("[data-amendment-error]").innerText())));
  t("…and what was typed stays", (await af.locator('textarea[name="reason"]').inputValue()) === "Забавена доставка на обектите");
  await af.locator('textarea[name="validity"]').fill("Не засяга валидността: срокът е еднакъв за всички");
  answers.push(true);
  await af.locator('button[type="submit"]').click();
  t("a whole order is recorded as amendment No. 1", await waitFor(async () => (await page.locator('[data-amendment="1"]').count()) === 1));
  const card = page.locator('[data-amendment="1"]');
  t("…with the old and the new deadline", /10\.12\.2026[\s\S]*→[\s\S]*20\.12\.2026/.test(await card.locator("[data-amendment-dates]").innerText()));
  t("…and the invitation's edition 2, replacing edition 1", (await card.locator('[data-amendment-edition="invitation:2"]').count()) === 1 && /заменя ред\. № 1|replaces ed\. No\. 1/.test(await card.innerText()));

  await go(`/schemes/${S}/editions?doc=invitation`);
  const ed2 = await page.locator('[data-edition="invitation:2"]').innerText();
  t("«Редакции»: edition 2 says «Изменение № 1 … по Заповед № …; заменя редакцията от …», with the participants", /Изменение № 1 от \d{2}\.\d{2}\.\d{4} по Заповед № 12-\d+ от 04\.11\.2026; заменя редакцията от \d{2}\.\d{2}\.\d{4}/.test(ed2) && (await page.locator('[data-edition="invitation:2"] [data-held]').count()) === 1);
  t("…edition 1 is kept", (await page.locator('[data-edition="invitation:1"]').count()) === 1);
  await go(`/dev/persona?role=lab&join=${S}`);
  const lab = await page.request.get(`${BASE}/lab/doc/${S}/invitation`);
  t("the laboratory now gets the amended invitation", lab.status() === 200 && Buffer.from(await lab.body()).equals(INV2), `status ${lab.status()}`);
  t("…and its portal says which amendment it is", /Изменение № 1 от [\d.]+ по Заповед № 12-\d+/.test(await page.locator("main").innerText()));
  await go("/dev/persona?role=manager");

  // withdrawn and sent again: the amended edition — no new one (review)
  await go(`/schemes/${S}`);
  answers.push(true);
  await row.locator('button[aria-label="More"]').click();
  await row.locator("button", { hasText: /Спри споделянето|Stop sharing/ }).click();
  await waitFor(async () => (await row.locator("button", { hasText: /^📨/ }).count()) === 1);
  answers.push(true);
  await row.locator("button", { hasText: /^📨/ }).click();
  t("withdrawn and sent again: still edition 2", await waitFor(async () => /\((ред\.|ed\.) № 2\)/.test(await row.innerText())));
  await go(`/schemes/${S}/editions?doc=invitation`);
  t("…no edition 3", (await page.locator('[data-edition="invitation:3"]').count()) === 0);

  await go(`/schemes/${S}`);
  t("the scheme's deadline is the amended one", (await page.locator('label:has-text("Краен срок за резултати") input[type="date"]').inputValue()) === "2026-12-20");

  // a step back to draft is no way around the order (review)
  await go(`/schemes/${S}#stages`);
  answers.push(true, "Проверка: връщане в чернова");
  await page.locator('[data-act="back"]').click();
  await page.locator("[data-lifecycle] [data-state]").filter({ hasText: /Чернова|Draft/ }).waitFor();
  await go(`/schemes/${S}`);
  t("back in draft, a deadline set still changes only by an amendment", (await page.locator("[data-dates-by-amendment]").count()) === 1 && (await page.locator('label:has-text("Краен срок за резултати") input[type="date"]').isDisabled()));
  t("…a deadline not yet set may still be set", !(await page.locator('label:has-text("Доклад до") input[type="date"]').isDisabled()));

  // the participants are told — through «Известия» (1.8)
  await go("/notices");
  t("the notice to the participants waits in «Известия»", (await page.locator("[data-held]").filter({ hasText: `Схема ${NUM} е изменена` }).count()) > 0);

  // a statistics expert of the scheme reads, but has no form
  await go(`/dev/persona?model=statistics_expert@${S}`);
  await go(`/schemes/${S}/amendments`);
  t("a statistics expert sees the amendment but no form", (await page.locator('[data-amendment="1"]').count()) === 1 && (await page.locator("[data-amendment-form]").count()) === 0);
  await go("/dev/persona?role=manager");

  // on record
  await go(`/activity?scheme=${S}`);
  await page.getByText(/Amendment No\. 1/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("the journal: the amendment and its edition", /Amendment No\. 1 of [\d.]+ by Order No\. 12-\d+ of 04\.11\.2026 — Забавена доставка на обектите · new deadlines: resultsDue 2026-12-20 · re-issued: invitation/.test(journal) && /Edition No\. 2 of [\d.]+ of “invitation” issued — Amendment No\. 1/.test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-amendments: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
