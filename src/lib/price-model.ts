// The price of a participation (plan part 9.4; Реш. 153; Zadanie App. В). Pure.
//
// Zadanie App. В: «Заявките се групират по ЕИК и се подреждат по брой заявени характеристики в
// намаляващ ред. Първата получава пълна цена, останалите — процента. При равен брой характеристики за
// първа се счита по-рано подадената заявка. Групирането и подреждането се извършват след затварянето
// на срока за заявяване, не при подаване.» The share is what part of the FULL price is paid (default
// 50; applies to the base and to the step alike — 3.7's sharePrice).
//
// A participation (5.1) is one set of characteristics: an application with counts per characteristic
// holds as many participations as its largest count — the i-th has the characteristics counted at least
// i times. ORDERED by the characteristics APPLIED FOR (the provider's words — «заявени»); PRICED by those
// that run (after the final list, 5.2): base + step × (n − 1). Delivery: free inside the EU — but Malta,
// Cyprus and Ireland, which pay the scheme's add-on — and the Balkans; outside them, by an offer (9.5);
// the laboratory's own courier — the participation only.
//
// FIXED at the second announcement (9.4 review): an invoiced price never changes by itself. A
// participation priced after it — admitted from the waiting list (9.3), or entered late — is priced
// against the fixed groups: its group already has a full price — the share; else the full. Before the
// final list the prices are a preview. A step back undoes the list — and the fixing.

import { fullPrice, sharePrice, fmtEur, type Commercial } from "./commercial-model";
import { OWN_COURIER } from "./lab-apply-model";
import { deadlineMs } from "./scheme-dates";
import { eikKey } from "./entities-model";
import { EU_AND_BALKANS } from "./participation-state-model";
import type { Selections } from "./application-model";

/** The participations of one application: each its characteristics' count, largest first. */
export function participationSizes(sel: Selections): number[] {
  const counts = Object.values(sel).filter((n) => Number.isInteger(n) && n > 0);
  const max = counts.length ? Math.max(...counts) : 0;
  return Array.from({ length: max }, (_, i) => counts.filter((c) => c >= i + 1).length);
}

/** The participations of a calibration application (no characteristics): its count, each one device —
 *  priced as one characteristic. */
export const calibrationSizes = (participations: number) => Array.from({ length: Math.max(1, Math.min(99, Math.floor(participations) || 1)) }, () => 1);

/** MT, CY, IE pay the add-on; the rest of the EU and the Balkans — free (the one list of 5.5, so the two
 *  never drift apart); elsewhere an offer. */
const ADDON = new Set(["MT", "CY", "IE"]);
const FREE = new Set([...EU_AND_BALKANS].filter((c) => !ADDON.has(c)));
export type DeliveryCharge = "free" | "addon" | "offer" | "own" | "unknown";
/** The laboratory's own courier — however PTS typed it (9.4 review). */
export const isOwnCourier = (courier: string | undefined) => (courier ?? "").trim().toLowerCase() === OWN_COURIER.toLowerCase();
export function deliveryCharge(country: string | undefined, courier: string | undefined): DeliveryCharge {
  if (isOwnCourier(courier)) return "own";
  const c = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "unknown";
  if (ADDON.has(c)) return "addon";
  if (FREE.has(c)) return "free";
  return "offer";
}

export interface PriceInput {
  /** the participation's id (one application) */
  id: string;
  /** the legal entity's country and registration number — the group (Zadanie App. В); none: alone */
  eik?: string;
  country?: string;
  /** when it was entered — the tie (an earlier one first) */
  createdAt?: string;
  code: string;
  /** what was applied for — the ORDER */
  applied: Selections;
  /** what it is billed for — after the final list, the characteristics that run — the PRICE */
  selections: Selections;
  /** a calibration scheme's application: its number of participations (no characteristics) */
  calibration?: number;
  courier?: string;
  /** linked to its laboratory (the copy, 4.5) — else its group cannot be known: no total */
  linked?: boolean;
}

export interface PriceLine { size: number; kind: "full" | "share"; cents: number | null }
export interface Price { id: string; group: string; lines: PriceLine[]; delivery: DeliveryCharge; deliveryCents: number | null; totalCents: number | null; linked: boolean }

/** The group: the entity's country and its number's normal form (entities are one per both — 4.1); a
 *  number with no letter or digit, or none — alone. */
export const groupKey = (p: Pick<PriceInput, "id" | "eik" | "country">) => {
  const k = p.eik ? eikKey(p.eik) : "";
  return k ? `${(p.country ?? "").trim().toUpperCase()}:${k}` : `own:${p.id}`;
};

/** An application's participations: (applied for, billed) per participation, in order. */
function sets(p: PriceInput): { applied: number; billed: number }[] {
  if (p.calibration !== undefined) return calibrationSizes(p.calibration).map(() => ({ applied: 1, billed: 1 }));
  const applied = participationSizes(p.applied);
  const billedCounts = Object.values(p.selections).filter((n) => Number.isInteger(n) && n > 0);
  return applied.map((a, i) => ({ applied: a, billed: billedCounts.filter((c) => c >= i + 1).length })).filter((x) => x.billed > 0);
}

