// Plan part 9.5 — carrier offers (Реш. 128): an offer read; at most five; withdrawn only before a choice;
// the choice once, an offer of THAT participation; the chosen price the delivery on the invoice (9.4 —
// the preview and a price fixed before the choice); the wiring (PTS's actions in the scheme, the
// laboratory's own participation, the offers to the laboratory only once sent, held for release).
import { readFileSync } from "node:fs";
import { readOffer, chooseProblem, chosenOfferCents, chosenOffer, offersForLab, liveOffers, MAX_OFFERS, type CarrierRecord } from "../src/lib/carrier-model.ts";
import { codedScheme } from "../src/lib/round-export.ts";
import { schemePrices } from "../src/lib/scheme-prices.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

const r = readOffer({ carrier: "  DHL  Express ", price: "85,50", days: "4", note: "до вратата" }, undefined);
t("an offer read: the carrier, the price in cents, the days, the note", r.ok && r.fields.carrier === "DHL Express" && r.fields.cents === 8550 && r.fields.days === 4 && r.fields.note === "до вратата");
const bad = (i: Record<string, unknown>, rec?: CarrierRecord) => { const x = readOffer({ carrier: "UPS", price: "10", ...i } as never, rec); return x.ok ? "ok" : x.problem; };
t("…refused: no carrier, a price that does not read, days out of 1–60, a long note", bad({ carrier: " " }) === "carrier" && bad({ price: "десет" }) === "price" && bad({ days: "0" }) === "days" && bad({ days: "61" }) === "days" && bad({ note: "x".repeat(201) }) === "note" && bad({}) === "ok" && bad({ days: "" }) === "ok");
const offer = (id: string, cents = 1000) => ({ id, carrier: `C${id}`, cents, at: "", by: "" });
const five: CarrierRecord = { offers: Array.from({ length: MAX_OFFERS }, (_, i) => offer(String(i))) };
t("…at most five; none once a carrier is chosen", bad({}, five) === "too-many" && bad({}, { offers: [offer("a")], choice: { offerId: "a", at: "", by: "" } }) === "chosen");
const rec: CarrierRecord = { offers: [offer("a", 8550), offer("b", 9900)] };
t("the choice: an offer of THIS participation, once", chooseProblem(rec, "a") === null && chooseProblem(rec, "zz") === "no-offer" && chooseProblem({ ...rec, choice: { offerId: "a", at: "", by: "" } }, "b") === "chosen" && chooseProblem(undefined, "a") === "none" && chooseProblem({ offers: [] }, "a") === "none");
const all = { p1: { ...rec, choice: { offerId: "b", at: "", by: "" } }, p2: rec };
t("the chosen offer's price, by participation — none until chosen", chosenOfferCents(all).get("p1") === 9900 && !chosenOfferCents(all).has("p2") && chosenOffer(all.p1)?.carrier === "Cb");
t("review: …only while the participation's carrier is still that offer's (PTS changed it by hand — no offer's price)", chosenOfferCents(all, new Map([["p1", "Cb"]])).get("p1") === 9900 && !chosenOfferCents(all, new Map([["p1", "FedEx"]])).has("p1"));
// ── what the laboratory sees: only what the RELEASED notice carried (1.8; review) ──
const sentRec: CarrierRecord = { offers: [offer("a", 8550), offer("b", 9900), offer("c", 7000)], sent: { noticeId: "n1", offerIds: ["a", "b"], at: "" } };
const released = { releasedAt: "2026-11-11T10:00:00Z" };
t("review: the laboratory sees nothing while the notice is held, nor once withheld", offersForLab(sentRec, null).length === 0 && offersForLab(sentRec, {}).length === 0 && offersForLab(sentRec, { releasedAt: "x", withheldAt: "y" }).length === 0);
t("review: …released — only the offers that notice carried (one added after it — not), none withdrawn, none once chosen", offersForLab(sentRec, released).map((o) => o.id).join() === "a,b" && offersForLab({ ...sentRec, offers: sentRec.offers.map((o) => (o.id === "b" ? { ...o, withdrawnAt: "x" } : o)) }, released).map((o) => o.id).join() === "a" && offersForLab({ ...sentRec, choice: { offerId: "a", at: "", by: "" } }, released).length === 0 && offersForLab({ offers: sentRec.offers }, released).length === 0);
t("review: the laboratory's choice — an offer it was sent, released, its carrier not set otherwise", chooseProblem(sentRec, "a", { notice: released, courier: "" }) === null && chooseProblem(sentRec, "c", { notice: released, courier: "" }) === "not-sent" && chooseProblem(sentRec, "a", { notice: null, courier: "" }) === "not-sent" && chooseProblem(sentRec, "a", { notice: released, courier: "Собствен куриер" }) === "set-otherwise" && chooseProblem(sentRec, "c") === null);
t("review: a withdrawn offer stays on record — never counted, never chosen", liveOffers({ offers: [offer("a"), { ...offer("b"), withdrawnAt: "x" }] }).length === 1 && chooseProblem({ offers: [offer("a"), { ...offer("b"), withdrawnAt: "x" }] }, "b") === "no-offer" && bad({}, { offers: [...Array.from({ length: 4 }, (_, i) => offer(String(i))), { ...offer("w"), withdrawnAt: "x" }] }) === "ok");
const exported = codedScheme({ id: "S", carrierOffers: { p1: { offers: [{ ...offer("a"), carrier: "DHL Secret", note: "до вратата", by: "pts@x" }], sent: { noticeId: "n1", offerIds: ["a"], at: "t" }, choice: { offerId: "a", at: "t2", by: "entityuser:u1" } } } } as never) as { carrierOffers: Record<string, unknown> };
t("review: the round export's coded part — the amounts and moments; never the carrier, the note or who chose", !JSON.stringify(exported.carrierOffers).includes("DHL") && !JSON.stringify(exported.carrierOffers).includes("вратата") && !JSON.stringify(exported.carrierOffers).includes("entityuser") && !JSON.stringify(exported.carrierOffers).includes("n1") && JSON.stringify(exported.carrierOffers).includes("1000"));

