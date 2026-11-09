// Plan part 5.4 check (release levels, recipients, downloads; Zadanie «Три нива на пускане
// на документ»; Реш. 50; D15), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-releases.mjs
// On a scheme of its own, opened: a legal entity's laboratory with participation A, and
// participation B of nobody's. The Instruction goes to A alone, the Protocol to one user
// by name; the user sees both — A's as «only for this participation», the Protocol «to
// you personally» — and opens them, on record. «Редакции» says who got which edition and
// who downloaded it; a withdrawal takes it back, kept. The plan, released, is public
// before applying.
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
page.on("dialog", async (d) => { await d.accept(d.type() === "prompt" ? "" : undefined); });
const stamp = Date.now() % 100000;
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eik = (() => { const d = String(10000000 + (stamp * 101) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; })();
const ENT = `Освобождаване ${stamp} ООД`, LAB = `Лаб. освоб. ${stamp}`, USER = `Иванка Пробна ${stamp}`;
const PDF = (w) => Buffer.from(`%PDF-1.4\n% ${w} ${stamp}\n%%EOF\n`);

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // a legal entity, its laboratory and a user
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
  const box = card.locator("[data-entity-users]");
  for (let i = 0; i < 20 && !(await box.locator('[data-user-form="new"]').isVisible().catch(() => false)); i++) { await box.locator("[data-user-new] summary").click(); await page.waitForTimeout(300); }
  await box.locator('[data-user-form="new"] [name="name"]').fill(USER);
  await box.locator('[data-user-form="new"] [name="email"]').fill(`user${stamp}@lab-test.bg`);
  await box.locator('[data-user-form="new"] button[type="submit"]').click();
  await waitFor(async () => (await box.locator("[data-user]", { hasText: USER }).count()) === 1);
  const uid = await box.locator("[data-user]", { hasText: USER }).getAttribute("data-user");
  // the user signs in once (dev persona) — an active user
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/dev/persona?role=manager");

  // a scheme of its own: the invitation sent — open; the plan, the Instruction and the Protocol uploaded, not sent
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Освобождаване ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  const upload = async (doc, buf) => {
    const row = page.locator(`[data-doc-row="${doc}"]`);
    const [ch] = await Promise.all([page.waitForEvent("filechooser"), row.locator("button", { hasText: /Качи|Upload/ }).click()]);
    await ch.setFiles({ name: `${doc}.pdf`, mimeType: "application/pdf", buffer: buf });
    await row.locator("button", { hasText: /^📨/ }).waitFor();
    return row;
  };
  const planRow = await upload("plan", PDF("plan"));
  await upload("instruction", PDF("instruction"));
  await upload("protocol", PDF("protocol"));
  const inv = await upload("invitation", PDF("invitation"));
  await inv.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await inv.locator('[data-edition-label="1"]').count()) === 1);
  // the scheme open, its plan uploaded but not released: the public plan is not there
  const anon = await browser.newContext();
  t("an open scheme's plan, uploaded but not released: not public", (await anon.request.get(`${BASE}/apply/${S}/plan`)).status() === 404);
  await planRow.locator("button", { hasText: /^📨/ }).click();
  await waitFor(async () => (await planRow.locator('[data-edition-label="1"]').count()) === 1);

  // participations: A linked to the laboratory, B of nobody's
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  for (const nm of [`Освоб. А ${stamp}`, `Освоб. Б ${stamp}`]) {
    await add.locator('[name="labName"]').fill(nm);
    await add.locator('button[type="submit"]').click();
    await waitFor(async () => (await page.locator("tbody").innerText()).includes(nm));
  }
  const rowA = page.locator("[data-participant-row]", { hasText: `Освоб. А ${stamp}` });
  const codeA = (await rowA.locator("td").first().innerText()).trim();
  const pidA = await rowA.locator("xpath=following-sibling::tr[@data-snapshot-row][1]").getAttribute("data-snapshot-row");
  const cell = page.locator(`[data-snapshot-row="${pidA}"]`);
  await cell.locator("[data-freeze-open] button").click();
  const ff = cell.locator("[data-freeze-form]");
  await waitFor(async () => (await ff.count()) === 1);
  await ff.locator('select[name="laboratoryId"]').selectOption(await ff.locator('select[name="laboratoryId"] option', { hasText: LAB }).getAttribute("value"));
  await ff.locator("[data-freeze-confirm]").check();
  await ff.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-snapshot="${pidA}"]`).count()) === 1);

  // ── to one participation: the Instruction to A ──
  await go(`/schemes/${S}/editions`);
  const relI = page.locator('[data-release-to-one="instruction"]');
  await relI.waitFor();
  await relI.locator("[data-release-target]").selectOption(pidA);
  await relI.locator("[data-release-send]").click();
  t("to one participation: sent, the participation told", await waitFor(async () => /участието е уведомено|participation is told/.test(await textOf(relI.locator("[data-release-msg]")))));
  // ── to one user: the Protocol to the user by name ──
  await go(`/schemes/${S}/editions`);
  const relP = page.locator('[data-release-to-one="protocol"]');
  await relP.locator("[data-release-level]").selectOption("user");
  // the users are opened only now, when «one user» is chosen (review)
  t("the users to send to by name: opened only when «one user» is chosen", (await page.locator(`[data-release-to-one="instruction"] [data-release-target] option[value="${uid}"]`).count()) === 0 && await waitFor(async () => (await relP.locator(`[data-release-target] option[value="${uid}"]`).count()) === 1));
  await relP.locator("[data-release-target]").selectOption(uid);
  await relP.locator("[data-release-send]").click();
  t("to one user by name: sent — PTS tells the person", await waitFor(async () => /съобщете на потребителя|tell the user/.test(await textOf(relP.locator("[data-release-msg]")))));

  // ── the user's page: what reaches it, each at its level ──
  await go(`/dev/persona?role=participant&user=${uid}`);
  await go("/lab/overview");
  const docs = page.locator(`[data-participation-id="${pidA}"] [data-docs]`);
  await docs.waitFor();
  t("the user sees the invitation (every participant), the plan, the Instruction for its participation alone, the Protocol to it personally", (await docs.locator('[data-doc="invitation"][data-doc-level="all"]').count()) === 1 && (await docs.locator('[data-doc="plan"]').count()) === 1 && (await docs.locator('[data-doc="instruction"][data-doc-level="participation"]').count()) === 1 && (await docs.locator('[data-doc="protocol"][data-doc-level="user"]').count()) === 1);
  const getI = await page.request.get(`${BASE}/lab/doc/${S}/instruction?p=${pidA}`);
  t("…and opens the Instruction: its released edition, the frozen file", getI.status() === 200 && Buffer.from(await getI.body()).equals(PDF("instruction")), `status ${getI.status()}`);
  const getP = await page.request.get(`${BASE}/lab/doc/${S}/protocol?p=${pidA}`);
  t("…the Protocol too", getP.status() === 200);
  const getX = await page.request.get(`${BASE}/lab/doc/${S}/stat-project?p=${pidA}`);
  t("…never what is not released, whatever the address", getX.status() === 403 || getX.status() === 404);

  // ── «Редакции»: who got which edition, who downloaded it ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/editions`);
  const edI = page.locator('[data-edition="instruction:1"]');
  t("«Редакции»: the Instruction's edition 1 went to one participation — by its code", (await edI.locator(`[data-release="participation"][data-release-to="${codeA}"]`).count()) === 1);
  t("…and was downloaded by it — on record", (await edI.locator(`[data-downloads] [data-download-by="${codeA}"]`).count()) >= 1);
  t("…the Protocol's to one user, by name for who may see it", (await page.locator('[data-edition="protocol:1"] [data-release="user"]').getAttribute("data-release-to")) === USER);
  // a withdrawal: it stays, crossed out — and the laboratory loses it
  await edI.locator("[data-release-withdraw]").click();
  t("withdrawn: kept on record, with the date", await waitFor(async () => (await page.locator('[data-edition="instruction:1"] [data-release="participation"][data-release-withdrawn="1"]').count()) === 1));
  await go(`/dev/persona?role=participant&user=${uid}`);
  t("…the laboratory no longer gets it", (await page.request.get(`${BASE}/lab/doc/${S}/instruction?p=${pidA}`)).status() === 403);

  // ── the plan, public before applying (D15) ──
  const pub = await anon.newPage();
  await pub.goto(`${BASE}/apply/${S}`, { waitUntil: "domcontentloaded" });
  t("the public scheme page links its plan — the released edition", (await pub.locator("[data-public-plan]").count()) === 1);
  const plan = await anon.request.get(`${BASE}/apply/${S}/plan`);
  t("…opened by anyone, before applying: the plan's released edition", plan.status() === 200 && Buffer.from(await plan.body()).equals(PDF("plan")), `status ${plan.status()}`);
  await anon.close();

  // on record — counts, codes, levels; never a name
  await go("/dev/persona?role=manager");
  await go("/activity");
  await page.getByText(/sent to one participation/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  t("on record: sent to one participation by its code, to one user — and the laboratory's opening at its level; never a name", new RegExp(`Document “instruction” sent to one participation \\(${codeA}\\)`).test(journal) && /Document “protocol” sent to one user of a legal entity/.test(journal) && /opened by the laboratory — to one participation/.test(journal) && !journal.includes(USER) && !journal.includes(LAB));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}
console.log(`\nverify-releases: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