function finish(c: Commercial | undefined, pr: Price, courier: string | undefined, country: string | undefined, offerCents?: number | null): Price {
  pr.lines.sort((a, b) => (a.kind === b.kind ? b.size - a.size : a.kind === "full" ? -1 : 1));
  pr.delivery = deliveryCharge(country, courier);
  pr.deliveryCents = pr.delivery === "free" || pr.delivery === "own" ? 0 : pr.delivery === "addon" ? c?.addOnMtCyIe ?? null : pr.delivery === "offer" ? offerCents ?? null : null;
  const parts = [...pr.lines.map((l) => l.cents), pr.deliveryCents];
  pr.totalCents = pr.linked && pr.lines.length && parts.every((x) => x !== null) ? (parts as number[]).reduce((a, b) => a + b, 0) : null;
  return pr;
}

/** Every participation's price — grouped by the entity; in each group the participations by the
 *  characteristics APPLIED FOR (largest first; a tie — the earlier application, then its code); the
 *  first pays the full price, the rest the share — each priced by the characteristics that RUN. A total
 *  is null where a price is not set, the delivery is by an offer not chosen (9.5), unknown, or the
 *  participation is not linked to its laboratory. `offers` — the delivery chosen (9.5), by participation. */
export function priceAll(c: Commercial | undefined, parts: readonly PriceInput[], offers: ReadonlyMap<string, number> = new Map()): Map<string, Price> {
  const out = new Map<string, Price>();
  const groups = new Map<string, { p: PriceInput; applied: number; billed: number; idx: number }[]>();
  for (const p of parts) {
    const g = groupKey(p);
    const list = groups.get(g) ?? [];
    sets(p).forEach((x, idx) => list.push({ p, ...x, idx }));
    groups.set(g, list);
    out.set(p.id, { id: p.id, group: g, lines: [], delivery: "unknown", deliveryCents: null, totalCents: null, linked: p.linked !== false });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.applied - a.applied || (a.p.createdAt ?? "￿").localeCompare(b.p.createdAt ?? "￿") || a.p.code.localeCompare(b.p.code) || a.idx - b.idx);
    list.forEach((x, i) => out.get(x.p.id)!.lines.push({ size: x.billed, kind: i === 0 ? "full" : "share", cents: i === 0 ? fullPrice(c, x.billed) : sharePrice(c, x.billed) }));
  }
  for (const p of parts) finish(c, out.get(p.id)!, p.courier, p.country, offers.get(p.id));
  return out;
}

/** A participation priced AFTER the prices were fixed (admitted from the waiting list, entered late):
 *  against the fixed groups — its group has a full price already: all its participations at the share;
 *  else its first at the full. */
export function priceLater(c: Commercial | undefined, fixed: readonly Pick<Price, "group" | "lines">[], p: PriceInput, offerCents?: number | null): Price {
  const g = groupKey(p);
  const hasFull = fixed.some((f) => f.group === g && f.lines.some((l) => l.kind === "full"));
  const pr: Price = { id: p.id, group: g, lines: [], delivery: "unknown", deliveryCents: null, totalCents: null, linked: p.linked !== false };
  sets(p).sort((a, b) => b.applied - a.applied).forEach((x, i) => {
    const full = !hasFull && i === 0;
    pr.lines.push({ size: x.billed, kind: full ? "full" : "share", cents: full ? fullPrice(c, x.billed) : sharePrice(c, x.billed) });
  });
  return finish(c, pr, p.courier, p.country, offerCents);
}

/** Are the prices to be computed now (Zadanie App. В: after the applications close — «не при
 *  подаване»)? The deadline passed (a deadline that does not read — closed, as 9.2 reads it), PTS
 *  closed them by hand, or the scheme runs on. Never for a draft or a scheme not held. */
export function pricesReady(s: { status: string; applicationsClosed?: unknown; dates?: { applicationsDue?: string } }, nowMs: number): boolean {
  if (s.status === "draft" || s.status === "not_held") return false;
  if (s.status !== "open") return true;
  if (s.applicationsClosed) return true;
  const raw = s.dates?.applicationsDue;
  if (!raw) return false;
  const due = deadlineMs(raw);
  return due === null || nowMs > due;
}

/** The prices fixed at the second announcement — kept on the scheme, by its moment. */
export interface FixedPrices { listAt: string; at: string; prices: Record<string, Price> }

/** A price in words, for PTS and the accountant: «пълна 2 хар. 140,00 € + дял 1 хар. 40,00 € + доставка 0,00 €». */
export function priceText(p: Price, lang: "bg" | "en"): string {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  if (!p.linked) return L("свържете участието с лабораторията (4.5) — групата по ЕИК не е известна", "link the participation to its laboratory (4.5) — its group by ЕИК is not known");
  const money = (c: number | null) => (c === null ? L("— (няма цена)", "— (no price)") : fmtEur(c, lang));
  const lines = p.lines.map((l) => `${l.kind === "full" ? L("пълна", "full") : L("дял", "share")} ${l.size} ${L("хар.", "char.")} ${money(l.cents)}`);
  const del = p.delivery === "offer" ? (p.deliveryCents === null ? L("доставка — по оферта (9.5)", "delivery — by an offer (9.5)") : `${L("доставка по оферта", "delivery by the offer")} ${money(p.deliveryCents)}`)
    : p.delivery === "unknown" ? L("доставка — няма държава", "delivery — no country")
    : p.delivery === "own" ? L("доставка — собствен куриер, 0,00 €", "delivery — own courier, 0.00 €")
    : `${L("доставка", "delivery")} ${money(p.deliveryCents)}`;
  return [...lines, del].join(" + ");
}
