// Delivery and receipt (plan part 5.6; spec §5.3, §8.4, Q8; Реш. 79, 127, 154; D18). Pure.
//
// What travels and what arrives, per participation — kept on the scheme (JSONB
// `deliveries`), keyed by the participation's id, which the coding act never changes:
//   - SHIPMENTS: a dispatch by PTS (waybill, carrier, the shipment documents ticked from the
//     scheme's list, 3.8), a replacement object, or a hand-over to the participant's own
//     courier — documented on Ф 7.3.4-1 with the day, the hour, the carrier and who took it
//     (Реш. 154: no Incoterms; the risk lies with whoever chose the carrier);
//   - RECEIPTS: the participant's online protocol (Ф 7.3.4-1) for one shipment — the day and
//     hour, the scheme's receipt checks answered one by one, undamaged or not, remarks, who
//     received it. «Годен» is not a judgement anyone types: it is every listed check passed
//     (Реш. 79) — and the packaging undamaged;
//   - PROBLEMS: «Сигнализирай проблем» — a participant's words, until PTS marks it resolved.
// Each list is appended to, never rewritten: a correction is a new entry.
//
// A REPLACEMENT object goes only while the participant still has the minimum working days to
// its own results deadline (Реш. 127; А16: 10 by default, set per scheme — the same minimum
// as for the waiting list, Q8). Below it, the portal says how many are left and refuses.

import type { ListItem } from "./scheme-lists-model";
import { addWorkingDays, workingDaysBetween } from "./holidays-model";
import { isIsoDate } from "./scheme-dates";

export type ShipmentKind = "dispatch" | "replacement" | "handover";
export interface Shipment {
  id: string;
  kind: ShipmentKind;
  /** when it was recorded (the round's clock, 1.3) and by whom (an account, never a name of a laboratory) */
  at: string;
  by: string;
  /** when it was recorded, real time — what a scan upload or PTS's own step is compared with */
  recordedAt?: string;
  /** the day it left (or was handed over) */
  day: string;
  waybill?: string;
  carrier?: string;
  /** the shipment documents that went with it — ids from the scheme's list (3.8) */
  docs: string[];
  /** a hand-over to the participant's own courier (Реш. 154) */
  handover?: { time: string; carrier: string; receiver: string };
  /** a replacement: why */
  reason?: string;
}

export interface ReceiptProtocol {
  id: string;
  shipmentId: string;
  at: string;
  /** «lab:<id>», «entityuser:<id>» — or a PTS person's e-mail, entered on its behalf */
  by: string;
  day: string;
  time: string;
  /** the scheme's receipt checks, by id, as answered */
  checks: Record<string, boolean>;
  undamaged: boolean;
  /** computed: every listed check passed and the packaging undamaged (Реш. 79) */
  suitable: boolean;
  remarks: string;
  /** the person who received it, as the participant writes it */
  receivedBy: string;
}

export interface DeliveryProblem {
  id: string;
  at: string;
  by: string;
  text: string;
  resolved?: { at: string; by: string; note: string };
}

export interface ParticipationDelivery { shipments: Shipment[]; receipts: ReceiptProtocol[]; problems: DeliveryProblem[] }
export type Deliveries = Record<string, ParticipationDelivery>;

export const EMPTY_DELIVERY: ParticipationDelivery = { shipments: [], receipts: [], problems: [] };
export const deliveryOf = (s: { deliveries?: Deliveries }, participantId: string): ParticipationDelivery => {
  const d = s.deliveries && Object.hasOwn(s.deliveries, participantId) ? s.deliveries[participantId] : undefined;
  return { shipments: d?.shipments ?? [], receipts: d?.receipts ?? [], problems: d?.problems ?? [] };
};

export const LIMITS = { waybill: 60, carrier: 60, receiver: 120, remarks: 1000, problem: 1000, note: 300, reason: 300 };
/** open problems a participation may have at once — the next waits for PTS's answer (review) */
export const MAX_OPEN_PROBLEMS = 5;
/** А16 / Реш. 127: the minimum working days, by default and its bounds */
export const DEFAULT_MIN_DAYS = 10;
export const minDaysOf = (s: { deliveryMinDays?: number }): number => {
  const n = s.deliveryMinDays;
  return Number.isInteger(n) && n! >= 1 && n! <= 60 ? n! : DEFAULT_MIN_DAYS;
};
export const readMinDays = (v: unknown): number | null => {
  const t = String(v ?? "").trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 60 ? n : null;
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F​-‏﻿�]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ── the forms ──
export type ShipmentProblem = "day" | "waybill" | "time" | "carrier" | "receiver" | "reason" | "future";
export function readShipment(kind: ShipmentKind, input: { day?: unknown; waybill?: unknown; carrier?: unknown; docs?: unknown[]; time?: unknown; receiver?: unknown; reason?: unknown }, list: readonly ListItem[] | undefined, today: string):
  { ok: true; fields: Omit<Shipment, "id" | "at" | "by"> } | { ok: false; problem: ShipmentProblem } {
  const day = clean(input.day, 10);
  if (!isIsoDate(day)) return { ok: false, problem: "day" };
  if (day > today) return { ok: false, problem: "future" };
  const known = new Set((list ?? []).map((i) => i.id));
  const docs = [...new Set((input.docs ?? []).map((d) => clean(d, 20)).filter((d) => known.has(d)))];
  const carrier = clean(input.carrier, LIMITS.carrier);
  if (kind === "handover") {
    const time = clean(input.time, 5);
    if (!isTime(time)) return { ok: false, problem: "time" };
    if (!carrier) return { ok: false, problem: "carrier" };
    const receiver = clean(input.receiver, LIMITS.receiver);
    if (receiver.length < 2) return { ok: false, problem: "receiver" };
    return { ok: true, fields: { kind, day, docs, carrier, handover: { time, carrier, receiver } } };
  }
  const waybill = clean(input.waybill, LIMITS.waybill);
  if (!waybill) return { ok: false, problem: "waybill" };
  const reason = clean(input.reason, LIMITS.reason);
  if (kind === "replacement" && reason.length < 3) return { ok: false, problem: "reason" };
  return { ok: true, fields: { kind, day, waybill, docs, ...(carrier ? { carrier } : {}), ...(kind === "replacement" ? { reason } : {}) } };
}

