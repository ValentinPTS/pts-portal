// The lifecycle of a scheme (plan part 3.2; Zadanie §3 and §11; О9 / Реш. 129, 111,
// 140, 147). Pure — no I/O — so the page, the actions and the tests share one truth.
//
// The 19 stages of Zadanie §3, each shown for every scheme, each in one of the scheme
// STATES. A stage is done in one of three ways:
//   • a dated TICK by the role responsible — the internal stages the portal reflects
//     but does not perform (1, 2, 4, 6, 14, 15, 16), and those whose own act comes in
//     a later part (3, 5, 9, 10, 13) — who ticked it and when, on record;
//   • an ACT that moves the scheme from one state to the next (7 open, 8 the first
//     announcement, 17 the report, 19 closing the records);
//   • from the portal's own record (11 the measurements, 12 the results, 18 the
//     feedback form sent).
// The date the statistical design was approved (stage 4) is `design_approved` — it
// proves the criteria came before the results (Scheme_meta, 3.13 / 7.1).
//
// For calibration the stages read differently (§11): one instrument travels lab to
// lab, and the end of the measurements is an EVENT — the reference calibration after
// the last participant — not a date. Processing starts only after it.

import type { FinalList } from "./announcement-model";
import type { Capability } from "./role-model";
import type { Scheme, SchemeStatus } from "./types";

/** In the order a scheme moves through them; «не се състои» ends a scheme at its
 *  first announcement (О9, Реш. 129). */
export const STATES: readonly SchemeStatus[] = ["draft", "open", "running", "processing", "report", "closed", "not_held"];
const ORDER: readonly SchemeStatus[] = ["draft", "open", "running", "processing", "report", "closed"];
export const stateIndex = (s: SchemeStatus): number => (s === "not_held" ? ORDER.indexOf("open") : ORDER.indexOf(s));

export const STATE_LABEL: Record<SchemeStatus, { bg: string; en: string }> = {
  draft: { bg: "Чернова", en: "Draft" },
  open: { bg: "Отворена", en: "Open" },
  running: { bg: "В процес", en: "In progress" },
  processing: { bg: "Обработка", en: "Processing" },
  report: { bg: "Докладът е издаден", en: "Report issued" },
  closed: { bg: "Приключена", en: "Closed" },
  not_held: { bg: "Не се състои", en: "Not held" },
};

// ── the acts ────────────────────────────────────────────────────────────────

export type ActKey = "open" | "announce" | "not_held" | "announce2" | "process" | "report" | "close" | "back";
export const ACT_KEYS: readonly ActKey[] = ["open", "announce", "not_held", "announce2", "process", "report", "close", "back"];
export const isActKey = (v: unknown): v is ActKey => typeof v === "string" && (ACT_KEYS as readonly string[]).includes(v);

/** What each act does: from which state, to which; whether it needs a note. Every
 *  act is the scheme manager's (scheme.edit) — the provider's decision, made by the
 *  manager of the scheme the Order names. */
export const ACTS: Record<ActKey, { from: readonly SchemeStatus[]; to: SchemeStatus | null; note: "required" | "optional" | "none"; bg: string; en: string }> = {
  open: { from: ["draft"], to: "open", note: "none", bg: "Отвори схемата (покана и заявки)", en: "Open the scheme (invitation and applications)" },
  announce: { from: ["open"], to: "running", note: "optional", bg: "Първо обявяване: схемата ще се проведе", en: "First announcement: the scheme will run" },
  not_held: { from: ["open"], to: "not_held", note: "required", bg: "Първо обявяване: схемата не се състои", en: "First announcement: the scheme is not held" },
  announce2: { from: ["running"], to: null, note: "optional", bg: "Второ обявяване: окончателен списък на участниците", en: "Second announcement: the final list of participants" },
  // 6.6 (Реш. 21): the start of processing IS the technical end of the submission — one act
  process: { from: ["running"], to: "processing", note: "optional", bg: "Заключи подаването и започни обработката", en: "Lock the submission and start processing" },
  report: { from: ["processing"], to: "report", note: "optional", bg: "Издай окончателния доклад", en: "Issue the final report" },
  close: { from: ["report"], to: "closed", note: "optional", bg: "Приключи записите", en: "Close the records" },
  back: { from: ["open", "running", "processing", "closed", "not_held"], to: null, note: "required", bg: "Върни към предишното състояние", en: "Step back to the previous state" },
};

