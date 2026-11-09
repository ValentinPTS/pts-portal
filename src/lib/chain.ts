import type { ChainStamp, ChainStampSource, ChainStop, SchemeChain } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// The calibration chain: one device, travelling laboratory to laboratory.
//
// THE RULE THAT SHAPES EVERYTHING. In a testing scheme nobody knows anybody. Here
// that is impossible — whoever ships the device must know where it is going. So
// the line is drawn somewhere else: NAMES TRAVEL, CODES DO NOT. A laboratory
// learns exactly two others in the whole round — the next one, from the app, and
// the previous one, from the box that arrives. The full order exists in one place
// only: the owner's screen.
//
// This module therefore deals in CODES and positions. It never resolves a name;
// the caller does that, and only for the one stop a laboratory is entitled to see
// (nextStopFor). Keeping the resolution outside means no accident in here can
// widen what a laboratory is told.
//
// Nothing here blocks anything. The Instruction gives each laboratory up to 3 working
// days with the device, but the portal enforces no limit (Q14), so the estimates
// below are estimates, never limits.
//
// PURE module (no next/supabase imports) so all of it is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const stops = (chain?: SchemeChain): ChainStop[] => chain?.stops ?? [];

/** A stop is DONE once it has handed the device on. */
export const isDone = (s: ChainStop): boolean => !!s.sentAt;
/** A stop HOLDS the device once it has confirmed receipt and not yet passed it on. */
export const isHolding = (s: ChainStop): boolean => !!s.receivedAt && !s.sentAt;
/**
 * Frozen stops are history and must never be reordered or removed — the device
 * has already been there, and the dates are the traceability record.
 */
export const isFrozen = (s: ChainStop): boolean => !!s.receivedAt;

/** Which stop has the device right now? -1 when nobody does (in transit, or not started). */
export function holderIndex(chain?: SchemeChain): number {
  return stops(chain).findIndex(isHolding);
}

/**
 * Where the device goes next: the first stop that has not yet received it.
 * -1 when every stop is done — at which point it is on its way back to PTS.
 */
export function nextStopIndex(chain?: SchemeChain): number {
  return stops(chain).findIndex((s) => !s.receivedAt);
}

/** The stop a given holder must forward to, or null when it is the last one. */
export function nextStopFor(chain: SchemeChain | undefined, fromIndex: number): ChainStop | null {
  const list = stops(chain);
  if (fromIndex < 0 || fromIndex >= list.length - 1) return null;
  return list[fromIndex + 1];
}

/** Every stop this participant code holds in the chain (normally one). */
export function stopIndexesForCode(chain: SchemeChain | undefined, code: string): number[] {
  return stops(chain).flatMap((s, i) => (s.kind === "lab" && s.code === code ? [i] : []));
}

export type LabChainState = "not-in-chain" | "waiting" | "holding" | "done";

/**
 * What this laboratory should be shown. A lab appearing more than once (possible
 * if the owner routes the device back to it) is "holding" if any of its stops
 * holds, "waiting" if any is still to come, and only "done" once all are past.
 */
export function labState(chain: SchemeChain | undefined, code: string): LabChainState {
  const idxs = stopIndexesForCode(chain, code);
  if (!idxs.length) return "not-in-chain";
  const list = stops(chain);
  if (idxs.some((i) => isHolding(list[i]))) return "holding";
  if (idxs.some((i) => !list[i].receivedAt)) return "waiting";
  return "done";
}

/**
 * Position in the queue, 1-based, counting EVERY stop — the reference laboratory
 * takes time too, so leaving it out would make the wait estimate lie. Uses the
 * lab's earliest still-pending stop. Returns null when it is not in the chain.
 */
export function positionOf(chain: SchemeChain | undefined, code: string): { position: number; total: number } | null {
  const list = stops(chain);
  const idxs = stopIndexesForCode(chain, code);
  if (!idxs.length) return null;
  const pending = idxs.filter((i) => !list[i].receivedAt);
  const idx = pending.length ? Math.min(...pending) : Math.max(...idxs);
  return { position: idx + 1, total: list.length };
}

