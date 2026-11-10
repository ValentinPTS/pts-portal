// Plan part 1.10 check, against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-export.mjs
// «Изнеси целия кръг» from the scheme's «Управление»: one ZIP, both parts or the
// coded part alone; a manager's alone; journalled.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("BASE must be a local dev server"); process.exit(2); }
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
const isZip = (b) => b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

try {
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  await page.getByRole("button", { name: /Управление|Manage/ }).first().click();
  await page.locator('[data-export="all"]').waitFor({ timeout: 20000 }).catch(() => {});
  t("the scheme's «Управление» offers the whole round and the coded part", (await page.locator('[data-export="all"]').count()) === 1 && (await page.locator('[data-export="coded"]').count()) === 1);

  const all = await page.request.get(`${BASE}/schemes/${S}/export`);
  const body = await all.body();
  t("the whole round: a ZIP, as a download", all.status() === 200 && /application\/zip/.test(all.headers()["content-type"] ?? "") && /attachment; filename="PTS_26-01-T-1_round_\d{8}\.zip"/.test(all.headers()["content-disposition"] ?? "") && isZip(body), `${all.status()} ${all.headers()["content-disposition"]}`);
  t("…with both parts and a README", ["README.md", "coded/scheme.json", "coded/results.csv", "identity/participants.csv"].every((n) => body.includes(Buffer.from(n))));
  const coded = await page.request.get(`${BASE}/schemes/${S}/export?part=coded`);
  const cb = await coded.body();
  t("…the participants' tables of Phase 4 in identity/ (4.5, 4.8)", ["identity/participation_snapshots.csv", "identity/entities.csv", "identity/laboratories.csv", "identity/entity_users.csv"].every((n) => body.includes(Buffer.from(n))) && !cb.includes(Buffer.from("identity/entities.csv")));
  t("…the scheme's tables in coded/ (3.14)", ["coded/lifecycle_acts.csv", "coded/lifecycle_stages.csv", "coded/amendments.csv", "coded/extensions.csv", "coded/batches.csv", "coded/batch_objects.csv", "coded/homogeneity.csv", "coded/characteristics.csv", "coded/characteristic_versions.csv", "coded/scheme_meta.csv", "coded/external_providers.csv", "coded/scheme_lists.csv", "coded/commercial.csv"].every((n) => body.includes(Buffer.from(n))));
  t("…and in the coded part alone too (review)", ["coded/lifecycle_acts.csv", "coded/scheme_meta.csv", "coded/external_providers.csv", "coded/homogeneity.csv"].every((n) => cb.includes(Buffer.from(n))));
  // the round's own tables (5.12): the coding, releases, deliveries, reference values, billing,
  // acknowledgements, messages — in the coded part, by codes
  const ROUND = ["coded/coding_acts.csv", "coded/coding_map.csv", "coded/releases.csv", "coded/shipments.csv", "coded/receipts.csv", "coded/delivery_problems.csv", "coded/reference_values.csv", "coded/billing.csv", "coded/chain_stops.csv", "coded/ack_required.csv", "coded/round_settings.csv", "coded/acknowledgements.csv", "coded/scheme_messages.csv"];
  t("…the round's tables in coded/ (5.12) — the full export and the coded part alone", ROUND.every((n) => body.includes(Buffer.from(n)) && cb.includes(Buffer.from(n))));
  t("the coded part alone: a ZIP with no identity/", coded.status() === 200 && isZip(cb) && cb.includes(Buffer.from("coded/codes.csv")) && !cb.includes(Buffer.from("identity/")), String(coded.status()));

  await go("/activity?action=round.exported");
  const rows = await page.locator("tbody tr").allInnerTexts();
  t("each export is in the journal", rows.filter((r) => /26-01-T-1/.test(r)).length >= 2 && rows.some((r) => /coded part only/.test(r)) && rows.some((r) => /both parts/.test(r)), rows.slice(0, 2).join(" | "));

  // not for staff
  await go("/dev/persona?role=staff");
  const denied = await page.request.get(`${BASE}/schemes/${S}/export`, { maxRedirects: 0 });
  t("staff: no export", denied.status() >= 300 && denied.status() < 400 || denied.status() === 403, String(denied.status()));
  await go(`/schemes/${S}`);
  await page.getByRole("button", { name: /Управление|Manage/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  t("…and no export in their menu", (await page.locator("[data-export]").count()) === 0);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-export: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