/** «Годен»: every listed check passed, and the packaging undamaged (Реш. 79). An empty list
 *  asks only the packaging. */
export const suitableFrom = (checks: Readonly<Record<string, boolean>>, list: readonly ListItem[] | undefined, undamaged: boolean): boolean =>
  undamaged && (list ?? []).every((i) => checks[i.id] === true);

export type ReceiptProblem = "day" | "time" | "future" | "before" | "checks" | "undamaged" | "receiver" | "shipment" | "twice" | "state";
export function readReceipt(input: { day?: unknown; time?: unknown; checks: Record<string, unknown>; undamaged?: unknown; remarks?: unknown; receivedBy?: unknown }, list: readonly ListItem[] | undefined, today: string, sentOn?: string):
  { ok: true; fields: Omit<ReceiptProtocol, "id" | "at" | "by" | "shipmentId"> } | { ok: false; problem: ReceiptProblem } {
  const day = clean(input.day, 10);
  if (!isIsoDate(day)) return { ok: false, problem: "day" };
  if (day > today) return { ok: false, problem: "future" };
  if (sentOn && day < sentOn) return { ok: false, problem: "before" }; // never before the object left (review)
  const time = clean(input.time, 5);
  if (!isTime(time)) return { ok: false, problem: "time" };
  // every check answered, yes or no — none left out, none invented
  const checks: Record<string, boolean> = {};
  for (const i of list ?? []) {
    const v = String(input.checks[i.id] ?? "");
    if (v !== "yes" && v !== "no") return { ok: false, problem: "checks" };
    checks[i.id] = v === "yes";
  }
  const u = String(input.undamaged ?? "");
  if (u !== "yes" && u !== "no") return { ok: false, problem: "undamaged" };
  const receivedBy = clean(input.receivedBy, LIMITS.receiver);
  if (receivedBy.length < 2) return { ok: false, problem: "receiver" };
  const undamaged = u === "yes";
  return { ok: true, fields: { day, time, checks, undamaged, suitable: suitableFrom(checks, list, undamaged), remarks: clean(input.remarks, LIMITS.remarks), receivedBy } };
}

// ── where a participation stands ──
/** The shipment awaiting its protocol: the latest one that has none yet — or null. */
export function openShipment(d: ParticipationDelivery): Shipment | null {
  const last = d.shipments[d.shipments.length - 1];
  if (!last) return null;
  return d.receipts.some((r) => r.shipmentId === last.id) ? null : last;
}
export const latestReceipt = (d: ParticipationDelivery): ReceiptProtocol | undefined => d.receipts[d.receipts.length - 1];
export const openProblems = (d: ParticipationDelivery): DeliveryProblem[] => d.problems.filter((p) => !p.resolved);

/** Received some other way after the latest shipment — a signed scan uploaded, or PTS's
 *  own case-file step — while no online protocol is filed for it. Compared in real time
 *  with when the shipment was recorded (review). */
export function receivedOtherwise(d: ParticipationDelivery, signals: { scanAt?: string; stepsAt: readonly string[] }): boolean {
  const last = openShipment(d);
  if (!last) return false;
  const after = last.recordedAt ?? last.at;
  return (!!signals.scanAt && signals.scanAt > after) || signals.stepsAt.some((t) => t > after);
}

/** What else says it arrived (5.6 review): the signed scan's upload, PTS's own case-file
 *  steps (a voided one never counts). */
export const otherReceipts = (s: { labUploads?: Record<string, Record<string, { uploadedAt: string } | undefined> | undefined> }, code: string, events: readonly { kind: string; source?: string; voidedAt?: string; recordedAt?: string }[]) => ({
  scanAt: s.labUploads?.[code]?.protocol?.uploadedAt,
  stepsAt: events.filter((e) => e.kind === "receipt_confirmed" && e.source === "manual" && !e.voidedAt).map((e) => e.recordedAt ?? ""),
});

