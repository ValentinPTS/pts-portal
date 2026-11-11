import { authorizeAnywhere, schemesFor, type Viewer } from "./access-matrix";
import { SECTIONS, type Section, type SectionKey } from "./admin-sections";

export { SECTIONS, sectionOf, type Section, type SectionKey } from "./admin-sections";

// The provider's administrative panel (plan part 2.7; PTS's design, «10.
// Административен панел»): one panel, its sections in the design's order, each shown
// only to whom the role model gives it (2.4). Pure: a new section's page gates with
// the same rule (lib/access.ts requireSection); the older pages keep their own gates,
// which these mirror. «Одобрения на регистрации» comes with 9.1.
//
// A section the plan builds later opens a page that says so and where its work is
// done meanwhile — so the panel is the whole portal's shape from now on.

/** Who may open each section — the same rule its page gates with. `managesPeople`:
 *  the head (or a founder while no head can act — lib/people-manager, 2.2). Someone
 *  of PTS with no role yet (day one, 2.4) has the dashboard, which says so, and the
 *  change register. */
export function maySection(key: SectionKey, v: Viewer, managesPeople: boolean): boolean {
  if (v.lab) return false; // a laboratory has its own portal
  const any = (cap: Parameters<typeof authorizeAnywhere>[1]) => authorizeAnywhere(v, cap);
  switch (key) {
    case "dashboard": return true;
    case "schemes": { const s = schemesFor(v, "codes.view"); return s === "all" || s.length > 0; }
    // the laboratory accounts and, from Phase 4, the organisations — with names (2.4)
    case "organizations": return any("labs.manage");
    // the registrations of organisations and the requests to join (9.1) — the same people
    case "registrations": return any("labs.manage");
    // the objects and batches: the technical expert (D18); the scheme manager plans them
    case "batches": return any("items.manage") || any("scheme.edit");
    // shipments go to a named laboratory (D18)
    case "deliveries": return any("dispatch");
    // a proforma or an invoice names the laboratory
    case "invoices": return any("participants.manage");
    case "journal": return any("journal.read");
    case "people": return managesPeople || any("labs.manage");
    case "notices": return any("journal.read");
    // the website's feed (10.2): who reads the notices sees what goes to the site; the head publishes it
    case "website": return any("journal.read");
    case "library": case "skins": return true; // the editor's elements and the skins: every staff page (requireStaff)
    case "changes": return true;
    // the calendar every working-day count reads: read by PTS's people, kept by the head
    case "holidays": return true;
    case "system": return any("system.technical");
    // the acceptance criteria and the validation record (8.1): who records it (the head, the
    // quality manager), and the software administrator, who reads — never records — it
    case "validation": return any("validation.record") || any("system.technical");
  }
}

export function visibleSections(v: Viewer, managesPeople: boolean): Section[] {
  return SECTIONS.filter((s) => maySection(s.key, v, managesPeople));
}