/**
 * How many stops are still ahead of this laboratory's turn.
 *
 * A stop counts until it has SENT THE DEVICE ON, not until it has received it: the
 * laboratory holding the device right now still has its whole measurement and the
 * courier leg to go, and that is exactly one pace of waiting for everyone behind
 * it. Counting only the not-yet-received stops made the queue look one stop
 * shorter than it is and told the next laboratory "съвсем скоро" while the device
 * was still on somebody's bench, with nothing in the portal to bring it back.
 */
export function stopsAhead(chain: SchemeChain | undefined, code: string): number {
  const list = stops(chain);
  const idxs = stopIndexesForCode(chain, code).filter((i) => !list[i].receivedAt);
  if (!idxs.length) return 0;
  const mine = Math.min(...idxs);
  return list.slice(0, mine).filter((s) => !isDone(s)).length;
}

/** Two receipts is one hop, and one hop is not a pace. See paceDays(). */
const MIN_HOPS_TO_TRUST = 2;
/**
 * A device physically moving between laboratories cannot average less than a day a
 * stop. Anything under it is a clustered pair of receipts, not a fast round.
 */
const MIN_CREDIBLE_PACE_DAYS = 1;

/**
 * How long a stop is actually taking, in days — measured receipt-to-receipt, so it
 * covers both the holding and the courier, which is what a waiting lab experiences.
 *
 * The owner's guess holds until the round has produced enough evidence to beat it,
 * and only then does the measurement take over. His guess is a starting point the
 * real round overwrites, not a target it is judged against — but it must not be
 * overwritten by noise.
 *
 * WHY IT WAITS FOR TWO HOPS. This used to switch as soon as two stops had received
 * the device, and two receipts are a single observation — divided by one. The first
 * hop of a round is also systematically the fastest: the provider ships to the
 * nearest laboratory, and the reference laboratory is usually quick because it is
 * the anchor measurement. So a round where he expected 14 days a stop, whose first
 * two receipts fell two days apart, told every laboratory behind them "около 4 дни"
 * when the honest answer was four weeks. It self-corrected as stops reported, which
 * is exactly backwards: it was most wrong while the labs were first asking.
 */