/** Where the object stands for the participation's state (5.5): sent — and received only
 *  when the LATEST shipment has its protocol (or was received otherwise). A replacement on
 *  its way is «изпратено», whatever came before (review). */
export const deliveryProgress = (d: ParticipationDelivery, otherwise: boolean): { dispatched: boolean; received: boolean } | null =>
  d.shipments.length ? { dispatched: true, received: !openShipment(d) || otherwise } : null;

/** A replacement may be offered: the latest shipment came unfit, or a problem was signalled
 *  after it and is still open — never twice for the same reason (review). */
export function replacementCalledFor(d: ParticipationDelivery): boolean {
  const last = d.shipments[d.shipments.length - 1];
  if (!last) return false;
  const rec = d.receipts.filter((r) => r.shipmentId === last.id).pop();
  if (rec && !rec.suitable) return true;
  return openProblems(d).some((p) => p.at > last.at);
}

export type DeliveryState = "to-send" | "sent" | "fit" | "unfit" | "received";
export function deliveryState(d: ParticipationDelivery, otherwise = false): DeliveryState {
  if (!d.shipments.length) return "to-send";
  if (openShipment(d)) return otherwise ? "received" : "sent";
  return latestReceipt(d)?.suitable ? "fit" : "unfit";
}
export const DELIVERY_STATE_LABEL: Record<DeliveryState, { bg: string; en: string }> = {
  "to-send": { bg: "за изпращане", en: "to send" },
  sent: { bg: "изпратено — чака протокол", en: "sent — awaiting the protocol" },
  fit: { bg: "получено, годно", en: "received, fit" },
  unfit: { bg: "получено, негодно", en: "received, unfit" },
  received: { bg: "получено — подписан протокол, без онлайн проверки", en: "received — a signed protocol, no online checks" },
};

/** A replacement object: why it may not go now — or null. Fewer than the minimum working
 *  days to the participant's own results deadline (Реш. 127); none at all for a calibration
 *  scheme (one object travels, 5.7); none without a deadline to count to. */
export function replacementProblem(type: string, resultsDue: string | undefined, today: string, minDays: number, off: ReadonlySet<string>): { problem: "calibration" | "no-deadline" | "too-late"; left?: number } | null {
  if (type === "C") return { problem: "calibration" };
  if (!resultsDue) return { problem: "no-deadline" };
  const left = workingDaysBetween(today, resultsDue.slice(0, 10), off);
  return left < minDays ? { problem: "too-late", left } : null;
}

/** The receipt reminder (1.8 template «receipt.due»): a shipment that left at least
 *  `afterDays` working days ago and still has no protocol. */
export const RECEIPT_REMINDER_AFTER = 3;
export const receiptReminderDue = (d: ParticipationDelivery, today: string, off: ReadonlySet<string>, afterDays = RECEIPT_REMINDER_AFTER): Shipment | null => {
  const s = openShipment(d);
  return s && addWorkingDays(s.day, afterDays, off) <= today ? s : null;
};

export const SHIPMENT_PROBLEM_TEXT: Record<ShipmentProblem, { bg: string; en: string }> = {
  day: { bg: "Посочете деня на изпращане.", en: "Give the day it was sent." },
  future: { bg: "Денят не може да е в бъдещето.", en: "The day cannot be in the future." },
  waybill: { bg: "Посочете номера на товарителницата.", en: "Give the waybill number." },
  time: { bg: "Посочете часа на предаването (ЧЧ:ММ).", en: "Give the hour of the hand-over (HH:MM)." },
  carrier: { bg: "Посочете куриера.", en: "Give the carrier." },
  receiver: { bg: "Посочете кой е взел обекта.", en: "Give who took the object." },
  reason: { bg: "Посочете защо се изпраща заместващ обект.", en: "Give why a replacement object is sent." },
};
export const RECEIPT_PROBLEM_TEXT: Record<ReceiptProblem, { bg: string; en: string }> = {
  day: { bg: "Посочете деня на получаване.", en: "Give the day of receipt." },
  future: { bg: "Денят на получаване не може да е в бъдещето.", en: "The day of receipt cannot be in the future." },
  time: { bg: "Посочете часа на получаване (ЧЧ:ММ).", en: "Give the hour of receipt (HH:MM)." },
  checks: { bg: "Отговорете на всяка проверка — да или не.", en: "Answer every check — yes or no." },
  undamaged: { bg: "Отбележете дали опаковката е ненарушена.", en: "Say whether the packaging is undamaged." },
  receiver: { bg: "Посочете кой е получил обекта.", en: "Give who received the object." },
  before: { bg: "Денят на получаване не може да е преди изпращането.", en: "The day of receipt cannot be before the dispatch." },
  shipment: { bg: "Няма изпратен обект, който да чака протокол.", en: "No dispatched object awaits a protocol." },
  twice: { bg: "Протоколът за тази пратка вече е подаден.", en: "The protocol for this shipment is in already." },
  state: { bg: "Схемата вече не приема протоколи и сигнали — свържете се с PTS.", en: "The scheme no longer takes protocols or problems — contact PTS." },
};