// ── on the invoice (9.4) ──
const C = { base: 10000, step: 4000, sharePct: 40 };
const part = { id: "p1", schemeId: "S", code: "T01", createdAt: "2026-11-01T00:00:00Z", participations: 1, status: "applied", selections: { 0: 1 }, characteristics: [0], standing: null, courier: "Cb" } as never;
const partNoCarrier = { ...(part as object), courier: "" } as never;
const copies = new Map([["p1", { entity: { eik: "US-1", country: "US" } }]]);
const LIST = "2026-11-20T10:00:00.000Z";
const base = { id: "S", status: "running", parameters: [{}], commercial: C, lifecycle: { acts: [{ act: "announce", at: "", by: "", day: "", from: "open", to: "running" }, { act: "announce2", at: LIST, by: "", day: "", from: "running", to: "running", final: { runs: [0], dropped: [], participants: ["p1"] } }] } };
const before = schemePrices(base as never, [partNoCarrier], copies, Date.now());
t("outside the EU and the Balkans, no choice yet: the delivery by an offer — no total", before.prices.get("p1")!.delivery === "offer" && before.prices.get("p1")!.totalCents === null);
const chosen = schemePrices({ ...base, carrierOffers: all } as never, [part], copies, Date.now());
t("…chosen: the offer's price on the invoice — the total complete (the scheme's own record read)", chosen.prices.get("p1")!.deliveryCents === 9900 && chosen.prices.get("p1")!.totalCents === 10000 + 9900);
const fixedBefore = { listAt: LIST, at: LIST, prices: { p1: { ...before.prices.get("p1")!, group: "" } } };
const fixedThenChosen = schemePrices({ ...base, pricesFixed: fixedBefore, carrierOffers: all } as never, [part], copies, Date.now());
t("…a price fixed before the choice keeps its lines and takes the delivery chosen after", fixedThenChosen.state === "fixed" && fixedThenChosen.prices.get("p1")!.lines[0].cents === 10000 && fixedThenChosen.prices.get("p1")!.totalCents === 19900);

