// Plan part 9.4 — the price (Реш. 153; Zadanie App. В): the participations of an application; grouped by
// the entity's ЕИК; the largest first (a tie — the earlier application); the first at the full price, the
// rest at the share — tested at 40 % (the plan's «done when»: a share other than 50); base + step × (n − 1);
// the characteristics that run only; the delivery (free / the MT·CY·IE add-on / own courier / by an offer);
// only after the applications close; the billing export and «Фактури».
import { readFileSync } from "node:fs";
import { participationSizes, deliveryCharge, priceAll, priceLater, pricesReady, priceText, calibrationSizes, groupKey, isOwnCourier } from "../src/lib/price-model.ts";
import { schemePrices, fixPrices } from "../src/lib/scheme-prices.ts";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullPrice, sharePrice } from "../src/lib/commercial-model.ts";
import { OWN_COURIER } from "../src/lib/lab-apply-model.ts";
import { BILLING_COLUMNS, billingRow } from "../src/lib/invoice-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

// base 100,00 €, step 40,00 €, the share 40 %, the add-on 25,50 €
const C = { base: 10000, step: 4000, sharePct: 40, addOnMtCyIe: 2550 };
t("the full price: base + step × (n − 1)", fullPrice(C, 1) === 10000 && fullPrice(C, 3) === 18000);
t("the share at 40 %: 40 % of the FULL price — on the base and the step alike (never 60 %)", sharePrice(C, 1) === 4000 && sharePrice(C, 3) === 7200 && sharePrice({ ...C, sharePct: 50 }, 3) === 9000);
t("an application's participations: counts 2·1 → two — of 2 and of 1 characteristic", JSON.stringify(participationSizes({ 0: 2, 1: 1 })) === "[2,1]" && JSON.stringify(participationSizes({ 0: 1, 1: 1, 2: 1 })) === "[3]" && JSON.stringify(participationSizes({ 0: 3 })) === "[1,1,1]" && participationSizes({}).length === 0);

