// Plan part 2.6 check (Реш. 149), against a LOCAL dev server (in-memory store, login
// off):   BASE=http://localhost:3000 node scripts/verify-order.mjs
// The scheme's Order is read by the staff it assigns roles to and by the head — not by
// the quality manager (unless designated, tested in scripts/order.test.ts), the auditor,
// another scheme's people or anyone signed out; and no laboratory ever fetches it. Each
// is asked by the scheme page's list, the documents index, the editor, the print
// routes and the PDF route.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = process.env.SCHEME ?? "26-01-T-1";
const OTHER = process.env.OTHER ?? "25-06-C-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const html = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  return { url: r.url(), text: await r.text(), status: r.status() };
};
// the Order's own words: «ЗАПОВЕД … ОПРЕДЕЛЯМ:» (lib/docs/order.ts)
const isOrder = (text) => /ОПРЕДЕЛЯМ|I DETERMINE/.test(text);
const persona = (p) => go(p === "auditor" ? "/dev/persona?role=auditor" : `/dev/persona?model=${encodeURIComponent(p)}`);
const waitFor = async (fn, tries = 30) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(300); } return false; };
const settle = async (el, set, want) => { for (let i = 0; i < 20; i++) { await set(); await page.waitForTimeout(150); if ((await el.inputValue()) === want) return; await page.waitForTimeout(300); } };
const links = (text) => [`/schemes/${S}/build/order`, `/schemes/${S}/fill/order`, `/schemes/${S}/doc/order`].some((l) => text.includes(l));
const PERSON = `order-${Date.now()}@example.test`;

try {
  // a role of this scheme from its Order — so the change register has one to show or hide
  await go("/dev/persona?role=manager");
  await go("/users");
  const add = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  await add.waitFor();
  const mail = add.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(PERSON); if ((await mail.inputValue()) === PERSON) break; await page.waitForTimeout(400); }
  await add.locator("input").nth(1).fill("Заповед Проверка");
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator(`[data-person="${PERSON}"]`).count()) === 1);
  const f = page.locator("[data-assign-role]");
  const [who, scheme, what, ord] = [f.locator("select").nth(0), f.locator("select").nth(1), f.locator("select").nth(2), f.locator("input")];
  await settle(who, () => who.selectOption(PERSON), PERSON);
  await settle(scheme, () => scheme.selectOption(S), S);
  await settle(what, () => what.selectOption("technical_expert"), "technical_expert");
  await settle(ord, () => ord.fill("№ 9 от 04.11.2026"), "№ 9 от 04.11.2026");
  await f.locator('button[type="submit"]').click();
  t("(a role from the Order given)", await waitFor(async () => (await page.locator(`[data-person="${PERSON}"] [data-held-role="${S}:technical_expert"]`).count()) === 1));
  const entry = `Роля в схема ${S}: ${PERSON}`;

  // those who read it
  for (const p of [`scheme_manager@${S}`, `statistics_expert@${S}`, `coding_expert@${S}`, `technical_expert@${S}`, `reviewer@${S}`, "head"]) {
    await persona(p);
    const print = await html(`/schemes/${S}/doc/order/print?lang=bg`);
    t(`${p}: reads the Order`, print.status === 200 && isOrder(print.text), `status ${print.status}`);
    const list = await html(`/schemes/${S}`);
    t(`${p}: the scheme page lists it`, list.text.includes(`/schemes/${S}/build/order`));
    if (p === `scheme_manager@${S}`) {
      const pdf = await page.request.post(BASE + "/api/pdf", { data: { id: S, doc: "order", lang: "bg" }, timeout: 120000 });
      t(`${p}: …and gets its PDF`, pdf.status() === 200 && /pdf/.test(pdf.headers()["content-type"] ?? ""), `status ${pdf.status()} ${pdf.headers()["content-type"]}`);
    }
    if (p === "head") t("the head: the change register shows the role", (await html("/changes")).text.includes(entry));
  }

  // those who do not
  for (const p of ["quality", "auditor", `scheme_manager@${OTHER}`]) {
    await persona(p);
    for (const path of [`/schemes/${S}/doc/order/print?lang=bg`, `/schemes/${S}/build/order/print?lang=bg`, `/schemes/${S}/uploaded/order`, `/schemes/${S}/fill/order`]) {
      const r = await html(path);
      t(`${p}: ${path} refused`, r.status >= 300 && !isOrder(r.text) || (r.url.includes("denied") && !isOrder(r.text)), `status ${r.status}`);
    }
    for (const path of [`/schemes/${S}/doc/order`, `/schemes/${S}/build/order`, `/schemes/${S}/build/order/history`]) {
      const r = await html(path);
      // a streamed page refuses with an in-page redirect; either way none of it is sent
      t(`${p}: ${path} shows none of it`, !isOrder(r.text) && (r.url.includes("denied") || /NEXT_REDIRECT|login\?denied=1/.test(r.text) || r.status >= 300), `status ${r.status}`);
    }
    const pdf = await page.request.post(BASE + "/api/pdf", { data: { id: S, doc: "order", lang: "bg" }, timeout: 90000 });
    t(`${p}: no PDF of it`, pdf.status() === 403 || pdf.status() === 401 || pdf.url().includes("denied"), `status ${pdf.status()}`);
    if (p !== `scheme_manager@${OTHER}`) {
      // they open the scheme (codes) — but its list and its index show no Order
      const list = await html(`/schemes/${S}`);
      t(`${p}: the scheme page opens without the Order`, list.status === 200 && !links(list.text) && list.text.includes(`/schemes/${S}/build/plan`));
      const index = await html(`/schemes/${S}/build`);
      t(`${p}: the documents index without it`, index.status === 200 && !links(index.text) && index.text.includes(`/schemes/${S}/build/plan`));
    }
  }

  // the change register: a scheme's roles only for who reads its journal or its Order
  await persona(`statistics_expert@${OTHER}`);
  const other = await html("/changes");
  t("another scheme's expert: the change register opens without this scheme's roles", other.status === 200 && /Регистър на промените/.test(other.text) && !other.text.includes(entry));
  await persona("quality");
  t("the quality manager (the journal of every scheme): the change register shows it", (await html("/changes")).text.includes(entry));

  // no laboratory, and nobody signed out
  await page.context().clearCookies();
  const lab = await html(`/lab/doc/${S}/order`);
  t("without a laboratory session the laboratory route gives nothing", lab.status === 401 || lab.status === 403 || !isOrder(lab.text), `status ${lab.status}`);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-order: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
