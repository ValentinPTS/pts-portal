import type { Scheme, SchemeStatus } from "./types";
import { t as trans, type UiLang } from "./i18n";
import { nextSchemeNumber, nextSeq, readSchemeNumber, type Activity, type NumberSpec } from "./scheme-number";

// Helpers for the folder-explorer navigation: Type → Year → Scheme → Documents.
export type FolderType = "T" | "C";

export const TYPE_SLUG: Record<FolderType, string> = { T: "testing", C: "calibration" };
export function typeFromSlug(slug: string): FolderType | null {
  return slug === "testing" ? "T" : slug === "calibration" ? "C" : null;
}
export function typeLabel(t: FolderType, lang: UiLang = "en"): string {
  return trans(lang, t === "C" ? "type.calibration" : "type.testing");
}

// Per-type accent so testing (green) and calibration (teal-blue) are instantly distinguishable.
export const ACCENT: Record<FolderType, { accent: string; soft: string; line: string }> = {
  T: { accent: "#57823c", soft: "#eef3ea", line: "#cbd9be" }, // testing — primary green
  C: { accent: "#8fa97e", soft: "#eef3ea", line: "#cbd9be" }, // calibration — logo sage
};

// These helpers work on anything with a number/type — a full Scheme OR a
// lightweight SchemeSummary (store.ts) — so list/nav pages can avoid loading the
// full document payload. Only display helpers that need titles take a full Scheme.
type HasNumber = { number: string };

// the year a number starts in — today's form and the archive's alike (3.1)
export function schemeYear(s: HasNumber): string {
  const r = readSchemeNumber(s.number);
  return r ? `20${r.yy}` : "—";
}
export function schemeName(s: Scheme): string {
  return (s.name && s.name.trim()) || s.titleEn || s.titleBg || s.number;
}

// distinct years (desc) present for a type
// Lifecycle buckets for grouping scheme lists (owner explorer + lab portal):
// coming = being prepared (draft), current = actively worked
// (enrolment open → reporting), finished = closed/reported.
export type Lifecycle = "current" | "coming" | "finished";
export const LIFECYCLE_ORDER: Lifecycle[] = ["current", "coming", "finished"];
export function lifecycleOf(st: SchemeStatus): Lifecycle {
  return st === "draft" ? "coming" : st === "closed" || st === "not_held" ? "finished" : "current";
}
export function lifecycleMeta(lc: Lifecycle, lang: UiLang = "en"): { label: string; color: string } {
  const color = lc === "current" ? "#57823c" : lc === "coming" ? "#9a6b22" : "#666666";
  return { label: trans(lang, `lifecycle.${lc}`), color };
}

const STATUS: Record<SchemeStatus, { label: string; tone: keyof typeof TONE }> = {
  draft: { label: "Draft", tone: "gray" },
  open: { label: "Open", tone: "amber" },
  running: { label: "In progress", tone: "amber" },
  processing: { label: "Processing", tone: "blue" },
  report: { label: "Report issued", tone: "blue" },
  closed: { label: "Closed", tone: "green" },
  not_held: { label: "Not held", tone: "gray" },
};
export const TONE = {
  green: { fg: "#456b2c", bg: "#e3eeda" },
  amber: { fg: "#9a6b22", bg: "#faf2e0" },
  gray: { fg: "#666666", bg: "#eef1ee" },
  blue: { fg: "#2f6f8f", bg: "#e7f0f6" },
};
export function statusChip(st: SchemeStatus, lang: UiLang = "en"): { label: string; fg: string; bg: string } {
  const s = STATUS[st] ?? STATUS.draft;
  return { label: trans(lang, `status.${st}`), ...TONE[s.tone] };
}

// next official number/id for a new project of this kind, activity and NA in this
// month: PTS|ILC YY/MM[-NA]-X-N, N counting within the month and the activity, Т/С
// and T/C alike (plan parts 0.14, 3.1; N15). Pass every scheme, archived ones
// included — their numbers are never handed out again (0.9).
export function nextProject(schemes: HasNumber[], spec: NumberSpec, year: string, month: number): { id: string; number: string } {
  return nextSchemeNumber(schemes.map((s) => s.number), spec, year, month);
}

/** What the new-scheme dialog needs to compose a number as PTS picks the kind, the
 *  activity and NA: this month, the series, and the next sequence per activity the
 *  folder offers (testing: T and S; calibration: C). */
export interface DialogNumbering { yy: string; mm: string; simulation: boolean; next: Partial<Record<Activity, number>> }
export function dialogNumbering(schemes: HasNumber[], type: FolderType, year: string, month: number, simulation: boolean): DialogNumbering {
  const numbers = schemes.map((s) => s.number);
  const acts: Activity[] = type === "C" ? ["C"] : ["T", "S"];
  return {
    yy: year.slice(-2), mm: String(month).padStart(2, "0"), simulation,
    next: Object.fromEntries(acts.map((a) => [a, nextSeq(numbers, a, year, month, simulation)])),
  };
}
