// Redesign R1: the icon beside each section of the team's menu (the words stay beside it — an icon never alone).
import type { SectionKey } from "./admin-sections";
import type { IconName } from "./ui-icons";

export const SECTION_ICON: Record<SectionKey, IconName> = {
  dashboard: "home",
  schemes: "flask",
  organizations: "building",
  registrations: "people",
  batches: "box",
  deliveries: "truck",
  invoices: "receipt",
  journal: "list",
  people: "user",
  notices: "bell",
  website: "globe",
  library: "bookmark",
  skins: "palette",
  changes: "history",
  holidays: "calendar",
  validation: "shield",
  system: "gear",
};
