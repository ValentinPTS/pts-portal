// The online application by the laboratory (plan part 9.2; Zadanie §7 «Заявяване»; Реш. 12, 108, 123,
// 147). Pure.
//
// In the laboratory's portal a user of an APPROVED organisation (Реш. 12: the entity «активно» — checked
// by PTS) applies for a scheme that is open for applications: started and taking applications (never a
// draft — Реш. 147), its «Краен срок за заявки» not passed (Sofia's day), its final list not announced
// (5.2). The application is 5.1's: the participations PER CHARACTERISTIC, 1–10 each (a calibration
// scheme: the number of participations), for one of the entity's active laboratories; the delivery by
// PTS or by the laboratory's own courier (9.4: participation only). No approval act — submitting makes
// the laboratory a participant (Реш. 123); PTS may only refuse it (Реш. 14). One application per
// laboratory per scheme — a change goes through PTS. Accreditation is no condition (Реш. 108): where the
// scheme asks for it and the laboratory has none, a warning — never a block.

import { readSelections, MAX_PER_CHARACTERISTIC, type Selections } from "./application-model";
import { currentFinalList } from "./announcement-model";
import { deadlineMs } from "./scheme-dates";
import { accreditationWarning } from "./scheme-lists-model";
import type { Scheme } from "./types";
import type { SchemeLists } from "./scheme-lists-model";

/** The courier text an own-courier participation carries (F 7.2.1-4 «Вид на куриера») — 9.4 reads it. */
export const OWN_COURIER = "Собствен куриер";

export type OpenProblem = "not-open" | "closed" | "deadline" | "final-list";
/** Is the scheme open for applications at this instant (the round's own clock — 1.3)? Its deadline a day
 *  (to its very end, Sofia) or a day and an hour (9.2 review: never compared as text). (A final list
 *  exists only once the scheme runs; its check is kept for a scheme stepped back.) */
export function applyOpenProblem(s: Pick<Scheme, "status" | "dates" | "lifecycle" | "applicationsClosed">, nowMs: number): OpenProblem | null {
  if (s.status !== "open") return "not-open";
  // closed by PTS's hand (9.3, Реш. 120) — «Запълнена» never closes it
  if (s.applicationsClosed) return "closed";
  const due = s.dates?.applicationsDue;
  const dueMs = due ? deadlineMs(due) : null;
  if (due && (dueMs === null || nowMs > dueMs)) return "deadline";
  if (currentFinalList(s)) return "final-list";
  return null;
}

export type ApplyProblem = "entity" | "laboratory" | "count" | "none" | "already" | "refused" | "delivery" | "changed" | OpenProblem;

export type LabApplyInput = Record<string, unknown>;
export interface LabApply { laboratoryId: string; selections: Selections | null; participations: number; ownCourier: boolean }

/** The form as typed — against the scheme's characteristics and the entity's active laboratories. The
 *  counts are positional: when the form posts the characteristics' signature (`paramSig`) and it is not
 *  the scheme's now (PTS changed them while the form was open), refused — never counts on the wrong
 *  characteristics (9.2 review). */
export function readLabApply(input: LabApplyInput, o: { characteristicCount: number; laboratoryIds: readonly string[]; signature?: string }): { ok: true; value: LabApply } | { ok: false; problem: ApplyProblem } {
  if (o.signature !== undefined && String(input.paramSig ?? "") !== o.signature) return { ok: false, problem: "changed" };
  const laboratoryId = String(input.laboratoryId ?? "");
  if (!o.laboratoryIds.includes(laboratoryId)) return { ok: false, problem: "laboratory" };
  const delivery = String(input.delivery ?? "pts");
  if (delivery !== "pts" && delivery !== "own") return { ok: false, problem: "delivery" };
  if (o.characteristicCount > 0) {
    const sel = readSelections(input as Record<string, unknown>, o.characteristicCount);
    if (!sel.ok) return { ok: false, problem: sel.problem };
    return { ok: true, value: { laboratoryId, selections: sel.selections, participations: Math.max(...Object.values(sel.selections)), ownCourier: delivery === "own" } };
  }
  const raw = String(input.participations ?? "").trim();
  if (!/^\d{1,2}$/.test(raw)) return { ok: false, problem: "count" };
  const n = parseInt(raw, 10);
  if (n < 1 || n > MAX_PER_CHARACTERISTIC) return { ok: false, problem: "count" };
  return { ok: true, value: { laboratoryId, selections: null, participations: n, ownCourier: delivery === "own" } };
}

/** A laboratory's earlier participations in the scheme decide whether it may apply (9.2 review): one in
 *  the round — «already»; refused (Реш. 14) or withdrawn — a new one only through PTS; only an ANNULLED one
 *  (entered wrongly) leaves the way open. */
export function earlierProblem(earlier: readonly { standing?: { state: string } | null }[]): "already" | "refused" | null {
  if (earlier.some((p) => !p.standing)) return "already";
  if (earlier.some((p) => p.standing && p.standing.state !== "annulled")) return "refused";
  return null;
}

/** Реш. 108 — the warning (never a block): the scheme asks for accreditation, the laboratory has none. */
export const labAccreditationWarning = (lists: SchemeLists | undefined, accreditationNo: string) => !!lists && accreditationWarning(lists, accreditationNo);

export const APPLY_PROBLEM_TEXT: Record<ApplyProblem, { bg: string; en: string }> = {
  entity: { bg: "заявки се подават, когато PTS провери организацията («активно»)", en: "applications open once PTS has checked the organisation («active»)" },
  laboratory: { bg: "изберете една от активните лаборатории на организацията", en: "choose one of the organisation's active laboratories" },
  count: { bg: "броят участия е от 1 до 10", en: "the number of participations is 1 to 10" },
  none: { bg: "изберете поне една характеристика", en: "choose at least one characteristic" },
  already: { bg: "тази лаборатория вече е заявила участие в схемата — за промяна пишете на PTS", en: "this laboratory has already applied for the scheme — to change it, write to PTS" },
  refused: { bg: "PTS отказа заявката на тази лаборатория за схемата — за нова заявка пишете на PTS", en: "PTS refused this laboratory's application for the scheme — for a new one, write to PTS" },
  delivery: { bg: "доставката е от PTS или със собствен куриер", en: "the delivery is by PTS or by your own courier" },
  changed: { bg: "характеристиките на схемата се промениха, докато формулярът беше отворен — отворете го отново", en: "the scheme's characteristics changed while the form was open — open it again" },
  "not-open": { bg: "схемата не приема заявки", en: "the scheme does not take applications" },
  closed: { bg: "PTS затвори заявяването за схемата", en: "PTS has closed the applications for the scheme" },
  deadline: { bg: "срокът за заявки е изтекъл", en: "the deadline for applications has passed" },
  "final-list": { bg: "окончателният списък на участниците е обявен — заявки вече не се приемат", en: "the final list of participants is announced — no more applications" },
};
