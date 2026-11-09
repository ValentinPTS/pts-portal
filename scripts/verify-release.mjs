// Plan part 0.7 check (freeze on release) — since part 3.0 what is sent is an EDITION
// (scripts/verify-editions.mjs checks those in full). Against a LOCAL dev server
// (in-memory):   BASE=http://localhost:3000 node scripts/verify-release.mjs
// Gives the Protocol content (one saved fill value), releases it, then changes the
// scheme number the Protocol prints. The edition the participants hold must keep the
// old number while the live document shows the new one. Restores the number after.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = process.env.SCHEME ?? "26-01-T-1";
const DOC = "protocol";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
// a confirm is accepted; a prompt (changed since an earlier run's edition: what
// changed and why) is answered
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Проверка 0.7: нова редакция на протокола" : undefined));
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  return { status: r.status(), text: await r.text() };
};
const setNumber = async (num) => {
  await go(`/schemes/${S}/edit`);
  const input = page.locator('input[name="number"]');
  await input.waitFor();
  await input.fill(num);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }).catch(() => {}),
    page.locator('button[type="submit"].btn-primary').first().click(),
  ]);
};

let original = "";
try {
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/edit`);
  original = await page.locator('input[name="number"]').inputValue();
  t("read the scheme number", !!original, original);
  // the check renames the scheme; a scheme with an issued certificate keeps its number
  // (part 0.14) — so run this before verify-cert.mjs, or on a fresh server

  // give the Protocol content, so it can be released (an empty slot is refused)
  const fill = await page.request.post(`${BASE}/schemes/${S}/fill/${DOC}?lang=bg`, { form: { ff_check: "on" }, maxRedirects: 0, timeout: 90000 });
  t("protocol has content", fill.status() === 303, `status ${fill.status()}`);

  // release it from the scheme page
  await go(`/schemes/${S}`);
  const row = page.locator("div", { hasText: "Протокол" }).filter({ has: page.getByRole("button", { name: /Изпрати|Send/ }) }).last();
  for (let i = 0; i < 20; i++) {
    await row.getByRole("button", { name: /Изпрати|Send/ }).first().click().catch(() => {});
    if ((await get(`/schemes/${S}/released/${DOC}?lang=bg`)).status === 200) break;
    await page.waitForTimeout(1000);
  }
  const before = await get(`/schemes/${S}/released/${DOC}?lang=bg`);
  t("the sent copy is kept", before.status === 200 && before.text.includes(original), `status ${before.status}`);

  // change what the Protocol prints, after release
  // another number of the scheme's own form — the portal reads every number (3.1)
  const changed = original.replace(/-(\d+)$/, () => `-${700 + (Date.now() % 250)}`);
  await setNumber(changed);
  t("the number could be changed — no issued certificate locks it (else run this on a fresh server, before verify-cert.mjs)", !/err=numberLocked/.test(page.url()), page.url());
  const live = await get(`/schemes/${S}/doc/${DOC}/print?lang=bg`);
  t("the live document shows the change", live.text.includes(changed));
  const after = await get(`/schemes/${S}/released/${DOC}?lang=bg`);
  t("the sent copy does NOT change", after.text === before.text && !after.text.includes(changed));

  await go(`/schemes/${S}`);
  const page1 = await get(`/schemes/${S}`);
  t("the scheme page links the sent copy", page1.text.includes(`/schemes/${S}/released/${DOC}`));
} finally {
  if (original) await setNumber(original).catch((e) => console.error("could not restore number:", e.message));
  await go("/dev/persona").catch(() => {});
  await browser.close();
}

console.log(`verify-release: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
