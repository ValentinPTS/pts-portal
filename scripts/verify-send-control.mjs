// Plan part 1.8 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-send-control.mjs
// Run on a fresh server (the templates are in memory), ideally after
// verify-lab-persona.mjs so «Известия» holds a chain notice: every held notice is
// shown as the exact e-mail with «Изпрати»; the reminder text is approved, then
// edited, which needs a new approval; a laboratory's invitation is shown in full
// before «Изпрати» and goes out only through the portal's own mail.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("BASE must be a local dev server"); process.exit(2); }
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
  await go("/dev/persona?role=manager");

  // «Известия»: each held notice is the exact e-mail, and «Изпрати»
  await go("/notices");
  // the page streams: its link to the texts is there once it has all come (a busy server is slow)
  await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.locator("[data-held] button").first().waitFor({ timeout: 60000 }).catch(() => {});
  const held = page.locator("[data-held]");
  const n = await held.count();
  let exact = true;
  for (let i = 0; i < n; i++) {
    const card = held.nth(i);
    exact &&= (await card.locator("[data-exact-text]").count()) === 1 && /PTS Bulgaria/.test(await card.locator("[data-exact-text]").innerText())
      && (await card.getByRole("button", { name: /^(Изпрати|Send)$/ }).count()) === 1;
  }
  t(`every held notice (${n}) is shown as the exact e-mail, with «Изпрати»`, exact && (process.env.EXPECT_HELD ? n > 0 : true), String(n));
  t("«Известия» links to the reminder texts", (await page.getByRole("link", { name: /Текстове на напомнянията|Reminder texts/ }).count()) === 1);
  t("…and lists the e-mails sent", /Изпратени имейли|E-mails sent/.test(await page.locator("main").innerText()));

  // «Текстове на напомнянията»: not approved → approve → edit → needs approval again
  await go("/notices/texts");
  const card = page.locator('[data-template="results.due"]');
  const status = async () => card.locator("[data-template-status]").innerText();
  t("the reminder text starts unapproved — reminders wait for a person", /не е одобрен|not approved/.test(await status()), await status());
  t("…shown as the laboratory will see it", /PTS 26\/01-T-1/.test(await card.locator("[data-template-sample]").innerText()));
  await card.locator("[data-template-approve]").click();
  await page.waitForURL(/approved=1/, { timeout: 20000 }).catch(() => {});
  t("approved: «одобрен · v1»", /одобрен · v1|approved · v1/.test(await status()), await status());
  // an edit without a placeholder is refused
  await card.locator("summary").click();
  const form = card.locator("[data-template-edit]");
  await form.locator('textarea[name="bg"]').fill("Утре е срокът.");
  await form.getByRole("button").click();
  await page.waitForURL(/error=/, { timeout: 20000 }).catch(() => {});
  t("a text without {scheme} and {date} is refused", /error=missing-placeholder/.test(page.url()), page.url());
  await go("/notices/texts");
  await page.locator('[data-template="results.due"] summary').click();
  const form2 = page.locator('[data-template="results.due"] [data-template-edit]');
  await form2.locator('textarea[name="bg"]').fill("Утре, {date}, е срокът за резултати по схема {scheme}.");
  await form2.getByRole("button").click();
  await page.waitForURL(/saved=1/, { timeout: 20000 }).catch(() => {});
  t("a changed text: v2, not approved until approved again", /не е одобрен · v2|not approved · v2/.test(await page.locator('[data-template="results.due"] [data-template-status]').innerText()));
  t("the fixed texts are listed for PTS: the invitation, Supabase's four (incl. «Password changed») and the notice of a confirmed profile (4.4)", (await page.locator("[data-fixed]").count()) === 6 && (await page.locator('[data-fixed="password-changed"]').count()) === 1 && (await page.locator('[data-fixed="profile-confirmed"]').count()) === 1);

  // a laboratory's invitation: the exact text first, then «Изпрати»
  await go("/users");
  const stamp = Date.now();
  const labForm = page.locator("form").filter({ has: page.locator('input[type="email"]') }).nth(1);
  const mail = labForm.locator('input[type="email"]');
  for (let i = 0; i < 20; i++) { await mail.fill(`invite-${stamp}@example.test`); if ((await mail.inputValue()) === `invite-${stamp}@example.test`) break; await page.waitForTimeout(400); }
  await labForm.locator("input").nth(1).fill("Invite check");
  await labForm.locator('button[type="submit"]').click();
  const row = page.locator("tr", { hasText: `invite-${stamp}@example.test` });
  await row.waitFor();
  t("adding a laboratory sends nothing — it says the invitation goes from its row", /Поканата се праща от реда|Its invitation goes from its row/.test(await page.locator("main").innerText()));
  await row.locator("[data-invite-open]").click();
  const preview = page.locator("[data-invite-preview]");
  await preview.waitFor();
  const text = await preview.innerText();
  t("«Покани» shows the invitation's exact text first", /PTS Bulgaria ви кани в своя портал/.test(text) && /PTS Bulgaria invites you/.test(text) && /Покана за портала на PTS Bulgaria/.test(text));
  t("…with the link left out of the preview", /‹връзката · the link›/.test(text));
  await preview.locator("[data-invite-send]").click();
  let said = "";
  for (let i = 0; i < 30 && !/Supabase|пощата на портала|portal's own mail/.test(said); i++) { await page.waitForTimeout(300); said = await page.locator("main").innerText(); }
  t("…and «Изпрати» here, with no mail set up, sends nothing and says why", /Supabase is not configured|пощата на портала|portal's own mail/.test(said));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-send-control: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
