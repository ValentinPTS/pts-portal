// Plan part 2.9 — the §4.2 regression, full (ISO/IEC 17043 §4.2; Реш. 93, 114, 142,
// 149; D5, D18), against a LOCAL dev server (in-memory store, login off):
//   BASE=http://localhost:3000 node scripts/verify-confidentiality.mjs
// A laboratory whose name, e-mail, contact, phone and delivery address occur nowhere
// else joins a scheme. Then EVERY page, print, export, file route, notice page and PDF
// of the app — the inventory, scripts/regression-routes.mjs, which
// scripts/regression-inventory.test.ts keeps complete — is opened as EVERY role:
//   • who sees names in that scheme (its scheme manager and coding expert, the local
//     build) DO get them where the scheme shows them — so the rest is not trivially
//     true — and a page that never shows a laboratory's identity shows none even to them;
//   • everyone else gets none of it from any response, nothing crashes, the export
//     is refused outright (a ZIP is compressed: a text search would prove nothing), and
//     — the check that sees inside PDFs and ZIPs too — the identity store records NO
//     opening of that laboratory while they work.
import { chromium } from "playwright";
import { inflateRawSync } from "node:zlib";
import { ROUTES } from "./regression-routes.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("BASE must be a local dev server"); process.exit(2); }
// the scheme: one made by this run (unless SCHEME is given), so that no other check on
// the same server opens its laboratories — the record of openings below stays this run's
let S = process.env.SCHEME ?? "";
const stamp = Date.now().toString(36);
const SECRET = {
  labName: `Поверителна Лаборатория ${stamp} ООД`,
  email: `secret-${stamp}@example.test`,
  contact: `инж. Тайно Лице ${stamp}`,
  phone: `+359 88 ${String(Date.now()).slice(-6)}`,
  deliveryAddress: `ул. Скрита ${stamp} 7, София`,
};
const MARKS = Object.values(SECRET);
let pass = 0, fail = 0;
const failures = [];
const t = (name, ok, extra = "") => {
  if (ok) pass++;
  else { fail++; failures.push(name); console.error("FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const get = async (path) => {
  const r = await page.request.get(BASE + path, { timeout: 120000, maxRedirects: 5 });
  const body = await r.body();
  return { status: r.status(), url: r.url(), text: body.toString("utf8"), body };
};
const leak = (text) => MARKS.find((m) => text.includes(m));
// a crash, not a refusal: a server error's digest in the streamed page (a redirect or a
// «not found» carries one too, by design — those are answers, not crashes)
const crashed = (a, x) => {
  if (x.status >= 500) return !(a.file === "api/cron/notify/route.ts" && x.status === 503); // the cron, no secret set locally: «not configured»
  const digests = [...x.text.matchAll(/digest\\?"\s*:\s*\\?"([^"\\]+)/g)].map((m) => m[1]);
  return digests.some((d) => !/^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK|NOT_FOUND)/.test(d));
};
const refused = (x) => x.status === 401 || x.status === 403 || x.url.includes("denied") || /NEXT_REDIRECT[^"\\]*login\?denied=1/.test(x.text);
// switch persona — and make sure the switch took
const persona = async (p) => {
  const r = await go(`/dev/persona?${p}`);
  t(`(${p}: the persona switched)`, !!r && r.status() < 400, `status ${r?.status()}`);
};

// the ZIP the export serves: its files, inflated
const unzip = (buf) => {
  const out = new Map();
  for (let i = 0; i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50;) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    i += 30 + nameLen + extra + size;
  }
  return out;
};

try {
  // ── never against a real database: everything planted here would stay ──
  await persona("role=manager");
  const sys = await get("/system");
  t("the server runs in memory — nothing planted reaches a database", /running entirely in memory|работи изцяло в паметта/.test(sys.text));
  if (!/running entirely in memory|работи изцяло в паметта/.test(sys.text)) throw new Error("not a memory-only server");

  // ── a scheme of this run's own ──
  if (!S) {
    await go("/files/testing");
    await page.locator("button", { hasText: /Нова схема|New scheme/ }).first().click();
    await page.locator('input[name="name"]').last().fill(`Поверителност ${stamp}`);
    await Promise.all([page.waitForURL(/\/schemes\/[^/]+$/, { timeout: 90000 }), page.locator('button[type="submit"]').last().click()]);
    S = new URL(page.url()).pathname.split("/").pop();
  }
  t("(a scheme of this run's own)", !!S, page.url());

  // ── a laboratory only this run knows ──
  await go(`/schemes/${S}/participants`);
  const add = page.locator('form:has(input[name="labName"])').last();
  for (const [field, value] of Object.entries(SECRET)) {
    const input = add.locator(`[name="${field}"]`);
    if (await input.count()) await input.fill(value);
  }
  await add.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${SECRET.labName}`);
  // coded at once (dev): since 5.3 an application has only a provisional reference until the
  // coding act — its results and certificate need a code
  await page.request.get(`${BASE}/dev/code?scheme=${S}`);
  await go(`/schemes/${S}/participants`);
  await page.waitForSelector(`text=${SECRET.labName}`);
  const code = (await page.locator("tr", { hasText: SECRET.labName }).locator("td").first().innerText()).trim();
  t("(the laboratory joins the scheme, with a code)", !!code);
  // the list's edit form carries all of it, for who sees names — so the absence below means something
  const planted = await get(`/schemes/${S}/participants`);
  t("(…its contact, phone and delivery address are on record)", ["contact", "phone", "deliveryAddress"].every((k) => planted.text.includes(SECRET[k])));

  // another LIVE scheme (another check may have archived one)
  const dash = await get("/dashboard");
  const OTHER = process.env.OTHER ?? [...dash.text.matchAll(/href="\/schemes\/([^"/]+)"/g)].map((m) => m[1]).find((id) => id !== S);
  t("(another live scheme to test against)", !!OTHER, "none found");

  // the addresses that need an id: a folder, a skin
  // (a folder: the scheme's own, or any of either kind; a skin: a saved one, or a built-in
  // id — its edit page answers either way, and is opened as every role)
  let folderPath = null;
  for (const where of [`/schemes/${S}`, "/files/testing", "/files/calibration"]) {
    folderPath = (await get(where)).text.match(/href="(\/files\/[a-z]+\/f\/[^"]+)"/)?.[1] ?? null;
    if (folderPath) break;
  }
  if (!folderPath) {
    // none at all on this server: make one, so the folder page is opened as every role
    await go("/files/testing");
    await page.locator("button", { hasText: /Нова папка|New folder/ }).first().click();
    await page.locator('input[name="name"]').fill(`Проверка ${stamp}`);
    await page.locator('button[type="submit"]').last().click();
    await page.waitForTimeout(1500);
    folderPath = (await get("/files/testing")).text.match(/href="(\/files\/[a-z]+\/f\/[^"]+)"/)?.[1] ?? null;
  }
  const skinId = (await get("/skins")).text.match(/href="\/skins\/([^"/]+)\/edit"/)?.[1] ?? "classic";

  // an edition of the invitation, and the invitation sent as it (3.0) — so the
  // editions' page and file, and what the participants hold, are opened as every role
  // with something in them
  await go(`/schemes/${S}`);
  const inv = page.locator('[data-doc-row="invitation"]');
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), inv.locator("button", { hasText: /Качи|Upload/ }).click()]);
  await chooser.setFiles({ name: "pokana.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
  await inv.locator("button", { hasText: /Изпрати|Send/ }).waitFor({ timeout: 60000 });
  page.once("dialog", (d) => d.accept());
  await inv.locator("button", { hasText: /Изпрати|Send/ }).click();
  await inv.locator('[data-edition-label="1"]').waitFor({ timeout: 60000 });
  const editions = [...new Set([...(await get(`/schemes/${S}/editions`)).text.matchAll(new RegExp(`/schemes/${S}/editions/([0-9a-f-]{36})\\?lang=bg`, "g"))].map((m) => m[1]))];
  t("(an edition issued and sent, to open as every role)", editions.length === 1, String(editions.length));
  const ctx = { S, OTHER, code, forms: ["feedback", "declaration", "application", "protocol", "results"], folderPath, skinId, editions };
  for (const r of ROUTES.filter((x) => x.names !== "dev" && x.file !== "api/pdf/route.ts")) t(`(${r.file}: at least one address)`, r.paths(ctx).length > 0);

  const addresses = ROUTES.filter((r) => r.names !== "dev").flatMap((r) => r.paths(ctx).map((p) => ({ ...r, path: p })));
  const posts = ROUTES.filter((r) => r.post).flatMap((r) => r.post(ctx).map((b) => ({ ...r, body: b })));
  console.log(`${addresses.length} addresses and ${posts.length} PDFs`);

  // a laboratory that takes part in THIS scheme — a fellow participant
  await persona(`role=lab&join=${S}`);
  const LAB = "role=lab";

  // ── who sees names in this scheme: they get them where the scheme shows them ──
  const SEES = ["role=manager", `model=scheme_manager@${S}`, `model=coding_expert@${S}`];
  const SHOWS = [
    `/schemes/${S}/participants`, `/schemes/${S}/participants/${encodeURIComponent(code)}?reveal=1`, `/schemes/${S}/results`,
    `/schemes/${S}/doc/registered/print?lang=bg`, `/schemes/${S}/doc/results-coded/print?lang=bg`,
    `/schemes/${S}/doc/certificate/print?lang=bg&p=${encodeURIComponent(code)}`, `/schemes/${S}/audit-pack?names=1`,
  ];
  for (const p of SEES) {
    await persona(p);
    for (const path of SHOWS) {
      const x = await get(path);
      t(`${p}: ${path} — shows who is behind the code`, x.status === 200 && x.text.includes(SECRET.labName), `status ${x.status}`);
    }
    for (const a of addresses.filter((x) => x.names === "never")) {
      const x = await get(a.path);
      t(`${p}: ${a.path} — never a laboratory's identity`, !leak(x.text) && !crashed(a, x), `status ${x.status} ${leak(x.text) ?? ""}`);
    }
  }

  // the identity store's record of openings of THIS laboratory (not for the export itself)
  const openingsOfPlanted = async () => {
    await persona("role=manager");
    const r = await page.request.get(`${BASE}/schemes/${S}/export`, { timeout: 120000 });
    const files = unzip(await r.body());
    const rows = (files.get("identity/identity_openings.csv") ?? "").split("\n").slice(1).filter(Boolean);
    return rows.filter((row) => row.split(",").some((cell) => cell.replace(/"/g, "").split(" ").includes(code)) && !/,export,/.test(row)).length;
  };
  const before = await openingsOfPlanted();
  t("(the export carries the record of openings — this laboratory's are in it)", before > 0, `rows ${before}`);

  // ── everyone else: nothing, anywhere ──
  const OTHERS = [
    "model=head", "model=quality", "model=software_admin",
    `model=statistics_expert@${S}`, `model=technical_expert@${S}`, `model=reviewer@${S}`,
    `model=scheme_manager@${OTHER}`, `model=coding_expert@${OTHER}`,
    "role=auditor", "role=staff", LAB,
  ];
  for (const p of OTHERS) {
    await persona(p);
    let n = 0;
    for (const a of addresses) {
      const x = await get(a.path);
      n++;
      t(`${p}: ${a.path} — no identity, no crash`, !leak(x.text) && !crashed(a, x), `status ${x.status}${leak(x.text) ? ` LEAK ${leak(x.text)}` : ""}`);
      if (a.file === "schemes/[id]/export/route.ts") t(`${p}: ${a.path} — the export refused`, refused(x), `status ${x.status}`);
    }
    for (const q of posts) {
      const r = await page.request.post(BASE + "/api/pdf", { data: q.body, timeout: 120000 });
      // F 7.2.1-6 (the name↔code mapping) is not made at all; the others are made from
      // the same print route opened above — masked for this role; what is inside the
      // PDF is proven by the openings below
      const restricted = q.body.doc === "results-coded";
      t(`${p}: PDF of ${q.body.doc}${q.body.participant ? " (one laboratory)" : ""} ${restricted ? "refused" : "made"}`, restricted ? r.status() === 403 || r.status() === 401 || r.url().includes("denied") : r.status() < 500, `status ${r.status()}`);
    }
    console.log(`  ${p}: ${n} addresses`);
  }
  const after = await openingsOfPlanted();
  // one more: the export just made for this count, which is not counted
  t("while everyone else worked — every page, print, PDF — the identity store opened this laboratory NOT ONCE", after === before, `before ${before}, after ${after}`);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await go("/dev/persona?role=manager").catch(() => {});
  await browser.close();
}
if (failures.length > 20) console.error(`…${failures.length} failures in all`);
console.log(`\nverify-confidentiality: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
