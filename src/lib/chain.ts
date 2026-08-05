import type { ChainStop, SchemeChain } from "./types";

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
// Nothing here blocks anything. There is no deadline for holding the device — the
// owner was explicit — so the estimates below are estimates, never limits.
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

/** How many stops are still ahead of this laboratory's turn. */
export function stopsAhead(chain: SchemeChain | undefined, code: string): number {
  const list = stops(chain);
  const idxs = stopIndexesForCode(chain, code).filter((i) => !list[i].receivedAt);
  if (!idxs.length) return 0;
  const mine = Math.min(...idxs);
  return list.slice(0, mine).filter((s) => !s.receivedAt).length;
}

/**
 * How long a stop is actually taking, in days — measured receipt-to-receipt, so it
 * covers both the holding and the courier, which is what a waiting lab experiences.
 *
 * Returns the round's own measured pace once two stops have received the device,
 * and the owner's guess until then. His guess is a starting point that the real
 * round overwrites, not a target it is judged against.
 */
export function paceDays(chain?: SchemeChain): number | null {
  const received = stops(chain)
    .map((s) => (s.receivedAt ? Date.parse(s.receivedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (received.length >= 2) {
    const span = received[received.length - 1] - received[0];
    const measured = span / (received.length - 1) / DAY;
    if (measured > 0) return measured;
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
  if (days < 10) return bg ? `около ${days} дни` : `about ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return bg ? `около ${weeks} седмици` : `about ${weeks} weeks`;
  const months = Math.round(days / 30);
  return bg ? `около ${months} месеца` : `about ${months} months`;
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
