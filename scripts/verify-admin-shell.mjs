// Plan part 2.7 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-admin-shell.mjs
// The administrative panel: each role's rail has exactly its sections (as
// scripts/admin-nav.test.ts writes them out), every one of them opens, a section not
// on one's rail is refused at its address, the panel is not on the laboratory's or
// the public pages, and the folder tree lists only the schemes one works in.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const T = process.env.SCHEME ?? "26-01-T-1";
const C = process.env.OTHER ?? "25-06-C-1";
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
// refused = sent to the sign-in's refusal (a redirect, or a streamed page's in-page
// one), or 401/403 — never a page that merely crashed
const refused = (r) => r.url.includes("denied") || /NEXT_REDIRECT[^"]*login\?denied=1|login\?denied=1/.test(r.text) || r.status === 401 || r.status === 403;
const rail = async () => { await go("/dashboard"); await page.locator("[data-admin-rail]").waitFor(); return page.locator("[data-admin-rail] [data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")).join(" ")); };

// «Почивни дни» joined «Още» in part 3.4
const MORE = "library skins changes holidays";
const ALL = ["dashboard", "schemes", "organizations", "batches", "deliveries", "invoices", "journal", "people", "notices", "library", "skins", "changes", "holidays", "system"];
const HREF = { dashboard: "/dashboard", schemes: "/", organizations: "/organizations", batches: "/batches", deliveries: "/deliveries", invoices: "/invoices", journal: "/activity", people: "/users", notices: "/notices", library: "/items", skins: "/skins", changes: "/changes", holidays: "/holidays", system: "/system" };
const PERSONAS = [
  ["role=manager", `dashboard schemes organizations batches deliveries invoices journal people notices ${MORE} system`], // login off: the build
  ["model=head", `dashboard schemes journal people notices ${MORE} system`],
  ["model=quality", `dashboard schemes journal notices ${MORE}`],
  ["model=software_admin", `dashboard journal notices ${MORE} system`],
  [`model=scheme_manager@${T}`, `dashboard schemes organizations batches deliveries invoices journal people notices ${MORE}`],
  [`model=statistics_expert@${T}`, `dashboard schemes ${MORE}`],
  [`model=technical_expert@${T}`, `dashboard schemes batches ${MORE}`],
  [`model=coding_expert@${T}`, `dashboard schemes organizations deliveries invoices people ${MORE}`],
  [`model=reviewer@${T}`, `dashboard schemes journal notices ${MORE}`],
  ["role=auditor", `dashboard schemes journal notices ${MORE}`],
  ["role=staff", `dashboard ${MORE}`], // one of PTS with no role yet
];

