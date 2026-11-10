// Plan part 7.3 check (the transfer check and the processing record; Manual 7.5.2), against a LOCAL
// dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-transfer-check.mjs
// A scheme in processing; an export to 2.0 and an import of its report; the card shows what was
// sent beside the report in force; «not the same» needs what differs; «the same» recorded and in
// force; an addition (charts) leaves it in force; a new report, or a new export, takes it out; a
// HEAD never runs the export.
import { chromium } from "playwright";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok:", name); } else { fail++; console.error("FAIL:", name, extra); } };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const answers = [];
page.on("dialog", async (d) => { const a = answers.shift(); await d.accept(d.type() === "prompt" ? (typeof a === "string" ? a : "") : undefined); });
const go = async (path) => { try { return await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { if (!/ERR_ABORTED/.test(String(e))) throw e; await page.waitForTimeout(800); return page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); } };
const waitFor = async (fn, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now() % 100000;
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag} ${stamp}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n`);
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082", "hex");
const unzip = (buf) => {
  const out = new Map();
  for (let i = 0; i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50;) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out.set(name, method === 8 ? inflateRawSync(data) : data);
    i += 30 + nameLen + extra + size;
  }
  return out;
};
const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");
  // a testing scheme with one participation, taken to processing
  await go("/files/testing");
  const dialog = page.locator('form:has(select[name="sample"])');
  for (let i = 0; i < 20 && !(await dialog.isVisible().catch(() => false)); i++) { await page.getByRole("button", { name: /Нова схема|New scheme/ }).first().click(); await page.waitForTimeout(500); }
  await dialog.locator('select[name="sample"]').selectOption("aggregates");
  await dialog.locator('input[name="name"]').fill(`Пренос ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), dialog.getByRole("button", { name: /Създай проект|Create project/ }).click()]);
  const S = new URL(page.url()).pathname.split("/").pop();
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"][required]):has(input[name="schemeId"])').last();
  await add.locator('[name="labName"]').fill(`Пренос А ${stamp}`);
  await add.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("tbody").innerText()).includes(`Пренос А ${stamp}`));
  await go(`/schemes/${S}#stages`);
  answers.push(true, "");
  await page.locator('[data-act="announce"]').click();
  await waitFor(async () => { await go(`/schemes/${S}`); return /В процес|In progress/.test(await state()); }, 10);
  await go(`/schemes/${S}#stages`);
  const second = page.locator("[data-second-announcement]");
  for (const box of await second.locator('input[name^="run_"]').all()) if (!(await box.isChecked())) await box.check();
  await second.locator('input[name="note"]').fill("Окончателен списък");
  answers.push(true);
  await second.locator("[data-second-submit]").click();
  await waitFor(async () => (await page.locator("[data-final-list]").count()) === 1, 40);
  answers.push(true);
  await page.locator("[data-coding-run]").click();
  await waitFor(async () => (await page.locator("[data-coding-done]").count()) === 1, 60);
  answers.push(true, `Обработката започва — проверка ${stamp}`);
  await page.locator('[data-act="process"]').click();
  t("setup: a scheme in processing", await waitFor(async () => { await go(`/schemes/${S}`); return /Обработка|Processing/.test(await state()); }, 20));

  // ── export, import ──
  const rx = await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  const handed = Buffer.from(await rx.body());
  t("exported to 2.0 — the file handed out", rx.status() === 200);
  // 7.10: the round export carries that very file — what went to 2.0 — and its table
  const zipped = unzip(Buffer.from(await (await page.request.get(`${BASE}/schemes/${S}/export?part=coded`)).body()));
  const kept = [...zipped.keys()].filter((n) => /^coded\/files\/analysis\/exports\/.+\.xlsx$/.test(n));
  const table = zipped.get("coded/analysis_exports.csv")?.toString("utf8") ?? "";
  t("7.10 — the round export holds the file handed out to 2.0, byte for byte, with its hash in analysis_exports.csv", kept.length === 1 && zipped.get(kept[0]).equals(handed) && table.includes(createHash("sha256").update(handed).digest("hex")), `${kept.length} ${table.slice(0, 200)}`);
  await go(`/schemes/${S}#analysis-import`);
  const form = page.locator("[data-import-form]");
  await form.locator('input[name="version"]').fill("2.0.3");
  await form.locator('input[name="report-bg"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: pdf("BG") });
  await form.locator("[data-import-submit]").click();
  await waitFor(async () => /imp=ok/.test(page.url()), 30);
  // ── the card ──
  await go(`/schemes/${S}#processing-record`);
  const sent = await page.locator("[data-transfer-sent]").innerText().catch(() => "");
  t("the card: what was sent — the code and the characteristics — beside what came back (2.0.3); not checked yet", /Кодове \(1\)|Codes \(1\)/.test(sent) && (await page.locator("[data-transfer-received]").innerText()).includes("2.0.3") && (await page.locator('[data-transfer-check="none"]').count()) === 1);
  t("…the processing record: the export and the import, in order", (await page.locator('[data-record-event="export"]').count()) === 1 && (await page.locator('[data-record-event="import"]').count()) === 1);
  const tf = page.locator("[data-transfer-form]");
  await tf.locator('input[value="no"]').check();
  await tf.locator("[data-transfer-submit]").click();
  t("«not the same» without what differs: refused — said", await waitFor(async () => /tc=note/.test(page.url()), 30));
  await go(`/schemes/${S}#processing-record`);
  await page.locator('[data-transfer-form] input[value="yes"]').check();
  await page.locator("[data-transfer-form] [data-transfer-submit]").click();
  t("«the same»: recorded and in force — on the record", await waitFor(async () => /tc=ok/.test(page.url()), 30) && (await page.locator('[data-transfer-check="same"]').count()) === 1 && (await page.locator('[data-record-event="check"]').count()) === 1);
  const act = await (await page.request.get(`${BASE}/activity?scheme=${S}`)).text();
  t("journalled — «lists the same codes and characteristics»", /Transfer check — 2\.0's report lists the same codes and characteristics/.test(act));
  // an addition (charts only) — the report in force is the same file: the check stays in force (review)
  await go(`/schemes/${S}#analysis-import`);
  await page.locator('[data-import-form] input[name="version"]').fill("2.0.3");
  await page.locator('[data-import-form] input[name="chart"]').setInputFiles([{ name: "c.png", mimeType: "image/png", buffer: png }]);
  await page.locator("[data-import-form] [data-import-submit]").click();
  await waitFor(async () => /imp=ok/.test(page.url()), 30);
  await go(`/schemes/${S}#processing-record`);
  t("an addition (charts only): the report in force unchanged — the check stays in force", (await page.locator('[data-transfer-check="same"]').count()) === 1);
  // a new report — another file in force: the check is out of force
  await go(`/schemes/${S}#analysis-import`);
  await page.locator('[data-import-form] input[name="version"]').fill("2.0.4");
  await page.locator('[data-import-form] input[name="report-bg"]').setInputFiles({ name: "report2.pdf", mimeType: "application/pdf", buffer: pdf("BG2") });
  await page.locator("[data-import-form] [data-import-submit]").click();
  await waitFor(async () => /imp=ok/.test(page.url()), 30);
  await go(`/schemes/${S}#processing-record`);
  t("a new report imported: not in force — the card names 2.0.4's report", (await page.locator('[data-transfer-check="none"]').count()) === 1 && (await page.locator("[data-transfer-received]").innerText()).includes("2.0.4"));
  // a HEAD never runs the export: no record, no journal line
  const before = await page.locator('[data-record-event="export"]').count();
  const rh = await page.request.fetch(`${BASE}/schemes/${S}/export/analysis`, { method: "HEAD" });
  await go(`/schemes/${S}#processing-record`);
  t("a HEAD on the export: 405 — nothing recorded", rh.status() === 405 && (await page.locator('[data-record-event="export"]').count()) === before);
  // check it again, then a new export — out of force
  await page.locator('[data-transfer-form] input[value="yes"]').check();
  await page.locator("[data-transfer-form] [data-transfer-submit]").click();
  await waitFor(async () => /tc=ok/.test(page.url()), 30);
  const ok2 = (await page.locator('[data-transfer-check="same"]').count()) === 1;
  await page.request.get(`${BASE}/schemes/${S}/export/analysis`);
  await go(`/schemes/${S}#processing-record`);
  t("checked again for 2.0.4; a new export — out of force again", ok2 && (await page.locator('[data-transfer-check="none"]').count()) === 1 && (await page.locator('[data-record-event="export"]').count()) === before + 1);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`\nverify-transfer-check: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