export function paceDays(chain?: SchemeChain): number | null {
  const received = stops(chain)
    .map((s) => (s.receivedAt ? Date.parse(s.receivedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const hops = received.length - 1;
  if (hops >= MIN_HOPS_TO_TRUST) {
    const measured = (received[received.length - 1] - received[0]) / hops / DAY;
    if (measured >= MIN_CREDIBLE_PACE_DAYS) return measured;
  }
  const guess = chain?.daysPerLab;
  return typeof guess === "number" && guess > 0 ? guess : null;
}

/**
 * Roughly how long until the device reaches this laboratory. null when there is
 * nothing to base it on — better to say nothing than to invent a number.
 */
export function estimatedWaitDays(chain: SchemeChain | undefined, code: string): number | null {
  if (labState(chain, code) !== "waiting") return null;
  const pace = paceDays(chain);
  if (pace === null) return null;
  return Math.round(stopsAhead(chain, code) * pace);
}

/**
 * The wait as a phrase a laboratory can act on. Deliberately coarse — "≈ 4 weeks"
 * is honest about being an estimate in a way "arrives 14.08.2026" never is, and
 * cannot be mistaken for a commitment.
 */
export function describeWait(days: number | null, lang: "bg" | "en"): string {
  if (days === null) return "";
  const bg = lang === "bg";
  if (days <= 0) return bg ? "съвсем скоро" : "very soon";
  // One is one: "около 1 дни" / "about 1 days" is the kind of slip a laboratory
  // reads as carelessness, and every participant sees this line every round.
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  if (days < 10) return bg ? `около ${n(days, "ден", "дни")}` : `about ${n(days, "day", "days")}`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return bg ? `около ${n(weeks, "седмица", "седмици")}` : `about ${n(weeks, "week", "weeks")}`;
  const months = Math.round(days / 30);
  return bg ? `около ${n(months, "месец", "месеца")}` : `about ${n(months, "month", "months")}`;
}

/**
 * Is the device in transit to THIS laboratory right now?
 *
 * Only when it has left the provider, NOBODY is holding it, and this laboratory's
 * stop is the next one due to receive. The "nobody holding" clause is the whole
 * point: a laboratory still working on the device has not sent it on, so the one
 * after it must not be told it is on its way — "how long do I wait" is the single
 * question the chain exists to answer, and answering it early makes it a lie.
 *
 * Deliberately not derived from stopsAhead(), which counts stops that have not
 * RECEIVED — a holder has received, so it stops being counted while it still has
 * the device in its hands.
 */
export function isIncomingFor(chain: SchemeChain | undefined, code: string): boolean {
  if (!chain?.dispatchedAt) return false;
  if (holderIndex(chain) !== -1) return false;
  const i = nextStopIndex(chain);
  if (i === -1) return false;
  const s = stops(chain)[i];
  return s.kind === "lab" && s.code === code;
}

/**
 * Bulgarian ordinal suffix for a queue position: 1-ви, 2-ри, 3-ти, 4-ти, 5-и …
 * The teens are regular in Bulgarian (единадесети … деветнадесети all end in -и),
 * so 11–19 take "-и" whatever their last digit is — 14 is 14-и, not 14-ти.
 * English needs none of this, which is why the caller only reaches for it in BG.
 */
export function ordinalSuffixBg(n: number): string {
  const teens = Math.abs(n) % 100;
  if (teens >= 11 && teens <= 19) return "и";
  switch (Math.abs(n) % 10) {
    case 1: return "ви";
    case 2: return "ри";
    case 3:
    case 4: return "ти";
    default: return "и";
  }
}

/** Has the whole chain been through? True once every stop has handed it on. */
export function chainComplete(chain?: SchemeChain): boolean {
  const list = stops(chain);
  return list.length > 0 && list.every(isDone);
}

/**
 * Apply a new order to the stops that have NOT been reached yet, leaving the
 * frozen ones exactly where they are. The owner can reorder, drop or add stops
 * mid-round — it happens rarely, but the app must never be the reason he cannot.
 *
 * `desiredIds` names the pending stops in their new order; any pending stop it
 * omits is dropped, and unknown ids are ignored. Returns a fresh array.
 */
export function reorderPending(current: ChainStop[], desiredIds: string[]): ChainStop[] {
  const frozen = current.filter(isFrozen);
  const pending = new Map(current.filter((s) => !isFrozen(s)).map((s) => [s.id, s]));
  const reordered = desiredIds.map((id) => pending.get(id)).filter((s): s is ChainStop => !!s);
  return [...frozen, ...reordered];
}

// ── Recording a step: PTS for any stop, a laboratory for its own (part 0.10) ─
//
// A reference laboratory has no account, and a laboratory may phone instead of
// pressing its button — so PTS can record any stop's arrival or handover itself,
// and says how it knows (N25 / E6.c). The device still moves in order, whoever
// records it: an arrival only at the next stop due, and only after PTS has sent
// the device. If it physically went somewhere else, the pending order is changed
// first — that is always allowed. Keeping the arrivals in order is also what keeps
// the stops already reached a prefix of the list, which every reorder relies on.
//
// PTS's time is when it HAPPENED: it may be in the past (a call about yesterday's
// courier), never in the future, and it must fit the chain's chronology — after
// the previous handover (after the dispatch, for the first stop), and a handover
// before the next stop's arrival. That is the traceability record, and it is what
// the waiting laboratories' estimate is computed from.
//
// The one difference for a laboratory: it may record its own arrival even while
// the stop before has not pressed its button — it has the device in its hands,
// and another laboratory's silence must not block it. PTS then records that
// handover for the silent stop.

export const CHAIN_STAMP_SOURCES: readonly ChainStampSource[] = ["phone", "email", "protocol", "courier", "in_person", "other"];
export const isStampSource = (x: unknown): x is ChainStampSource =>
  typeof x === "string" && (CHAIN_STAMP_SOURCES as readonly string[]).includes(x);

export type StampWhat = "received" | "sent";
export type StampProblem =
  | "closed" | "missing" | "already" | "order" | "not-dispatched" | "previous-holding"
  | "not-received" | "time" | "future" | "before-receipt"
  | "before-dispatch" | "before-previous" | "after-next-arrival";

/** A clock a few minutes fast must not make "now" look like the future. */
const FUTURE_SLACK_MS = 5 * 60_000;

/** Why this step cannot be recorded, or null when it can. `by` is who records it. */
export function stampProblem(
  chain: SchemeChain | undefined, stopId: string, what: StampWhat, atMs: number, nowMs: number,
  by: "pts" | "lab" = "pts",
): StampProblem | null {
  if (chain?.returnedAt) return "closed";
  const list = stops(chain);
  const i = list.findIndex((s) => s.id === stopId);
  if (i === -1) return "missing";
  const s = list[i];
  if (!Number.isFinite(atMs)) return "time";
  if (atMs > nowMs + FUTURE_SLACK_MS) return "future";
  // Chronology is compared to the MINUTE: PTS types minutes, a button press carries
  // seconds, and an arrival typed for 13:36 is not "before" a dispatch at 13:36:42.
  const min = (ms: number) => Math.floor(ms / 60_000);
  const t = (iso?: string) => (iso ? min(Date.parse(iso)) : NaN);
  const at = min(atMs);
  if (what === "received") {
    if (s.receivedAt) return "already";
    if (!chain?.dispatchedAt) return "not-dispatched";
    if (i !== nextStopIndex(chain)) return "order";
    if (i === 0 && at < t(chain.dispatchedAt)) return "before-dispatch";
    if (i > 0) {
      const prev = list[i - 1];
      if (!prev.sentAt) return by === "lab" ? null : "previous-holding";
      if (at < t(prev.sentAt)) return "before-previous";
    }
    return null;
  }
  if (!s.receivedAt) return "not-received";
  if (s.sentAt) return "already";
  if (at < t(s.receivedAt)) return "before-receipt";
  const next = list[i + 1];
  if (next?.receivedAt && at > t(next.receivedAt)) return "after-next-arrival";
  return null;
}

/**
 * Why the owner cannot close the chain yet, or null. Only a chain every stop has
 * handed on can close: a closed chain takes no more steps, so closing it early
 * would strand the stops still open — the very stall this part removes. A stop
 * the device will not reach is dropped from the order first.
 */
export function returnProblem(chain?: SchemeChain, atMs?: number): "not-dispatched" | "already" | "open-stops" | "before-handover" | null {
  if (chain?.returnedAt) return "already";
  if (!chain?.dispatchedAt) return "not-dispatched";
  if (!chainComplete(chain)) return "open-stops";
  // back with PTS no earlier than the last stop let it go (compared to the minute, as
  // the stamps are) — reachable when a test round's clock was moved back (1.3)
  if (atMs !== undefined) {
    const last = Math.max(...chain.stops.map((s) => (s.sentAt ? Date.parse(s.sentAt) : 0)));
    if (Math.floor(atMs / 60000) < Math.floor(last / 60000)) return "before-handover";
  }
  return null;
}

/** The newest business time the chain holds — dispatch, every arrival and handover,
 *  the return. A test round's clock is never moved back before it (1.3). */
export function chainNewestMs(chain?: SchemeChain): number {
  if (!chain) return 0;
  const all = [chain.dispatchedAt, chain.returnedAt, ...chain.stops.flatMap((s) => [s.receivedAt, s.sentAt])]
    .filter((x): x is string => !!x).map((x) => Date.parse(x)).filter(Number.isFinite);
  return all.length ? Math.max(...all) : 0;
}

/**
 * The stops after the owner saves a new order. Stops already reached stay first,
 * exactly as they are, whatever is posted; the rest are rebuilt from `desired`,
 * reusing a pending stop by id and minting a new one otherwise. An id that has
 * become FROZEN since the screen was loaded — the device reached it meanwhile — is
 * skipped, never re-minted: that would put the same laboratory in the chain twice.
 */
export function rebuildChain(
  current: ChainStop[],
  desired: { id?: string; kind: "lab" | "ref"; code?: string }[],
  mint: () => string,
): ChainStop[] {
  const frozen = current.filter(isFrozen);
  const frozenIds = new Set(frozen.map((s) => s.id));
  const pending = new Map(current.filter((s) => !isFrozen(s)).map((s) => [s.id, s]));
  const rebuilt = desired
    .filter((d) => !(d.id && frozenIds.has(d.id)))
    .map((d) => (d.id ? pending.get(d.id) : undefined)
      ?? { id: mint(), kind: d.kind, code: d.kind === "lab" ? String(d.code) : undefined });
  return [...frozen, ...rebuilt];
}

/** The stops with one arrival or handover recorded. Returns a fresh array. */
export function applyStamp(
  list: ChainStop[], stopId: string, what: StampWhat, atIso: string, stamp: ChainStamp,
): ChainStop[] {
  return list.map((s) => (s.id !== stopId ? s
    : what === "received" ? { ...s, receivedAt: atIso, received: stamp }
    : { ...s, sentAt: atIso, sent: stamp }));
}

export function stampSourceLabel(src: ChainStampSource | undefined, lang: "bg" | "en"): string {
  const L: Record<ChainStampSource, [string, string]> = {
    phone: ["по телефона", "by phone"],
    email: ["по имейл", "by e-mail"],
    protocol: ["от протокола за получаване", "from the receipt protocol"],
    courier: ["от куриера", "from the courier"],
    in_person: ["лично", "in person"],
    other: ["друго", "other"],
  };
  return src ? L[src][lang === "bg" ? 0 : 1] : "";
}

// Chain times are shown and filed in Bulgarian time, wherever the server runs: a
// device that arrived at 00:30 in Sofia arrived on that day, not the UTC day before.
const SOFIA = "Europe/Sofia";
function sofiaParts(iso: string | undefined) {
  const d = new Date(iso ?? "");
  if (!iso || !Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}
/** The calendar day in Bulgaria, yyyy-mm-dd — what a case-file step is dated. */
export function sofiaDay(iso?: string): string {
  const p = sofiaParts(iso);
  return p ? `${p.y}-${p.m}-${p.d}` : "";
}
/** The time of day in Bulgaria, HH:MM. */
export function sofiaTime(iso?: string): string {
  const p = sofiaParts(iso);
  return p ? `${p.hh}:${p.mm}` : "";
}
/** Date and time in Bulgaria, dd.mm.yyyy HH:MM — every chain step is shown this way. */
export function fmtStamp(iso?: string): string {
  const p = sofiaParts(iso);
  return p ? `${p.d}.${p.m}.${p.y} ${p.hh}:${p.mm}` : "";
}

/** Now, as Bulgarian wall-clock time in the form a datetime-local input takes. */
export function sofiaNowWall(nowMs: number = Date.now()): string {
  const p = sofiaParts(new Date(nowMs).toISOString());
  return p ? `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}` : "";
}

// Sofia's offset from UTC at an instant, in ms (+2 h in winter, +3 h in summer).
function sofiaOffsetMs(t: number): number {
  const p = sofiaParts(new Date(t).toISOString());
  if (!p) return 0;
  const minute = Math.floor(t / 60_000) * 60_000;
  return Date.UTC(+p.y, +p.m - 1, +p.d, +p.hh, +p.mm) - minute;
}

/**
 * A Bulgarian wall-clock time ("2026-11-02T14:30", what PTS types) as an instant.
 * Read as Sofia time whatever the browser's or the server's zone. null for anything
 * that is not a real date and time — a mistyped year included (Chrome lets "26"
 * through as the year 0026).
 */
export function sofiaWallToIso(wall: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall ?? "");
  if (!m) return null;
  const [y, mo, d, hh, mi] = m.slice(1).map(Number);
  if (y < 2000 || hh > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, hh, mi);
  const chk = new Date(asUtc);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  // twice, so a time next to a summer-time change takes the offset of its own side
  let t = asUtc - sofiaOffsetMs(asUtc);
  t = asUtc - sofiaOffsetMs(t);
  return new Date(t).toISOString();
}
