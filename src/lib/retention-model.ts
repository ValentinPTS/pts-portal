// Retention (plan part 4.7; Zadanie §10). Pure.
//
// A rejected registration — a request for a laboratory account — is kept SIX YEARS from
// its rejection, with its reason; then it may be removed (the database refuses earlier,
// migration 0037). A profile with no participation is kept until its deletion is
// requested; then the head of the PT provider erases it by hand, naming the request by
// its incoming number and date — never free words that could name a person.

export const RETENTION_YEARS = 6;
export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 500;

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F​-‏﻿�]/g, " ").replace(/\s+/g, " ").trim();

/** A timestamp minus (or plus) whole years as Postgres reckons it: the same month and
 *  day, a 29 February that does not exist becoming the 28th (so «now() - interval '6
 *  years'» here and in the database agree — 4.7 review). */
export function shiftYears(ms: number, years: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear() + years, m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** The day a rejected registration may be removed: six years after its rejection
 *  (a 29 February is kept until the 28th six years on). "" when there is no date. */
export function keptUntil(rejectedAt: string | undefined): string {
  const t = new Date(rejectedAt ?? "").getTime();
  return Number.isNaN(t) ? "" : new Date(shiftYears(t, RETENTION_YEARS)).toISOString();
}

/** May it be removed now — rejected, and rejected before «now − six years», exactly as
 *  the database's guard asks (0037)? */
export function retentionOver(a: { status: string; reviewedAt?: string }, nowMs: number): boolean {
  if (a.status !== "rejected") return false;
  const t = new Date(a.reviewedAt ?? "").getTime();
  return !Number.isNaN(t) && t < shiftYears(nowMs, -RETENTION_YEARS);
}

/** The reason of a rejection — required (3–500 characters), or null. */
export function readRejectReason(v: unknown): string | null {
  const r = clean(v);
  return [...r].length >= REJECT_REASON_MIN ? [...r].slice(0, REJECT_REASON_MAX).join("") : null;
}

/** The request an erasure answers — its incoming number (letters, digits, «№ / . -», no
 *  spaces: never a name) and its date (not in the future) — or null. */
export function readEraseRequest(no: unknown, date: unknown, todayIso: string): { no: string; date: string } | null {
  const n = clean(no);
  const d = clean(date);
  if (!/^[0-9A-Za-zА-Яа-я№/.-]{1,30}$/.test(n)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || d > todayIso.slice(0, 10)) return null;
  return { no: n, date: d };
}
