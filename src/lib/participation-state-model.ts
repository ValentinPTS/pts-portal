// A participation's state, its stage and what it asks for now (plan part 5.5; the
// specification's «Състояния на участието» т. 2.3; the design's «Начало» and «Страница
// на участие»; К26, К18; Реш. 128, 96, 19). Pure.
//
// The STATE is read from what is on record — never a field anyone sets by hand: the
// application and its standing (5.1), the final list (5.2), the code (5.3), the case
// file's steps (dispatch, receipt, results), the calibration chain, the report. A FIXED
// map takes each state to one of the STAGES the bar shows (К26, agreed by PTS). Payment
// is NOT a stage — a separate mark beside the bar (К18, agreed; Реш. 96: payment never
// holds the dispatch back).
//
// «Изчаква избор на доставчик» (Реш. 128, О5): on the final list and before the object
// goes, for a participation outside the EU and the Balkans whose carrier is not chosen
// yet — until 9.5, PTS records the chosen carrier by hand, as the participation's courier
// (Ф 7.2.1-4 «Вид на куриера»).
//
// Three states of т. 2.3 come with their own parts and are in the map already, so the map
// stays one fixed table: «в списък на изчакващите» (9.3), «резултати чернова» (the
// results form, phase 6) and «изключено» (Реш. 126, 7.2). Nothing reaches them yet.

import type { CaseEventKind, ParticipantStatus, Scheme, SchemeChain } from "./types";
import type { Standing } from "./application-model";
import { inFinalRound, currentFinalList } from "./announcement-model";
import { isProvisional } from "./coding-model";
import { labState, isIncomingFor } from "./chain";
import { resultsDeadline, resultsSubmittedAt } from "./deadlines-model";
import { deadlineMs, isPast } from "./scheme-dates";

export type PState =
  | "applied"        // заявено — a participant at once (Реш. 23)
  | "waitlisted"     // в списък на изчакващите (Реш. 26, 120) — from 9.3
  | "carrier"        // изчаква избор на доставчик (Реш. 128)
  | "confirmed"      // потвърдено — on the final list, coded
  | "dispatched"     // обектът изпратен
  | "received"       // обектът получен
  | "draft"          // резултати чернова — from the results form (phase 6)
  | "submitted"      // резултати подадени
  | "scored"         // оценено — the report issued
  | "nr"             // N/R — received, no result by the report (Реш. 19)
  | "no-object"      // the report issued, the object never received — NOT N/R (design §3)
  | "withdrawn"      // оттеглено (Реш. 18)
  | "refused"        // отказано (5.1)
  | "annulled"       // анулирано (5.1)
  | "excluded"       // изключено (Реш. 126) — from 7.2
  | "not-final"      // не е в окончателния списък (5.2)
  | "not-held";      // схемата не се състои (О9)

/** The bar (К26): the design's stages without «Плащане» (К18). The fourth is the work
 *  itself — testing or calibration, by the scheme. */
export const STAGES = ["application", "dispatch", "receipt", "work", "results", "report"] as const;
export type Stage = (typeof STAGES)[number];

/** К26: the fixed map, state → stage — the stage it is IN now. A state that ends the
 *  participation has none. */
export const STATE_STAGE: Record<PState, Stage | null> = {
  applied: "application", waitlisted: "application", carrier: "application",
  confirmed: "dispatch", dispatched: "receipt", received: "work", draft: "work",
  submitted: "results", scored: "report", nr: "report",
  "no-object": null, withdrawn: null, refused: null, annulled: null, excluded: null, "not-final": null, "not-held": null,
};