/** Where «back» returns to. A report issued to the participants is never taken back —
 *  its correction is the next edition (3.0, ISO/IEC 17043 §7.4.3). */
export const BACK_TO: Partial<Record<SchemeStatus, SchemeStatus>> = {
  open: "draft", running: "open", not_held: "open", processing: "running", closed: "report",
};

export const MIN_NOTE = 5;
export const MAX_NOTE = 1000;
const chars = (s: string) => [...s].length;

// ── the stages ──────────────────────────────────────────────────────────────

/** Who ticks a stage: a capability in the scheme, or the person designated for the
 *  processing act (2.5, Реш. 140). */
export type Ticker = { cap: Capability } | { designated: "processor" | "reviewer" | "approver" };
export type StageWay = { tick: Ticker } | { act: ActKey } | { record: "measurements" | "results" | "feedback" };

export interface StageDef {
  no: number;
  bg: string;
  en: string;
  /** the calibration reading (§11), where it differs */
  cal?: { bg: string; en: string };
  /** the state in which the stage happens */
  state: SchemeStatus;
  /** Zadanie §3: 7–13 and 17–18 go through the portal; the others it reflects */
  inPortal: boolean;
  way: StageWay;
  /** a later part does it through the portal; until then, a tick */
  later?: string;
}

export const STAGES: readonly StageDef[] = [
  { no: 1, bg: "Иницииране — заповед за планиране и екип", en: "Initiation — the Order for planning and the team", state: "draft", inPortal: false, way: { tick: { cap: "order.manage" } } },
  { no: 2, bg: "Становище на инженера по материалите", en: "The materials engineer's opinion", state: "draft", inPortal: false, way: { tick: { cap: "items.manage" } } },
  { no: 3, bg: "План на схемата (Ф 7.2.1-1) — утвърден", en: "Scheme plan (F 7.2.1-1) — approved", state: "draft", inPortal: false, way: { tick: { cap: "scheme.edit" } } },
  { no: 4, bg: "Статистически проект (Ф 7.2.2-1) — одобрен, преди резултатите", en: "Statistical design (F 7.2.2-1) — approved, before the results", state: "draft", inPortal: false, way: { tick: { cap: "scheme.edit" } } },
  { no: 5, bg: "Подготовка на обектите (партида)", en: "Preparing the items (the batch)", cal: { bg: "Подготовка на уреда и първоначално референтно калибриране", en: "Preparing the instrument and its first reference calibration" }, state: "draft", inPortal: false, way: { tick: { cap: "items.manage" } } },
  { no: 6, bg: "Оценяване на хомогенността и стабилността", en: "Homogeneity and stability assessed", cal: { bg: "Стабилност на уреда", en: "The instrument's stability" }, state: "draft", inPortal: false, way: { tick: { cap: "results.process" } } },
  { no: 7, bg: "Покана (Ф 7.2.1-2) и заявки (Ф 7.2.1-3)", en: "Invitation (F 7.2.1-2) and applications (F 7.2.1-3)", state: "open", inPortal: true, way: { act: "open" } },
  { no: 8, bg: "Първо обявяване — ще се проведе ли", en: "First announcement — will it run", state: "open", inPortal: true, way: { act: "announce" } },
  { no: 9, bg: "Кодиране — кодове на случаен принцип", en: "Coding — codes at random", cal: { bg: "Кодиране и ред на веригата", en: "Coding and the order of the chain" }, state: "running", inPortal: true, way: { tick: { cap: "results.enter" } } }, // done by the coding act (5.3); a sequential calibration scheme ticks it (D17)
  { no: 10, bg: "Изпращане на обектите", en: "Dispatching the items", cal: { bg: "Уредът тръгва по веригата", en: "The instrument sets off along the chain" }, state: "running", inPortal: true, way: { tick: { cap: "dispatch" } }, later: "5.6" },
  { no: 11, bg: "Измервания от участниците", en: "Measurements by the participants", cal: { bg: "Измервания по веригата", en: "Measurements along the chain" }, state: "running", inPortal: true, way: { record: "measurements" } },
  { no: 12, bg: "Подаване на резултати", en: "Results submitted", cal: { bg: "Резултати и повторно референтно калибриране", en: "Results and the closing reference calibration" }, state: "running", inPortal: true, way: { record: "results" } },
  { no: 13, bg: "Проверка и кодиране на данните", en: "Data checked and coded", state: "processing", inPortal: true, way: { tick: { cap: "results.enter" } }, later: "6.x" },
  { no: 14, bg: "Статистическа обработка", en: "Statistical processing", state: "processing", inPortal: false, way: { tick: { designated: "processor" } } },
  { no: 15, bg: "Независим преглед", en: "Independent review", state: "processing", inPortal: false, way: { tick: { designated: "reviewer" } } },
  { no: 16, bg: "Одобряване", en: "Approval", state: "processing", inPortal: false, way: { tick: { designated: "approver" } } },
  { no: 17, bg: "Окончателен доклад (Ф 7.4.3-1) и сертификати", en: "Final report (F 7.4.3-1) and certificates", state: "report", inPortal: true, way: { act: "report" } },
  { no: 18, bg: "Обратна връзка (Ф 8.6-2)", en: "Feedback (F 8.6-2)", state: "report", inPortal: true, way: { record: "feedback" } },
  { no: 19, bg: "Приключване на записите", en: "Records closed", state: "closed", inPortal: false, way: { act: "close" } },
];
export const stageDef = (no: number): StageDef | undefined => STAGES.find((s) => s.no === no);
export const isTickStage = (no: number): boolean => { const d = stageDef(no); return !!d && "tick" in d.way; };

