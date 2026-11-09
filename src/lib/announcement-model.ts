// The two announcements (plan part 5.2; Zadanie «Двете обявявания»; Реш. 24, 65, 66,
// 129). Pure.
//
// FIRST: the scheme runs (its minimum of participants reached) or it is «не се
// състои» — every applicant still in the round is told; nothing is invoiced in a
// scheme not held.
// SECOND: which characteristics run and which drop, and so the final list of
// participants. Its message is INDIVIDUAL — made from what each participant applied
// for (Реш. 65). A characteristic runs, by default, once it has five participations
// (Реш. 66); PTS decides, the counts shown. A participation none of whose
// characteristics runs is not on the final list: it goes no further and is never
// invoiced. Proformas only after the second announcement (Реш. 65).

import { characteristicsOf, inRound, selectionsOf, type Selections, type Standing } from "./application-model";
import { currentSecondAnnouncement, type Lifecycle } from "./lifecycle-model";

/** Реш. 66: a characteristic's set is final at five participations. */
export const MIN_PER_CHARACTERISTIC = 5;

/** What the second announcement settled — kept with its act, never changed after. */
export interface FinalList {
  /** the characteristics that run (indexes in the scheme) */
  runs: number[];
  /** the ones that drop */
  dropped: number[];
  /** the participations on the final list (their ids) */
  participants: string[];
  /** the same characteristics by their stable ids (3.6) — for the record and the export */
  runIds?: string[];
  droppedIds?: string[];
}

type Part = { id: string; selections?: Selections; characteristics?: number[]; standing?: Standing | null };

/** The participations applied for each characteristic, by the participations still in
 *  the round (a laboratory's two participations in one count two). */
export function countsPerCharacteristic(parts: readonly Part[], characteristicCount: number): number[] {
  const out = Array.from({ length: characteristicCount }, () => 0);
  for (const p of parts) {
    if (!inRound(p)) continue;
    for (const [k, v] of Object.entries(selectionsOf(p, characteristicCount))) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < characteristicCount && v > 0) out[i] += v;
    }
  }
  return out;
}

/** The characteristics that run unless PTS decides otherwise: those with five. */
export const defaultRuns = (counts: readonly number[], min = MIN_PER_CHARACTERISTIC): number[] =>
  counts.flatMap((c, i) => (c >= min ? [i] : []));

/** One participation under the runs: its own characteristics that run and that drop. */
export function splitFor(p: Part, runs: readonly number[], characteristicCount: number): { runs: number[]; dropped: number[] } {
  const own = characteristicsOf(selectionsOf(p, characteristicCount));
  const set = new Set(runs);
  return { runs: own.filter((i) => set.has(i)), dropped: own.filter((i) => !set.has(i)) };
}

/** The final list under the runs: every participation in the round with a
 *  characteristic that runs. */
export function finalListOf(parts: readonly Part[], runs: readonly number[], characteristicCount: number): FinalList {
  const r = [...new Set(runs)].filter((i) => Number.isInteger(i) && i >= 0 && i < characteristicCount).sort((a, b) => a - b);
  const dropped = Array.from({ length: characteristicCount }, (_, i) => i).filter((i) => !r.includes(i));
  return { runs: r, dropped, participants: parts.filter((p) => inRound(p) && splitFor(p, r, characteristicCount).runs.length > 0).map((p) => p.id) };
}

/** Its selections under the final list — the characteristics that run only. */
export function finalSelectionsOf(p: Part, final: Pick<FinalList, "runs">, characteristicCount: number): Selections {
  const set = new Set(final.runs);
  return Object.fromEntries(Object.entries(selectionsOf(p, characteristicCount)).filter(([k]) => set.has(Number(k))));
}

/** The final list of the scheme's current run — undefined before its second
 *  announcement, and once the scheme is stepped back to open (or not held): a step
 *  back undoes it, a new first and second announcement make the next. One made before
 *  5.2 kept no list: every participation in the round. */
export function currentFinalList(s: { status: string; lifecycle?: Lifecycle }): { participants: string[] | null; runs: number[] | null } | undefined {
  if (!["running", "processing", "report", "closed"].includes(s.status)) return undefined;
  const a = currentSecondAnnouncement(s);
  if (!a) return undefined;
  return a.final ? { participants: a.final.participants, runs: a.final.runs } : { participants: null, runs: null };
}

/** Does the participation go on in the round — in it, and on the final list once there
 *  is one? (5.2 review: one off the list is told it goes no further — no reminders, no
 *  results, not counted.) */
export function inFinalRound(s: { status: string; lifecycle?: Lifecycle }, p: { id: string; standing?: Standing | null }): boolean {
  if (!inRound(p)) return false;
  const list = currentFinalList(s);
  return !list?.participants || list.participants.includes(p.id);
}

/** May this participation be invoiced (a proforma) now — or why not. */
export function invoiceProblem(s: { status: string; lifecycle?: Lifecycle }, p: { id: string; standing?: Standing | null }): "before-second" | "not-final" | null {
  const list = currentFinalList(s);
  if (!list) return "before-second";
  if (!inRound(p)) return "not-final";
  if (list.participants && !list.participants.includes(p.id)) return "not-final";
  return null;
}

export const ANNOUNCEMENT_PROBLEM_TEXT = {
  runs: { bg: "изберете поне една характеристика, която се провежда — ако не се провежда нито една, върнете схемата назад и обявете, че не се състои", en: "choose at least one characteristic that runs — if none runs, step the scheme back and declare it not held" },
  changed: { bg: "характеристиките на схемата се промениха междувременно — отворете страницата отново", en: "the scheme's characteristics changed meanwhile — open the page again" },
  "final-list": { bg: "нито едно участие няма характеристика, която се провежда", en: "no participation has a characteristic that runs" },
  "not-final": { bg: "участието не е в окончателния списък — то не продължава и не се фактурира", en: "the participation is not on the final list — it goes no further and is not invoiced" },
  "before-second": { bg: "проформа се издава само след второто обявяване (Реш. 65)", en: "a proforma is issued only after the second announcement (Реш. 65)" },
  "list-final": { bg: "окончателният списък е обявен — за да го промените, върнете схемата към предишното състояние", en: "the final list is announced — to change it, step the scheme back to its previous state" },
};