export const STATE_LABEL: Record<PState, { bg: string; en: string }> = {
  applied: { bg: "Заявено", en: "Applied" },
  waitlisted: { bg: "В списъка на изчакващите", en: "On the waiting list" },
  carrier: { bg: "Изчаква избор на доставчик", en: "Awaiting the choice of carrier" },
  confirmed: { bg: "Потвърдено", en: "Confirmed" },
  dispatched: { bg: "Обектът е изпратен", en: "Object dispatched" },
  received: { bg: "Обектът е получен", en: "Object received" },
  draft: { bg: "Резултати — чернова", en: "Results — draft" },
  submitted: { bg: "Резултатите са подадени", en: "Results submitted" },
  scored: { bg: "Оценено", en: "Scored" },
  nr: { bg: "N/R — без резултат", en: "N/R — no result" },
  "no-object": { bg: "Без получен обект", en: "No object received" },
  withdrawn: { bg: "Оттеглено", en: "Withdrawn" },
  refused: { bg: "Отказано", en: "Refused" },
  annulled: { bg: "Анулирано", en: "Annulled" },
  excluded: { bg: "Изключено", en: "Excluded" },
  "not-final": { bg: "Не е в окончателния списък", en: "Not on the final list" },
  "not-held": { bg: "Схемата не се състои", en: "The scheme is not held" },
};

const STAGE_WORDS: Record<Exclude<Stage, "work">, { bg: string; en: string }> = {
  application: { bg: "Заявка", en: "Application" },
  dispatch: { bg: "Изпращане", en: "Dispatch" },
  receipt: { bg: "Получаване", en: "Receipt" },
  results: { bg: "Резултати", en: "Results" },
  report: { bg: "Окончателен доклад", en: "Final report" },
};
/** A stage's words — the work stage by the scheme's activity. */
export function stageLabel(stage: Stage, type: "T" | "C" | string): { bg: string; en: string } {
  if (stage !== "work") return STAGE_WORDS[stage];
  return type === "C" ? { bg: "Калибриране", en: "Calibration" } : { bg: "Изпитване", en: "Testing" };
}

/** EU member states and the Balkans outside it (ISO 3166 alpha-2; Greece also «EL») — the
 *  specification's Q8 (Реш. 38, 42): «Балканите за целите на доставката: Албания, Босна и
 *  Херцеговина, Косово, Северна Македония, Сърбия, Черна гора. Без Молдова и Турция.» Malta,
 *  Cyprus and Ireland pay a fixed add-on (3.7), they choose no carrier. Outside: by offer (Реш. 128). */
export const EU_AND_BALKANS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "AL", "BA", "ME", "MK", "RS", "XK",
]);
/** Outside the EU and the Balkans? An unknown country is not presumed outside. */
export const needsCarrierChoice = (country: string | undefined): boolean => !!country?.trim() && /^[A-Za-z]{2}$/.test(country.trim()) && !EU_AND_BALKANS.has(country.trim().toUpperCase());

export interface StateFacts {
  /** out of the round (5.1) */
  standing?: "refused" | "annulled" | "withdrawn";
  /** the scheme: not held; its report issued */
  notHeld?: boolean;
  reported?: boolean;
  /** the second announcement made, and this participation on its list (5.2) */
  finalList?: boolean;
  onList?: boolean;
  /** coded (5.3) */
  coded?: boolean;
  /** outside the EU and the Balkans, its carrier not chosen yet (Реш. 128) */
  carrierPending?: boolean;
  dispatched?: boolean;
  received?: boolean;
  submitted?: boolean;
  /** from 9.3, phase 6 and 7.2 */
  waitlisted?: boolean;
  draft?: boolean;
  excluded?: boolean;
}

/** The participation's state, from what is on record. */
export function participationState(f: StateFacts): PState {
  if (f.standing) return f.standing;
  if (f.excluded) return "excluded";
  if (f.notHeld) return "not-held";
  if (f.finalList && !f.onList) return "not-final";
  // the report issued: scored with its results — or N/R, in the report by its code, when it
  // RECEIVED an object and sent no result (Реш. 19). One that never received an object is
  // not N/R (design §3: «не бива да се показва като N/R»); how the report shows it is not
  // decided (7.2) — here it ends as «без получен обект».
  if (f.reported) return f.submitted ? "scored" : f.received ? "nr" : "no-object";
  if (f.submitted) return "submitted";
  if (f.draft) return "draft";
  if (f.received) return "received";
  if (f.dispatched) return "dispatched";
  if (f.finalList && f.onList && f.carrierPending) return "carrier";
  if (f.finalList && f.onList && f.coded) return "confirmed";
  if (f.waitlisted) return "waitlisted";
  return "applied";
}