/** A stage's tick, on the scheme (Scheme.lifecycle.stages). */
export interface StageTick { at: string; by: string; day: string; note?: string; afterResults?: boolean }
/** An act, on the scheme (Scheme.lifecycle.acts) — and in the journal. */
export interface LifecycleAct {
  act: ActKey; from: SchemeStatus; to: SchemeStatus; at: string; by: string; day: string; note?: string;
  /** the second announcement's settlement — the characteristics that run and the final
   *  list (part 5.2, lib/announcement-model); never changed after */
  final?: FinalList;
  /** the first announcement: the participations in the round then, and the scheme's
   *  minimum — below it, it ran by PTS's decision, on record (5.2; Реш. 24, 129) */
  count?: { inRound: number; min: number };
}
export interface Lifecycle { stages?: Record<string, StageTick>; acts?: LifecycleAct[] }

// ── the rules ───────────────────────────────────────────────────────────────

export type ActProblem = "state" | "note" | "too-long" | "calibration-end" | "chain-incomplete" | "no-report" | "not-approved" | "twice" | "gone";

/** Why an act is refused, in words. */
export const ACT_PROBLEM_TEXT: Record<ActProblem, { bg: string; en: string }> = {
  state: { bg: "Схемата не е в състоянието за това действие.", en: "The scheme is not in the state for this act." },
  note: { bg: "Напишете основанието (поне 5 знака).", en: "Write the reason (at least 5 characters)." },
  "too-long": { bg: "Текстът е твърде дълъг (до 1000 знака).", en: "The text is too long (1000 characters at most)." },
  "calibration-end": { bg: "Повторното референтно калибриране след последния участник още не е записано във веригата — то слага край на измерванията.", en: "The closing reference calibration after the last participant is not yet recorded in the chain — it ends the measurements." },
  "no-report": { bg: "Окончателният доклад е файлът на PTS — първо го качете в документа «Окончателен доклад».", en: "The final report is PTS's file — upload it to the «Final report» document first." },
  "not-approved": { bg: "Резултатите още не са одобрени (етап 16).", en: "The results are not approved yet (stage 16)." },
  twice: { bg: "Второто обявяване вече е направено.", en: "The second announcement has already been made." },
  "chain-incomplete": { bg: "Не всеки участник е минал по веригата — уредът не е бил при всички.", en: "Not every participant has been through the chain — the instrument has not been with them all." },
  gone: { bg: "Схемата вече я няма (архивирана).", en: "The scheme is no longer there (archived)." },
};

