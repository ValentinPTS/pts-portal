// The waiting list (plan part 9.3; Реш. 120, 127; Zadanie А16). Pure.
//
// A scheme with a maximum of participants (3.7 — hidden from laboratories): the applications still in
// the round, in the order they were entered (the online one — its submission time, 9.2; PTS's — when PTS
// entered it), the first up to the maximum are in; the rest are on the waiting list, in that order. Until
// the final list (5.2), a refusal or a withdrawal moves the next one up by itself. The final list leaves
// the waiting list out and keeps it — who was waiting then. After the receipt protocols PTS admits the
// FIRST in line when a reserve object is free (a calibration scheme — its device travels: no object) and
// the minimum days before the results deadline hold (Реш. 127, as a replacement object, 5.6); admitted, it
// joins the final list. «Запълнена» is a label and a warning, never a closure (Реш. 120): applying closes
// only by its date or by PTS's hand.

import { inRound, objectsNeeded, selectionsOf, type Selections, type Standing } from "./application-model";
import { currentFinalList, finalSelectionsOf, splitFor, inFinalRound } from "./announcement-model";
import { toCode, isProvisional } from "./coding-model";
import { deliveryOf, deliveryProgress, minDaysOf, receivedOtherwise, otherReceipts } from "./delivery-model";
import { workingDaysBetween } from "./holidays-model";
import type { Scheme } from "./types";
import { currentSecondAnnouncement, type Lifecycle } from "./lifecycle-model";

type Part = { id: string; code: string; createdAt?: string; standing?: Standing | null; selections?: Selections; characteristics?: number[] };
/** An admission — made under ONE final list (its second announcement's moment, `listAt`): a step back
 *  that undoes the list undoes it too (9.3 review). */
export interface Admission { participantId: string; at: string; by: string; listAt?: string }

/** In the order entered — the time, then the code (a row with no time last, by its code). */
export function byEntry<T extends Pick<Part, "code" | "createdAt">>(parts: readonly T[]): T[] {
  return [...parts].sort((a, b) => (a.createdAt ?? "￿").localeCompare(b.createdAt ?? "￿") || a.code.localeCompare(b.code));
}

/** The waiting list before the final list: the applications in the round beyond the maximum, in order. */
export function waitingBeforeList(parts: readonly Part[], max: number | undefined): string[] {
  if (max === undefined || !Number.isInteger(max) || max < 0) return [];
  return byEntry(parts.filter((p) => inRound(p))).slice(max).map((p) => p.id);
}

/** The waiting list the second announcement keeps (9.3 review): beyond the maximum, in order — among
 *  the participations that have a characteristic that RUNS only (one with none goes no further, and is
 *  told so; never waits). A scheme with no characteristics: all in the round. */
export function waitingAtAnnouncement(parts: readonly Part[], runs: readonly number[], characteristicCount: number, max: number | undefined): string[] {
  if (max === undefined || !Number.isInteger(max) || max < 0) return [];
  const eligible = parts.filter((p) => inRound(p) && (!characteristicCount || splitFor(p, runs, characteristicCount).runs.length > 0));
  return byEntry(eligible).slice(max).map((p) => p.id);
}

/** The waiting list now: before the final list — by the maximum and the order; after it — those the list
 *  kept as waiting, still in the round and not admitted, in the order they were kept. */
export function waitingNow(o: { parts: readonly Part[]; max: number | undefined; finalWaitlist?: readonly string[] | null; admitted: readonly Admission[] }): string[] {
  const admitted = new Set(o.admitted.map((a) => a.participantId));
  if (o.finalWaitlist) {
    const live = new Set(o.parts.filter((p) => inRound(p)).map((p) => p.id));
    return o.finalWaitlist.filter((id) => live.has(id) && !admitted.has(id));
  }
  return waitingBeforeList(o.parts, o.max).filter((id) => !admitted.has(id));
}

/** «Запълнена» (Реш. 120): the maximum reached by the applications in the round — a label, never a closure. */
export const isFullNow = (parts: readonly Part[], max: number | undefined) => max !== undefined && parts.filter((p) => inRound(p)).length >= max;

/** May PTS admit this one from the waiting list now? The FIRST in line only; a free reserve object (a
 *  testing scheme); the minimum days before the results deadline (Реш. 127) — the caller computes the
 *  working days left with the scheme's days off. */