// ── the facts, read from the record ──
const ORDER: ParticipantStatus[] = ["applied", "approved", "invoiced", "paid", "dispatched", "received", "submitted", "scored"];
const reached = (status: string, at: ParticipantStatus) => ORDER.indexOf(status as ParticipantStatus) >= ORDER.indexOf(at);

export interface StateInput {
  scheme: Pick<Scheme, "status" | "type" | "lifecycle" | "chain" | "labUploads" | "supersededFiles">;
  part: { id: string; code: string; status: string; standing?: Standing | null; courier?: string };
  /** its case file (any order) */
  events: readonly { kind: CaseEventKind }[];
  /** the participation's country (ISO alpha-2), when the reader may know it */
  country?: string;
}

/** What the record says of one participation. A step counts when its case event is
 *  recorded OR the status reached it (the event wins — a recorded step shows even if the
 *  status write failed); for a calibration scheme also when the chain says so. */
export function stateFacts({ scheme, part, events, country }: StateInput): StateFacts {
  const has = (k: CaseEventKind) => events.some((e) => e.kind === k);
  const chain: SchemeChain | undefined = scheme.type === "C" ? scheme.chain : undefined;
  const cs = chain ? labState(chain, part.code) : "not-in-chain";
  const received = has("receipt_confirmed") || reached(part.status, "received") || cs === "holding" || cs === "done";
  const dispatched = received || has("items_dispatched") || reached(part.status, "dispatched") || (!!chain && isIncomingFor(chain, part.code));
  const submitted = has("results_returned") || reached(part.status, "submitted") || !!resultsSubmittedAt(scheme, part.code, part.status);
  return {
    standing: part.standing?.state,
    notHeld: scheme.status === "not_held",
    reported: scheme.status === "report" || scheme.status === "closed",
    finalList: !!currentFinalList(scheme),
    onList: inFinalRound(scheme, part),
    coded: !isProvisional(part.code),
    carrierPending: needsCarrierChoice(country) && !part.courier?.trim(),
    dispatched, received, submitted,
  };
}

/** К18: payment beside the bar — nothing invoiced, invoiced, paid. */
export type PaymentMark = "none" | "invoiced" | "paid";
export const paymentMark = (invoiced: boolean, paid: boolean): PaymentMark => (paid ? "paid" : invoiced ? "invoiced" : "none");
/** From the record: the proforma put there (5.8 adds the numbers) and the payment noted. */
export const paymentOf = (s: Pick<Scheme, "labDocs" | "paidAt">, code: string, status: string): PaymentMark =>
  paymentMark(!!s.labDocs?.[code]?.proforma || status === "invoiced" || status === "paid", !!s.paidAt?.[code] || status === "paid");
export const PAYMENT_LABEL: Record<PaymentMark, { bg: string; en: string }> = {
  none: { bg: "Няма проформа", en: "No proforma" },
  invoiced: { bg: "Проформата е издадена — чака плащане", en: "Proforma issued — awaiting payment" },
  paid: { bg: "Платено", en: "Paid" },
};

/** Finished — shown in the archive, not among the active ones. */
export const finished = (st: PState): boolean => st === "scored" || st === "nr" || STATE_STAGE[st] === null;

// ── the next deadline ──
export type DeadlineKind = "applications" | "dispatch" | "results" | "chain" | "report";
export const DEADLINE_LABEL: Record<DeadlineKind, { bg: string; en: string }> = {
  applications: { bg: "Срок за заявяване", en: "Application deadline" },
  dispatch: { bg: "Изпращане на обектите", en: "Dispatch of the objects" },
  results: { bg: "Краен срок за резултати", en: "Results deadline" },
  chain: { bg: "Предаване на уреда нататък", en: "Hand the instrument on by" },
  report: { bg: "Окончателен доклад", en: "Final report" },
};
export interface NextDeadline { kind: DeadlineKind; at: string; orderNo?: string }

/** The one date ahead of this participation, by its state: what it waits for next. A date
 *  of PTS's that has passed (applications, dispatch, the report) is not «ahead» — the next
 *  one is shown instead (5.5 review); the participant's own deadline is shown even passed:
 *  overdue is said, never a block (Zadanie §9). `chainDue`: its own window while it holds
 *  the instrument (3.4). `nowMs`: the round's clock (1.3). */
