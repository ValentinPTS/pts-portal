import type { Scheme, SchemeStatus } from "./types";
import { t as trans, type UiLang } from "./i18n";

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
type SchemeRef = { number: string; type: FolderType };

export function schemeYear(s: HasNumber): string {
  const m = s.number.match(/(\d{2})\/\d{2}-/);
  return m ? `20${m[1]}` : "—";
}
export function schemeName(s: Scheme): string {
  return (s.name && s.name.trim()) || s.titleEn || s.titleBg || s.number;
}

// distinct years (desc) present for a type
export function yearsForType<T extends SchemeRef>(schemes: T[], type: FolderType): string[] {
  const set = new Set(schemes.filter((s) => s.type === type).map(schemeYear));
  return [...set].sort((a, b) => b.localeCompare(a));
}
export function schemesIn<T extends SchemeRef>(schemes: T[], type: FolderType, year: string): T[] {
  return schemes.filter((s) => s.type === type && schemeYear(s) === year);
}

const STATUS: Record<SchemeStatus, { label: string; tone: keyof typeof TONE }> = {
  draft: { label: "Draft", tone: "gray" },
  open: { label: "Open", tone: "amber" },
  running: { label: "In progress", tone: "amber" },
  report: { label: "Reporting", tone: "blue" },
  closed: { label: "Reported", tone: "green" },
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

// next official number/id for a new project of this type + year (e.g. PTS 26/04-T-1)
export function nextProject<T extends SchemeRef>(schemes: T[], type: FolderType, year: string): { id: string; number: string } {
  const yy = year.slice(2);
  let maxMid = 0;
  for (const s of schemes.filter((x) => x.type === type && schemeYear(x) === year)) {
    const m = s.number.match(/\/(\d+)-/);
    if (m) maxMid = Math.max(maxMid, parseInt(m[1], 10));
  }
  const mid = String(maxMid + 1).padStart(2, "0");
  return { id: `${yy}-${mid}-${type}-1`, number: `PTS ${yy}/${mid}-${type}-1` };
}
