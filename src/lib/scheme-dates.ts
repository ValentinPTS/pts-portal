import type { Scheme } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// The scheme's four WORKING dates.
//
// Kept deliberately apart from scheme.schedule. The schedule is document content:
// the owner writes it by hand and prints it into the Plan, and he does not want
// the app's dates leaking into his documents. These four are the opposite — purely
// operational. They tell a laboratory what it is waiting for, and they are what the
// day-before reminder reads. NOTHING here renders into any document, and nothing
// here blocks anything: a date can pass unmet and the round simply carries on,
// which is how the work actually goes.
//
// Stored as ISO yyyy-mm-dd rather than the dd.mm.yyyy the schedule uses, because
// these get compared (is it due tomorrow?) and sorted, and ISO does that correctly
// without parsing. Display goes through fmtSchemeDate.
//
// PURE module — no next/supabase imports — so the comparisons are unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

export const DATE_KEYS = ["applicationsDue", "dispatch", "resultsDue", "reportDue"] as const;
export type SchemeDateKey = (typeof DATE_KEYS)[number];

export const DATE_LABELS: Record<SchemeDateKey, { bg: string; en: string }> = {
  applicationsDue: { bg: "Краен срок за заявки", en: "Applications due" },
  dispatch: { bg: "Изпращане на пробите", en: "Items dispatched" },
  resultsDue: { bg: "Краен срок за резултати", en: "Results due" },
  reportDue: { bg: "Доклад до", en: "Report due" },
};

/** yyyy-mm-dd, and a real day — "2026-02-31" is rejected, not silently rolled over. */
export function isIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// ── Deadlines with their hour and zone (part 3.4; А10: Bulgarian time, EET in winter,
//    EEST in summer). A working date is a day, «yyyy-mm-dd» — until the end of that
//    day — or a day and the hour in Bulgaria, «yyyy-mm-ddTHH:MM». ────────────────────

/** A day, or a day and an hour (00:00–23:59) in Bulgaria. */
export function isDeadline(v: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v ?? "");
  if (!m || !isIsoDate(m[1])) return false;
  return m[2] === undefined || (Number(m[2]) <= 23 && Number(m[3]) <= 59);
}
export const deadlineDay = (v: string): string => String(v ?? "").slice(0, 10);
export const deadlineTime = (v: string): string | null => /T(\d{2}:\d{2})$/.exec(v ?? "")?.[1] ?? null;

/** Bulgaria's offset from UTC, in minutes, at that instant. */
function sofiaOffsetMin(utcMs: number): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Sofia", timeZoneName: "shortOffset" }).formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 120;
}

/** The zone a Bulgarian day is in: EET (UTC+2) in winter, EEST (UTC+3) in summer. */
export function sofiaZone(day: string): "EET" | "EEST" {
  const ms = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 12);
  return sofiaOffsetMin(ms) === 180 ? "EEST" : "EET";
}

/** The instant a deadline passes: its hour in Bulgaria — a day alone, at its end
 *  (23:59). Null for what is not a deadline. */
export function deadlineMs(v: string | undefined): number | null {
  if (!v || !isDeadline(v)) return null;
  const day = deadlineDay(v);
  const time = deadlineTime(v);
  const [hh, mm] = (time ?? "23:59").split(":").map(Number);
  // a day alone lasts to its very end — 23:59:59.999 — so the day's last minute counts
  const wall = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh, mm, time ? 0 : 59, time ? 0 : 999);
  // the offset at that wall time — taken twice, for the hour the clocks change
  const first = wall - sofiaOffsetMin(wall) * 60_000;
  return wall - sofiaOffsetMin(first) * 60_000;
}

/** Has the deadline passed at this instant? A state, never a block (Zadanie §9). */
export const isPast = (v: string | undefined, nowMs: number): boolean => { const d = deadlineMs(v); return d !== null && nowMs > d; };

/** ISO → dd.mm.yyyy for display, with the hour and the zone when it has one
 *  («10.12.2026, 17:00 EET»). Anything unparseable is passed through unchanged. */
export function fmtSchemeDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const day = `${m[3]}.${m[2]}.${m[1]}`;
  if (!m[4]) return day;
  // the zone of that very instant: on the days the clocks change, the early hours
  // are in the zone they are really in
  const at = deadlineMs(iso!);
  return `${day}, ${m[4]} ${at !== null && sofiaOffsetMin(at) === 180 ? "EEST" : "EET"}`;
}

/**
 * Whole days from `today` to `iso`. Negative once the date has passed, null if
 * either is not a real date. Both are plain calendar days, compared in UTC, so no
 * timezone or daylight-saving shift can make "tomorrow" arrive a day early.
 */
export function daysUntil(iso: string | undefined, todayIso: string): number | null {
  iso = iso && isDeadline(iso) ? deadlineDay(iso) : iso; // a deadline's hour does not move its day
  if (!iso || !isIsoDate(iso) || !isIsoDate(todayIso)) return null;
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((day(iso) - day(todayIso)) / 86_400_000);
}

/** Every date the owner has actually set, in workflow order. */
export function setDates(s: Pick<Scheme, "dates">): { key: SchemeDateKey; at: string }[] {
  return DATE_KEYS.filter((k) => !!s.dates?.[k]).map((k) => ({ key: k, at: s.dates![k]! }));
}

/**
 * What the day-before reminder should go out for (Phase 2): a date that falls
 * exactly `within` days from today. Exactly, not "at most" — a reminder that fires
 * on every one of the last three days is noise, and the owner asked for one, a day
 * before.
 */
export function dueIn(s: Pick<Scheme, "dates">, todayIso: string, within = 1): SchemeDateKey[] {
  return DATE_KEYS.filter((k) => daysUntil(s.dates?.[k], todayIso) === within);
}
