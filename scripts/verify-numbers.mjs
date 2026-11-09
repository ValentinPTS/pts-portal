// Plan parts 0.14 and 3.1 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-numbers.mjs
// Scheme numbers: the dialog suggests PTS YY/MM-X-N for THIS month (Bulgarian
// time), N counting within the month and the activity; Cyrillic Т/С and Latin T/C
// are one number — a Cyrillic copy of an existing number is refused on create and
// on edit (the edit keeps the rest of the form); a Cyrillic number keeps its
// activity letter in the scheme's address.
// 3.1: the dialog composes PTS|ILC YY/MM[-NA]-T|S|C-N from the kind, the activity
// and NA; the scheme keeps them as fields and shows them; a number the portal cannot
// read, or a C number in testing, is refused; an archive number of an old form is
// accepted as written, and what it does not state PTS chooses on the edit page.
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
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });

// today in Bulgaria, as the server counts it
const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit" }).formatToParts(new Date());
const yy = parts.find((p) => p.type === "year").value.slice(2), mm = parts.find((p) => p.type === "month").value;

const openDialog = async (slug) => {
  await go(`/files/${slug}`);
  const open = page.getByRole("button", { name: /Нова схема|New scheme/ }).first();
  const dialog = page.locator('form:has(select[name="sample"])');
  // retried until the page has hydrated — an early click does nothing
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await open.click(); await page.waitForTimeout(500); }
  return dialog;
};
const create = async (slug, number, name) => {
  const dialog = await openDialog(slug);
  await dialog.locator('input[name="number"]').fill(number);
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByRole("button", { name: /Създай проект|Create project/ }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForURL((u) => /\/schemes\/[^/]+$/.test(u.pathname) || ["dupNumber", "badNumber", "numberActivity"].some((k) => u.searchParams.has(k)));
};
const markers = async () => Object.fromEntries(await Promise.all(["kind", "activity", "accredited"].map(async (k) =>
  [k, (await page.locator(`[data-scheme-markers] [data-marker="${k}"]`).innerText()).trim()])));

try {
  await go("/dev/persona?role=manager");

  // the suggestion: this month, the next in the month for the activity
  const dialog = await openDialog("testing");
  const suggested = await dialog.locator('input[name="number"]').inputValue();
  t(`the dialog suggests PTS ${yy}/${mm}-T-N for this month`, new RegExp(`^PTS ${yy}/${mm}-T-\\d+$`).test(suggested), suggested);

  // a Cyrillic copy of the demo's number is the same number → refused
  await create("testing", "PTS 26/01-Т-1", "Cyrillic duplicate"); // Cyrillic Т
  t("create: «PTS 26/01-Т-1» (Cyrillic) is refused next to «PTS 26/01-T-1»", page.url().includes("dupNumber="), page.url());
  t("…with the «already exists» message", await page.getByText(/Вече съществува схема с този номер|already exists/).first().isVisible());

  // a new Cyrillic number keeps its letter in the address
  // wide enough that runs on the same server never meet (a taken number is refused)
  const seq = 1000 + (Date.now() % 8000);
  await create("testing", `PTS ${yy}/${mm}-Т-${seq}`, "Cyrillic number");
  const id = page.url().split("/schemes/")[1];
  t("a Cyrillic «Т» number gets the id …-T-N, letter kept", id === `${yy}-${mm}-T-${seq}`, id);

  // the next suggestion counts the Cyrillic one too
  const again = await (await openDialog("testing")).locator('input[name="number"]').inputValue();
  // earlier runs may have left higher numbers in memory: the next is above ours
  const nextSeq = parseInt(again.split("-").pop(), 10);
  t("the next suggestion counts past the Cyrillic number", again.startsWith(`PTS ${yy}/${mm}-T-`) && nextSeq > seq, again);

  // edit: a taken number is not saved, the rest of the form is
  await go(`/schemes/${id}/edit`);
  const form = page.locator('form:has(input[name="titleEn"])').first();
  await form.locator('input[name="number"]').fill("PTS 26/01-Т-1");
  const title = `Kept title ${Date.now()}`;
  await form.locator('input[name="titleEn"]').fill(title);
  await form.locator('button[type="submit"]').first().click();
  await page.waitForURL(/err=dupNumber/);
  t("edit: the taken number is reported", await page.getByText(/Номерът не е сменен|The number was not changed/).first().isVisible());
  const kept = await page.locator('input[name="number"]').inputValue();
  t("…the number stays as it was", kept === `PTS ${yy}/${mm}-Т-${seq}`, kept);
  t("…and the other change is saved", (await page.locator('input[name="titleEn"]').inputValue()) === title);

  // ── 3.1: the dialog composes the number from the kind, the activity and NA ──
  const d = await openDialog("testing");
  await d.locator('select[name="kind"]').selectOption("ILC");
  const ilc = await d.locator('input[name="number"]').inputValue();
  t("ILC composes «ILC YY/MM-NA-T-N», NA ticked by default", new RegExp(`^ILC ${yy}/${mm}-NA-T-\\d+$`).test(ilc) && (await d.locator('input[name="na"]').isChecked()), ilc);
  await d.locator('select[name="activity"]').selectOption("S");
  const ilcS = await d.locator('input[name="number"]').inputValue();
  t("…sampling makes it «-NA-S-N»", new RegExp(`^ILC ${yy}/${mm}-NA-S-\\d+$`).test(ilcS), ilcS);
  await d.locator('input[name="na"]').uncheck();
  const ilcNoNa = await d.locator('input[name="number"]').inputValue();
  t("…NA unticked drops «-NA»", new RegExp(`^ILC ${yy}/${mm}-S-\\d+$`).test(ilcNoNa), ilcNoNa);
  await d.locator('select[name="kind"]').selectOption("PTS");
  t("…PTS again: «PTS YY/MM-S-N», NA off", new RegExp(`^PTS ${yy}/${mm}-S-\\d+$`).test(await d.locator('input[name="number"]').inputValue()) && !(await d.locator('input[name="na"]').isChecked()));
  const cal = await openDialog("calibration");
  t("calibration offers no other activity than C", (await cal.locator('select[name="activity"]').count()) === 0
    && new RegExp(`^PTS ${yy}/${mm}-C-\\d+$`).test(await cal.locator('input[name="number"]').inputValue()));

  // an ILC created from the dialog keeps its markers as fields
  const d2 = await openDialog("testing");
  await d2.locator('select[name="kind"]').selectOption("ILC");
  const ilcSeq = 10000 + (Date.now() % 80000);
  const ilcNo = `ILC ${yy}/${mm}-NA-T-${ilcSeq}`;
  await d2.locator('input[name="number"]').fill(ilcNo);
  await d2.locator('input[name="name"]').fill("ILC check");
  await d2.getByRole("button", { name: /Създай проект|Create project/ }).click();
  await page.waitForURL(/\/schemes\/[^/]+$/);
  const ilcId = page.url().split("/schemes/")[1];
  t("an ILC keeps its prefix in the address", ilcId === `ILC-${yy}-${mm}-NA-T-${ilcSeq}`, ilcId);
  const m1 = await markers();
  t("the scheme page shows ILC · testing · NA", /ILC/.test(m1.kind) && /\(T\)/.test(m1.activity) && /NA/.test(m1.accredited), JSON.stringify(m1));

  // a number the portal cannot read is refused, with the form it expects
  await create("testing", `Проба ${Date.now()}`, "Free text number");
  t("create: a free-text number is refused", page.url().includes("badNumber="), page.url());
  t("…with the expected form named", await page.locator("[data-number-refused]").filter({ hasText: /PTS\|ILC/ }).first().isVisible());
  await create("testing", `PTS ${yy}/${mm}-C-${ilcSeq}`, "C in testing");
  t("create: a C number in the testing folder is refused", page.url().includes("numberActivity="), page.url());

  // an archive number of an old form is accepted as written
  const oldNo = `PTS 19/07-${10000 + (Date.now() % 80000)}`;
  await create("testing", oldNo, "Archive scheme");
  const oldId = page.url().split("/schemes/")[1];
  t("an old form «PTS YY/MM-N» is accepted", /\/schemes\/19-07-\d+$/.test(page.url()), page.url());
  const m2 = await markers();
  t("…its kind and accreditation are not stated", /не е посочено|not stated/.test(m2.kind) && /не е посочено|not stated/.test(m2.accredited), JSON.stringify(m2));
  // PTS chooses on the edit page what the number does not state
  await go(`/schemes/${oldId}/edit`);
  const ef = page.locator('form:has(input[name="titleEn"])').first();
  t("the edit page offers the three as choices for an old form", (await ef.locator('[data-marker][data-stated="chosen"]').count()) === 3);
  await ef.locator('select[name="kind"]').selectOption("ILC");
  await ef.locator('select[name="activity"]').selectOption("S");
  await ef.locator('select[name="accredited"]').selectOption("NA");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/edit")), ef.locator('button[type="submit"]').first().click()]);
  const m3 = await markers();
  t("…and keeps what PTS chose", /ILC/.test(m3.kind) && /\(S\)/.test(m3.activity) && /NA/.test(m3.accredited), JSON.stringify(m3));
  t("…the number stays as written", (await page.getByText(oldNo).count()) > 0);
  // a current number states them: shown as the number's, not as choices
  await go(`/schemes/${oldId}/edit`);
  const ef2 = page.locator('form:has(input[name="titleEn"])').first();
  await ef2.locator('input[name="number"]').fill(`PTS ${yy}/${mm}-T-${ilcSeq + 1}`);
  t("typing today's form turns the choices into the number's", (await ef2.locator('[data-marker][data-stated="number"]').count()) === 3);
  // an unreadable number is not saved; the rest is
  await ef2.locator('input[name="number"]').fill("PTS 26/13-T-1");
  const title2 = `Kept ${Date.now()}`;
  await ef2.locator('input[name="titleEn"]').fill(title2);
  await ef2.locator('button[type="submit"]').first().click();
  await page.waitForURL(/err=badNumber/);
  t("edit: «PTS 26/13-T-1» (month 13) is refused", await page.locator("[data-number-refused]").first().isVisible());
  t("…the number stays and the other change is saved", (await page.locator('input[name="number"]').inputValue()) === oldNo && (await page.locator('input[name="titleEn"]').inputValue()) === title2);
  // the change of markers is on record
  await go(`/activity?scheme=${oldId}`);
  // (the filter's <option> carries the same label — the entry's badge is a span)
  t("the journal records the markers' change", await page.locator("span").filter({ hasText: /^(Променен номер, вид, дейност или акредитация на схемата|Scheme number, kind, activity or accreditation changed)$/ }).first().isVisible());
  t("…with the new markers", await page.getByText(/ILC · S · NA/).first().isVisible());
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-numbers: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