/** Why a tick is refused, in words. */
export const TICK_PROBLEM_TEXT: Record<TickProblem | "not-ticked" | "who" | "settled" | "stale" | "self", { bg: string; en: string }> = {
  "by-act": { bg: "Етап 9 се отбелязва от акта «Кодиране» и остава с него (част 5.3).", en: "Stage 9 is marked by the coding act and stays with it (part 5.3)." },
  settled: { bg: "Одобрението на статистическия проект не се оттегля, след като обработката е започнала.", en: "The statistical design's approval is not withdrawn once processing has started." },
  stale: { bg: "Определянето за обработка вече не е в сила — ръководителят на РТ провайдъра определя отново (част 2.5).", en: "The processing designation no longer holds — the head of the PT provider designates again (part 2.5)." },
  self: { bg: "Не преглеждате или одобрявате собствената си обработка или преглед, освен ако определянето го допуска с обосновка (Реш. 140).", en: "You do not review or approve your own processing or review unless the designation allows it with a justification (Реш. 140)." },
  stage: { bg: "Този етап не се отбелязва ръчно.", en: "This stage is not ticked by hand." },
  state: { bg: "Схемата още не е стигнала до този етап.", en: "The scheme has not reached this stage yet." },
  order: { bg: "Първо предишният акт на обработката (обработка → преглед → одобрение).", en: "The earlier processing act first (process → review → approve)." },
  "too-long": { bg: "Бележката е твърде дълга (до 1000 знака).", en: "The note is too long (1000 characters at most)." },
  "not-ticked": { bg: "Етапът не е отбелязан.", en: "The stage is not ticked." },
  who: { bg: "Този етап се отбелязва от друга роля.", en: "Another role ticks this stage." },
};

/** The closing reference calibration of a calibration chain (§11): the last stop is
 *  the reference laboratory, after every participant, and it has handed the
 *  instrument on. Its date ends the measurements — not a deadline. */
export function calibrationEnd(chain: Scheme["chain"]): string | null {
  const stops = chain?.stops ?? [];
  const lastLab = stops.map((s) => s.kind).lastIndexOf("lab");
  const last = stops[stops.length - 1];
  if (!last || last.kind !== "ref" || lastLab === -1) return null;
  return last.sentAt ?? null;
}

type ForAct = Pick<Scheme, "status" | "type" | "chain" | "uploads"> & { lifecycle?: Lifecycle };

/** Every participant has been through the chain: each has a stop of its own that has
 *  handed the instrument on. */
export function chainCovers(chain: Scheme["chain"], codes: readonly string[]): boolean {
  const done = new Set((chain?.stops ?? []).filter((x) => x.kind === "lab" && x.code && x.sentAt).map((x) => x.code as string));
  return codes.every((c) => done.has(c));
}

/** Why this act cannot be done now — or null. `note` is what the person wrote;
 *  `participantCodes`, for a calibration scheme's processing, who must have been
 *  through the chain. */
export function actProblem(s: ForAct, act: ActKey, note: string, participantCodes?: readonly string[]): ActProblem | null {
  const def = ACTS[act];
  if (!def.from.includes(s.status)) return "state";
  const n = String(note ?? "").trim();
  if (chars(n) > MAX_NOTE) return "too-long";
  if (def.note === "required" && chars(n) < MIN_NOTE) return "note";
  if (act === "announce2" && currentSecondAnnouncement(s)) return "twice";
  // calibration: processing starts after the closing reference calibration (§11)
  if (act === "process" && s.type === "C" && !calibrationEnd(s.chain)) return "calibration-end";
  if (act === "process" && s.type === "C" && participantCodes && !chainCovers(s.chain, participantCodes)) return "chain-incomplete";
  // the report issued is PTS's file, approved first (Реш. 135, 140)
  if (act === "report" && !s.uploads?.report) return "no-report";
  if (act === "report" && !s.lifecycle?.stages?.["16"]) return "not-approved";
  return null;
}

/** The state an act leaves the scheme in. */
export function actTarget(s: Pick<Scheme, "status">, act: ActKey): SchemeStatus {
  if (act === "back") return BACK_TO[s.status] ?? s.status;
  return ACTS[act].to ?? s.status;
}

export type TickProblem = "stage" | "state" | "order" | "too-long" | "by-act";

/** Why this stage cannot be ticked now — or null. A stage is ticked once the scheme
 *  has reached its state (a preparation stage may be ticked late, and says so by its
 *  date); not in a scheme that is not held, past its first announcement; the three
 *  processing acts in their order (Реш. 140). */
