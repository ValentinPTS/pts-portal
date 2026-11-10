// Plan part 9.1 check (registration and joining), against a LOCAL dev server (in-memory store, login
// off):   BASE=http://localhost:3000 node scripts/verify-registration.mjs
// A new organisation registers (the three levels) → «Одобрения на регистрации» → approved → «Организации»
// shows it «чака проверка», from the portal, with its laboratory and its administrator invited. The same
// ЕИК again: the same neutral page — and a request to JOIN, decided by the profile's administrator in the
// laboratory's portal; another, by PTS on a signed letter (the letter kept, through its gate). PTS
// appoints the new user the administrator. Each notice to the official e-mail on record. A refusal kept
// with its reason; a mistake in the form named; the honeypot dropped.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) { pass++; console.log("ok:", name); }
  else { fail++; console.error("FAIL:", name, extra); }
};
const browser = await chromium.launch();
const ctx = await browser.newContext();
// its own address for the per-address limit of the public forms — the gates' other checks keep theirs
const stamp = Date.now() % 100000;
await ctx.setExtraHTTPHeaders({ "x-forwarded-for": `10.91.${Math.floor(stamp / 256) % 256}.${stamp % 256}` });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on("dialog", (d) => d.accept());
const go = (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
const waitFor = async (fn, tries = 50) => { for (let i = 0; i < tries; i++) { if (await fn().catch(() => false)) return true; await page.waitForTimeout(400); } return false; };
const text = async (loc) => ((await loc.count()) ? (await loc.first().textContent()) ?? "" : "");
const w1 = [1, 2, 3, 4, 5, 6, 7, 8], w2 = [3, 4, 5, 6, 7, 8, 9, 10];
const eikOf = (k) => { const d = String(10000000 + (stamp * k) % 89999999).slice(0, 8).split("").map(Number); let c = d.reduce((a, x, i) => a + x * w1[i], 0) % 11; if (c === 10) { c = d.reduce((a, x, i) => a + x * w2[i], 0) % 11; if (c === 10) c = 0; } return d.join("") + c; };
const ORG = `Регистрация ${stamp} ООД`, ORG2 = `Отказ ${stamp} ООД`, EIK = eikOf(37), EIK2 = eikOf(53);
const OFFICIAL = `office${stamp}@lab-test.bg`;
const ADMIN = `admin${stamp}@lab-test.bg`, P2 = `p2-${stamp}@lab-test.bg`, P3 = `p3-${stamp}@lab-test.bg`;

const register = async (o) => {
  await go("/register");
  const f = page.locator("[data-register-form]");
  // a cold server hydrates late: the choice is made again until the form takes it (its button enabled)
  for (let i = 0; i < 40; i++) {
    await f.locator("[data-register-country]").selectOption(o.country ?? "BG");
    if (await f.locator('button[type="submit"]').isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const v = { orgName: o.org, eik: o.eik, address: "София, ул. Регистрация 1", officialEmail: OFFICIAL, labName: o.lab ?? `Лаб. ${o.org}`, deliveryAddress: "София, ул. Доставка 2", contactPerson: o.name, email: o.email, position: "Ръководител на лабораторията", ...(o.extra ?? {}) };
  for (const [k, val] of Object.entries(v)) await f.locator(`[name="${k}"]`).fill(val);
  await Promise.all([page.waitForURL(o.expect ?? /register\/thanks/, { timeout: 90000 }).catch(() => {}), f.locator('button[type="submit"]').click()]);
  return (await text(page.locator("main, body"))).replace(/\s+/g, " ");
};
const thanksOf = async () => (await text(page.locator("[data-register-thanks]"))).replace(/\s+/g, " ").trim();
const userIdOf = async (card, email) => card.locator("[data-user]", { hasText: email }).first().getAttribute("data-user");

try {
  await go("/dev/persona?role=manager");
  if (!/running entirely in memory|работи изцяло в паметта/.test(await (await page.request.get(BASE + "/system")).text())) throw new Error("not a memory-only server");

  // ── the form: the three levels, the M4 link; a mistake named ──
  await go("/register");
  t("the form: the organisation, the laboratory and the person — three levels at once; M4 linked or said (Реш. 152)", (await page.locator("[data-register-level]").count()) === 3 && /М4|M4/.test(await text(page.locator("[data-register-privacy]"))));
  await register({ org: ORG, eik: EIK.slice(0, 8) + String((Number(EIK[8]) + 1) % 10), name: "Грешка", email: `bad${stamp}@lab-test.bg`, expect: /never/ });
  await page.locator("[data-register-error]").waitFor({ timeout: 60000 }).catch(() => {});
  t("a mistake in the form: named, by its level (the ЕИК's check digit) — and what was typed kept", (await page.locator("[data-register-error]").getAttribute("data-register-error")) === "entity.eik-bg" && /ЕИК не е валиден|ЕИК is not valid/.test(await text(page.locator("[data-register-error]"))) && (await page.locator('[name="orgName"]').inputValue()) === ORG && (await page.locator('[name="email"]').inputValue()) === `bad${stamp}@lab-test.bg` && (await page.locator("[data-register-country]").inputValue()) === "BG");

  // ── a new organisation ──
  await register({ org: ORG, eik: EIK, name: "Мария Админ", email: ADMIN });
  const neutral = await thanksOf();
  t("registered: the neutral page", /register\/thanks/.test(page.url()) && /Регистрацията е получена|Registration received/.test(neutral));
  await go("/registrations");
  const card = page.locator("[data-registration]", { hasText: ORG });
  await waitFor(async () => (await card.count()) === 1);
  t("«Одобрения на регистрации»: the registration with its three levels and its checks", (await card.count()) === 1 && /контролната цифра е вярна|check digit correct/.test(await text(card.locator("[data-registration-checks]"))) && (await text(card.locator("[data-registration-person]"))).includes(ADMIN) && (await text(card.locator("[data-registration-laboratory]"))).includes(`Лаб. ${ORG}`));
  await card.locator("[data-registration-approve]").click();
  await waitFor(async () => (await page.locator("[data-registrations-done]").count()) === 1);
  const said = await text(page.locator("[data-registrations-done]"));
  t("approved: the page says so — the profile made; the notice to the official e-mail on record (no mail here: not sent)", /Одобрена|Approved/.test(said) && /НЕ тръгна|did NOT go/.test(said), said);
  await go("/organizations");
  const ent = page.locator("[data-entity]", { hasText: ORG });
  await waitFor(async () => (await ent.count()) === 1);
  const entText = await text(ent);
  const adminId = await userIdOf(ent, ADMIN);
  t("«Организации»: «чака проверка», from the portal, its laboratory, its administrator invited", (await ent.locator('[data-origin="portal"]').count()) === 1 && /чака проверка|awaiting the check/.test(entText) && entText.includes(`Лаб. ${ORG}`) && (await ent.locator(`[data-user="${adminId}"]`).getAttribute("data-user-role")) === "admin" && (await ent.locator(`[data-user="${adminId}"]`).getAttribute("data-user-state")) === "invited");
  t("…the profile is the laboratory's: no role select in «Поправи» (the administrator changes by the appointment)", (await ent.locator("[data-user-form] select[name=role]").count()) === 0);
  await go("/registrations");
  t("…and no longer waiting", (await page.locator("[data-registration]", { hasText: ORG }).count()) === 0);

  // the administrator accepts (the persona accepts the invitation)
  await go(`/dev/persona?role=participant&user=${adminId}`);
  t("the administrator signs in: the tab «Заявки за присъединяване»", (await page.locator('[data-participant-nav] a[href="/lab/joins"]').count()) === 1);

  // ── the same ЕИК again: a request to join — the same page ──
  await register({ org: ORG, eik: ` ${EIK} `, name: "Петър Втори", email: P2 });
  t("the same ЕИК: the same neutral page, the same words — nothing said of the organisation", (await thanksOf()) === neutral);
  await go("/dev/persona?role=manager");
  await go("/registrations");
  const j2 = page.locator("[data-join]", { hasText: P2 });
  await waitFor(async () => (await j2.count()) === 1);
  t("PTS sees the request to join, «към» the organisation; it has an active administrator — a letter asked", (await j2.count()) === 1 && (await text(j2)).includes(ORG) && (await j2.getAttribute("data-join-has-admin")) === "1" && (await j2.locator("[data-join-letter]").getAttribute("required")) !== null);
  await j2.locator("[data-join-letter]").evaluate((el) => el.removeAttribute("required"));
  await j2.locator('[data-join-pts] button[type="submit"]').click();
  await waitFor(async () => (await j2.locator("[data-registration-error]").count()) === 1);
  t("…PTS without the letter: refused by the server — the administrator decides", /писмо|letter/.test(await text(j2.locator("[data-registration-error]"))));

  // the administrator decides it in the laboratory's portal
  await go(`/dev/persona?role=participant&user=${adminId}`);
  await go("/lab/joins");
  const req = page.locator("[data-join-request]", { hasText: P2 });
  await waitFor(async () => (await req.count()) === 1);
  t("the laboratory's portal: the request, its person; the invitation that goes on «Одобри» shown first (1.8)", (await req.count()) === 1 && (await text(req)).includes("Петър Втори") && /Покана за портала|Invitation to the PTS/.test(await text(req.locator("[data-join-invite]"))));
  await req.locator("[data-join-approve]").click();
  await waitFor(async () => (await page.locator("[data-joins-done]").count()) === 1);
  t("…approved: a user; the invitation said (no mail here: PTS sends it); the request gone", /е потребител|is a user/.test(await text(page.locator("[data-joins-done]"))) && /PTS/.test(await text(page.locator("[data-joins-done]"))) && (await page.locator("[data-join-request]", { hasText: P2 }).count()) === 0);
  await go("/dev/persona?role=manager");
  await go("/organizations");
  const ent2 = page.locator("[data-entity]", { hasText: ORG });
  await waitFor(async () => (await ent2.locator("[data-user]", { hasText: P2 }).count()) === 1);
  const p2Id = await userIdOf(ent2, P2);
  t("«Организации»: the joined person a user, invited", (await ent2.locator(`[data-user="${p2Id}"]`).getAttribute("data-user-role")) === "user" && (await ent2.locator(`[data-user="${p2Id}"]`).getAttribute("data-user-state")) === "invited");

  // ── another: PTS decides on the organisation's signed letter ──
  await register({ org: ORG, eik: EIK, name: "Иван Трети", email: P3 });
  await go("/registrations");
  const j3 = page.locator("[data-join]", { hasText: P3 });
  await waitFor(async () => (await j3.count()) === 1);
  await j3.locator("[data-join-letter]").setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% signed letter ${stamp}\n%%EOF\n`) });
  await j3.locator('[data-join-pts] button[type="submit"]').click();
  await waitFor(async () => /Одобрена от PTS|Approved by PTS/.test(await text(page.locator("[data-registrations-done]"))));
  t("PTS on the signed letter: approved", /Одобрена от PTS|Approved by PTS/.test(await text(page.locator("[data-registrations-done]"))));
  await go("/registrations");
  const letters = page.locator("[data-join-letters]");
  const href = await letters.locator("a", { hasText: /писмото|the letter/ }).first().getAttribute("href");
  const res = await page.request.get(BASE + href);
  t("…the letter kept — through its gate, never cached", res.status() === 200 && /application\/pdf/.test(res.headers()["content-type"] ?? "") && /private, no-store/.test(res.headers()["cache-control"] ?? "") && (await res.text()).includes(`signed letter ${stamp}`));
  t("…a letter of nothing: not found", (await page.request.get(BASE + "/registrations/letter/00000000-0000-4000-8000-000000000000")).status() === 404);
  t("PTS sees who waits for the invitation — the one let in on the letter", (await page.locator("[data-waiting-invite]").count()) === 1 && (await text(page.locator("[data-waiting-invite]"))).includes(P3));

  // the same e-mail again (another organisation): the same page
  await register({ org: `Друга ${stamp} ООД`, eik: eikOf(71), name: "Мария Админ", email: ADMIN });
  t("a repeated e-mail: the same neutral page, the same words", (await thanksOf()) === neutral);

  // ── PTS appoints the new user the administrator ──
  await go(`/dev/persona?role=participant&user=${p2Id}`); // accepts the invitation: active
  t("a user (not the administrator): no tab for the requests", (await page.locator('[data-participant-nav] a[href="/lab/joins"]').count()) === 0);
  await go("/dev/persona?role=manager");
  await go("/organizations");
  const ent3 = page.locator("[data-entity]", { hasText: ORG });
  const ap = ent3.locator(`[data-user-appoint="${p2Id}"]`);
  await waitFor(async () => (await ap.count()) === 1);
  await ap.locator("summary").click();
  t("the appointment shows the notice to the official e-mail first (1.8)", /Нов администратор на профила ви|A new administrator of your profile/.test(await text(ap)));
  await ap.locator(`[data-user-appoint-send="${p2Id}"]`).click();
  await waitFor(async () => (await ent3.locator(`[data-user="${p2Id}"]`).getAttribute("data-user-role")) === "admin");
  t("…appointed: the new administrator; the one before a user", (await ent3.locator(`[data-user="${p2Id}"]`).getAttribute("data-user-role")) === "admin" && (await ent3.locator(`[data-user="${adminId}"]`).getAttribute("data-user-role")) === "user");
  t("a notice to the official e-mail that did not go: «Изпрати отново» on the organisation (no mail here)", (await ent3.locator("[data-resend-official]").count()) >= 1);

  // ── each notice on record, to the official e-mail ──
  await go("/notices");
  const sent = await text(page.locator("[data-sent]"));
  t("on record: the profile made, the users joined (by the administrator, by PTS), the administrator changed — each to the official e-mail", ["profile.created", "profile.user_joined", "profile.admin_changed"].every((k) => sent.includes(k)) && (sent.match(/profile\.user_joined/g) ?? []).length >= 2 && sent.includes(OFFICIAL), sent.slice(0, 400));

  // ── a refusal, kept with its reason ──
  await register({ org: ORG2, eik: EIK2, name: "Отказан", email: `no${stamp}@lab-test.bg` });
  await go("/registrations");
  const c2 = page.locator("[data-registration]", { hasText: ORG2 });
  await waitFor(async () => (await c2.count()) === 1);
  await c2.locator("[data-registration-reject] summary").click();
  await c2.locator('[name="reason"]').fill("непълни данни");
  await c2.locator("[data-registration-reject-confirm]").click();
  await waitFor(async () => /Отказана|Refused/.test(await text(page.locator("[data-registrations-done]"))));
  await go("/registrations");
  const list = page.locator("[data-rejected-registrations]");
  const row = list.locator("tr", { hasText: ORG2 });
  t("refused: listed with its reason, kept six years", (await row.count()) === 1 && (await text(row)).includes("непълни данни") && (await text(row)).includes(String(new Date().getFullYear() + 6)));

  // ── the honeypot: the same page, nothing stored ──
  await register({ org: `Бот ${stamp}`, eik: eikOf(61), name: "Бот", email: `bot${stamp}@lab-test.bg`, extra: {} , expect: /register\/thanks/ }).catch(() => {});
  await go("/register");
  const f = page.locator("[data-register-form]");
  for (let i = 0; i < 40; i++) {
    await f.locator("[data-register-country]").selectOption("BG");
    if (await f.locator('button[type="submit"]').isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  for (const [k, val] of Object.entries({ orgName: `Капан ${stamp}`, eik: eikOf(67), address: "а", officialEmail: OFFICIAL, labName: "л", deliveryAddress: "д", contactPerson: "Капан", email: `trap${stamp}@lab-test.bg`, website: "http://spam" })) await f.locator(`[name="${k}"]`).fill(val);
  await Promise.all([page.waitForURL(/register\/thanks/, { timeout: 90000 }).catch(() => {}), f.locator('button[type="submit"]').click()]);
  t("the honeypot: the same page", (await thanksOf()) === neutral);
  await go("/registrations");
  t("…and nothing stored", (await page.locator("[data-registration]", { hasText: `Капан ${stamp}` }).count()) === 0 && (await page.locator("[data-registration]", { hasText: `Бот ${stamp}` }).count()) === 1);

  // ── the journal: the steps, never a name ──
  await go("/activity");
  await page.getByText(/new profile administrator/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const journal = await text(page.locator("main"));
  t("on record: the registration, its approval, the joins, the appointment — no name, no e-mail", /registration of an organisation received/i.test(journal) && /Registration approved/.test(journal) && /request to join approved/i.test(journal) && /new profile administrator/i.test(journal) && ![ADMIN, P2, P3, OFFICIAL, "Петър Втори", "Иван Трети", "Мария Админ", ORG, ORG2].some((x) => journal.includes(x)));

  // ── erased on request (4.7): its registrations go with it ──
  await go("/organizations");
  const gone = page.locator("[data-entity]", { hasText: ORG }).first();
  await gone.locator("[data-erase-entity] summary").click();
  const ef = gone.locator("[data-erase-entity] form");
  await ef.locator('[name="requestNo"]').fill(`ВХ-${stamp}`);
  await ef.locator('[name="requestDate"]').fill(new Date().toISOString().slice(0, 10));
  await ef.locator('[name="confirmed"]').check();
  await ef.locator('button[type="submit"]').click();
  await waitFor(async () => (await page.locator("[data-entity]", { hasText: ORG }).count()) === 0 || (await page.locator("[data-erase-error]").count()) > 0, 60);
  const eraseError = await text(page.locator("[data-erase-error]"));
  t("review: the profile erased on request", !eraseError && (await page.locator("[data-entity]", { hasText: ORG }).count()) === 0, eraseError);
  await go("/registrations");
  const after = await text(page.locator("main"));
  t("review: erased — its registrations and joins anonymised: no name, no e-mail of them left; the letter gone", !after.includes("Иван Трети") && !after.includes(P3) && !after.includes(P2) && (await page.request.get(BASE + href)).status() === 404);
} catch (e) {
  fail++;
  console.error("FAIL: crashed", e);
} finally {
  await browser.close();
}
console.log(`verify-registration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
