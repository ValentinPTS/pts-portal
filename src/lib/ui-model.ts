// Redesign R0 (2026-11-18, direction A «Пътека от стъпки»): what the shared building blocks say, kept apart from
// their markup (no React here) — every state has its words, and every pill its icon, so a state is never told by
// colour alone. The blocks: components/ui; their rules: scripts/ui-r0.test.ts; the plan: docs/participant-portal/REDESIGN.md.
import type { IconName } from "./ui-icons";
import type { PState, Stage } from "./participation-state-model";

/** A step on a path: done (green, a tick), now (orange — the person's turn), wait (the current step, but someone else
 *  has it — grey, a clock: orange is never shown for what the person cannot do), later (grey, dashed). */
export type StepState = "done" | "now" | "wait" | "later";
export const STEP_STATES: readonly StepState[] = ["done", "now", "wait", "later"];

/** A pill beside a thing: turn (it waits for this person), done, later (it waits for someone else), info. */
export type PillState = "turn" | "done" | "later" | "info";
export const PILL_STATES: readonly PillState[] = ["turn", "done", "later", "info"];

export const STATE_WORD: Record<StepState, { bg: string; en: string }> = {
  done: { bg: "Готово", en: "Done" },
  now: { bg: "Ваш ред сега", en: "Your turn now" },
  wait: { bg: "Чака PTS", en: "Waiting for PTS" },
  later: { bg: "После", en: "Later" },
};

/** A participation's stages, each with its picture (the bar on the laboratory's pages, R2). */
export const STAGE_ICON: Record<Stage, IconName> = { application: "doc", dispatch: "truck", receipt: "box", work: "flask", results: "pencil", report: "award" };

/** Is it the laboratory's turn in this state — something it does now (the path's step orange, «Ваш ред»)? The object
 *  sent (confirm it when it arrives), with it (the testing or the calibration), the results a draft, the carrier to
 *  choose (Реш. 128). Everything else waits for PTS — or has ended. */
export const labsTurn = (s: PState): boolean => s === "dispatched" || s === "received" || s === "draft" || s === "carrier";

export const PILL_ICON: Record<PillState, IconName> = { turn: "pencil", done: "check", later: "clock", info: "info" };

/** The steps of a path with their states, from where the person is now: the steps before it are done, it is now, the
 *  ones after it later. Before the first (-1): all later; past the last: all done. */
export function pathSteps<T extends object>(steps: readonly T[], nowIndex: number): (T & { state: StepState })[] {
  return steps.map((s, i) => ({ ...s, state: i < nowIndex ? "done" : i === nowIndex ? "now" : "later" }));
}
