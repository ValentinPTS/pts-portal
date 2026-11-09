// The §4.2 check for plan part 0.1, run against a LOCAL dev server (in-memory store,
// no real database — .env.development.local blanks the Supabase settings).
//   BASE=http://localhost:3000 node scripts/verify-names.mjs
// As manager it adds one participant with a name that occurs nowhere else, then
// opens every page that shows participants as each role that works by CODE in this
// scheme — the role model's (part 2.4: the statistics and the technical expert, the
// quality manager, the authorised reviewer (2.5), the head without a role from the
// Order) and the auditor
// (development personas, /dev/persona) — and fails if the name or the lab's e-mail
// appears, if the add form is offered, or if the applications page opens. Then the
// two who see names here (the scheme manager, the coding expert) see it, and a
// scheme manager of ANOTHER scheme gets nothing of this one (Реш. 93, 114; D5, D18).
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = process.env.SCHEME ?? "26-01-T-1";
const NAME = `Проверка Имена ${Date.now().toString(36)} ООД`;
const MAIL = `names-${Date.now().toString(36)}@example.test`;
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

try {
  // 1. manager adds a participant
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/participants`);
  // the add form is the last form with a labName field (edit forms sit in the table above)
  const add = page.locator('form:has(input[name="labName"])').last();
  await add.locator('input[name="labName"]').fill(NAME);
  await add.locator('input[name="email"]').fill(MAIL);
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${NAME}`);
  const code = (await page.locator("tr", { hasText: NAME }).locator("td").first().innerText()).trim();
  t("manager sees the new participant", !!code, code);

  const pages = [
    `/schemes/${S}/participants`,
    `/schemes/${S}/participants/${encodeURIComponent(code)}`,
    `/schemes/${S}/results`,
    `/schemes/${S}/traceability`,
    `/schemes/${S}/doc/certificate`,
    `/schemes/${S}`,
    `/schemes/${S}/audit-pack?names=1`,
    `/activity`,
    `/activity?scheme=${S}`,
    // the editor ships its insertable fields (incl. «Participants (codes)») in the page
    `/schemes/${S}/build/report`,
    `/schemes/${S}/build/registered`,
  ];

  const mgr = await html(`/schemes/${S}/results`);
  t("manager: results show the lab column", mgr.text.includes(NAME));
  // part 0.2: F 7.2.1-6 is the name↔code mapping — a manager opens it, with names
  const six = await html(`/schemes/${S}/doc/results-coded/print?lang=bg`);
  t("manager: F 7.2.1-6 opens with the name", six.status === 200 && six.text.includes(NAME) && six.text.includes("F 7.2.1-6"));
  const fiveM = await html(`/schemes/${S}/doc/registered-coded/print?lang=bg`);
  t("manager: F 7.2.1-5 has no name", fiveM.status === 200 && !fiveM.text.includes(NAME) && fiveM.text.includes("F 7.2.1-5"));

  // 2. who works by code here: no name, no e-mail, no add form, no applications page
  const persona = (role) => go(role === "auditor" ? "/dev/persona?role=auditor" : `/dev/persona?model=${encodeURIComponent(role)}`);
  for (const role of ["auditor", `statistics_expert@${S}`, `technical_expert@${S}`, `reviewer@${S}`, "quality", "head"]) {
    await persona(role);
    for (const p of pages) {
      const r = await html(p);
      t(`${role}: ${p} has no name`, !r.text.includes(NAME), `status ${r.status}`);
      t(`${role}: ${p} has no lab e-mail`, !r.text.includes(MAIL));
    }
    const part = await html(`/schemes/${S}/participants`);
    t(`${role}: no add-participant form`, !part.text.includes('name="labName"'));
    const sch = await html(`/schemes/${S}`);
    t(`${role}: no Applications menu entry`, !sch.text.includes(`/schemes/${S}/applications`));
    // A streamed page refuses with an in-page redirect (meta refresh + NEXT_REDIRECT)
    // rather than an HTTP 307; either way none of the page's content may be sent.
    // part 0.2: F 7.2.1-6 refused everywhere, F 7.2.1-5 readable and name-free
    for (const p of [`/schemes/${S}/doc/results-coded/print?lang=bg`, `/schemes/${S}/build/results-coded/print?lang=bg`, `/schemes/${S}/fill/results-coded?lang=bg`]) {
      const r = await html(p);
      t(`${role}: ${p} refused (403)`, r.status === 403 && !r.text.includes(NAME), `status ${r.status}`);
    }
    for (const p of [`/schemes/${S}/doc/results-coded`, `/schemes/${S}/build/results-coded`, `/schemes/${S}/build/results-coded/history`]) {
      const r = await html(p);
      const refused = r.url.includes("denied") || r.text.includes("NEXT_REDIRECT;replace;/login?denied=1");
      t(`${role}: ${p} refused`, refused && !r.text.includes(NAME), r.url);
    }
    // an invented key (the old template key) is simply not a document
    const bogus = await html(`/schemes/${S}/build/results-coded@2`);
    t(`${role}: invented document key is not found`, bogus.text.includes("NEXT_HTTP_ERROR_FALLBACK;404") || bogus.status === 404, `status ${bogus.status}`);
    const fill5 = await html(`/schemes/${S}/fill/registered-coded?lang=bg`);
    t(`${role}: fill view of F 7.2.1-5 has no name`, fill5.status === 200 && !fill5.text.includes(NAME), `status ${fill5.status}`);
    const pdf = await page.request.post(BASE + "/api/pdf", { data: { id: S, doc: "results-coded", lang: "bg" }, timeout: 90000 });
    t(`${role}: PDF of F 7.2.1-6 refused`, pdf.status() === 403, `status ${pdf.status()}`);
    const five = await html(`/schemes/${S}/doc/registered-coded/print?lang=bg`);
    t(`${role}: F 7.2.1-5 opens without names`, five.status === 200 && !five.text.includes(NAME) && five.text.includes("F 7.2.1-5"));
    t(`${role}: scheme page does not list F 7.2.1-6`, !sch.text.includes(`/doc/results-coded`) && !sch.text.includes(`/build/results-coded`));

    const apps = await html(`/schemes/${S}/applications`);
    const refused = (apps.url.includes("/login") && apps.url.includes("denied")) || apps.text.includes("NEXT_REDIRECT;replace;/login?denied=1");
    t(`${role}: applications page refused`, refused, apps.url);
    t(`${role}: applications page sends no applicant data`, !apps.text.includes("ЕИК / VAT"));
  }

  // 3. who sees names HERE — the scheme manager and the coding expert of this scheme
  for (const role of [`scheme_manager@${S}`, `coding_expert@${S}`]) {
    await persona(role);
    const r = await html(`/schemes/${S}/results`);
    t(`${role}: sees who is behind the code`, r.status === 200 && r.text.includes(NAME));
    const m = await html(`/schemes/${S}/doc/results-coded/print?lang=bg`);
    t(`${role}: F 7.2.1-6 opens with the name`, m.status === 200 && m.text.includes(NAME));
  }

  // 4. a scheme manager of ANOTHER scheme: nothing of this one
  await persona("scheme_manager@25-06-C-1");
  for (const p of [...pages.filter((x) => x.startsWith(`/schemes/${S}`)), `/schemes/${S}/doc/results-coded/print?lang=bg`]) {
    const r = await html(p);
    const refused = r.status === 403 || r.url.includes("denied") || r.text.includes("NEXT_REDIRECT;replace;/login?denied=1");
    t(`another scheme's manager: ${p} refused, no name`, refused && !r.text.includes(NAME), `status ${r.status} ${r.url}`);
  }
} finally {
  await go("/dev/persona").catch(() => {});
  await browser.close();
}

console.log(`verify-names: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