const E1 = "131468980", E2 = "175074752";
const parts = [
  // entity 1: lab A applied first for 2 characteristics, lab B later for 3 — B is the larger: full
  { id: "a", code: "Z001", createdAt: "2026-11-01T08:00:00Z", eik: E1, country: "BG", applied: { 0: 1, 1: 1 }, selections: { 0: 1, 1: 1 } },
  { id: "b", code: "Z002", createdAt: "2026-11-02T08:00:00Z", eik: ` ${E1} `, country: "BG", applied: { 0: 1, 1: 1, 2: 1 }, selections: { 0: 1, 1: 1, 2: 1 } },
  // entity 2: one application, counts 2·1 — its first participation full, its second at the share
  { id: "c", code: "Z003", createdAt: "2026-11-01T09:00:00Z", eik: E2, country: "MT", applied: { 0: 2, 1: 1 }, selections: { 0: 2, 1: 1 } },
  // no ЕИК: alone — full; its own courier (typed any case) — no delivery
  { id: "d", code: "Z004", createdAt: "2026-11-03T08:00:00Z", country: "US", courier: "собствен куриер", applied: { 2: 1 }, selections: { 2: 1 } },
  // outside the EU and the Balkans: delivery by an offer (9.5) — no total
  { id: "e", code: "Z005", createdAt: "2026-11-03T09:00:00Z", eik: "US-999", country: "US", applied: { 0: 1 }, selections: { 0: 1 } },
];
const P = priceAll(C, parts);
const a = P.get("a")!, b = P.get("b")!, c = P.get("c")!, d = P.get("d")!, e = P.get("e")!;
t("grouped by the entity's ЕИК (its normal form): the one with more characteristics first — full; the other at the share (40 %)", b.lines.length === 1 && b.lines[0].kind === "full" && b.lines[0].cents === 18000 && a.lines[0].kind === "share" && a.lines[0].cents === 5600, JSON.stringify([a, b]));
t("an application's two participations: the first full, the second at the share", JSON.stringify(c.lines.map((l) => [l.kind, l.size, l.cents])) === JSON.stringify([["full", 2, 14000], ["share", 1, 4000]]));
t("delivery: Bulgaria free; Malta the add-on; the own courier nothing; outside — by an offer, no total", a.delivery === "free" && a.deliveryCents === 0 && a.totalCents === 5600 && c.delivery === "addon" && c.totalCents === 14000 + 4000 + 2550 && d.delivery === "own" && d.totalCents === 10000 && e.delivery === "offer" && e.totalCents === null);
const tie = priceAll(C, [{ id: "x", code: "Z010", createdAt: "2026-11-05T00:00:00Z", eik: E1, applied: { 0: 1 }, selections: { 0: 1 }, country: "BG" }, { id: "y", code: "Z011", createdAt: "2026-11-04T00:00:00Z", eik: E1, applied: { 1: 1 }, selections: { 1: 1 }, country: "BG" }]);
t("a tie in the number of characteristics: the EARLIER application is the first (full)", tie.get("y")!.lines[0].kind === "full" && tie.get("x")!.lines[0].kind === "share");
const tie2 = priceAll(C, [{ id: "x", code: "Z020", createdAt: "2026-11-05T00:00:00Z", eik: E1, applied: { 0: 1 }, selections: { 0: 1 }, country: "BG" }, { id: "y", code: "Z019", createdAt: "2026-11-05T00:00:00Z", eik: E1, applied: { 1: 1 }, selections: { 1: 1 }, country: "BG" }]);
t("review: …the same moment — then its code", tie2.get("y")!.lines[0].kind === "full" && tie2.get("x")!.lines[0].kind === "share");
// the provider's words: ordered by the characteristics APPLIED FOR, priced by those that RUN (review)
const ord = priceAll(C, [{ id: "A", code: "Z030", createdAt: "2026-11-01T00:00:00Z", eik: E1, country: "BG", applied: { 0: 1, 1: 1, 2: 1 }, selections: { 0: 1 } }, { id: "B", code: "Z031", createdAt: "2026-11-02T00:00:00Z", eik: E1, country: "BG", applied: { 0: 1, 1: 1 }, selections: { 0: 1, 1: 1 } }]);
t("review: ordered by the characteristics APPLIED FOR (A 3 — first, full at its 1 running: 100,00 €), priced by those that RUN (B 2 — the share: 56,00 €)", ord.get("A")!.lines[0].kind === "full" && ord.get("A")!.totalCents === 10000 && ord.get("B")!.lines[0].kind === "share" && ord.get("B")!.totalCents === 5600);
t("review: the group — the entity's country and its number's normal form: the same digits in Bulgaria and Serbia two groups; an empty number alone", groupKey({ id: "1", eik: "131 468-980", country: "bg" }) === groupKey({ id: "2", eik: "131468980", country: "BG" }) && groupKey({ id: "1", eik: "131468980", country: "BG" }) !== groupKey({ id: "2", eik: "131468980", country: "RS" }) && groupKey({ id: "1", eik: "-", country: "BG" }) === "own:1" && groupKey({ id: "2", eik: " ", country: "BG" }) === "own:2");
t("review: rounded to the cent, half up — base 123,45 €, step 10,01 €, the share 33,33 %", sharePrice({ base: 12345, step: 1001, sharePct: 33.33 }, 2) === 4448 && sharePrice({ base: 100, sharePct: 50.5 }, 1) === 51);
t("review: not linked to its laboratory (no copy) — no total, said why", (() => { const x = priceAll(C, [{ ...parts[0], linked: false }]).get("a")!; return x.totalCents === null && /свържете участието с лабораторията/.test(priceText(x, "bg")); })());
t("review: the own courier however typed", isOwnCourier(" Собствен Куриер ") && isOwnCourier(OWN_COURIER) && !isOwnCourier("Спиди"));
t("no base price — no price, never a guess", priceAll({}, [parts[0]]).get("a")!.totalCents === null);
t("a calibration application (no characteristics): each device a participation of one", JSON.stringify(calibrationSizes(3)) === "[1,1,1]" && priceAll(C, [{ id: "k", code: "Z020", country: "BG", applied: {}, selections: {}, calibration: 2 }]).get("k")!.totalCents === 10000 + 4000);
t("delivery by the country: the EU and the Balkans free (Greece «EL» too), MT/CY/IE the add-on, elsewhere an offer, none known — unknown", deliveryCharge("RS", "") === "free" && deliveryCharge("el", undefined) === "free" && deliveryCharge("CY", "") === "addon" && deliveryCharge("IE", "") === "addon" && deliveryCharge("TR", "") === "offer" && deliveryCharge("", "") === "unknown" && deliveryCharge("TR", OWN_COURIER) === "own");
t("the price in words — for PTS and the accountant", /пълна 2 хар\. 140,00 € \+ дял 1 хар\. 40,00 € \+ доставка 25,50 €/.test(priceText(c, "bg")) && /по оферта/.test(priceText(e, "bg")));
t("review: the free delivery is 5.5's list less MT, CY, IE (Greece «EL», Kosovo free)", deliveryCharge("EL", "") === "free" && deliveryCharge("XK", "") === "free" && deliveryCharge("MT", "") === "addon");
t("review: a deadline with its hour — ready from that minute; one that does not read — closed (as 9.2 reads it)", !pricesReady({ status: "open", dates: { applicationsDue: "2026-11-20T09:00" } }, Date.parse("2026-11-20T06:59:00Z")) && pricesReady({ status: "open", dates: { applicationsDue: "2026-11-20T09:00" } }, Date.parse("2026-11-20T07:01:00Z")) && pricesReady({ status: "open", dates: { applicationsDue: "20.11" } }, Date.now()));
// ── fixed at the second announcement; a later one against the fixed groups (review H1) ──
const later = priceLater(C, [{ group: groupKey({ id: "b", eik: E1, country: "BG" }), lines: [{ size: 3, kind: "full", cents: 18000 }] }], { id: "w", code: "Z040", eik: E1, country: "BG", applied: { 0: 1, 1: 1, 2: 1, 3: 1 }, selections: { 0: 1, 1: 1, 2: 1, 3: 1 } });
const alone = priceLater(C, [], { id: "w2", code: "Z041", eik: E2, country: "BG", applied: { 0: 2 }, selections: { 0: 2 } });
t("review: priced after the fixing — its group has a full price: the share (even the larger one); none — its first full", later.lines.every((l) => l.kind === "share") && later.totalCents === sharePrice(C, 4) && alone.lines.map((l) => l.kind).join() === "full,share");
const LIST = "2026-11-20T10:00:00.000Z";
const mk = (id: string, code: string, at: string, sel: Record<string, number>, standing: unknown = null) => ({ id, schemeId: "S", code, createdAt: at, participations: 1, status: "applied", selections: sel, characteristics: Object.keys(sel).map(Number), standing } as never);
const pa = mk("pa", "T01", "2026-11-01T00:00:00Z", { 0: 1, 1: 1 }), pb = mk("pb", "T02", "2026-11-02T00:00:00Z", { 0: 1 }), pr = mk("pr", "T03", "2026-11-03T00:00:00Z", { 0: 1 }, { state: "refused", at: "", by: "" }), pw = mk("pw", "T04", "2026-11-04T00:00:00Z", { 0: 1, 1: 1, 2: 1 });
const copies = new Map([["pa", { entity: { eik: E1, country: "BG" } }], ["pb", { entity: { eik: E1, country: "BG" } }], ["pr", { entity: { eik: E1, country: "BG" } }], ["pw", { entity: { eik: E1, country: "BG" } }]]);
const sch = { id: "S", status: "running", parameters: [{}, {}, {}], commercial: C, lifecycle: { acts: [{ act: "announce", at: "", by: "", day: "", from: "open", to: "running" }, { act: "announce2", at: LIST, by: "", day: "", from: "running", to: "running", final: { runs: [0, 1, 2], dropped: [], participants: ["pa", "pb"], waitlist: ["pw"] } }] }, commercial2: undefined } as never;
const fixedNow = fixPrices(sch, [pa, pb, pr, pw], copies, LIST, ["pa", "pb"]);
t("review: the fixing keeps no ЕИК (never beside a code in the coded record)", Object.values(fixedNow.prices).every((x) => x.group === "") && !JSON.stringify(fixedNow).includes(E1));
const withFixed = { ...(sch as object), pricesFixed: fixedNow } as never;
const nowPr = schemePrices(withFixed, [pa, pb, pr, pw], copies, Date.now());
t("review: the fixed prices stand; the refused and the waiting one left out", nowPr.state === "fixed" && nowPr.prices.get("pa")!.lines[0].kind === "full" && nowPr.prices.get("pb")!.lines[0].kind === "share" && !nowPr.prices.has("pr") && !nowPr.prices.has("pw"));
const changedC = schemePrices({ ...(withFixed as object), commercial: { ...C, sharePct: 50 } } as never, [pa, pb], copies, Date.now());
t("review: the scheme's share changed after the fixing — the invoiced price unchanged", changedC.prices.get("pb")!.totalCents === nowPr.prices.get("pb")!.totalCents);
const admitted = schemePrices({ ...(withFixed as object), waitlistAdmitted: [{ participantId: "pw", at: "", by: "", listAt: LIST }] } as never, [pa, pb, pr, pw], copies, Date.now());
t("review: admitted from the waiting list — priced against its group (a full price there already: the share), marked «later»", admitted.prices.get("pw")!.later === true && admitted.prices.get("pw")!.lines[0].kind === "share" && admitted.prices.get("pa")!.lines[0].kind === "full");
const stepped = schemePrices({ ...(withFixed as object), lifecycle: { acts: [{ act: "announce", at: "", by: "", day: "", from: "open", to: "running" }] } } as never, [pa, pb], copies, Date.now());
t("review: a step back undoes the list — and the fixing: a preview again", stepped.state === "preview");
t("a scheme not held — no prices; before the deadline — none", schemePrices({ ...(sch as object), status: "not_held" } as never, [pa], copies, Date.now()).state === "not-held" && schemePrices({ ...(sch as object), status: "open", lifecycle: undefined } as never, [pa], copies, Date.now()).state === "not-ready");
t("only after the applications close — never at submission (Zadanie App. В)", !pricesReady({ status: "open" }, Date.now()) && !pricesReady({ status: "open", dates: { applicationsDue: "2099-01-01" } }, Date.now()) && pricesReady({ status: "open", dates: { applicationsDue: "2020-01-01" } }, Date.now()) && pricesReady({ status: "open", applicationsClosed: { at: "", by: "" } }, Date.now()) && pricesReady({ status: "running" }, Date.now()) && !pricesReady({ status: "draft" }, Date.now()) && !pricesReady({ status: "not_held" }, Date.now()));
const row = billingRow({ order: 1, code: "X", characteristics: "", objects: 1, price: { total: "202.50", how: "пълна …" } });
t("the billing export: the amount with a point, and how it was computed", (BILLING_COLUMNS as readonly string[]).includes("Цена, €") && (BILLING_COLUMNS as readonly string[]).includes("Цена — как е сметната") && row["Цена, €"] === "202.50" && row["Цена — как е сметната"] === "пълна …");
const route = src("app/invoices/export/route.ts");
const inv = src("app/invoices/page.tsx");
t("review: ONE reading — the export and «Фактури» both through schemePrices (the groups from the copies)", /schemePrices\(s, await listParticipants\(id\), snaps, schemeNowMs\(s\)\)/.test(route) && /schemePrices\(chosen, await listParticipants\(chosen\.id\), snaps, schemeNowMs\(chosen\)\)/.test(inv));
t("«Фактури»: the price only to who sees the names in the scheme (the copies opened on record)", /mayNow\("names\.view", chosen\.id\)/.test(inv) && /openParticipationSnapshots\(\{ actor: await actorNow\(\), purpose: "names\.view" \}/.test(inv));
const actions = src("lib/actions.ts");
t("review: the second announcement fixes the prices with its list — or says it did not", /fixPrices\(\{ \.\.\.cur, lifecycle:/.test(actions) && /the prices NOT fixed/.test(actions));
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const x = join(dir, f); return statSync(x).isDirectory() ? walk(x) : [x]; });
const labTree = walk(fileURLToPath(new URL("../src/app/lab", import.meta.url)));
t("review: never to a laboratory — no file of the laboratory's portal reads the prices", labTree.length > 10 && labTree.every((f) => !/price-model|scheme-prices|priceAll|schemePrices/.test(readFileSync(f, "utf8"))));

console.log(`prices.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
