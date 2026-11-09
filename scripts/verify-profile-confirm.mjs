// Plan part 4.4 check (a profile from a PDF application, Реш. 145), against a LOCAL dev
// server (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-profile-confirm.mjs
// PTS enters an entity, a laboratory, an administrator and a user. The invitation waits
// for the entity's official e-mail (К23), then shows its text and — with no portal mail
// here — refuses in words. The administrator (a persona: the invitation accepted) sees
// «заявка в PDF», the checked identifiers and the official e-mail read-only, and the M4
// line. A form left open undoes nothing PTS saved meanwhile; the same field changed by
// both is refused. Confirming without the tick is refused, the typing kept; then it
// confirms — the date shown here and on «Организации», the notice on record as not sent
// (no mail here) with «send again». A user sees the rest read-only and no confirm. The
// laboratory's area leads to the review. On record without a name or an address.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
// two people at once: PTS, and the laboratory — each its own browser (its own persona)
const pts = await (await browser.newContext()).newPage();
const lab = await (await browser.newContext()).newPage();
for (const p of [pts, lab]) { p.setDefaultTimeout(60000); p.on("dialog", (d) => d.accept()); }
const go = (page, path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const waitFor = async (page, fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 53) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Потвърди ${stamp} ООД`, LAB = `Лаборатория ${stamp}`, A = `Админ ${stamp}`, B = `Колега ${stamp}`;
const mailA = `admin${stamp}@lab-test.bg`, mailB = `user${stamp}@lab-test.bg`, office = `office${stamp}@lab-test.bg`;

try {
  await go(pts, "/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await pts.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // PTS enters the profile from the PDF application — no official e-mail yet
  await go(pts, "/organizations");
  const nf = pts.locator('[data-entity-form="new"]');
  for (const [k, v] of Object.entries({ name: ENT, country: "BG", eik, address: "София, ул. Потвърди 1" })) await nf.locator(`[name="${k}"]`).fill(v);
  await nf.locator('button[type="submit"]').click();
  const card = pts.locator("[data-entity]", { hasText: ENT });
  await waitFor(pts, async () => (await card.count()) === 1);
  t("PTS's entry: «заявка в PDF», awaiting the laboratory's confirmation, no official e-mail yet", (await card.locator("[data-origin]").getAttribute("data-origin")) === "pdf" && (await card.locator("[data-origin]").getAttribute("data-confirmed-at")) === "" && (await textOf(card.locator("[data-official-email]"))).trim() === "—");
  const labs = card.locator("[data-entity-labs]");
  for (let i = 0; i < 20 && !(await labs.locator('[data-lab-form="new"]').isVisible().catch(() => false)); i++) { await labs.locator("[data-lab-new] summary").click(); await pts.waitForTimeout(300); }
  const lf = labs.locator('[data-lab-form="new"]');
  await lf.locator('[name="name"]').fill(LAB);
  await lf.locator('[name="deliveryAddress"]').fill("Пловдив, ул. Стара 1");
  await lf.locator('button[type="submit"]').click();
  await waitFor(pts, async () => (await labs.locator("[data-lab]", { hasText: LAB }).count()) === 1);
  const box = card.locator("[data-entity-users]");
  const addUser = async (name, email) => {
    for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await pts.waitForTimeout(300); }
    const f = box.locator('[data-user-form="new"]');
    await f.locator('[name="name"]').fill(name);
    await f.locator('[name="email"]').fill(email);
    await f.locator('button[type="submit"]').click();
  };
  await addUser(A, mailA);
  const ua = box.locator("[data-user]", { hasText: A });
  await waitFor(pts, async () => (await ua.count()) === 1);
  await addUser(B, mailB);
  const ub = box.locator("[data-user]", { hasText: B });
  await waitFor(pts, async () => (await ub.count()) === 1);
  const idA = await ua.getAttribute("data-user"), idB = await ub.getAttribute("data-user");
  // the invitation waits for the official e-mail (К23 — the notice of the confirmation goes there)
  await ua.locator("[data-user-invite] summary").click();
  await ua.locator("[data-user-invite-send]").click();
  t("the invitation waits for the entity's official e-mail (К23)", await waitFor(pts, async () => /официалния e-mail|official e-mail/.test(await textOf(box.locator("[data-user-error]")))));
  await card.locator("[data-entity-edit] summary").click();
  await card.locator(`[data-entity-form] [name="officialEmail"]`).fill(office);
  await card.locator(`[data-entity-form] button[type="submit"]`).click();
  await waitFor(pts, async () => (await textOf(card.locator("[data-official-email]"))).includes(office));
  if (!(await ua.locator("[data-user-invite]").evaluate((d) => d.open).catch(() => false))) await ua.locator("[data-user-invite] summary").click();
  const shown = await textOf(ua.locator("[data-user-invite]"));
  t("…then it shows whom, its subject and its whole text before «Изпрати»", shown.includes(mailA) && /Покана за портала/.test(shown) && /set a password|зададете парола/.test(shown));
  await ua.locator("[data-user-invite-send]").click();
  t("…with no portal mail here: refused in words — nothing sent, the user still «поканен»", await waitFor(pts, async () => /пощата на портала|portal's own mail/.test(await textOf(box.locator("[data-user-error]")))) && (await ua.getAttribute("data-user-state")) === "invited");

  // the administrator — the invitation accepted (the persona stands for its password)
  await go(lab, `/dev/persona?role=participant&user=${idA}`);
  await lab.waitForURL(/\/lab\/confirm/, { timeout: 60000 });
  const note = await textOf(lab.locator("[data-review-data]"));
  t("the administrator's review: «въведени от PTS от заявката в PDF», to confirm", /заявката ви в PDF|PDF application/.test(note) && /потвърдете|confirm it/.test(note));
  const ident = await textOf(lab.locator("[data-checked-identity]"));
  const form = lab.locator("[data-profile-form]");
  t("…the checked identifiers and the official e-mail shown, not editable; M4 named", ident.includes(ENT) && ident.includes(eik) && (await form.locator('[name="name"], [name="eik"], [name="officialEmail"]').count()) === 0 && (await form.locator("[data-official-email]").inputValue()) === office && /М4|M4/.test(await textOf(lab.locator("[data-privacy]"))));

  // a form left open: PTS corrects the laboratory's name meanwhile
  const labCard = labs.locator("[data-lab]", { hasText: LAB });
  await labCard.locator("details summary").first().click();
  await labCard.locator('[data-lab-form] [name="name"]').fill(`${LAB} (по сертификата)`);
  await labCard.locator('[data-lab-form] button[type="submit"]').click();
  await waitFor(pts, async () => (await labs.locator("[data-lab]", { hasText: "(по сертификата)" }).count()) === 1);
  await form.locator('[name="ownPhone"]').fill("+359 88 000 2222");
  await form.locator('button[value="save"]').click();
  await waitFor(lab, async () => /Записано|Saved/.test(await textOf(form.locator("[data-profile-done]"))));
  await go(pts, "/organizations");
  t("a form left open undoes nothing PTS saved meanwhile — only what the person changed is written (review)", (await textOf(pts.locator("[data-entity]", { hasText: ENT }).locator("[data-entity-labs]"))).includes("(по сертификата)"));
  // …PTS changes it again while the laboratory's page still shows the previous one;
  // the laboratory changes the same field: refused
  const labCard2 = pts.locator("[data-entity]", { hasText: ENT }).locator("[data-lab]", { hasText: "(по сертификата)" });
  await labCard2.locator("details summary").first().click();
  await labCard2.locator('[data-lab-form] [name="name"]').fill(`${LAB} (по сертификата, 2)`);
  await labCard2.locator('[data-lab-form] button[type="submit"]').click();
  await waitFor(pts, async () => (await pts.locator("[data-lab]", { hasText: "(по сертификата, 2)" }).count()) === 1);
  await form.locator('[name$="_name"]').first().fill(`${LAB} — друго`);
  await form.locator('button[value="save"]').click();
  t("…the same field changed by both: refused, to look again (review)", await waitFor(lab, async () => /междувременно|meanwhile/.test(await textOf(form.locator("[data-profile-error]")))));

  await go(lab, "/lab/confirm");
  const form2 = lab.locator("[data-profile-form]");
  await form2.locator('[name="ownPosition"]').fill("Ръководител на лабораторията");
  await form2.locator('button[value="confirm"]').click();
  t("confirming without the tick: refused — the typing kept", await waitFor(lab, async () => /отбележете|tick that/.test(await textOf(form2.locator("[data-profile-error]")))) && (await form2.locator('[name="ownPosition"]').inputValue()) === "Ръководител на лабораторията");
  await form2.locator('[name$="_deliveryAddress"]').first().fill("Пловдив, ул. Нова 2");
  await form2.locator('[name="confirmTick"]').check();
  await form2.locator('button[value="confirm"]').click();
  t("completed and confirmed — the notice could not go here (no portal mail): on record, and it says so", await waitFor(lab, async () => /Потвърдено|Confirmed/.test(await textOf(form2.locator("[data-profile-done]")))) && /записано|on record/.test(await textOf(form2.locator("[data-profile-done]"))));
  await go(lab, "/lab/confirm");
  t("…the page now: confirmed, with the date — no confirm button any more", /Потвърдени на \d\d\.\d\d\.\d{4} от вас|Confirmed on \d\d\.\d\d\.\d{4} by you/.test(await textOf(lab.locator("[data-confirmed]"))) && (await lab.locator('button[value="confirm"]').count()) === 0);
  await go(lab, "/lab");
  await lab.waitForURL(/\/lab\/overview/, { timeout: 60000 }).catch(() => {});
  t("the laboratory's area leads a participant's user to its own pages (4.6)", /\/lab\/overview/.test(lab.url()));

  // a user — sees the rest, completes only their own, does not confirm
  await go(lab, `/dev/persona?role=participant&user=${idB}`);
  await lab.waitForURL(/\/lab\/confirm/, { timeout: 60000 });
  const fb = lab.locator("[data-profile-form]");
  t("a user: the entity and laboratories read-only, no confirm", (await fb.locator('[name="correspondenceAddress"]').getAttribute("readonly")) !== null && (await fb.locator('button[value="confirm"]').count()) === 0 && /от администратора на профила|by the profile's administrator/.test(await textOf(lab.locator("[data-confirmed]"))));
  await fb.locator('[name="ownPhone"]').fill("+359 88 000 1111");
  await fb.locator('button[value="save"]').click();
  t("…their own details saved", await waitFor(lab, async () => /Записано|Saved/.test(await textOf(fb.locator("[data-profile-done]")))));

  // PTS sees the confirmation, and the notice that did not go
  await go(pts, "/organizations");
  const card2 = pts.locator("[data-entity]", { hasText: ENT });
  await waitFor(pts, async () => (await card2.count()) === 1);
  t("«Организации»: confirmed by the laboratory, the new address there, the administrator active", /\d{4}-\d\d-\d\dT/.test((await card2.locator("[data-origin]").getAttribute("data-confirmed-at")) ?? "") && (await textOf(card2.locator("[data-entity-labs]"))).includes("Нова 2") && (await card2.locator("[data-user]", { hasText: A }).getAttribute("data-user-state")) === "active");
  t("…the notice (К23) on record as not sent, with «send again» (review)", (await card2.locator("[data-notice-outcome]").getAttribute("data-notice-outcome")) === "failed" && (await card2.locator("[data-resend-notice] button").count()) === 1);
  await card2.locator("[data-resend-notice] button").click();
  t("…sent again: with no mail here, said so", await waitFor(pts, async () => /не тръгна|did not go/.test(await textOf(card2.locator("[data-resend-notice]")))));
  await go(pts, "/activity");
  await pts.getByText(/confirmed its data/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await pts.locator("main").innerText();
  t("on record — completed, confirmed — never a name or an address", /The laboratory completed its data/.test(journal) && /The laboratory confirmed its data/.test(journal) && !journal.includes(office) && !journal.includes(mailA) && !journal.includes(A) && !journal.includes("Нова 2"));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go(pts, "/dev/persona").catch(() => {});
  await go(lab, "/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-profile-confirm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
