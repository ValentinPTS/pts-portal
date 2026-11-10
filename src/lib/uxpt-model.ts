// The u(x_pt) ≤ 0.3·σ_pt check (plan part 7.6; К16; D3). Pure. While 2.0 returns documents only,
// 2.0's report states it and the scheme manager confirms it before the report is issued: met for
// every characteristic; not for all — the report carries the sentence on the uncertainty (which, in
// words); or not applicable (a calibration scheme — Eₙ, no σ_pt — the reason in words). Bound to the
// report in force by its hash: another report, none in force. The portal compares no numbers (К16:
// when 2.0 returns them as data, the comparison is made on them).

export type UxptAnswer = "met" | "exceeded" | "na";
export interface UxptCheck { id: string; at: string; by: string; importId: string; reportSha: string; answer: UxptAnswer; note: string }

export const UXPT_NOTE_MIN = 5;
/** The answers a scheme may give: a testing scheme — met, or not for all; a calibration scheme
 *  (Eₙ — no σ_pt) — not applicable, and only that (7.6 review). */
export const answersFor = (type: string | undefined): readonly UxptAnswer[] => (type === "C" ? ["na"] : ["met", "exceeded"]);
/** The answer: «met»; «exceeded» and «na» with their words (required) — one its scheme may give. */
export function readUxpt(input: { answer: unknown; note: unknown }, type?: string): { ok: true; answer: UxptAnswer; note: string } | { ok: false; problem: "uxpt-answer" | "uxpt-note" } {
  const a = input.answer === "met" || input.answer === "exceeded" || input.answer === "na" ? input.answer : null;
  if (!a || !answersFor(type).includes(a)) return { ok: false, problem: "uxpt-answer" };
  const note = (typeof input.note === "string" ? input.note : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1000);
  if (a !== "met" && [...note].length < UXPT_NOTE_MIN) return { ok: false, problem: "uxpt-note" };
  return { ok: true, answer: a, note };
}

/** The confirmation in force: the latest for this report — its import and its hash, as the transfer
 *  check (7.4): a re-import, or a later R going back to an earlier file, is read again (review). */
export const uxptInForce = (checks: readonly UxptCheck[] | undefined, reportSha: string | undefined | null, importId?: string | null): UxptCheck | null =>
  (reportSha ? [...(checks ?? [])].reverse().find((c) => c.reportSha === reportSha && (importId == null || c.importId === importId)) : undefined) ?? null;

export const UXPT_ANSWER_TEXT: Record<UxptAnswer, { bg: string; en: string }> = {
  met: { bg: "u(x_pt) ≤ 0,3·σ_pt — изпълнено за всяка характеристика", en: "u(x_pt) ≤ 0.3·σ_pt — met for every characteristic" },
  exceeded: { bg: "u(x_pt) > 0,3·σ_pt за някои — докладът съдържа изречението за неопределеността", en: "u(x_pt) > 0.3·σ_pt for some — the report carries the sentence on the uncertainty" },
  na: { bg: "u(x_pt) ≤ 0,3·σ_pt — не се прилага (калибриране, Eₙ)", en: "u(x_pt) ≤ 0.3·σ_pt — not applicable (calibration, Eₙ)" },
};
