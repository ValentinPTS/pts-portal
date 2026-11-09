// Plan part 1.3 check. Two runs, as verify-testenv.mjs:
//   TEST environment (PTS_ENVIRONMENT=test, the «portal-dev-test» launch on :3001):
//     BASE=http://localhost:3001 EXPECT=test node scripts/verify-clock.mjs
//   the real portal:  BASE=http://localhost:3000 EXPECT=production node scripts/verify-clock.mjs
// In the test environment a round's clock moves to any date and back, and the
// journal records it on the real time; the real portal has no clock to move.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3001";
const TEST = (process.env.EXPECT ?? "test") === "test";
const S = "26-01-T-1";
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
  await go(`/schemes/${S}`);
  const panel = page.locator("[data-test-clock]");
  if (!TEST) {
    await page.waitForTimeout(1500);
    t("the real portal: no round clock to move", (await panel.count()) === 0);
  } else {
    await panel.waitFor();
    t("the test environment: the round's clock is on the scheme page", (await panel.count()) === 1);
    // move it to the day before a deadline, in the past of nobody's calendar
    const input = panel.locator('input[name="clockAt"]');
    for (let i = 0; i < 20; i++) { await input.fill("2027-03-14T10:00"); if ((await input.inputValue()) === "2027-03-14T10:00") break; await page.waitForTimeout(500); }
    await panel.getByRole("button", { name: /Премести часовника|Move the clock/ }).click();
    await panel.locator('[role="status"]').waitFor();
    await go(`/schemes/${S}`);
    const now = await page.locator("[data-clock-now]").innerText();
    t("…moved: «now» for the round is 14.03.2027", /14\.03\.2027 10:0\d/.test(now) && /преместен|moved/.test(now), now);
    const act = await (await page.request.get(`${BASE}/activity`)).text();
    t("the journal records the move", /Test clock moved to 2027-03-14T10:00/.test(act));
    // the reminder job, by hand (the daily cron runs on the real portal only)
    await page.locator("[data-test-clock]").getByRole("button", { name: /Пусни напомнянията сега|Run the reminders now/ }).click();
    const said = page.locator("[data-test-clock] [role=\"status\"]");
    await said.waitFor();
    for (let i = 0; i < 20 && !/Напомняния|Reminders/.test(await said.innerText()); i++) await page.waitForTimeout(300);
    t("the reminders run by hand and say how many", /(Напомняния|Reminders): \d+/.test(await said.innerText()), await said.innerText());
    // a year typed wrong is refused
    const inp = page.locator('[data-test-clock] input[name="clockAt"]');
    await inp.fill("2207-03-14T10:00");
    await page.locator("[data-test-clock]").getByRole("button", { name: /Премести часовника|Move the clock/ }).click();
    for (let i = 0; i < 20 && !/5 години|5 years/.test(await said.innerText().catch(() => "")); i++) await page.waitForTimeout(300);
    t("a year typed wrong (2207) is refused", /5 години|5 years/.test(await said.innerText()));
    // and back
    await page.locator("[data-test-clock]").getByRole("button", { name: /Върни истинското време|Back to the real time/ }).click();
    await page.locator("[data-test-clock] [role=\"status\"]").waitFor();
    await go(`/schemes/${S}`);
    const back = await page.locator("[data-clock-now]").innerText();
    t("…and back to the real time", !/преместен|moved/.test(back) && !/2027/.test(back), back);
  }
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-clock (${TEST ? "test" : "production"}): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
