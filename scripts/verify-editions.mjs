// Plan part 3.0 check (the edition core; Реш. 50), against a LOCAL dev server
// (in-memory store, login off):   BASE=http://localhost:3000 node scripts/verify-editions.mjs
// On a scheme of its own: «Изпрати» sends edition 1; the file is replaced and the
// laboratory still holds edition 1; sent again, it asks what changed and why, and goes
// out as edition 2 — edition 1 still opens, unchanged; an unchanged document is not
// issued again; any document can be issued from «Редакции»; another scheme's manager
// cannot open them; the journal and the round export carry them. (Since part 3.2 the
// report is reached through the scheme's acts, not the edit page.)
import { chromium } from "playwright";
import { inflateRawSync } from "node:zlib";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 30) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const stamp = Date.now();
const PDF1 = Buffer.from(`%PDF-1.4\n% instruction one ${stamp}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const PDF2 = Buffer.from(`%PDF-1.4\n% instruction two ${stamp}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

// the answers to the page's dialogs, in order (confirm → true; prompt → its text)
const answers = [];
page.on("dialog", async (d) => {
  const a = answers.shift();
  if (a === false) await d.dismiss();
  else await d.accept(typeof a === "string" ? a : undefined);
});

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

let S;
// part 3.2: past «Отворена» a scheme moves by the acts on its page — announce, start
// processing, the three processing ticks (Реш. 140), issue the report
const toReport = async () => {
  const state = async () => (await page.locator("[data-lifecycle] [data-state]").innerText()).trim();
  for (const step of [{ act: "announce" }, { act: "process" }, { tick: 14 }, { tick: 15 }, { tick: 16 }, { act: "report" }]) {
    await go(`/schemes/${S}#stages`);
    await page.locator("[data-lifecycle] [data-stage]").nth(18).waitFor();
    const before = await state();
    if (step.act) {
      answers.push(true, "");
      await page.locator(`[data-act="${step.act}"]`).click();
      await waitFor(async () => (await state()) !== before);
    } else {
      answers.push("");
      await page.locator(`[data-tick="${step.tick}"]`).click();
      await waitFor(async () => (await page.locator(`[data-stage="${step.tick}"]`).getAttribute("data-done")) === "1");
    }
  }
};
// the status buttons work once the editor has hydrated — click until the hidden field shows it
const setStatus = async (label, value) => {
  await go(`/schemes/${S}/edit`);
  for (let i = 0; i < 30; i++) {
    await page.getByRole("button", { name: label, exact: false }).first().click();
    if ((await page.locator('input[name="status"]').inputValue().catch(() => "")) === value) break;
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
  const sys = await (await page.request.get(BASE + "/system")).text();
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys)) throw new Error("not a memory-only server");

  await go("/files/testing");
  await page.locator("button", { hasText: /Нова схема|New scheme/ }).first().click();
  await page.locator('input[name="name"]').last().fill(`Редакции ${stamp}`);
  await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), page.locator('button[type="submit"]').last().click()]);
  S = new URL(page.url()).pathname.split("/").pop();
  t("(a scheme of this run's own)", !!S);
  // started, so a laboratory may see it at all (Реш. 147)
  await setStatus(/Отворена|Open/, "open");

  const row = (doc) => page.locator(`[data-doc-row="${doc}"]`);
  const upload = async (doc, buffer, replace = false) => {
    const r = row(doc);
    const click = replace
      ? async () => { await r.locator('button[aria-label="More"]').click(); await r.locator("button", { hasText: /Замени файла|Replace file/ }).click(); }
      : () => r.locator("button", { hasText: /Качи|Upload/ }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), click()]);
    await chooser.setFiles({ name: `${doc}.pdf`, mimeType: "application/pdf", buffer });
  };
  const menu = async (doc, label) => { await row(doc).locator('button[aria-label="More"]').click(); await row(doc).locator("button", { hasText: label }).click(); };

  // ── 1. sent: edition 1 ──
  await go(`/schemes/${S}`);
  await upload("instruction", PDF1);
  await row("instruction").locator("button", { hasText: /^📨/ }).waitFor();
  answers.push(true);
  await row("instruction").locator("button", { hasText: /^📨/ }).click();
  t("«Изпрати» sends edition 1 — the row says so", await waitFor(async () => (await row("instruction").locator('[data-edition-label="1"]').count()) === 1 && /\((ред\.|ed\.) № 1\)/.test(await row("instruction").innerText())));

  await go(`/schemes/${S}/editions`);
  const ed = (doc, no) => page.locator(`[data-edition="${doc}:${no}"]`);
  t("«Редакции»: edition 1, «Първа редакция», with the participants", (await ed("instruction", 1).count()) === 1 && /Първа редакция/.test(await ed("instruction", 1).innerText()) && (await ed("instruction", 1).locator("[data-held]").count()) === 1);
  const ed1Href = await ed("instruction", 1).locator("a").first().getAttribute("href");

  await go(`/dev/persona?role=lab&join=${S}`);
  const lab1 = await page.request.get(`${BASE}/lab/doc/${S}/instruction`);
  t("the laboratory gets edition 1's file", lab1.status() === 200 && Buffer.from(await lab1.body()).equals(PDF1), `status ${lab1.status()}`);

  // ── 2. the file replaced: the laboratory still holds edition 1 ──
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}`);
  await upload("instruction", PDF2, true);
  await page.waitForTimeout(1500);
  await go(`/dev/persona?role=lab&join=${S}`);
  const lab2 = await page.request.get(`${BASE}/lab/doc/${S}/instruction`);
  t("the file replaced after sending: the laboratory still gets edition 1, unchanged", lab2.status() === 200 && Buffer.from(await lab2.body()).equals(PDF1));
  await go("/dev/persona?role=manager");
  await go(`/schemes/${S}/editions`);
  t("«Редакции» says it changed since edition 1", (await page.locator('[data-edition-doc="instruction"] [data-changed-since="1"]').count()) === 1);

  // ── 3. withdrawn and sent again: what changed and why → edition 2 ──
  await go(`/schemes/${S}`);
  answers.push(true);
  await menu("instruction", /Спри споделянето|Stop sharing/);
  await row("instruction").locator("button", { hasText: /^📨/ }).waitFor();
  answers.push(true, "", ); // confirm, then an empty reason: nothing is sent
  await row("instruction").locator("button", { hasText: /^📨/ }).click();
  await page.waitForTimeout(2500);
  await go(`/schemes/${S}/editions`);
  t("asked what changed and given nothing: no edition 2, nothing sent", (await ed("instruction", 2).count()) === 0 && (await ed("instruction", 1).locator("[data-held]").count()) === 0);
  await go(`/schemes/${S}`);
  answers.push(true, "Нова версия на инструкцията — сменен срок", "т. 3");
  await row("instruction").locator("button", { hasText: /^📨/ }).click();
  t("…given the reason and the scope, it goes out as edition 2", await waitFor(async () => (await row("instruction").locator('[data-edition-label="2"]').count()) === 1 && /\((ред\.|ed\.) № 2\)/.test(await row("instruction").innerText())));
  await go(`/schemes/${S}/editions`);
  const e2 = await ed("instruction", 2).innerText().catch(() => "");
  t("«Редакции»: edition 2 with its reason and scope, with the participants; edition 1 kept, no longer with them",
    /сменен срок/.test(e2) && /т\. 3/.test(e2) && (await ed("instruction", 2).locator("[data-held]").count()) === 1 && (await ed("instruction", 1).count()) === 1 && (await ed("instruction", 1).locator("[data-held]").count()) === 0);
  const e1 = await page.request.get(BASE + ed1Href);
  t("edition 1 still opens — exactly its file", e1.status() === 200 && Buffer.from(await e1.body()).equals(PDF1), `status ${e1.status()}`);
  await go(`/dev/persona?role=lab&join=${S}`);
  const lab3 = await page.request.get(`${BASE}/lab/doc/${S}/instruction`);
  t("the laboratory now gets edition 2", lab3.status() === 200 && Buffer.from(await lab3.body()).equals(PDF2));
  await go("/lab");
  t("…and its portal says which edition it holds", await waitFor(async () => /\((ред\.|ed\.) № 2\)/.test(await page.locator("main").innerText())));
  await go("/dev/persona?role=manager");

  // ── 4. unchanged: sent again, no new edition ──
  await go(`/schemes/${S}`);
  answers.push(true);
  await menu("instruction", /Спри споделянето|Stop sharing/);
  await row("instruction").locator("button", { hasText: /^📨/ }).waitFor();
  answers.push(true); // only the confirm: an unchanged document asks for no note
  await row("instruction").locator("button", { hasText: /^📨/ }).click();
  t("unchanged and sent again: still edition 2, no edition 3", await waitFor(async () => /\((ред\.|ed\.) № 2\)/.test(await row("instruction").innerText())) && (await row("instruction").locator('[data-edition-label="3"]').count()) === 0);

  // ── 5. «Издай редакция» from the page: any document, never an unchanged one ──
  await upload("plan", PDF1);
  await page.waitForTimeout(1500);
  await go(`/schemes/${S}/editions?doc=plan`);
  const form = page.locator("[data-issue-edition]");
  await form.locator("select").selectOption("plan");
  await form.locator('button[type="submit"]').click();
  t("the plan (never sent) issued as its edition 1 from «Редакции»", await waitFor(async () => (await page.locator('[data-edition="plan:1"]').count()) === 1));
  await form.locator("select").selectOption("instruction");
  await form.locator('textarea[name="reason"]').fill("Нищо не е променено всъщност");
  await form.locator('button[type="submit"]').click();
  t("…an unchanged document is not issued again", await waitFor(async () => /Nothing has changed since edition 2/.test(await form.innerText())) && (await page.locator('[data-edition="instruction:3"]').count()) === 0);

  // ── 6. the final report: an edition of PTS's file — a replaced file reaches the
  //       laboratories only when issued as the next edition, with its note ──
  const R1 = Buffer.from(`%PDF-1.4\n% report one ${stamp}\n%%EOF\n`), R2 = Buffer.from(`%PDF-1.4\n% report two ${stamp}\n%%EOF\n`);
  await go(`/schemes/${S}`);
  await upload("report", R1);
  await page.waitForTimeout(1500);
  await toReport(); // the acts of part 3.2
  const labGet = async (doc) => { await go(`/dev/persona?role=lab&join=${S}`); const r = await page.request.get(`${BASE}/lab/doc/${S}/${doc}`); const b = Buffer.from(await r.body()); await go("/dev/persona?role=manager"); return { status: r.status(), b }; };
  const rep1 = await labGet("report");
  t("the report issued: the laboratory gets it, kept as its edition 1", rep1.status === 200 && rep1.b.equals(R1), `status ${rep1.status}`);
  await go(`/schemes/${S}`);
  await upload("report", R2, true);
  await page.waitForTimeout(1500);
  t("…the file replaced: the laboratory still gets edition 1", (await labGet("report")).b.equals(R1));
  await go(`/schemes/${S}/editions?doc=report`);
  t("…«Редакции»: edition 1 with the participants, changed since", (await page.locator('[data-edition="report:1"] [data-held]').count()) === 1 && (await page.locator('[data-edition-doc="report"] [data-changed-since="1"]').count()) === 1);
  await form.locator("select").selectOption("report");
  await form.locator('textarea[name="reason"]').fill("Поправена грешка в таблица 3");
  await form.locator('button[type="submit"]').click();
  t("…issued as edition 2 with its note", await waitFor(async () => (await page.locator('[data-edition="report:2"]').count()) === 1));
  t("…and now the laboratory gets edition 2", (await labGet("report")).b.equals(R2));

  // ── 7. not for another scheme's people ──
  for (const persona of ["model=scheme_manager@26-01-T-1", "role=lab"]) {
    await go(`/dev/persona?${persona}`);
    const r = await page.request.get(BASE + ed1Href, { maxRedirects: 0 });
    const list = await page.request.get(`${BASE}/schemes/${S}/editions`);
    t(`${persona}: cannot open an edition, nor the list`, r.status() !== 200 && !(await list.text()).includes(`data-edition="instruction:1"`), `status ${r.status()}`);
  }
  await go("/dev/persona?role=manager");

  // ── 8. on record ──
  await go(`/activity?scheme=${S}`);
  // the page streams: read it once the entries are in (a first compile can be slow)
  await page.getByText(/“plan” issued/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await page.locator("main").innerText();
  const want = [/Edition No\. 2 of [\d.]+ of “instruction” issued — Нова версия на инструкцията — сменен срок \(scope: т\. 3\)/, /sent to the participants — Edition No\. 2/, /Edition No\. 1 of [\d.]+ of “plan” issued/];
  const missing = want.filter((re) => !re.test(journal)).map(String);
  t("the journal: each edition issued with its note, each sending with its edition", !missing.length, `missing ${missing.join(" | ")}\n${journal.slice(0, 1500)}`);
  const exp = await page.request.get(`${BASE}/schemes/${S}/export?part=coded`, { timeout: 120000 });
  const files = exp.status() === 200 ? unzip(Buffer.from(await exp.body())) : new Map();
  const csv = files.get("coded/editions.csv")?.toString("utf8") ?? "";
  t("the round export: every edition, with its file and hash, which one is with the participants",
    csv.split("\n").filter((l) => /instruction|plan/.test(l)).length === 3 && /sha256/.test(csv)
    && files.get("coded/files/editions/instruction/1.pdf")?.equals(PDF1) && files.get("coded/files/editions/instruction/2.pdf")?.equals(PDF2)
    && /instruction,2,[^\n]*,yes,/.test(csv), `status ${exp.status()}; ${[...files.keys()].filter((k) => k.includes("edition")).join(", ")}`);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
console.log(`\nverify-editions: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
