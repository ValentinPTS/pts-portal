// Anonymous feedback (plan part 10.3; Реш. 92, 122; К21). Pure.
//
// The questions are the feedback sheet's (F 8.6-2, lib/docs/feedback.ts): communication and service (1–5),
// would use again (yes / no / other + words), suggestions for next year, comments. What is kept says
// nothing of who or when: per scheme, COUNTERS (each answer) and the WORDS as an unordered set — no time,
// no participation, no account, no order of arrival; no journal line — the one act in the portal outside
// the journal (К21). The participation keeps only «given», so it is offered once.
//
// Given while the report stands — never after the records are closed (10.3 review: a step back and a second
// close would show the difference). PTS sees the answers only once the records are CLOSED (giving ended —
// nothing to read off by watching the counts change) and only from three; until then only «fewer than
// three / three or more».

export const WORDS_MAX = 2000;
export const FEEDBACK_SHOWN_FROM = 3;
export type Rating = 1 | 2 | 3 | 4 | 5;
export type Again = "yes" | "no" | "other";
export interface FeedbackAnswers { q1?: Rating; q2?: Rating; q3?: Again; q3text?: string; q4?: string; q5?: string }
export type FeedbackProblem = "empty" | "rating" | "again" | "too-long";

// control characters, bidi overrides and zero-width characters out (10.3 review); line breaks kept
const clean = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "").trim();

/** The answers as the form sent them — each optional, one at least. */
export function readFeedback(input: Record<string, unknown>): { ok: true; answers: FeedbackAnswers } | { ok: false; problem: FeedbackProblem } {
  const a: FeedbackAnswers = {};
  for (const k of ["q1", "q2"] as const) {
    const v = clean(input[k]);
    if (!v) continue;
    if (!/^[1-5]$/.test(v)) return { ok: false, problem: "rating" };
    a[k] = Number(v) as Rating;
  }
  const again = clean(input.q3);
  if (again) {
    if (again !== "yes" && again !== "no" && again !== "other") return { ok: false, problem: "again" };
    a.q3 = again;
  }
  const words = { q3text: a.q3 === "other" ? clean(input.q3text) : "", q4: clean(input.q4), q5: clean(input.q5) };
  for (const [k, v] of Object.entries(words) as [keyof typeof words, string][]) {
    if (!v) continue;
    if ([...v].length > WORDS_MAX) return { ok: false, problem: "too-long" };
    a[k] = v;
  }
  if (!Object.keys(a).length) return { ok: false, problem: "empty" };
  return { ok: true, answers: a };
}

/** The counters one feedback adds: «total», and each answer given (q1:1…5, q2:1…5, q3:yes|no|other). */
export function keysOf(a: FeedbackAnswers): string[] {
  return ["total", ...(a.q1 ? [`q1:${a.q1}`] : []), ...(a.q2 ? [`q2:${a.q2}`] : []), ...(a.q3 ? [`q3:${a.q3}`] : [])];
}
/** The words one feedback adds — by question, never with who or when. */
export function wordsOf(a: FeedbackAnswers): { q: "q3" | "q4" | "q5"; text: string }[] {
  return [...(a.q3text ? [{ q: "q3" as const, text: a.q3text }] : []), ...(a.q4 ? [{ q: "q4" as const, text: a.q4 }] : []), ...(a.q5 ? [{ q: "q5" as const, text: a.q5 }] : [])];
}

type Lifecycled = { status: string; lifecycle?: { acts?: readonly { act: string }[] } };
/** The records were closed once — giving ended for good, even after a step back. */
const everClosed = (s: Lifecycled) => s.status === "closed" || !!s.lifecycle?.acts?.some((a) => a.act === "close");
/** Offered to a participation on the final list while the report stands — never once the records were closed. */
export const feedbackOffered = (s: Lifecycled, inFinal: boolean) => inFinal && s.status === "report" && !everClosed(s);
/** PTS sees the answers once the records are closed, from three. */
export const feedbackShown = (total: number, s: Lifecycled) => everClosed(s) && s.status === "closed" && total >= FEEDBACK_SHOWN_FROM;
/** While giving: only whether three have given — never the exact number (a reload would time each give). */
export const feedbackBand = (total: number): "none" | "under" | "enough" => (total <= 0 ? "none" : total < FEEDBACK_SHOWN_FROM ? "under" : "enough");

/** The words in a fixed order — never the order they came in. */
export const sortedWords = <T extends { q: string; text: string }>(ws: readonly T[]) => [...ws].sort((x, y) => x.q.localeCompare(y.q) || x.text.localeCompare(y.text, "bg"));

export const QUESTION_TEXT: Record<"q1" | "q2" | "q3" | "q4" | "q5", { bg: string; en: string }> = {
  q1: { bg: "Как преценявате нивото на комуникация по време на провеждането на изпитването за пригодност?", en: "How do you assess the level of communication during the proficiency test?" },
  q2: { bg: "Как преценявате нивото на предоставената услуга?", en: "How do you assess the level of service provided?" },
  q3: { bg: "Бихте ли използвали отново услугите на PTS Bulgaria?", en: "Would you use PTS Bulgaria's services again?" },
  q4: { bg: "Предложете продукти и характеристики за изпитване за пригодност през следващата година.", en: "Suggest products and parameters for proficiency testing next year." },
  q5: { bg: "Коментари, бележки, препоръки и предложения за подобряване на услугата:", en: "Comments, notes, recommendations and suggestions for improving the service:" },
};
export const FEEDBACK_PROBLEM_TEXT: Record<FeedbackProblem | "given" | "not-offered" | "failed", { bg: string; en: string }> = {
  empty: { bg: "отговорете поне на един въпрос", en: "answer one question at least" },
  rating: { bg: "оценката е от 1 до 5", en: "the rating is 1 to 5" },
  again: { bg: "изберете «Да», «Не» или «Друго»", en: "choose «Yes», «No» or «Other»" },
  "too-long": { bg: `отговорът е до ${WORDS_MAX} знака`, en: `an answer is ${WORDS_MAX} characters at most` },
  given: { bg: "обратната връзка за това участие вече е дадена", en: "the feedback for this participation is given already" },
  "not-offered": { bg: "обратна връзка се дава след издаването на доклада, до приключването на записите", en: "feedback is given once the report is issued, until the records are closed" },
  failed: { bg: "не се записа — опитайте отново", en: "it was not recorded — try again" },
};
