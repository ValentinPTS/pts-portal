// Реш. 147 check for plan part 0.3, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-unstarted.mjs
// Turns the demo scheme into a draft through the editor, checks that the public
// apply page and list answer as if it did not exist, then turns it back to Open.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = process.env.SCHEME ?? "26-01-T-1";
const NUM = "26/01-T-1";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  return { status: r.status(), text: await r.text() };
};
const setStatus = async (label, value) => {
  await go(`/schemes/${S}/edit`);
  // the status buttons only work once the editor has hydrated — click until the
  // hidden field shows the new value (a cold dev compile can take a while)
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: label, exact: false }).first().click();
    const v = await page.locator('input[name="status"]').inputValue().catch(() => "");
    if (v === value) break;
    await page.waitForTimeout(1000);
  }
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 90000 }).catch(() => {}),
    page.locator('button[type="submit"].btn-primary').first().click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
};

try {
  await go("/dev/persona?role=manager");
  // A streamed page answers notFound() inside the stream (status 200, the 404
  // fallback marker) — so "like a missing one" is checked by comparing the two.
  const NF = "NEXT_HTTP_ERROR_FALLBACK;404";
  const missing = await get(`/apply/NO-SUCH-SCHEME`);
  t("a missing scheme renders not-found", missing.text.includes(NF));

  await setStatus(/Чернова|Draft/, "draft");
  const draft = await get(`/apply/${S}`);
  t("draft: /apply/<id> answers exactly like a missing one", draft.status === missing.status && draft.text.includes(NF), `status ${draft.status}`);
  t("draft: no number on that page", !draft.text.includes(NUM));
  const list = await get(`/apply`);
  t("draft: not in the public list", !list.text.includes(NUM));
  const edit = await get(`/schemes/${S}/edit`);
  t("draft: no «announce to labs» option", !edit.text.includes("Обяви на лабораториите") && !edit.text.includes("Announce to labs"));
} finally {
  await setStatus(/Отворена|Open/, "open").catch((e) => console.error("could not restore status:", e.message));
  const back = await get(`/apply/${S}`);
  t("restored to Open: /apply/<id> renders the scheme", back.status === 200 && back.text.includes(NUM), `status ${back.status}`);
  await go("/dev/persona").catch(() => {});
  await browser.close();
}

console.log(`verify-unstarted: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
