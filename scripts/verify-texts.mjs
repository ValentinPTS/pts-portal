// Plan part 0.11 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-texts.mjs
// The texts PTS decided reach the pages and the print routes: the certificate
// without a form number, the Order heading, the payment and risk-in-transit
// sentences in both Invitations, the registration form that no longer asks for
// accreditation as a condition. The wording itself is pinned by texts.test.ts.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const T = "26-01-T-1", C = "25-06-C-1"; // the demo schemes
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
// every page must load: a negative check on an error page would prove nothing
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  if (r.status() !== 200) throw new Error(`${path} → HTTP ${r.status()}`);
  return r.text();
};
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

try {
  await go("/dev/persona?role=manager");

  // Q23 — the certificate
  for (const id of [T, C]) {
    const cert = await get(`/schemes/${id}/doc/certificate/print?lang=bg`);
    t(`${id}: the printed certificate has no «proposed»`, !cert.includes("proposed"));
    t(`${id}: its footer reads revision · date`, /<div class="docfooter">[^<·]+ · [^<·]+<\/div>/.test(cert), cert.match(/<div class="docfooter">[^<]*<\/div>/)?.[0]);
  }
  const schemePage = await get(`/schemes/${T}`);
  t("the documents list says «no form number» for the certificate", /без номер на формуляр|no form number/.test(schemePage));
  t("…and nowhere «предложен / proposed»", !/предложен|>proposed</.test(schemePage));

  // Q22 — the Order
  const order = plain(await get(`/schemes/${T}/doc/order/print?lang=bg`));
  t("the Order heading reads «изпитване за пригодност»", order.includes("Планиране на изпитване за пригодност"));

  // Реш. 96 + Реш. 154 — both Invitations; E2 gone
  for (const [id, lang] of [[T, "bg"], [C, "bg"], [T, "en"], [C, "en"]]) {
    const inv = plain(await get(`/schemes/${id}/doc/invitation/print?lang=${lang}`));
    t(`${id}/${lang}: the payment sentence`, lang === "bg" ? inv.includes("Плащането не е условие за изпращане") : inv.includes("Payment is not a condition for dispatch"));
    t(`${id}/${lang}: the risk-in-transit paragraph, city blank`, lang === "bg" ? inv.includes("Обектът се предава в ____________") : inv.includes("The item is handed over in ____________"));
    t(`${id}/${lang}: no «illustrative» note`, !/илюстратив|illustrative/i.test(inv));
  }

  // D22 — Ф 7.2.2-1
  const stat = plain(await get(`/schemes/${C}/doc/stat-project/print?lang=en`));
  t("Ф 7.2.2-1 prints u_stab / (2·√3)", stat.includes("/ (2·√3)") && !stat.includes("X_REF2| / √3"));

  // Реш. 108 — the registration form
  await go("/register");
  const reg = await page.locator("form").first().innerText();
  t("registration: the accreditation fields say «if any»", /ако имате|if any/.test(reg), reg.slice(0, 300));
  const country = page.locator("form select").first();
  // a cold server hydrates late: the choice is made again until the form takes it (9.1)
  const euNote = page.getByText(/Акредитацията не е условие за регистрация|Accreditation is not a condition for registering/);
  for (let i = 0; i < 40 && !(await euNote.isVisible().catch(() => false)); i++) { await country.selectOption("BG"); await page.waitForTimeout(500); }
  await euNote.waitFor();
  t("registration (EU): accreditation is not a condition", true);
  await country.selectOption({ index: (await country.locator("option").count()) - 1 }); // «outside the EU»
  await page.getByText(/фирмена регистрация и, ако имате, сертификат за акредитация|business registration and, if you have one, your accreditation/).waitFor();
  t("registration (outside the EU): accreditation only if they have one", true);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-texts: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