// ── the wiring ──
const actions = src("lib/actions.ts");
const blk = actions.slice(actions.indexOf("// ── Carrier offers (plan part 9.5"), actions.indexOf("// ── The coding act"));
t("PTS: every carrier action in THIS scheme (participants.manage), on a participation of the final list", (blk.match(/await requireCap\("participants\.manage", schemeId\)/g) ?? []).length === 5 && /if \(!inFinalRound\(scheme, part\) \|\| !currentFinalList\(scheme\)\)/.test(blk));
t("review: an offer withdrawn — kept (who, when), only before a choice; any change of the offers undoes the sending", /withdrawnAt: at, withdrawnBy: by/.test(blk) && (blk.match(/sent: undefined/g) ?? []).length >= 3);
t("review: the sending — a notice held for release; the earlier one still held is withheld; the notice and the offers it carried kept; no one to tell — said", /if \(rec\?\.sent\?\.noticeId\) await decideNotice\(rec\.sent\.noticeId, "withhold", by\)/.test(blk) && /sent: \{ noticeId: n\.id, offerIds: live\.map\(\(o\) => o\.id\), at \}/.test(blk) && /if \(!n\) return say95\("no-one"\)/.test(blk) && !/releasedBy(Writer|Template)/.test(src("lib/notify-events.ts").slice(src("lib/notify-events.ts").indexOf("export async function notifyCarrierOffers"), src("lib/notify-events.ts").indexOf("export async function notifyCarrierChosen"))));
t("the laboratory: its OWN participation (its viewer's rows), only what its released notice carried, its carrier not set otherwise; PTS told", /const viewer = await participantViewer\(\);[\s\S]*viewer\.rows\.find\(\(r\) => r\.participantId === String\(participantId\)\)/.test(blk) && /recordCarrierChoice\(t\.scheme, t\.part, String\(offerId\), by, false, viewer\.actor, \{ notice \}\)/.test(blk) && /await notifyCarrierChosen\(/.test(blk));
t("review: the choice read back (one made at once elsewhere wins); a carrier that cannot be set gives the choice back", /const back = \(await getScheme\(scheme\.id\)\)\?\.carrierOffers\?\.\[part\.id\]\?\.choice;/.test(blk) && /choice: undefined/.test(blk.slice(blk.indexOf("the carrier was not set"))));
t("review: a change through PTS — the choice cancelled with its reason (kept), the carrier cleared, waiting again", /cancelled: \[\.\.\.\(rec\.cancelled \?\? \[\]\), \{ \.\.\.rec\.choice, cancelledAt:/.test(blk) && /updateParticipant\(t\.part\.id, \{ courier: "" \}/.test(blk));
t("…a choice recorded by PTS is marked so", /byPts \? \{ byPts: true \} : \{\}/.test(blk));
const lab = src("app/lab/p/[id]/page.tsx");
t("review: the laboratory's page — the offers only as the RELEASED notice carried them; the choice shown while its carrier stands", /const sentOffers = offersForLab\(carrierRec, sentNotice\)/.test(lab) && /getNotice\(carrierRec\.sent\.noticeId\)/.test(lab) && /data-carrier-chosen-lab/.test(lab) && /<CarrierChoice /.test(lab));
t("review: PTS's «Участници» — the panel wherever the delivery is by an offer (a hand-typed carrier too)", /reveal && canManage && !out && listed === true && \(carrierRec \|\| needsCarrierChoice\(/.test(src("app/schemes/[id]/participants/page.tsx")));

console.log(`carrier.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
