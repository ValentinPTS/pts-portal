// Submission (plan part 6.4; Zadanie §7; Реш. 111; D1). Pure.
//
// draft → review → confirmations → receipt. The form closes for the laboratory at the results
// deadline in force (Реш. 111 — the scheme's, or an extension; a day alone ends at its end, in
// Sofia), on the round's clock (1.3). After it, a result comes in only through PTS: an UNLOCK with
// who, when, why and until when — the version submitted under it names it. Every version is kept
// (the database refuses any change — 0042); the next one is a new version.

import { isPast, isIsoDate } from "./scheme-dates";
import { readValue, computeError, type ResultDraft, type CalDraft, type ResultRow, type CalRow, type CheckProblem } from "./results-model";

export interface ResultUnlock { id: string; participantId: string; code: string; until: string; reason: string; at: string; by: string }

/** An unlock that holds today (Sofia's day on the round's clock): its last day included. */
export const activeUnlock = (unlocks: readonly ResultUnlock[] | undefined, participantId: string, today: string): ResultUnlock | null =>
  [...(unlocks ?? [])].filter((u) => u.participantId === participantId && u.until >= today).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/** Is the form open to the laboratory now? Before the deadline in force; after it, only under an unlock. */
export function submissionOpen(deadline: string | undefined, nowMs: number, unlock: ResultUnlock | null): { open: boolean; late: boolean } {
  const late = isPast(deadline, nowMs);
  return { open: !late || !!unlock, late };
}

export const UNLOCK_REASON_MIN = 5;
/** An unlock is for a short while — a technical error being put right — never a way round the
 *  deadline for good (6.4 review): at most this many days ahead. */
export const UNLOCK_MAX_DAYS = 30;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export function readUnlock(input: { until: unknown; reason: unknown }, today: string): { ok: true; until: string; reason: string } | { ok: false; problem: "until" | "reason" } {
  const until = typeof input.until === "string" ? input.until.trim() : "";
  const reason = (typeof input.reason === "string" ? input.reason : "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 500);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || !isIsoDate(until) || until < today || until > addDays(today, UNLOCK_MAX_DAYS)) return { ok: false, problem: "until" };
  if ([...reason].length < UNLOCK_REASON_MIN) return { ok: false, problem: "reason" };
  return { ok: true, until, reason };
}

export interface Confirmations { truthful: true; subcontracted: boolean; subcontractedPart?: string; errorsConfirmed?: true }
export type ConfirmProblem = "truthful" | "subcontract" | "errors";
/** The confirmations: the results ours, as entered (required); a part subcontracted — which (when
 *  yes); calibration: the computed errors confirmed (D1). */
export function readConfirmations(input: { truthful?: unknown; subcontracted?: unknown; subcontractedPart?: unknown; errorsConfirmed?: unknown }, kind: "T" | "C"): { ok: true; value: Confirmations } | { ok: false; problem: ConfirmProblem } {
  const yes = (v: unknown) => v === true || v === "on" || v === "yes" || v === "1";
  if (!yes(input.truthful)) return { ok: false, problem: "truthful" };
  const subcontracted = yes(input.subcontracted);
  const part = (typeof input.subcontractedPart === "string" ? input.subcontractedPart : "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300);
  if (subcontracted && [...part].length < 3) return { ok: false, problem: "subcontract" };
  if (kind === "C" && !yes(input.errorsConfirmed)) return { ok: false, problem: "errors" };
  return { ok: true, value: { truthful: true, subcontracted, ...(subcontracted ? { subcontractedPart: part } : {}), ...(kind === "C" ? { errorsConfirmed: true as const } : {}) } };
}

export const SUBMIT_PROBLEM_TEXT: Record<"closed" | "checks" | "stale" | "state" | "not-yours" | "failed" | "unknown" | "changed" | ConfirmProblem, { bg: string; en: string }> = {
  closed: { bg: "Срокът за резултати е изтекъл — формулярът е затворен. След срока резултат се приема само чрез PTS (Реш. 111).", en: "The results deadline has passed — the form is closed. After the deadline a result comes in only through PTS (Реш. 111)." },
  checks: { bg: "Формулярът още не е пълен или не е във формат — вижте проверката.", en: "The form is not complete or not in format yet — see the check." },
  stale: { bg: "Черновата се промени след прегледа — прегледайте я отново.", en: "The draft changed after the review — review it again." },
  state: { bg: "Формулярът не приема подаване сега.", en: "The form takes no submission now." },
  "not-yours": { bg: "Това участие не е ваше.", en: "This participation is not yours." },
  failed: { bg: "Подаването НЕ е записано — опитайте пак.", en: "The submission was NOT recorded — try again." },
  // the answer did not come back (the connection, the server): it may or may not be recorded — the
  // page's list of versions says which; «Подай» again is safe — the same submission is not doubled
  unknown: { bg: "Отговорът не пристигна — не е ясно дали подаването е записано. Презаредете страницата: подадените версии са изброени там. Повторно «Подай» оттук не създава втора версия.", en: "The answer did not arrive — it is not known whether the submission was recorded. Reload the page: the submitted versions are listed there. «Submit» again from here does not create a second version." },
  changed: { bg: "Формулярът е променен след прегледа — прегледайте обобщението, потвърдете отново и подайте.", en: "The form changed after the review — look at the summary again, confirm again and submit." },
  truthful: { bg: "Потвърдете, че резултатите са получени от вашата лаборатория, както са въведени.", en: "Confirm that the results were obtained by your laboratory, as entered." },
  subcontract: { bg: "Посочете коя част е възложена на подизпълнител.", en: "Say which part is subcontracted." },
  errors: { bg: "Потвърдете изчислените грешки (измерена − референтна стойност).", en: "Confirm the computed errors (measured − reference value)." },
};

/** What a submitted version holds: the draft as typed; the values as numbers; calibration: the
 *  computed errors (D1 — the three stored); N/R and N/A as declared; the notices said; the
 *  confirmations; the unlock it came in by. */
export function submissionPayload(kind: "T" | "C", draft: ResultDraft | CalDraft, rows: readonly ResultRow[] | readonly CalRow[], notices: readonly CheckProblem[], confirmations: Confirmations, unlock: ResultUnlock | null): Record<string, unknown> {
  const n = (s: string) => { const v = readValue(s); return typeof v === "number" ? v : null; };
  let values: Record<string, unknown>;
  if (kind === "T") {
    const d = draft as ResultDraft;
    values = Object.fromEntries((rows as ResultRow[]).map((r) => { const x = d.rows[r.key]; return [r.key, x?.nr ? { nr: true } : { d: (x?.d ?? []).map(n), mean: n(x?.mean ?? ""), U: n(x?.U ?? ""), k: n(x?.k ?? "") }]; }));
  } else {
    const c = draft as CalDraft;
    values = Object.fromEntries((rows as CalRow[]).map((r) => { const p = c.points[r.key]; return [r.key, !p || p.na ? { na: true } : { ref: n(p.ref), meas: n(p.meas), error: computeError(p.ref, p.meas), U: n(p.U), cmc: n(p.cmc) }]; }));
  }
  return {
    v: 1, kind, draft, values,
    notices: notices.map((p) => ({ key: p.key, field: p.field, why: p.why })),
    confirmations,
    ...(unlock ? { unlock: { id: unlock.id, by: unlock.by, at: unlock.at, reason: unlock.reason } } : {}),
  };
}
