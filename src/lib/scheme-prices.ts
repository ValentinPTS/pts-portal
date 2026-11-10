// The prices of a scheme's participations, as PTS's pages and the billing export read them (plan part
// 9.4; Реш. 153). Pure — one reading for «Фактури» and the export (9.4 review).
//
// Before the applications close — none. Then a PREVIEW, until the second announcement FIXES them (kept
// on the scheme — no ЕИК in it: the groups are worked out again from the copies when needed). After it,
// a participation the fixing did not price (admitted from the waiting list, entered late) is priced
// against the fixed groups (lib/price-model priceLater). The waiting ones (9.3) are left out until
// admitted; one not linked to its laboratory (4.5) has no total — its group is not known.

import { priceAll, priceLater, pricesReady, groupKey, type Price, type PriceInput, type FixedPrices } from "./price-model";
import { inFinalRound, currentFinalList } from "./announcement-model";
import { currentSecondAnnouncement } from "./lifecycle-model";
import { billedSelections } from "./invoice-model";
import { selectionsOf } from "./application-model";
import { waitingOf } from "./waitlist-model";
import type { Scheme, CodedParticipant } from "./types";

type Copy = { entity: { eik: string; country: string } };

/** The price input of one participation — its group from its copy (none: not linked). */
export function priceInputOf(s: Pick<Scheme, "parameters" | "status" | "lifecycle" | "waitlistAdmitted">, p: CodedParticipant, copy: Copy | undefined): PriceInput {
  const n = s.parameters.length;
  const final = currentFinalList(s);
  return {
    id: p.id, code: p.code, createdAt: p.createdAt, eik: copy?.entity.eik, country: copy?.entity.country, courier: p.courier, linked: !!copy,
    applied: n ? selectionsOf(p, n) : {}, selections: n ? billedSelections(p, final?.runs, n) : {}, ...(n ? {} : { calibration: p.participations }),
  };
}

/** The fixing at the second announcement — the prices of the participations on its list. */
export function fixPrices(s: Scheme, parts: readonly CodedParticipant[], copies: ReadonlyMap<string, Copy>, listAt: string, listed: readonly string[]): FixedPrices {
  const going = parts.filter((p) => listed.includes(p.id));
  const all = priceAll(s.commercial, going.map((p) => priceInputOf(s, p, copies.get(p.id))));
  // no group key kept — it would name the entity's number beside a code in the coded record
  return { listAt, at: new Date().toISOString(), prices: Object.fromEntries([...all].map(([id, pr]) => [id, { ...pr, group: "" }])) };
}

export type PricesState = "not-held" | "not-ready" | "preview" | "fixed";

/** The prices now — `offers`: the delivery chosen (9.5), by participation. */
export function schemePrices(s: Scheme, parts: readonly CodedParticipant[], copies: ReadonlyMap<string, Copy>, nowMs: number, offers: ReadonlyMap<string, number> = new Map()):
  { state: PricesState; prices: Map<string, Price & { later?: boolean }> } {
  if (s.status === "not_held") return { state: "not-held", prices: new Map() };
  if (!pricesReady(s, nowMs)) return { state: "not-ready", prices: new Map() };
  const waiting = new Set(waitingOf(s, parts));
  const going = parts.filter((p) => inFinalRound(s, p) && !waiting.has(p.id));
  const fixed = s.pricesFixed && currentFinalList(s) && s.pricesFixed.listAt === currentSecondAnnouncement(s)?.at ? s.pricesFixed : null;
  if (!fixed) return { state: "preview", prices: priceAll(s.commercial, going.map((p) => priceInputOf(s, p, copies.get(p.id))), offers) };
  // the fixed groups, worked out again from the copies — every participation the fixing priced
  const fixedGroups = parts.filter((p) => fixed.prices[p.id]).map((p) => ({ group: groupKey(priceInputOf(s, p, copies.get(p.id))), lines: fixed.prices[p.id].lines }));
  const out = new Map<string, Price & { later?: boolean }>();
  for (const p of going) {
    const f = fixed.prices[p.id];
    if (f) {
      // a delivery by an offer chosen after the fixing (9.5) — its amount, the rest as fixed
      const off = offers.get(p.id);
      const withOffer = f.delivery === "offer" && f.deliveryCents === null && off !== undefined
        ? { ...f, deliveryCents: off, totalCents: f.linked && f.lines.every((l) => l.cents !== null) ? f.lines.reduce((a, l) => a + (l.cents ?? 0), 0) + off : null }
        : f;
      out.set(p.id, withOffer);
    } else out.set(p.id, { ...priceLater(s.commercial, fixedGroups, priceInputOf(s, p, copies.get(p.id)), offers.get(p.id)), later: true });
  }
  return { state: "fixed", prices: out };
}
