// Plan part 10.2 check (the website's feed; Реш. 147, 1.8), against a LOCAL dev server (in-memory store,
// login off):   BASE=http://localhost:3000 node scripts/verify-website.mjs
// A started scheme and a draft. «Сайт» shows the feed as it would go — the scheme, never the draft; the
// address serves only what was PUBLISHED (no session); «Публикувай за сайта» → the address has it, never the
// draft, never a count or a price; the scheme taken back to draft → gone from the address at once and the
// page says «stale»; on record.
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
page.on("dialog", (d) => d.accept());
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 50) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const text = async (loc) => ((await loc.count()) ? (await loc.first().textContent()) ?? "" : "");
const type = async (loc, v) => { for (let i = 0; i < 20; i++) { await loc.fill(v); await page.waitForTimeout(150); if ((await loc.inputValue()) === v) return; await page.waitForTimeout(400); } };
const stamp = Date.now() % 100000;
const TITLE = `Сайт ${stamp}`;

async function newScheme(name, status) {
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(name);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const id = new URL(page.url()).pathname.split("/").pop();
  await setStatus(id, status, name);
  return id;
}
async function setStatus(id, status, title) {
  await go(`/schemes/${id}/edit`);
  await page.locator('input[name="titleEn"]').waitFor();
  if (title) { await type(page.locator('input[name="titleBg"]').first(), title); await type(page.locator('input[name="titleEn"]').first(), title); }
  const want = status === "draft" ? /^(Чернова|Draft)$/ : /Отворена|Open/;
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: want }).first().click().catch(() => {});
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === status) break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit") || u.search.length > 0, { timeout: 90000 }).catch(() => {}), page.locator('button[type="submit"].btn-primary').first().click()]);
}
const numberOf = async (id) => { await go(`/schemes/${id}/edit`); await page.locator('input[name="titleEn"]').waitFor(); return (await page.locator('input[name="number"]').first().inputValue()).trim(); };

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  const S = await newScheme(TITLE, "open");
  const D = await newScheme(`Чернова сайт ${stamp}`, "draft");
  const SN = await numberOf(S), DN = await numberOf(D);

  const anon = await browser.newContext();
  const get = async () => { const r = await anon.request.get(`${BASE}/feed/schemes.json`); return { status: r.status(), body: await r.text(), cors: r.headers()["access-control-allow-origin"], cache: r.headers()["cache-control"] }; };
  const before = await get();
  t("the address before this scheme is published: not there (only what a person published — never live data)", (before.status === 404 || before.status === 200) && !before.body.includes(SN));

  // ── «Сайт»: the feed as it would go ──
  await go("/website");
  t("«Сайт» in the panel; the feed as it would go — the started scheme, never the draft; the exact JSON", (await page.locator('[data-admin-rail] a[href="/website"]').count()) === 1 && (await page.locator(`[data-website-row="${S}"]`).count()) === 1 && (await page.locator(`[data-website-row="${D}"]`).count()) === 0 && (await text(page.locator("[data-website-json]"))).includes(SN) && !(await text(page.locator("[data-website-json]"))).includes(DN));
  await page.locator("[data-website-publish]").click();
  await waitFor(async () => (await page.locator("[data-website-published]").count()) === 1);
  t("«Публикувай за сайта» → a new version, said", (await page.locator("[data-website-published]").count()) === 1 && (await page.locator('[data-website-state="current"]').count()) === 1);

  // a second press with nothing changed: nothing new (10.2 review)
  await page.locator("[data-website-publish]").click();
  await waitFor(async () => (await page.locator("[data-website-unchanged]").count()) === 1);
  t("…pressed again with nothing changed — nothing new published, said", (await page.locator("[data-website-unchanged]").count()) === 1);

  const after = await get();
  let feed = null;
  try { feed = JSON.parse(after.body); } catch { /* not JSON */ }
  const mine = feed?.schemes?.find((x) => x.id === S);
  t("the address (no session): the published feed — the scheme with its state and links; never the draft; never cached", after.status === 200 && after.cors === "*" && /no-cache/.test(after.cache ?? "") && feed?.schema_version === 1 && !!mine && mine.state?.key === "accepting" && mine.links?.page?.endsWith(`/apply/${S}`) && !after.body.includes(DN) && !feed.schemes.some((x) => x.id === D));
  t("…never a count, the maximum, a price or a participant", !/maxParticipants|minParticipants|commercial|"base"|participants|€/.test(after.body));

  // ── taken back to draft: gone at once; the page says stale ──
  await setStatus(S, "draft");
  const later = await get();
  t("the scheme taken back to draft — out of the address at once (Реш. 147), though the publication is unchanged", later.status === 200 && !later.body.includes(SN) && JSON.parse(later.body).version === feed.version);
  await go("/website");
  t("…«Сайт» says the website's data is stale — publish again", (await page.locator("[data-website-stale]").count()) === 1);

  await go("/activity");
  await page.getByText(/Website feed published/).first().waitFor({ timeout: 60000 }).catch(() => {});
  t("on record — the publication, its version and count", /Website feed published — version \d+, \d+ schemes/.test(await text(page.locator("main"))));
  await anon.close();
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-website: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