/** May PTS admit this one from the waiting list now (9.3 review)? Only while the scheme runs, after its
 *  final list, the coding act done for it and — a testing scheme — every receipt protocol in (the reserve
 *  objects are known once the list's objects arrived); the FIRST in line only; a characteristic of it
 *  running; as many free reserve objects as it needs (they are drawn for it by the coding act); the
 *  minimum days before the results deadline (Реш. 127). A calibration scheme has no reserve objects — its
 *  laboratories join through the instrument's route (3.4), not here. */
export function admitProblem(o: { participantId: string; waiting: readonly string[]; status: string; finalListMade: boolean; type: "T" | "C" | string; uncoded: number; awaitingReceipt: number; runs: boolean; need: number; freeReserves: number; daysLeft: number | null; minDays: number }):
  "not-waiting" | "not-first" | "state" | "no-list" | "calibration" | "uncoded" | "receipts" | "no-run" | "no-reserve" | "no-deadline" | "too-late" | null {
  if (!o.waiting.includes(o.participantId)) return "not-waiting";
  if (o.waiting[0] !== o.participantId) return "not-first";
  if (o.status !== "running") return "state";
  if (!o.finalListMade) return "no-list";
  if (o.type === "C") return "calibration";
  if (o.uncoded > 0) return "uncoded";
  if (o.awaitingReceipt > 0) return "receipts";
  if (!o.runs) return "no-run";
  if (o.freeReserves < Math.max(1, o.need)) return "no-reserve";
  if (o.daysLeft === null) return "no-deadline";
  if (o.daysLeft < o.minDays) return "too-late";
  return null;
}

/** The reserve objects free: the batches' reserve objects (3.5 — drawn at random), less those the coding
 *  act gave to admitted participations, the replacements sent (5.6 — one object each) and the objects the
 *  admissions not yet coded will take (9.3 review: by the objects each NEEDS, never one per admission). */
export const freeReserves = (reserves: number, used: number) => Math.max(0, reserves - used);
export function reserveCounts(s: { batches?: { objects: { code?: string; role?: string }[] }[]; deliveries?: Record<string, { shipments?: { kind: string }[] }>; coding?: { objects?: Record<string, string[]> }[] }, pendingNeed = 0):
  { reserves: number; given: number; replacements: number; pending: number; free: number } {
  const reserveCodes = new Set((s.batches ?? []).flatMap((b) => b.objects.filter((o) => o.role === "reserve").map((o) => o.code ?? "")));
  const given = (s.coding ?? []).flatMap((r) => Object.values(r.objects ?? {}).flat()).filter((c) => reserveCodes.has(c)).length;
  const replacements = Object.values(s.deliveries ?? {}).reduce((a, d) => a + (d.shipments ?? []).filter((x) => x.kind === "replacement").length, 0);
  return { reserves: reserveCodes.size, given, replacements, pending: pendingNeed, free: freeReserves(reserveCodes.size, given + replacements + pendingNeed) };
}

/** The objects a participation needs under the final list — 0 when none of its characteristics runs. */
export function needOf(p: Part, runs: readonly number[] | null, characteristicCount: number): number {
  const sel = runs ? finalSelectionsOf(p, { runs: [...runs] }, characteristicCount) : selectionsOf(p, characteristicCount);
  return Object.keys(sel).length ? objectsNeeded(sel, "T") : 0;
}

/** The admissions made under the scheme's current final list (a step back undoes the others). */
export function admissionsNow(s: { status: string; lifecycle?: Lifecycle; waitlistAdmitted?: Admission[] }): Admission[] {
  const a = currentFinalList(s) ? currentSecondAnnouncement(s) : undefined;
  return a ? (s.waitlistAdmitted ?? []).filter((x) => x.listAt === a.at) : [];
}

