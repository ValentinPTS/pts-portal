// Plan part 1.1 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-system.mjs
// The manager-only «Проверка на системата» shows the database state, the
// migrations, the buckets and the switches — and no secret. Staff and auditors
// cannot open it.
import { chromium } from "playwright";
import { readdirSync } from "node:fs";

// as many as the repo has
const EXPECTED = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).length;

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
// a refused page redirects on its own; a navigation started meanwhile is aborted — retry
const go = async (path) => {
  for (let i = 0; ; i++) {
    try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); }
    catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; await page.waitForTimeout(800); }
  }
};

try {
  await go("/dev/persona?role=manager");
  await go("/users");
  // a streamed page: wait for it before reading (a busy dev server answers late)
  // (the page's own link — the administrative panel's rail has one too, 2.7)
  await page.locator("main").getByRole("link", { name: /Проверка на системата|System check/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
  t("the users page links to the system check", (await page.locator("main").getByRole("link", { name: /Проверка на системата|System check/ }).count()) === 1);
  await go("/system");
  await page.locator('[data-system="people"]').waitFor({ timeout: 60000 }).catch(() => {});
  const text = await page.locator("main").innerText();
  t("the system check opens for a manager", /Проверка на системата|System check/.test(text));
  for (const part of ["db", "migrations", "buckets", "flags", "mail", "processors", "people"]) {
    t(`…with its «${part}» section`, (await page.locator(`[data-system="${part}"]`).count()) === 1);
  }
  t("locally: in memory, said plainly", /в паметта|in memory/.test(text));
  t("…and says it runs entirely in memory", /работи изцяло в паметта|running entirely in memory/.test(text));
  t(`the code expects ${EXPECTED} migrations`, new RegExp(`(Очаквани от кода|Expected by the code)\\s*${EXPECTED}\\b`).test(text), text.slice(0, 400));
  // the portal's mail (1.7): locally none, said plainly; the test e-mail needs a sign-in
  t("mail: no provider locally — «nothing is sent»", /(Доставчик на пощата|Mail provider)\s*(няма — нищо не се праща|none — nothing is sent)/.test(text));
  t("mail: the test e-mail button is there, and off without login", (await page.locator("[data-test-mail] button").isDisabled()) === true);
  // the processors (1.12): every outside service, and where the server runs
  t("processors: the registry, and «where the server runs» (locally: local)", (await page.locator("[data-processor]").count()) >= 9 && /(Къде работи сървърът|Where the server runs)\s*(локално|local)/.test(text));
  t("people: who the head of the provider is, and no shared address among the founders", /(Ръководител на доставчика|Head of the PT provider)/.test(text) && /(Общ адрес сред основателите|A shared address among the founders)\s*(няма|none)/.test(text));
  t("INTERNAL_TOKEN shown only as set / not set", /INTERNAL_TOKEN\s*(зададен|не е зададен|set|not set)/.test(text));
  const html = await page.content();
  t("no secret value on the page", !/sb_secret_|eyJhbGciOi/.test(html));

  for (const role of ["staff", "auditor"]) {
    await go(`/dev/persona?role=${role}`);
    const r = await go("/system");
    await page.waitForTimeout(1000);
    const body = await page.content();
    // a refused page redirects (or streams a redirect marker) instead of the check
    t(`${role}: no system check`, !/data-system="migrations"/.test(body), `${r?.status()} ${page.url()}`);
  }
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-system: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
