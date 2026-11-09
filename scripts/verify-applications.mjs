// Plan part 0.4 check, against a LOCAL dev server (in-memory store):
//   BASE=http://localhost:3000 node scripts/verify-applications.mjs
// Online applications are closed in the transition (Реш. 1): the public pages show
// the PDF route and never the application form; the staff applications page says so.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = process.env.SCHEME ?? "26-01-T-1"; // an Open demo scheme
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 90000 });
  return { status: r.status(), text: await r.text() };
};

try {
  const land = await get("/apply");
  t("landing: says applications go by the PDF form", land.text.includes("формуляра за заявка (PDF)") || land.text.includes("PDF application form"));
  t("landing: links to ptsbg.eu", land.text.includes("https://ptsbg.eu"));
  t("landing: no «apply» call to action", !land.text.includes("Заяви участие →") && !land.text.includes("Apply →"));

  const one = await get(`/apply/${S}`);
  t("scheme page: renders the scheme", one.status === 200 && one.text.includes("26/01-T-1"));
  t("scheme page: no application form", !one.text.includes('name="labName"') && !one.text.includes('name="schemeId"'));
  t("scheme page: the PDF route", one.text.includes("https://ptsbg.eu"));

  await page.goto(BASE + "/dev/persona?role=manager", { waitUntil: "domcontentloaded" });
  const apps = await get(`/schemes/${S}/applications`);
  t("applications page: says online applications are off", apps.text.includes("Онлайн заявките са изключени") || apps.text.includes("Online applications are switched off"));
  t("applications page: no link to the public form", !apps.text.includes(`href="/apply/${S}"`));
  const edit = await get(`/schemes/${S}/edit`);
  t("editor: no copy-the-apply-link box", !edit.text.includes("Копирай линка") && !edit.text.includes("Copy link"));
} finally {
  await page.goto(BASE + "/dev/persona").catch(() => {});
  await browser.close();
}

console.log(`verify-applications: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
