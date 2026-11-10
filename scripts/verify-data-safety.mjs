// Plan part 0.9 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-data-safety.mjs
// A manual case-file step is voided with a reason (kept, struck through), and a
// scheme is archived (gone from view, answering like a missing one). Restart the
// dev server to get the archived demo scheme back — it lives in memory only.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = "26-01-T-1";       // a participant and a case step are added here
const ARCH = "25-06-C-1";    // this demo scheme is archived
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
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  return { status: r.status(), text: await r.text() };
};

try {
  await go("/dev/persona?role=manager");
  // a participant to work on
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"])').last();
  const NAME = `Data safety ${Date.now()}`;
  await add.locator('input[name="labName"]').fill(NAME);
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${NAME}`);
  const code = (await page.locator("tr", { hasText: NAME }).locator("td").first().innerText()).trim();
  t("a participant to work on (a code, or since 5.3 its provisional reference)", /^(\d{6,}|Z\d{3})$/.test(code), code);

  // a manual step, then void it
  await go(`/schemes/${S}/participants/${code}`);
  const REF = `WAYBILL-${Date.now().toString(36)}`;
  const addStep = page.locator('form:has(input[name="ref"])');
  // a step that moves the status — since 5.6 a testing scheme's dispatch goes through «Доставки»,
  // so the receipt, recorded by PTS on the laboratory's behalf
  await addStep.locator('select[name="kind"]').selectOption("receipt_confirmed"); // moves the status
  await addStep.locator('input[name="ref"]').fill(REF);
  await addStep.locator('button[type="submit"]').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(`text=${REF}`);
  t("the step is recorded", true);
  await go(`/schemes/${S}/participants`);
  t("the step moved the status to received", /получен|received/i.test(await page.locator("tr", { hasText: NAME }).first().innerText()));
  await go(`/schemes/${S}/participants/${code}`);
  const voidForm = page.locator('form:has(input[name="reason"]):not([data-unlock-form])').first(); // 6.4: the unlock form asks a reason too
  await voidForm.locator('input[name="reason"]').fill("recorded on the wrong participant");
  await voidForm.locator('button[type="submit"]').click();
  await page.waitForLoadState("domcontentloaded");
  const caseHtml = (await get(`/schemes/${S}/participants/${code}`)).text;
  t("voided step is KEPT in the case file", caseHtml.includes(REF));
  t("…marked voided, with its reason", caseHtml.includes("recorded on the wrong participant") && /анулирано|voided/.test(caseHtml));
  // the receipt step was the only thing that moved the status — it comes back down
  await go(`/schemes/${S}/participants`);
  const rowText = await page.locator("tr", { hasText: NAME }).first().innerText();
  t("voiding the step brings the status back", /одобрен|approved/i.test(rowText) && !/получен|received/i.test(rowText), rowText.replace(/\s+/g, " "));
  await go(`/schemes/${S}/participants/${code}`); // the page as it is now
  t("…and no void form is offered for it again", (await page.locator(`tr:has-text("${REF}") input[name="reason"]`).count()) === 0);

  // archive a scheme instead of deleting it
  await go(`/schemes/${ARCH}`);
  await page.getByRole("button", { name: /Управление|Manage/ }).first().click().catch(() => {});
  await page.getByRole("button", { name: /Архивирай схемата|Archive scheme/ }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith(`/schemes/${ARCH}`), { timeout: 90000 }).catch(() => {});
  const gone = await get(`/schemes/${ARCH}`);
  t("archived: the scheme answers like a missing one", gone.text.includes("NEXT_HTTP_ERROR_FALLBACK;404") || gone.status === 404);
  const act = await get(`/activity?scheme=${ARCH}`);
  t("archived: the journal says so", /Схема архивирана|Scheme archived/.test(act.text));
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}

console.log(`verify-data-safety: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