export function tickProblem(s: Pick<Scheme, "status"> & { lifecycle?: Lifecycle; type?: "T" | "C"; distribution?: string }, no: number, note = ""): TickProblem | null {
  const d = stageDef(no);
  if (!d || !("tick" in d.way)) return "stage";
  if (chars(String(note ?? "").trim()) > MAX_NOTE) return "too-long";
  if (s.status === "not_held") return d.no <= 8 ? null : "state";
  if (stateIndex(s.status) < stateIndex(d.state)) return "state";
  // stage 9 is done by the coding act (5.3) — save a sequential calibration scheme (D17)
  if (no === 9 && s.type && !(s.type === "C" && s.distribution !== "simultaneous")) return "by-act";
  const ticked = (n: number) => !!s.lifecycle?.stages?.[String(n)];
  if (no === 15 && !ticked(14)) return "order";
  if (no === 16 && !(ticked(14) && ticked(15))) return "order";
  return null;
}

/** Withdrawing a tick: refused once a later processing act stands on it, or once the
 *  report is issued on the approval. */
export function untickProblem(s: Pick<Scheme, "status"> & { lifecycle?: Lifecycle; coding?: unknown[] }, no: number): "stage" | "not-ticked" | "order" | "settled" | "by-act" | null {
  const d = stageDef(no);
  if (!d || !("tick" in d.way)) return "stage";
  const ticked = (n: number) => !!s.lifecycle?.stages?.[String(n)];
  if (!ticked(no)) return "not-ticked";
  // the coding act's own tick stays: the codes are given (5.3)
  if (no === 9 && s.coding?.length) return "by-act";
  // the design's approval date proves the criteria came first: once processing has
  // started it is not withdrawn and dated again
  if (no === 4 && s.status !== "not_held" && stateIndex(s.status) >= stateIndex("processing")) return "settled";
  if ((no === 14 && ticked(15)) || (no === 15 && ticked(16))) return "order";
  if (no >= 14 && no <= 16 && stateIndex(s.status) >= stateIndex("report") && s.status !== "not_held") return "order";
  return null;
}

/** The date the statistical design was approved (Sofia day), or null. */
export const designApproved = (s: { lifecycle?: Lifecycle }): string | null => s.lifecycle?.stages?.["4"]?.day ?? null;

// ── how each stage reads ────────────────────────────────────────────────────

export interface StageView {
  no: number;
  title: string;
  way: "tick" | "act" | "record";
  inPortal: boolean;
  /** done, with who and when; for a record stage, what the portal has */
  done: { at?: string; day?: string; by?: string; note?: string; afterResults?: boolean } | null;
  /** what the portal's record says (a record stage), or the act's second step */
  detail?: string;
  /** the scheme is in this stage's state now */
  current: boolean;
  /** the stage will not happen: the scheme is not held */
  skipped: boolean;
  later?: string;
}

export interface StageFacts {
  /** participants in the scheme */
  participants: number;
  /** of them, with results received */
  withResults: number;
  /** the latest result received (ISO) */
  lastResultAt?: string;
  /** the feedback form went out (ISO) */
  feedbackSentAt?: string;
}

/** The second announcement of the scheme's current run: one made after its latest
 *  first announcement — a step back and a new announcement start a new run. */
export function currentSecondAnnouncement(s: { lifecycle?: Lifecycle }): LifecycleAct | undefined {
  const acts = s.lifecycle?.acts ?? [];
  const lastFirst = acts.map((a) => a.act).lastIndexOf("announce");
  // a scheme announced before 3.2 has no first announcement on record: its run is all
  return acts.slice(lastFirst + 1).find((a) => a.act === "announce2");
}

const actOf = (s: { lifecycle?: Lifecycle }, act: ActKey): LifecycleAct | undefined =>
  [...(s.lifecycle?.acts ?? [])].reverse().find((a) => a.act === act);

