// Plan part 10.3 check (anonymous feedback; Реш. 92, 122; К21), against a LOCAL dev server (in-memory store,
// login off):   BASE=http://localhost:3000 node scripts/verify-feedback.mjs
// A scheme (an ILC — its report uploaded by hand) with a laboratory's own participation. Before the report:
// no feedback offered. Issued: the laboratory gives it once — the page says «given», the complaint goes to
// the site's form; PTS's panel says how many gave but hides the answers under three; the journal has no
// line of it; the records closed: the counts and the words shown — no code, no time.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const answers = [], alerts = [];
page.on("dialog", async (d) => { if (d.type() === "alert") alerts.push(d.message()); const a = answers.shift(); if (a === false) await d.dismiss(); else await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const textOf = async (loc) => ((await loc.count()) ? await loc.innerText() : "");
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ILC ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();
const stage = (no) => page.locator(`[data-lifecycle] [data-stage="${no}"]`);
const tick = async (S, no) => { await go(`/schemes/${S}#stages`); answers.push(""); await page.locator(`[data-tick="${no}"]`).click(); await waitFor(async () => (await stage(no).getAttribute("data-done")) === "1"); };
const upload = async (S, buffer, name) => {
  await go(`/schemes/${S}`);
  const r = page.locator('[data-doc-row="report"]');
  await r.waitFor();
  // no file yet: «Качи»; a file there: «⋯» → «Замени файла»
  const direct = r.locator("button", { hasText: /^＋ (Качи|Upload)$/ });
  const opener = async () => {
    if (await direct.count()) return direct.first().click();
    await r.locator('button[aria-label="More"]').click();
    return page.locator("button", { hasText: /Замени файла|Replace file/ }).first().click();
  };
  // a click before the page is interactive opens nothing: tried again (a flake seen in the gates, 8.3)
  let chooser = null;
  for (let i = 0; i < 3 && !chooser; i++) {
    [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 20000 }).catch(() => null), opener().catch(() => null)]);
    if (!chooser) await page.waitForTimeout(1000);
  }
  if (!chooser) throw new Error("the upload's file chooser never opened");
  await chooser.setFiles({ name, mimeType: "application/pdf", buffer });
  return waitFor(async () => (await r.innerText()).includes(name));
};
const REPORT = pdf("R1");
const WORDS4 = `Плочки и бордюри ${stamp}`, WORDS5 = `Повече време за изпитването ${stamp}`, OTHER = `Зависи от цената ${stamp}`;

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── an ILC scheme, with a laboratory's own participation ──
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('select[name="kind"]').selectOption("ILC");
  await dialog.locator('input[name="name"]').fill(`Обратна връзка ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  t("setup: an ILC scheme (its number «ILC …»)", /^ILC-\d{2}-\d{2}-NA-T-/.test(S), S);
  await go(`/dev/persona?role=lab&join=${S}`);
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await state()); }, 10);
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40);
  if ((await page.locator("[data-coding-run]").count()) > 0) {
    answers.push(true);
    await page.locator("[data-coding-run]").click();
    await waitFor(async () => { await go(`/schemes/${S}#stages`); return (await stage(9).getAttribute("data-done")) === "1"; }, 30);
  }
  await go(`/schemes/${S}#stages`);
  answers.push(true, `Обработката започва — ILC ${stamp}`);
  await page.locator('[data-act="process"]').click();
  t("setup: the ILC in processing", await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await state()); }, 20));


  // ── before the report: nothing offered ──
  await go("/dev/persona?role=lab");
  await go("/lab");
  const pid = await page.locator(`[data-lab-card="${S}"] [data-open-participation]`).getAttribute("data-open-participation");
  await go(`/lab/p/${pid}`);
  t("before the report: no feedback offered", (await page.locator("[data-feedback]").count()) === 0);

  // ── the report issued ──
  await go("/dev/persona?role=manager");
  t("setup: the report uploaded", await upload(S, REPORT, `fb-report-${stamp}.pdf`));
  for (const no of [14, 15, 16]) await tick(S, no);
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="report"]').click();
  t("setup: the report issued", await waitFor(async () => { await go(`/schemes/${S}`); return (await state()) === "Докладът е издаден"; }, 20));

  // ── the laboratory gives its feedback ──
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pid}`);
  // a second tab, opened before the feedback is given (10.3 review: a stale tab)
  const ctx2 = await browser.newContext();
  const tab2 = await ctx2.newPage();
  await tab2.goto(`${BASE}/dev/persona?role=lab`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await tab2.goto(`${BASE}/lab/p/${pid}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await tab2.locator('[data-feedback="open"]').waitFor();
  const form = page.locator('[data-feedback="open"]');
  t("the report issued: the feedback form — anonymous, said; the complaint to the site's form (П 7.6)", (await form.count()) === 1 && /анонимна|anonymous/i.test(await textOf(form)) && (await form.locator("[data-feedback-complaints] a").count()) === 1);
  await form.locator('input[name="q1"][value="5"]').check();
  await form.locator('input[name="q2"][value="4"]').check();
  await form.locator('input[name="q3"][value="other"]').check();
  await form.locator('input[name="q3text"]').fill(OTHER);
  await form.locator('textarea[name="q4"]').fill(WORDS4);
  await form.locator('textarea[name="q5"]').fill(WORDS5);
  await form.locator("[data-feedback-submit]").click();
  t("…given: the page says so", await waitFor(async () => (await page.locator('[data-feedback="given"]').count()) === 1), await textOf(page.locator('[data-feedback] [role="alert"]')));
  await go(`/lab/p/${pid}`);
  t("…once: after a reload it is not offered again", (await page.locator('[data-feedback="given"]').count()) === 1 && (await page.locator('[data-feedback="open"]').count()) === 0);
  await tab2.locator('input[name="q1"][value="1"]').check();
  await tab2.locator("[data-feedback-submit]").click();
  t("…a stale tab's second feedback: refused — it shows «given», nothing counted twice", await waitFor(async () => (await tab2.locator('[data-feedback="given"]').count()) === 1));
  await ctx2.close();

  // ── PTS: how many, the answers hidden under three; no journal line ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  const panel = page.locator("[data-feedback-panel]");
  t("PTS's panel while it is given: «fewer than three» — never the exact number (a reload would time each give), never an answer", (await panel.getAttribute("data-feedback-panel")) === "hidden" && (await panel.locator('[data-feedback-band="under"]').count()) === 1 && !/\b1\b/.test(await textOf(panel.locator("[data-feedback-band]"))) && !(await textOf(panel)).includes(WORDS4));
  const journal = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("no journal line of it — no account, no time (К21)", !journal.includes(WORDS4) && !journal.includes(OTHER) && !journal.includes(WORDS5));

  // ── the records closed: giving ends; fewer than three — the answers withheld ──
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="close"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /Приключ|Closed/.test(await state()); }, 20);
  const closed = page.locator("[data-feedback-panel]");
  t("the records closed, one gave: the answers withheld (fewer than three) — none matched to its participation", (await closed.getAttribute("data-feedback-panel")) === "hidden" && /по-малко от 3|fewer than 3/i.test(await textOf(closed)) && !(await textOf(closed)).includes(WORDS4));
  const exp = await (await page.request.get(`${BASE}/schemes/${S}/export?part=coded`)).body();
  t("…the round export the same: withheld — never the words", !Buffer.from(exp).includes(Buffer.from(WORDS4)));
  await go("/dev/persona?role=lab");
  await go(`/lab/p/${pid}`);
  t("…and no feedback offered once the records are closed", (await page.locator('[data-feedback="open"]').count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-feedback: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
