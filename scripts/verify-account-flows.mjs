// Plan part 1.5 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-account-flows.mjs
// What runs without Supabase: «forgot password» on both doors and its one answer
// for any address, the link landing (an expired or broken link says so), «set a
// password» needs the session a link makes, and the laboratory's review step. The
// full round trip — invitation, reset and confirmation e-mails — needs the test
// Supabase project (docs/participant-portal/TEST-ENV-SETUP-BG.md).
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
const go = async (path) => {
  for (let i = 0; ; i++) {
    try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); }
    catch (e) { if (i >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e; await page.waitForTimeout(800); }
  }
};

try {
  await go("/dev/persona");
  // «forgot password» on both doors
  for (const [door, area] of [["/login", "team"], ["/lab/login", "lab"]]) {
    await go(door);
    const link = page.getByRole("link", { name: /Забравена парола\?|Forgot your password\?/ });
    t(`${door}: a «forgot password» link`, (await link.getAttribute("href")) === `/auth/forgot?area=${area}`);
  }
  await go("/auth/forgot?area=lab");
  const form = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
  for (let i = 0; i < 20; i++) { await form.locator('input[name="email"]').fill("nobody@example.test"); if ((await form.locator('input[name="email"]').inputValue()) === "nobody@example.test") break; await page.waitForTimeout(400); }
  await form.getByRole("button", { name: /Изпрати връзка|Send a link/ }).click();
  const sent = page.locator("[data-reset-sent]");
  await sent.waitFor();
  t("forgot: one answer whatever the address — nothing revealed", /Ако има акаунт|If an account has/.test(await sent.innerText()));
  t("…and the way back to the laboratory sign-in", (await sent.getByRole("link").getAttribute("href")) === "/lab/login");

  // the link landing: an unusable link says so at once
  for (const q of ["", "?type=invite", "?token_hash=x&type=admin", "?token_hash=x&type=signup"]) {
    await go(`/auth/confirm${q}`);
    await page.waitForURL(/\/auth\/confirmed\?error=link/, { timeout: 20000 }).catch(() => {});
    t(`an unusable link «${q || "(none)"}» → «no longer valid»`, /\/auth\/confirmed\?error=link/.test(page.url()) && (await page.locator('[data-auth-landing="error"]').count()) === 1, page.url());
  }
  // a usable-looking one only OPENS: nothing is spent until the person presses «Продължи»
  await go("/auth/confirm?token_hash=abc&type=invite&next=%2F%09%2Fevil.example");
  const cont = page.locator("[data-auth-continue]");
  t("opening an invitation link spends nothing — it asks to continue", (await cont.count()) === 1 && /Продължи|Continue/.test(await cont.innerText()) && /\/auth\/confirm\?/.test(page.url()));
  t("…and says what it is for", /Приемане на поканата|Accepting the invitation/.test(await cont.innerText()));
  await cont.getByRole("button", { name: /^(Продължи|Continue)$/ }).click();
  await page.waitForURL(/\/auth\/confirmed/, { timeout: 20000 }).catch(() => {});
  t("pressing it with a token that does not work → «no longer valid», never another site", /^http:\/\/localhost:\d+\/auth\/confirmed\?error=link/.test(page.url()), page.url());
  await go("/auth/confirmed");
  t("a confirmed address: «you can sign in now»", /Имейлът е потвърден|Your e-mail is confirmed/.test(await page.locator('[data-auth-landing="ok"]').innerText()));

  // «set a password» needs the session a link makes
  await go("/auth/set-password?from=invite");
  // a page's redirect is streamed (Next 16): the browser follows it a moment later
  await page.waitForURL(/\/auth\/confirmed\?error=link/, { timeout: 20000 }).catch(() => {});
  t("set a password without a link's session → refused, «no longer valid»", /\/auth\/confirmed\?error=link/.test(page.url()), page.url());

  // after an invitation a laboratory reviews its data (the step 4.4 builds on)
  await go("/dev/persona?role=lab");
  await go("/lab/profile?review=1");
  t("the laboratory's «review your data» note", /Прегледайте|Review them/.test(await page.locator("[data-review-data]").innerText()));
  t("a development persona has no password to change", (await page.locator("[data-change-password]").count()) === 0);
  await go("/lab/profile");
  t("…and no note without the invitation", (await page.locator("[data-review-data]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-account-flows: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
