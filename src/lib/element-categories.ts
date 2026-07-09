// Element categories — the single source of truth for how snippet/element
// categories are LABELLED (bilingual) and ORDERED, everywhere elements appear
// (the /items page and the editor's insert panel). The order follows the real
// document flow of a scheme (Plan → Application → Results sheet → Report →
// Feedback), with the general-purpose ones first and the owner's own custom
// category names after the known ones, alphabetically. PURE module.

export const DEFAULT_CAT = "My items";

// known category → bilingual label + flow position
const KNOWN: Record<string, { bg: string; en: string; order: number }> = {
  [DEFAULT_CAT]: { bg: "Мои елементи", en: "My items", order: 0 },
  General: { bg: "Общи", en: "General", order: 1 },
  Form: { bg: "Формуляр", en: "Form", order: 2 },
  Plan: { bg: "План", en: "Plan", order: 3 },
  Application: { bg: "Заявка", en: "Application", order: 4 },
  Results: { bg: "Лист с резултати", en: "Results sheet", order: 5 },
  Report: { bg: "Доклад", en: "Report", order: 6 },
  Feedback: { bg: "Обратна връзка", en: "Feedback", order: 7 },
};

export function categoryLabel(cat: string, lang: "bg" | "en" = "bg"): string {
  const k = KNOWN[cat];
  return k ? k[lang] : cat; // custom categories show exactly as typed
}

// My items → known flow order → custom categories A→Z
export function cmpCategory(a: string, b: string): number {
  if (a === b) return 0;
  const ka = KNOWN[a]?.order ?? 99;
  const kb = KNOWN[b]?.order ?? 99;
  return ka !== kb ? ka - kb : a.localeCompare(b);
}

// Group a list of items by category, ordered for display. `catOf` extracts the
// category (defaulting to DEFAULT_CAT), items inside a group sort by name.
export function groupByCategory<T>(
  items: T[],
  catOf: (it: T) => string | undefined,
  nameOf: (it: T) => string
): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const c = catOf(it) || DEFAULT_CAT;
    (m.get(c) ?? m.set(c, []).get(c)!).push(it);
  }
  const entries = [...m.entries()].sort((a, b) => cmpCategory(a[0], b[0]));
  for (const [, list] of entries) list.sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
  return entries;
}
