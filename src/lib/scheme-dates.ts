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

/** ISO → dd.mm.yyyy for display. Anything unparseable is passed through unchanged. */
export function fmtSchemeDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso ?? "");
}

/**
 * Whole days from `today` to `iso`. Negative once the date has passed, null if
 * either is not a real date. Both are plain calendar days, compared in UTC, so no
 * timezone or daylight-saving shift can make "tomorrow" arrive a day early.
 */
export function daysUntil(iso: string | undefined, todayIso: string): number | null {
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