export function nextDeadline(s: Pick<Scheme, "dates" | "extensions" | "type">, code: string, st: PState, chainDue?: { at: string; orderNo?: string }, nowMs: number = Date.now()): NextDeadline | null {
  const d = s.dates ?? {};
  const ahead = (kind: DeadlineKind, at: string | undefined): NextDeadline | null => (at && !isPast(at, nowMs) ? { kind, at } : null);
  const results = (): NextDeadline | null => {
    if (s.type === "C") return null; // a calibration scheme's window starts at its receipt (3.4)
    const rd = resultsDeadline(s, code);
    return rd.at ? { kind: "results", at: rd.at, orderNo: rd.ext?.orderNo } : null;
  };
  switch (st) {
    case "applied": case "waitlisted":
      return ahead("applications", d.applicationsDue) ?? ahead("dispatch", d.dispatch) ?? (ahead("results", d.resultsDue) ? results() : null);
    case "carrier": case "confirmed":
      // the applications are closed for one on the final list: what comes next is the dispatch
      return ahead("dispatch", d.dispatch) ?? (ahead("results", d.resultsDue) ? results() : null);
    case "dispatched": case "received": case "draft":
      if (chainDue) return { kind: "chain", at: chainDue.at, orderNo: chainDue.orderNo };
      return results();
    case "submitted":
      return ahead("report", d.reportDue);
    default:
      return null;
  }
}

/** A deadline's instant, for ordering — a day alone at its end; none last. */
export const deadlineOrder = (at: string | undefined): number => deadlineMs(at) ?? Number.POSITIVE_INFINITY;

// ── what asks for action now (the home's «Изисква действие») ──
export type ActionKind = "deadline" | "delivery" | "document";
export const ACTION_LABEL: Record<ActionKind, { bg: string; en: string }> = {
  deadline: { bg: "Срок", en: "Deadline" },
  delivery: { bg: "Доставка", en: "Delivery" },
  document: { bg: "Документ", en: "Document" },
};
export interface ActionItem {
  kind: ActionKind;
  participantId: string;
  /** what — its words */
  what: "results" | "chain" | "receipt" | "document";
  /** the date it is about (deadline, dispatch) */
  at?: string;
  /** a document's key and its edition */
  docKey?: string;
  editionNo?: number;
  editionId?: string;
}

/** The participation's actions, by its state: results not yet in by the deadline; the
 *  instrument to hand on; an object dispatched and its receipt not confirmed; a document
 *  released to it and not opened by anyone of it. A finished one asks for nothing. */
export function actionsFor(p: { participantId: string; state: PState; deadline: NextDeadline | null; dispatchedAt?: string; unopened: readonly { key: string; editionNo?: number; editionId?: string }[] }): ActionItem[] {
  if (finished(p.state)) return [];
  const out: ActionItem[] = [];
  if (p.deadline?.kind === "results" && (p.state === "received" || p.state === "draft" || p.state === "dispatched")) out.push({ kind: "deadline", participantId: p.participantId, what: "results", at: p.deadline.at });
  if (p.deadline?.kind === "chain") out.push({ kind: "deadline", participantId: p.participantId, what: "chain", at: p.deadline.at });
  if (p.state === "dispatched") out.push({ kind: "delivery", participantId: p.participantId, what: "receipt", at: p.dispatchedAt });
  for (const d of p.unopened) out.push({ kind: "document", participantId: p.participantId, what: "document", docKey: d.key, editionNo: d.editionNo, editionId: d.editionId });
  return out;
}

/** The order actions are shown in: deadlines first, the nearest first (by the instant it
 *  passes — a day alone at its end); then deliveries; then documents. */
export const actionOrder = (a: ActionItem, b: ActionItem): number => {
  const rank = { deadline: 0, delivery: 1, document: 2 } as const;
  return rank[a.kind] - rank[b.kind] || deadlineOrder(a.at) - deadlineOrder(b.at) || (a.at ?? "").localeCompare(b.at ?? "");
};
