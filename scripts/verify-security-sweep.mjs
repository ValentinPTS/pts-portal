// The security sweep after Phase 10 (2026-11-11) — the fixes a person meets, against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-security-sweep.mjs
// «Създай проект» pressed twice makes one scheme, never «already exists» (UM-1); two edit tabs — the later
// save refused, said, the other's kept (UM-2); an auditor: the editor read-only, a forced save on «/denied»
// (UR-1); the portal's own «not found» (UP-2); sign-in's «next» never another site (SA-2); the register's
// API takes text only (UP-3); the document routes keep their own policy (SI-2); a path with dot segments
// is served as what it resolves to — and the proxy is asked on it (the matcher; login off here, so only
// what is served is seen).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (p, pg = page) => pg.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 60) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;

try {
  // ── UM-1: «Създай проект» pressed twice — one scheme, its page ──
  await go("/dev/persona?role=manager");
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Проверка ${stamp}`);
  const create = dialog.locator("[data-create-project]");
  await page.waitForTimeout(800); // hydrated
  await create.dblclick();
  await page.waitForURL(/\/schemes\/[^/?]+$|dupNumber/, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  t("UM-1: pressed twice — on the new scheme's page, never «already exists»", /\/schemes\/[^/?]+$/.test(new URL(page.url()).pathname) && !page.url().includes("dupNumber"), page.url());
  const S = new URL(page.url()).pathname.split("/").pop();

  // ── UM-2: two tabs on «Редактирай данните» ──
  const tabB = await ctx.newPage();
  await go(`/schemes/${S}/edit`);
  await go(`/schemes/${S}/edit`, tabB);
  await page.waitForTimeout(1500); await tabB.waitForTimeout(1500);
  const A_TITLE = `Заглавие А ${stamp}`, B_TITLE = `Title B ${stamp}`;
  await page.locator('input[name="titleBg"]').fill(A_TITLE);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.includes("err="), { timeout: 90000 }), page.getByRole("button", { name: /Запази промените|Save changes/ }).click()]);
  await tabB.locator('input[name="titleEn"]').fill(B_TITLE);
  await Promise.all([tabB.waitForURL((u) => u.search.includes("err=") || !u.pathname.endsWith("/edit"), { timeout: 90000 }), tabB.getByRole("button", { name: /Запази промените|Save changes/ }).click()]);
  t("UM-2: the stale tab's save refused, said", tabB.url().includes("err=stale") && (await tabB.locator("[data-edit-stale]").count()) === 1, tabB.url());
  await go(`/schemes/${S}/edit`);
  t("…the other tab's change kept, the stale one not written", (await page.locator('input[name="titleBg"]').inputValue()) === A_TITLE && (await page.locator('input[name="titleEn"]').inputValue()) !== B_TITLE);
  await tabB.close();

  // ── UR-1: the auditor reads the editor, saves nothing; a forced save — «/denied» ──
  await go("/dev/persona?role=auditor");
  await go(`/schemes/${S}/edit`);
  t("UR-1: the auditor's editor is read-only — no «Запази промените»", await waitFor(async () => (await page.locator("[data-read-only]").count()) === 1) && (await page.getByRole("button", { name: /Запази промените|Save changes/ }).count()) === 0);
  await go("/items");
  t("…«Елементи»: no add, edit or remove", (await page.getByRole("button", { name: /Добави за редакция|Add for editing|Добави всички|Add all/ }).count()) === 0);
  await go("/skins");
  t("…«Облици»: no «по подразбиране», no new one", (await page.getByRole("button", { name: /по подразбиране|as default/i }).count()) === 0 && (await page.locator('a[href="/skins/new"]').count()) === 0);
  // the save forced: the form as the manager has it, posted as the auditor
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/edit`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => fetch("/dev/persona?role=auditor", { credentials: "same-origin" }));
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }), page.getByRole("button", { name: /Запази промените|Save changes/ }).click()]);
  t("…a save forced as the auditor: «Нямате право на това», never the sign-in page", new URL(page.url()).pathname === "/denied" && (await waitFor(async () => (await page.locator("[data-denied]").count()) === 1)), page.url());
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/edit`);
  t("…and nothing was changed", (await page.locator('input[name="titleBg"]').inputValue()) === A_TITLE);

  // ── UP-2: the portal's own «not found» ──
  await go("/apply/no-such-scheme");
  // (a streamed page: the «not found» comes after the loading shell)
  t("UP-2: an unknown scheme — the portal's «not found», in its words, a way back", (await waitFor(async () => (await page.locator("[data-not-found]").count()) === 1)) && /Страницата не е намерена|Page not found/.test(await page.locator("[data-not-found]").innerText()));

  // ── SA-2: sign-in's «next» never another site ──
  for (const n of ["/\\evil.example/x", "/\tevil.example", "/.//evil.example"]) {
    await go(`/login?next=${encodeURIComponent(n)}`);
    const v = await page.locator('input[name="next"]').first().inputValue().catch(() => "?");
    t(`SA-2: «next=${JSON.stringify(n)}» — the form keeps «/»`, v === "/", v);
  }

  // ── UP-3: the register's API — text only ──
  const api = await page.request.post(`${BASE}/api/certificate`, { headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${stamp % 250}.${(stamp >> 3) % 250}` }, data: JSON.stringify({ number: ["PTS 26/01-T-1-12345"], code: ["01"] }) });
  t("UP-3: an array for the number and the code — «invalid», nothing more", api.status() === 200 && JSON.stringify(await api.json()) === JSON.stringify({ valid: false }));

  // ── round 2 (R2S-10): a laboratory's document is never fetched as a picture ──
  const asImage = await page.request.get(`${BASE}/lab/doc/${S}/plan`, { headers: { "sec-fetch-dest": "image" }, maxRedirects: 0 });
  t("R2S-10: a document fetched as a picture — refused (403), nothing on record", asImage.status() === 403, String(asImage.status()));

  // ── the proxy's matcher: a dot-segment path is served as what it resolves to (login off: open) ──
  const dot = await page.request.get(`${BASE}/certificate/%2e%2e/dashboard`, { maxRedirects: 0 });
  t("a «..» path is what it resolves to — the proxy asked on it (login on: the sign-in)", [200, 307, 308].includes(dot.status()), String(dot.status()));
} catch (e) {
  fail++;
  console.error("FAIL: crashed:", e?.message ?? e);
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
