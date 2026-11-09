// A participation's state, its stage and what it asks for now (plan part 5.5; the
// specification's «Състояния на участието»; the design's «Начало» and «Страница на
// участие»; К26, К18; Реш. 128, 96). Pure.
//
// The STATE is read from what is on record — never a field anyone sets by hand: the
// application and its standing (5.1), the final list (5.2), the code (5.3), the case
// file's steps (dispatch, receipt), the results and the report. A FIXED map takes each
// state to one of the STAGES the bar shows (К26). Payment is NOT a stage — a separate
// mark beside the bar (К18; Реш. 96: payment never holds the dispatch back).
//
// «Изчаква избор на доставчик» (Реш. 128, О5): after the second announcement and before
// the proforma, for a participation outside the EU and the Balkans whose carrier is not
// chosen yet — until 9.5, PTS records the chosen carrier by hand (the participation's
// courier).

export type PState =
  | "applied"        // заявено — a participant at once (Реш. 23)
  | "carrier"        // изчаква избор на доставчик (Реш. 128)
  | "confirmed"      // потвърдено — on the final list, coded
  | "dispatched"     // обектът изпратен
  | "received"       // обектът получен
  | "submitted"      // резултати подадени
  | "scored"         // оценено — the report issued
  | "nr"             // N/R — received, no result by the report (Реш. 19)
  | "withdrawn"      // оттеглено (Реш. 18)
  | "refused"        // отказано (5.1)
  | "annulled"       // анулирано (5.1)
  | "not-final"      // не е в окончателния списък (5.2)
  | "not-held";      // схемата не се състои (О9)

export const STAGES = ["application", "confirmation", "dispatch", "receipt", "results", "report"] as const;
export type Stage = (typeof STAGES)[number];

/** К26: the fixed map, state → stage. A state that ends the participation has none. */
export const STATE_STAGE: Record<PState, Stage | null> = {
  applied: "application", carrier: "confirmation", confirmed: "confirmation",
  dispatched: "dispatch", received: "receipt", submitted: "results", scored: "report", nr: "report",
  withdrawn: null, refused: null, annulled: null, "not-final": null, "not-held": null,
};

export const STATE_LABEL: Record<PState, { bg: string; en: string }> = {
  applied: { bg: "Заявено", en: "Applied" },
  carrier: { bg: "Изчаква избор на доставчик", en: "Awaiting the choice of carrier" },
  confirmed: { bg: "Потвърдено", en: "Confirmed" },
  dispatched: { bg: "Обектът е изпратен", en: "Object dispatched" },
  received: { bg: "Обектът е получен", en: "Object received" },
  submitted: { bg: "Резултатите са подадени", en: "Results submitted" },
  scored: { bg: "Оценено", en: "Scored" },
  nr: { bg: "N/R — без резултат", en: "N/R — no result" },
  withdrawn: { bg: "Оттеглено", en: "Withdrawn" },
  refused: { bg: "Отказано", en: "Refused" },
  annulled: { bg: "Анулирано", en: "Annulled" },
  "not-final": { bg: "Не е в окончателния списък", en: "Not on the final list" },
  "not-held": { bg: "Схемата не се състои", en: "The scheme is not held" },
};

export const STAGE_LABEL: Record<Stage, { bg: string; en: string }> = {
  application: { bg: "Заявка", en: "Application" },
  confirmation: { bg: "Потвърждение", en: "Confirmation" },
  dispatch: { bg: "Изпращане", en: "Dispatch" },
  receipt: { bg: "Получаване", en: "Receipt" },
  results: { bg: "Резултати", en: "Results" },
  report: { bg: "Доклад", en: "Report" },
};

/** EU member states and the Balkans outside it (ISO 3166 alpha-2; Greece also «EL») —
 *  delivery not charged; outside them a carrier is chosen (Реш. 128). PTS to confirm. */
export const EU_AND_BALKANS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "AL", "BA", "ME", "MK", "RS", "XK",
]);
export const needsCarrierChoice = (country: string | undefined): boolean => !!country && !EU_AND_BALKANS.has(country.trim().toUpperCase());

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
}

/** The participation's state, from what is on record. */
export function participationState(f: StateFacts): PState {
  if (f.standing) return f.standing;
  if (f.notHeld) return "not-held";
  if (f.finalList && !f.onList) return "not-final";
  // the report issued: scored with its results — or N/R, in the report by its code (Реш. 19)
  if (f.reported) return f.submitted ? "scored" : "nr";
  if (f.submitted) return "submitted";
  if (f.received) return "received";
  if (f.dispatched) return "dispatched";
  if (f.finalList && f.onList && f.carrierPending) return "carrier";
  if (f.finalList && f.onList && f.coded) return "confirmed";
  return "applied";
}

/** К18: payment beside the bar — nothing invoiced, invoiced, paid. */
export type PaymentMark = "none" | "invoiced" | "paid";
export const paymentMark = (invoiced: boolean, paid: boolean): PaymentMark => (paid ? "paid" : invoiced ? "invoiced" : "none");
export const PAYMENT_LABEL: Record<PaymentMark, { bg: string; en: string }> = {
  none: { bg: "Няма проформа", en: "No proforma" },
  invoiced: { bg: "Проформата е издадена — чака плащане", en: "Proforma issued — awaiting payment" },
  paid: { bg: "Платено", en: "Paid" },
};

/** Finished — shown in the archive, not among the active ones. */
export const finished = (st: PState): boolean => st === "scored" || st === "nr" || STATE_STAGE[st] === null;
