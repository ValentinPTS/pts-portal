// Plan part 8.2 check (the closed-round import), against a LOCAL dev server (in-memory store, login
// off — the local build takes a replay; the real portal never does):
//   BASE=http://localhost:3000 node scripts/verify-replay.mjs
// A synthetic coded 2.0 input file (scripts/replay-fixture.ts) loaded by the software administrator
// → a replay round with a SIM number, in processing, the submission locked, codes only; its page shows
// the re-export matching the file cell by cell (only the expected differences); a file with a
// laboratory's name in a code is refused, by its row, and the name never repeated; a scheme role
// cannot load one.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const dir = mkdtempSync(join(tmpdir(), "replay-"));
execFileSync(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", "scripts/replay-fixture.ts", dir, String(Date.now() % 100000)], { stdio: "ignore" });
const GOOD = readFileSync(join(dir, "replay-good.xlsx")), NAMED = readFileSync(join(dir, "replay-name.xlsx"));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 60) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(500); } return false; };
const load = async (buffer, name) => {
  await go("/validation");
  const box = page.locator("[data-replay-import]");
  await box.locator('input[name="file"]').setInputFiles({ name, mimeType: XLSX, buffer });
  await box.locator("[data-replay-submit]").click();
  await waitFor(async () => (await box.locator("[data-replay-done], [data-replay-problem]").count()) > 0);
  return box;
};

try {
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // ── a scheme role: no import ──
  await go("/dev/persona?model=statistics_expert@26-01-T-1");
  const r0 = await go("/validation");
  t("a scheme role: «Валидиране» refused — no import", page.url().includes("denied") || /login\?denied=1/.test(await page.content()) || r0?.status() === 403);

  // ── the software administrator loads a closed round ──
  await go("/dev/persona?model=software_admin");
  await go("/validation");
  t("the software administrator: the import form (the local build takes a replay)", (await page.locator("[data-replay-import] input[type=file]").count()) === 1);
  // a name where a code belongs: refused, by its row, the name never repeated
  const bad = await load(NAMED, "named.xlsx");
  const badText = await bad.innerText();
  t("a laboratory's name in a code: refused by its row — nothing loaded, the name not repeated back", (await bad.locator('[data-replay-problem="read"]').count()) === 1 && /Participants row 2/.test(badText) && !badText.includes("Пример ЕООД") && (await bad.locator("[data-replay-done]").count()) === 0);
  // the good file
  const ok = await load(GOOD, "replay-26-03.xlsx");
  const S = await ok.locator("[data-replay-done]").getAttribute("data-replay-done").catch(() => null);
  const number = S ? (await ok.locator("[data-replay-done] a").innerText()).trim() : "";
  t("loaded: a replay round with a SIM number (Реш. 130)", !!S && /^SIM /.test(number), `${S} ${number}`);
  await go("/validation");
  t("…listed among the replays", (await page.locator(`[data-replay-row="${S}"]`).count()) === 1);

  // ── its page: in processing, codes only, the comparison ──
  await go("/dev/persona?model=quality");
  await go(`/schemes/${S}`);
  t("…in processing, the submission locked — an act on record", /Обработка|Processing/.test(await page.locator("[data-lifecycle] [data-state]").innerText()) && /Възпроизвеждане — внесен приключил кръг/.test((await page.locator("[data-lifecycle]").textContent()) ?? "")); // the acts' history is folded
  const card = page.locator("#replay");
  t("the replay card: the original number, the counts", (await card.getAttribute("data-replay"))?.startsWith("PTS 26/03-T-1") && /3 участия · 2 характеристики · 4 резултата · 1 N\/R/.test(await card.innerText()));
  t("THE ROUND TRIP: the portal's re-export matches the file cell by cell — no unexpected difference", (await card.getAttribute("data-replay-unexpected")) === "0" && (await card.locator("[data-replay-match]").count()) === 1, await card.innerText().catch(() => ""));
  t("…the expected differences listed (the SIM number, the dates, «excluded», the portal's N/R note)", Number(await card.locator("[data-replay-expected]").getAttribute("data-replay-expected")) >= 5);
  t("…what the file held that the portal cannot carry as it is: said", /126302 \/ ch-1/.test(await card.locator("[data-replay-said]").innerText()));
  // codes only: the participants' page names nobody
  await go("/dev/persona?role=manager");
  const parts = await (await page.request.get(`${BASE}/schemes/${S}/participants`)).text();
  t("codes only: the participations are the file's codes — nobody behind them", /126301/.test(parts) && /126303/.test(parts) && !/Пример ЕООД/.test(parts));
  // the export to 2.0 of the replay: whole, final (locked)
  const exp = await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  t("the replay exports to 2.0 like any round in processing — not preliminary", exp.status() === 200 && !/PRELIMINARY/.test(exp.headers()["content-disposition"] ?? ""));
  const journal = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled: «Replay of PTS 26/03-T-1 loaded as SIM …»", new RegExp(`Replay of PTS 26/03-T-1[^<]* loaded as ${number.replace(/[/()]/g, "\\$&")}`).test(journal));
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-replay: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