/** Every stage of the scheme, as it reads now. */
export function stageViews(s: Pick<Scheme, "status" | "type" | "chain"> & { lifecycle?: Lifecycle }, facts: StageFacts, lang: "bg" | "en"): StageView[] {
  const bg = lang === "bg";
  const here = stateIndex(s.status);
  return STAGES.map((d) => {
    const t = (d.cal && s.type === "C" ? d.cal : d)[lang];
    const way = "tick" in d.way ? "tick" : "act" in d.way ? "act" : "record";
    let done: StageView["done"] = null;
    let detail: string | undefined;
    if ("tick" in d.way) {
      const k = s.lifecycle?.stages?.[String(d.no)];
      if (k) done = { at: k.at, day: k.day, by: k.by, note: k.note, afterResults: k.afterResults };
    } else if ("act" in d.way) {
      // done once the scheme has reached the act's state — who and when from the act;
      // a scheme that got there before 3.2 has no act on record, and says so.
      // Stage 8: the first announcement either way — it runs, or it is not held.
      const target = ACTS[d.way.act].to as SchemeStatus;
      // a scheme not held was open: stage 7 happened; 8 is its first announcement
      const reached = d.no === 8 ? s.status === "not_held" || stateIndex(s.status) >= stateIndex("running")
        : d.no === 7 ? stateIndex(s.status) >= stateIndex("open")
        : s.status !== "not_held" && stateIndex(s.status) >= stateIndex(target);
      const a = d.no === 8 ? (s.status === "not_held" ? actOf(s, "not_held") : actOf(s, "announce")) : actOf(s, d.way.act);
      if (reached) done = a ? { at: a.at, day: a.day, by: a.by, note: a.note } : {};
      if (reached && !a) detail = bg ? "отпреди записа на етапите — кой и кога не е записано" : "from before the stages were recorded — who and when not on record";
      if (d.no === 8) {
        if (s.status === "not_held") detail = bg ? "Не се състои" : "Not held";
        if (s.status === "not_held" && !a) detail += bg ? " — кой и кога не е записано" : " — who and when not on record";
        // only the current run's, and only while the scheme runs on from it
        const second = s.status !== "not_held" && stateIndex(s.status) >= stateIndex("running") ? currentSecondAnnouncement(s) : undefined;
        if (second) detail = (bg ? "Второ обявяване: " : "Second announcement: ") + second.day;
      }
    } else if (d.way.record === "results") {
      detail = bg ? `Резултати от ${facts.withResults} от ${facts.participants} участници` : `Results from ${facts.withResults} of ${facts.participants} participants`;
      if (s.type === "C") {
        const end = calibrationEnd(s.chain);
        detail += end ? (bg ? ` · повторно референтно калибриране: ${end.slice(0, 10)}` : ` · closing reference calibration: ${end.slice(0, 10)}`)
          : (bg ? " · повторното референтно калибриране предстои" : " · the closing reference calibration is to come");
      }
      if (facts.participants > 0 && facts.withResults >= facts.participants && (s.type !== "C" || calibrationEnd(s.chain))) done = { at: facts.lastResultAt };
    } else if (d.way.record === "measurements") {
      detail = facts.withResults ? (bg ? `${facts.withResults} от ${facts.participants} са подали` : `${facts.withResults} of ${facts.participants} have reported`) : undefined;
      if (facts.participants > 0 && facts.withResults >= facts.participants) done = { at: facts.lastResultAt };
    } else if (d.way.record === "feedback") {
      if (facts.feedbackSentAt) done = { at: facts.feedbackSentAt };
    }
    const skipped = s.status === "not_held" && d.no > 8;
    return {
      no: d.no, title: t, way, inPortal: d.inPortal, done, detail,
      current: !skipped && stateIndex(d.state) === here && s.status !== "not_held",
      skipped, later: d.later,
    };
  });
}

/** Who may do this, said in words — for the page. */
export function tickerLabel(t: Ticker, lang: "bg" | "en"): string {
  const bg = lang === "bg";
  if ("designated" in t) {
    return t.designated === "processor" ? (bg ? "определеният да обработи" : "the designated processor")
      : t.designated === "reviewer" ? (bg ? "определеният за независимия преглед" : "the designated reviewer")
      : (bg ? "определеният да одобри" : "the designated approver");
  }
  const L: Partial<Record<Capability, [string, string]>> = {
    "order.manage": ["ръководителят на РТ провайдъра", "the head of the PT provider"],
    "items.manage": ["техническият експерт", "the technical expert"],
    "scheme.edit": ["ръководителят на схемата", "the scheme manager"],
    "results.process": ["експертът по статистика или техническият експерт", "the statistics or technical expert"],
    "results.enter": ["експертът по събиране и кодиране", "the coding expert"],
    dispatch: ["ръководителят на схемата или експертът по кодиране", "the scheme manager or the coding expert"],
  };
  const l = L[t.cap];
  return l ? l[bg ? 0 : 1] : t.cap;
}
