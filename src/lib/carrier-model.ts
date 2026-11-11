// Carrier offers (plan part 9.5; Реш. 128, О5). Pure.
//
// A participation outside the EU and the Balkans, on the final list, waits for its carrier («Изчаква
// избор на доставчик», 5.5). PTS enters the offers — each a carrier, a price, the days in transit, a
// note — and SENDS them: a notice held for a person to release (1.8). The laboratory sees and picks only
// the offers that notice carried, and only once it is released (9.5 review) — once; PTS may record a
// choice the laboratory sent by e-mail, and cancel a choice (with its reason) for another. An offer is
// withdrawn, never deleted — on record. The choice sets the participation's carrier (the state moves on)
// and its price is the delivery on the invoice (9.4) while that carrier stands.

import { parseCents } from "./commercial-model";

export const MAX_OFFERS = 5;
/** the carrier as the participation's courier holds it (60) */
export const OFFER_LIMITS = { carrier: 60, note: 200, days: 60 };

export interface CarrierOffer { id: string; carrier: string; cents: number; days?: number; note?: string; at: string; by: string; withdrawnAt?: string; withdrawnBy?: string }
export interface CarrierChoice { offerId: string; at: string; by: string; byPts?: boolean }
export interface CarrierRecord {
  offers: CarrierOffer[];
  /** the notice that carried the offers to the laboratory, and which offers — a change after it needs a new one */
  sent?: { noticeId?: string; offerIds: string[]; at: string };
  choice?: CarrierChoice;
  /** choices PTS cancelled — each with its reason */
  cancelled?: (CarrierChoice & { cancelledAt: string; cancelledBy: string; reason: string })[];
}
export type CarrierOffers = Record<string, CarrierRecord>;

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F​-‏﻿]/g, " ").replace(/\s+/g, " ").trim();
/** The offers standing — none withdrawn. */
export const liveOffers = (rec: CarrierRecord | undefined) => (rec?.offers ?? []).filter((o) => !o.withdrawnAt);

export type OfferProblem = "carrier" | "price" | "days" | "note" | "too-many" | "chosen";
/** An offer as PTS typed it. */
export function readOffer(input: { carrier: unknown; price: unknown; days?: unknown; note?: unknown }, rec: CarrierRecord | undefined):
  { ok: true; fields: Pick<CarrierOffer, "carrier" | "cents" | "days" | "note"> } | { ok: false; problem: OfferProblem } {
  if (rec?.choice) return { ok: false, problem: "chosen" };
  if (liveOffers(rec).length >= MAX_OFFERS) return { ok: false, problem: "too-many" };
  const carrier = clean(input.carrier);
  if (!carrier || [...carrier].length > OFFER_LIMITS.carrier) return { ok: false, problem: "carrier" };
  const cents = parseCents(clean(input.price));
  if (cents === null) return { ok: false, problem: "price" };
  const d = clean(input.days);
  let days: number | undefined;
  if (d) { if (!/^\d{1,2}$/.test(d) || Number(d) < 1 || Number(d) > OFFER_LIMITS.days) return { ok: false, problem: "days" }; days = Number(d); }
  const note = clean(input.note);
  if ([...note].length > OFFER_LIMITS.note) return { ok: false, problem: "note" };
  return { ok: true, fields: { carrier, cents, ...(days ? { days } : {}), ...(note ? { note } : {}) } };
}

/** The notice that carried the offers: released and not withheld — only then the laboratory sees them. */
export type SentNotice = { releasedAt?: string; withheldAt?: string } | null | undefined;
export const noticeOut = (n: SentNotice) => !!n?.releasedAt && !n.withheldAt;

/** The offers the laboratory sees and may pick: those the released notice carried, still standing, no
 *  choice made. */
export function offersForLab(rec: CarrierRecord | undefined, notice: SentNotice): CarrierOffer[] {
  if (!rec?.sent || rec.choice || !noticeOut(notice)) return [];
  const sent = new Set(rec.sent.offerIds);
  return liveOffers(rec).filter((o) => sent.has(o.id));
}

/** May this offer be chosen now? PTS: any standing offer of THIS participation, none chosen. The
 *  laboratory (`lab`): also one its released notice carried, and its carrier not set otherwise. */
export function chooseProblem(rec: CarrierRecord | undefined, offerId: string, lab?: { notice: SentNotice; courier: string | undefined }):
  "none" | "chosen" | "no-offer" | "not-sent" | "set-otherwise" | null {
  if (!rec || !liveOffers(rec).length) return "none";
  if (rec.choice) return "chosen";
  if (!liveOffers(rec).some((o) => o.id === offerId)) return "no-offer";
  if (lab) {
    if ((lab.courier ?? "").trim()) return "set-otherwise";
    if (!offersForLab(rec, lab.notice).some((o) => o.id === offerId)) return "not-sent";
  }
  return null;
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().slice(0, OFFER_LIMITS.carrier);
export const chosenOffer = (rec: CarrierRecord | undefined): CarrierOffer | undefined => (rec?.choice ? rec.offers.find((o) => o.id === rec.choice!.offerId) : undefined);

/** The chosen offer's price, by participation — the delivery on the invoice (9.4) — only while the
 *  participation's carrier is still that offer's (PTS changed it by hand: no offer's price, 9.5 review). */
export function chosenOfferCents(all: CarrierOffers | undefined, courierOf?: ReadonlyMap<string, string | undefined>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [pid, rec] of Object.entries(all ?? {})) {
    const o = chosenOffer(rec);
    if (!o) continue;
    if (courierOf && courierOf.has(pid) && norm(courierOf.get(pid)) !== norm(o.carrier)) continue;
    out.set(pid, o.cents);
  }
  return out;
}

export const OFFER_PROBLEM_TEXT: Record<OfferProblem | "none" | "no-offer" | "not-sent" | "set-otherwise" | "reason" | "no-one", { bg: string; en: string }> = {
  carrier: { bg: "превозвачът е задължителен, до 60 знака", en: "the carrier is required, 60 characters at most" },
  price: { bg: "цената не се разчита (напр. 85,50)", en: "the price does not read (e.g. 85.50)" },
  days: { bg: "дните за доставка са от 1 до 60", en: "the days in transit are 1 to 60" },
  note: { bg: "бележката е до 200 знака", en: "the note is 200 characters at most" },
  "too-many": { bg: "най-много пет оферти", en: "five offers at most" },
  chosen: { bg: "превозвачът вече е избран — промяна чрез PTS", en: "the carrier is chosen already — a change through PTS" },
  none: { bg: "няма оферти", en: "there are no offers" },
  "no-offer": { bg: "офертата не е намерена", en: "the offer is not found" },
  "not-sent": { bg: "тази оферта не ви е изпратена — изберете от изпратените", en: "this offer was not sent to you — choose from those sent" },
  "set-otherwise": { bg: "превозвачът вече е записан от PTS", en: "the carrier is recorded by PTS already" },
  reason: { bg: "напишете причината (поне 3 знака)", en: "write the reason (3 characters at least)" },
  "no-one": { bg: "в портала няма кого да уведомим — съобщете офертите на лабораторията пряко и запишете избора ѝ", en: "there is no one to tell in the portal — give the laboratory the offers directly and record its choice" },
};