try {
  for (const [persona, want] of PERSONAS) {
    await go(`/dev/persona?${persona}`);
    const got = await rail();
    t(`${persona}: the rail has exactly its sections`, got === want, got);
    for (const key of want.split(" ")) {
      const r = await html(HREF[key]);
      t(`${persona}: «${key}» opens`, r.status === 200 && !refused(r), `status ${r.status} ${r.url}`);
    }
    for (const key of ALL.filter((k) => !want.split(" ").includes(k) && k !== "schemes")) {
      t(`${persona}: «${key}» refused at its address`, refused(await html(HREF[key])));
    }
    if (!want.split(" ").includes("schemes")) {
      const home = await html("/");
      t(`${persona}: «Схеми» with nothing to show goes to the dashboard`, /\/dashboard$/.test(new URL(home.url).pathname) || /NEXT_REDIRECT[^"]*\/dashboard/.test(home.text), home.url);
    }
  }

  // the planned sections say what they will be and where the work is done meanwhile
  await go("/dev/persona?role=manager");
  // («Обекти и партиди» is built since part 3.5)
  for (const [key, part] of [["deliveries", "5.6"], ["invoices", "5.8"]]) {
    await go(HREF[key]);
    const text = await page.locator(`[data-planned-section="${key}"]`).innerText();
    t(`«${key}» says which part builds it, and links to where it is done now`, text.includes(part) && (await page.locator(`[data-planned-section="${key}"] a`).count()) === 1);
  }
  await go("/dashboard");
  // another check may have archived a scheme: at least the one this check uses
  t("the dashboard lists the live schemes and the sections", (await page.locator(`[data-dashboard-schemes] a[href="/schemes/${T}"]`).count()) === 1 && (await page.locator("[data-dashboard-sections] a").count()) === 13); // + «Почивни дни» (3.4)
  await go(`/schemes/${T}`);
  t("on a scheme, «Схеми» is the section lit", (await page.locator('[data-admin-rail] [data-section="schemes"][aria-current="page"]').count()) === 1);

  // no panel on the laboratory's or the public pages
  for (const path of ["/lab/login", "/login", "/register", `/apply/${T}`]) {
    const r = await html(path);
    t(`${path}: no administrative panel`, !r.text.includes("data-admin-rail"), `status ${r.status}`);
  }

  // signed out (login off, no persona would be the build): a laboratory's password reset
  // is not PTS — a laboratory persona there gets no panel
  await go(`/dev/persona?role=lab`);
  t("a laboratory on /auth/forgot: no administrative panel", !(await html("/auth/forgot?area=lab")).text.includes("data-admin-rail"));
  await go("/dev/persona?role=manager");

  // the rail stays in view while a long page scrolls
  await go(`/schemes/${T}`);
  await page.locator("[data-processing]").waitFor(); // a streamed page: its documents first
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const stuck = await page.evaluate(() => ({ y: window.scrollY, top: document.querySelector("[data-admin-rail]").getBoundingClientRect().top }));
  t("scrolled down a long page, the rail is still at the top of the screen", stuck.y > 200 && Math.abs(stuck.top) <= 40, JSON.stringify(stuck));
  // the editor: the rail is a bar along the top, and the A4 sheet has its width
  // (the editor: an A4 sheet, 794px, beside its 330px panel — about 1210px with the gaps)
  await page.setViewportSize({ width: 1280, height: 800 });
  await go(`/schemes/${T}/build/report`);
  await page.locator("main#content").waitFor();
  const bar = await page.evaluate(() => ({ dir: getComputedStyle(document.querySelector("[data-admin-rail]")).flexDirection, content: document.querySelector("main#content").clientWidth }));
  t("on the editor the rail is a bar, and the page keeps the width the sheet and its panel need", bar.dir === "row" && bar.content >= 1210, JSON.stringify(bar));
  // keyboard: before the rail, a stop that skips to the content (in development the
  // persona strip's links come first — they are not on the site)
  await go("/dashboard");
  let skip = false;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => ({ href: document.activeElement?.getAttribute("href"), rail: !!document.activeElement?.closest("[data-admin-rail]") }));
    if (at.rail) break;
    if (at.href === "#content") { skip = true; break; }
  }
  t("Tab reaches «Към съдържанието» before the rail", skip);

  // the folder tree beside the lists: only one's own schemes (2.4)
  await go(`/schemes/${T}`);
  await page.locator('main a[href^="/files/"]').first().waitFor();
  const folders = await page.locator('main a[href^="/files/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  // the folder that HOLDS the scheme — other checks may have left folders of their own
  let deepest = null;
  for (const h of [...folders.filter((x) => x.includes("/f/")).reverse(), ...folders.filter((x) => /^\/files\/[^/]+$/.test(x))]) {
    if ((await (await page.request.get(BASE + h)).text()).includes(`href="/schemes/${T}"`)) { deepest = h; break; }
  }
  await go(`/dev/persona?model=statistics_expert@${C}`);
  const tree = await html(deepest);
  t(`a statistics expert of ${C} opening ${T}'s folder sees no link to ${T}`, tree.status === 200 && !tree.text.includes(`href="/schemes/${T}"`), `${deepest} status ${tree.status}`);
  await go(`/dev/persona?model=statistics_expert@${T}`);
  t(`…while its own statistics expert does`, (await html(deepest)).text.includes(`href="/schemes/${T}"`));

  // a narrow screen: the rail becomes a bar, the page does not scroll sideways
  await go("/dev/persona?role=manager");
  await page.setViewportSize({ width: 375, height: 800 });
  await go("/dashboard");
  t("on a phone the page does not scroll sideways", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.setViewportSize({ width: 1280, height: 800 });
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-admin-shell: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
