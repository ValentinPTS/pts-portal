// The administrative panel's sections (plan part 2.7; PTS's design «10.
// Административен панел»), in the design's order — the list and which section a path
// is under. No rule here: who sees which is lib/admin-nav.ts. Kept apart so the rail
// (a client component) carries the list, not the role model.

export type SectionKey =
  | "dashboard" | "schemes" | "organizations" | "batches" | "deliveries" | "invoices"
  | "journal" | "people"
  // the portal's own pages the design does not draw: under «Още»
  | "notices" | "library" | "skins" | "system" | "changes" | "holidays";

export interface Section {
  key: SectionKey;
  href: string;
  bg: string;
  en: string;
  group: "main" | "records" | "more";
  // the plan part that builds it, while it is a placeholder
  comesIn?: string;
}

export const SECTIONS: readonly Section[] = [
  { key: "dashboard", href: "/dashboard", bg: "Табло", en: "Dashboard", group: "main" },
  { key: "schemes", href: "/", bg: "Схеми", en: "Schemes", group: "main" },
  { key: "organizations", href: "/organizations", bg: "Организации и лаборатории", en: "Organisations and laboratories", group: "main" },
  { key: "batches", href: "/batches", bg: "Обекти и партиди", en: "Objects and batches", group: "main" },
  { key: "deliveries", href: "/deliveries", bg: "Доставки", en: "Deliveries", group: "main" }, // built in 5.6
  { key: "invoices", href: "/invoices", bg: "Фактури", en: "Invoices", group: "main", comesIn: "5.8" },
  { key: "journal", href: "/activity", bg: "Регистър на действията", en: "Register of actions", group: "records" },
  { key: "people", href: "/users", bg: "Потребители на провайдъра", en: "The provider's users", group: "records" },
  { key: "notices", href: "/notices", bg: "Известия", en: "Notices", group: "more" },
  { key: "library", href: "/items", bg: "Елементи", en: "My items", group: "more" },
  { key: "skins", href: "/skins", bg: "Облици", en: "Skins", group: "more" },
  { key: "changes", href: "/changes", bg: "Регистър на промените", en: "Change register", group: "more" },
  { key: "holidays", href: "/holidays", bg: "Почивни дни", en: "Days off", group: "more" },
  { key: "system", href: "/system", bg: "Проверка на системата", en: "System check", group: "more" },
];

/** The section a path belongs to — for the panel's highlight. */
export function sectionOf(path: string): SectionKey | null {
  if (path === "/" || path.startsWith("/files") || path.startsWith("/schemes")) return "schemes";
  const hit = SECTIONS.filter((s) => s.href !== "/").find((s) => path === s.href || path.startsWith(s.href + "/"));
  return hit?.key ?? null;
}
