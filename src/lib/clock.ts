import { isTestEnvironment } from "./environment";
import { sofiaNowWall } from "./chain";

// One clock (plan part 1.3, Реш. 132, their В4). Every BUSINESS time — a deadline, a
// reminder, a lock, a wait, the moment a device was sent — is read through
// schemeNowMs(scheme). In the TEST environment a round can be given any "now",
// including a past date, to try the reminder before a deadline, a late result, an
// extension or a reissued report without waiting for the calendar. The moved clock
// runs on from where it was set (an offset), so a simulated chain keeps its order.
//
// Record stamps — who did what, when (the journal, created_at, recordedAt, a file's
// uploadedAt, a release's «sent» time, proforma uploaded/paid) — stay on the real
// clock: the record of the test itself is never fiction. The round's TIMELINE — its
// case-file steps and chain events — is dated on the round's clock.
//
// On the real portal a test clock is ignored even if one were stored. No other
// imports, so pages, actions, jobs and tests can all use it.

export interface TestClock {
  offsetMs: number; // the round's now = real now + offset
  setAt: string; // real time it was set
  setBy: string;
}

/** The round's "now", in ms — moved only in the test environment. */
export function schemeNowMs(s?: { testClock?: TestClock } | null, realNowMs: number = Date.now(), env?: Record<string, string | undefined>): number {
  const off = s?.testClock?.offsetMs;
  return typeof off === "number" && Number.isFinite(off) && isTestEnvironment(env) ? realNowMs + off : realNowMs;
}

/** The round's "now" as an ISO instant. */
export const schemeNowIso = (s?: { testClock?: TestClock } | null, realNowMs?: number, env?: Record<string, string | undefined>) =>
  new Date(schemeNowMs(s, realNowMs, env)).toISOString();

/** The calendar day in Bulgaria for an instant — yyyy-mm-dd. A deadline is a
 *  Bulgarian working day, not the server's UTC date. */
export function sofiaToday(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** How far this round's clock is moved, in ms — 0 on the real portal. Pure: what a
 *  page hands its client components, which then read the time themselves. */
export function clockOffsetMs(s?: { testClock?: TestClock } | null, env?: Record<string, string | undefined>): number {
  const off = s?.testClock?.offsetMs;
  return typeof off === "number" && Number.isFinite(off) && isTestEnvironment(env) ? off : 0;
}

/** The round's now as an ISO instant, from an offset — for client components. */
export const shiftedNowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

/** The round's now as a Bulgarian datetime-local value — a form's default and limit. */
export const sofiaNowWallShifted = (offsetMs = 0) => sofiaNowWall(Date.now() + offsetMs);

// How far a test round's clock may be moved from the real time: far enough for any
// past round or next year's programme, not so far that a typo (2207) is taken.
export const MAX_CLOCK_SHIFT_MS = 5 * 366 * 86_400_000;

/** Is this round's clock moved (test environment only)? */
export const clockMoved = (s?: { testClock?: TestClock } | null, env?: Record<string, string | undefined>) =>
  !!s?.testClock && isTestEnvironment(env) && s.testClock.offsetMs !== 0;