export const ADMIT_PROBLEM_TEXT: Record<NonNullable<ReturnType<typeof admitProblem>>, { bg: string; en: string }> = {
  "not-waiting": { bg: "участието не е в списъка на изчакващите", en: "the participation is not on the waiting list" },
  state: { bg: "допуска се само докато схемата е «В процес»", en: "admission only while the scheme is «In progress»" },
  calibration: { bg: "калибриране: няма резервни обекти — лабораторията влиза в маршрута на уреда (3.4) с промяна на окончателния списък", en: "calibration: there are no reserve objects — the laboratory joins the instrument's route (3.4) by a change of the final list" },
  uncoded: { bg: "първо кодирането на окончателния списък", en: "first the coding act for the final list" },
  receipts: { bg: "допускането — след протоколите за получаване на всички от окончателния списък", en: "admission — after the receipt protocols of everyone on the final list" },
  "no-run": { bg: "нито една от характеристиките му не се провежда", en: "none of its characteristics runs" },
  "not-first": { bg: "допуска се първият по ред в списъка на изчакващите", en: "the first in line on the waiting list is admitted" },
  "no-list": { bg: "допускане от списъка на изчакващите — след окончателния списък и протоколите за получаване", en: "admission from the waiting list — after the final list and the receipt protocols" },
  "no-reserve": { bg: "няма достатъчно свободни резервни обекти за него", en: "not enough reserve objects are free for it" },
  "no-deadline": { bg: "няма срок за резултатите — минималният брой дни не може да се провери", en: "there is no results deadline — the minimum days cannot be checked" },
  "too-late": { bg: "до срока за резултатите остават по-малко от минималните работни дни (Реш. 127)", en: "fewer than the minimum working days are left before the results deadline (Decision 127)" },
};

type SchemeLike = { status: string; lifecycle?: Lifecycle; commercial?: { maxParticipants?: number }; waitlistAdmitted?: Admission[] };

/** The scheme's waiting list now — from its maximum, its final list (once there is one) and its
 *  admissions. The maximum is read here, never by a laboratory's page (3.7). */
export function waitingOf(s: SchemeLike, parts: readonly Part[]): string[] {
  const list = currentFinalList(s);
  return waitingNow({ parts, max: s.commercial?.maxParticipants, finalWaitlist: list ? list.waitlist ?? [] : null, admitted: admissionsNow(s) });
}

/** «Запълнена» for the laboratory's page — a yes or a no, never the maximum (3.7). */
export const schemeFull = (s: SchemeLike, parts: readonly Part[]) => isFullNow(parts, s.commercial?.maxParticipants);

/** Everything an admission rests on, read from the scheme and its participations — for PTS's page and
 *  the act alike (one reading). `today` — the round's day (Sofia); `off` — the days off. */
export function admissionCheck(s: Scheme, parts: readonly (Part & { status?: string })[], participantId: string | undefined, today: string, off: ReadonlySet<string>,
  events: readonly { code: string; kind: string; source?: string; voidedAt?: string; recordedAt?: string }[] = []) {
  const waiting = waitingOf(s, parts);
  const list = currentFinalList(s);
  const n = s.parameters.length;
  const runs = list?.runs ?? null;
  const p = participantId ? parts.find((x) => x.id === participantId) : undefined;
  const need = p && s.type === "T" ? needOf(p, runs, n) : 0;
  const onList = list ? parts.filter((q) => inFinalRound(s, q)) : [];
  // the coding act's work still to do — the one being admitted aside
  const uncoded = toCode(s, parts).filter((q) => q.id !== participantId).length;
  // received — its latest shipment's protocol, or received otherwise (the scan, PTS's step — 5.6)
  const received = (q: Part) => { const d = deliveryOf(s, q.id); return !!deliveryProgress(d, receivedOtherwise(d, otherReceipts(s, q.code, events.filter((e) => e.code === q.code))))?.received; };
  const awaitingReceipt = s.type === "T" ? onList.filter((q) => !isProvisional(q.code) && !received(q)).length : 0;
  // the admissions not coded yet will take their objects from the reserve
  const admittedIds = new Set(admissionsNow(s).map((a) => a.participantId));
  const pendingNeed = parts.filter((q) => admittedIds.has(q.id) && isProvisional(q.code)).reduce((a, q) => a + needOf(q, runs, n), 0);
  const reserves = reserveCounts(s, pendingNeed);
  const due = s.dates?.resultsDue;
  const daysLeft = due ? workingDaysBetween(today, due.slice(0, 10), off) : null;
  const problem = participantId ? admitProblem({
    participantId, waiting, status: s.status, finalListMade: !!list, type: s.type, uncoded, awaitingReceipt,
    runs: !n || need > 0, need, freeReserves: reserves.free, daysLeft, minDays: minDaysOf(s),
  }) : null;
  return { waiting, reserves, awaitingReceipt, need, problem };
}
