// The provider's role model (plan part 2.1; the Zadanie's roles, Реш. 93, 114, 140,
// 142, 143; D5, D10, D18). Pure: no I/O. RIGHTS SIT ON THE ROLE TYPE — a person
// has the rights of the roles they hold, and nothing else.
//
//   Permanent (one per person, or none):
//     head            — the head of the PT provider: manages PTS's people and the
//                       Order, authorises releases (1.11), resets 2FA (Реш. 95).
//                       No laboratory names unless the Order gives a scheme role (D5).
//                       Named in PROVIDER_HEAD_EMAILS (1.6).
//     quality         — the quality manager: the journal, the codes and results,
//                       PTS's own actors — never a participant's identity (Реш. 114;
//                       the Zadanie's matrix: «кодове и резултати без имена» — да);
//                       the independent review (Реш. 140).
//     software_admin  — separate: technical access only; never processes, reviews
//                       or approves (П 7.4.1 т. 3); every opening of the code link
//                       logged (2.3, Реш. 142). Ivaylo, by order, with Ф 4.2-1 (D10).
//   Per scheme, from the Order:
//     scheme_manager     — the scheme; names and the code link; dispatch with
//                          identities (D18); the approval (the third act, Реш. 140)
//     coding_expert      — data collection and coding: names and the code link
//     statistics_expert  — codes and results only (the Ф 7.2.1-5 content); processes
//     technical_expert   — materials engineer / technical expert: codes and results
//                          only; the objects and batches (D18); may process (Реш. 140)
//     reviewer           — the authorised person for the independent review, named
//                          by the Order — the reviewer when the quality manager
//                          processes (Реш. 140): codes, results and the journal
//
// Only the scheme manager and the coding expert see who is behind a code (Реш. 93).
// Enforced in every page and action by lib/access.ts (2.4).

export const PERMANENT_ROLES = ["head", "quality", "software_admin"] as const;
export type PermanentRole = (typeof PERMANENT_ROLES)[number];

export const SCHEME_ROLES = ["scheme_manager", "coding_expert", "statistics_expert", "technical_expert", "reviewer"] as const;
export type SchemeRole = (typeof SCHEME_ROLES)[number];

export type RoleType = PermanentRole | SchemeRole;

export const CAPABILITIES = [
  "names.view",        // who is behind a code — the code link (logged, 2.3)
  "codes.view",        // the coded data
  "results.read",
  "results.enter",     // data collection
  "results.process",   // the statistical processing (2.0, outside; the export and import)
  "scheme.edit",       // the scheme's data and documents
  "docs.release",      // send documents to the participants
  "dispatch",          // shipments, receipts and the chain — with identities (D18)
  "items.manage",      // the objects and batches
  "journal.read",
  "review",            // the second processing act (Реш. 140)
  "approve",           // the third processing act (Реш. 140)
  "people.manage",     // PTS's people and their permanent roles (Реш. 141)
  "order.manage",      // enter the Order, assign the scheme roles
  "order.view",        // the scheme's Order: the staff it assigns roles to, never a participant (Реш. 149)
  "register.propose",  // propose a release or an update (1.11)
  "register.authorise",
  "twofa.reset",       // Реш. 95
  "system.technical",  // the technical side: settings, the system check
  // part 2.4 — what the portal's gates need that the matrix did not name
  "scheme.create",     // a new scheme, folder or project: the Order starts a scheme
  "library.manage",    // the shared library, templates, skins and covers (no names)
  "participants.manage", // add or edit a participant, decide an application — with names
  "labs.manage",       // the laboratory accounts and account applications — names, no codes
  "texts.approve",     // approve the words sent to laboratories (reminder templates, 1.8)
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const RIGHTS: Record<RoleType, readonly Capability[]> = {
  head: ["people.manage", "order.manage", "order.view", "register.authorise", "twofa.reset", "codes.view", "journal.read", "scheme.create", "library.manage", "texts.approve", "system.technical"],
  quality: ["journal.read", "codes.view", "results.read", "review"],
  software_admin: ["system.technical", "register.propose", "journal.read"],
  scheme_manager: ["names.view", "codes.view", "results.read", "order.view", "scheme.edit", "docs.release", "dispatch", "journal.read", "approve", "library.manage", "participants.manage", "labs.manage"],
  coding_expert: ["names.view", "codes.view", "results.read", "order.view", "results.enter", "dispatch", "participants.manage", "labs.manage"],
  statistics_expert: ["codes.view", "results.read", "order.view", "results.process"],
  technical_expert: ["codes.view", "results.read", "order.view", "results.process", "items.manage"],
  reviewer: ["codes.view", "results.read", "order.view", "journal.read", "review"],
};

export const ROLE_LABEL: Record<RoleType, { bg: string; en: string }> = {
  head: { bg: "Ръководител на РТ провайдъра", en: "Head of the PT provider" },
  quality: { bg: "Отговорник по качеството", en: "Quality manager" },
  software_admin: { bg: "Администратор на софтуера", en: "Software administrator" },
  scheme_manager: { bg: "Ръководител на схемата", en: "Scheme manager" },
  coding_expert: { bg: "Експерт по събиране и кодиране на данните", en: "Data-collection and coding expert" },
  statistics_expert: { bg: "Експерт по статистика", en: "Statistics expert" },
  technical_expert: { bg: "Материален инженер / технически експерт", en: "Materials engineer / technical expert" },
  reviewer: { bg: "Упълномощено лице за независимия преглед", en: "Authorised person for the independent review" },
};

export interface PersonRoles {
  // the head comes from PROVIDER_HEAD_EMAILS, the others from staff_users — so a list
  permanent: PermanentRole[];
  // scheme id → the scheme roles this person holds there (from the Order)
  schemes: Record<string, SchemeRole[]>;
}

/** May this person do this — by a permanent role, or in this scheme by its role
 *  there? A scheme role grants ONLY inside its own scheme: asked without a scheme,
 *  only a permanent role answers — a page that forgets the scheme sees less, never more. */
export function can(p: PersonRoles, cap: Capability, schemeId?: string): boolean {
  if (p.permanent.some((r) => RIGHTS[r].includes(cap))) return true;
  return !!schemeId && (p.schemes[schemeId] ?? []).some((r) => RIGHTS[r].includes(cap));
}

/** May this person do this somewhere — by a permanent role, or by a role in ANY
 *  scheme? For what is not bound to one scheme: the shared library, the laboratory
 *  accounts, the journal page (filtered to their schemes). */
export function canAnywhere(p: PersonRoles, cap: Capability): boolean {
  return p.permanent.some((r) => RIGHTS[r].includes(cap)) || Object.values(p.schemes).some((rs) => rs.some((r) => RIGHTS[r].includes(cap)));
}

/** The schemes in which this person may do this by a scheme role (for a list page). */
export function schemesWhere(p: PersonRoles, cap: Capability): string[] {
  return Object.entries(p.schemes).filter(([, rs]) => rs.some((r) => RIGHTS[r].includes(cap))).map(([id]) => id);
}

/** Why this person may not take this scheme role, or null. */
export function assignmentProblem(p: PersonRoles, role: SchemeRole, schemeId: string): "software-admin" | "already" | null {
  // the software administrator never processes, reviews or approves (П 7.4.1 т. 3)
  if (p.permanent.includes("software_admin")) return "software-admin";
  if ((p.schemes[schemeId] ?? []).includes(role)) return "already";
  return null;
}

/** Permanent roles that may not be one person's: the software administrator holds no
 *  other (the head authorises what the administrator proposes — 1.11; the
 *  administrator never processes, reviews or approves). The head and the quality
 *  manager may be one person in a small provider — not a conflict here; who reviews
 *  a given scheme is designated in 2.5. */
export function permanentConflict(p: PersonRoles): string | null {
  if (p.permanent.includes("software_admin") && p.permanent.length > 1) return "the software administrator holds no other role";
  return null;
}

/** What a person may hold, conflicts resolved closed: a software administrator keeps
 *  only that — no head powers, no scheme role. */
export function effectiveRoles(p: PersonRoles): PersonRoles {
  return p.permanent.includes("software_admin") ? { permanent: ["software_admin"], schemes: {} } : p;
}

// Who processes, reviews and approves a given scheme — and the warning when two
// coincide — are DESIGNATED per scheme (lib/processing-model.ts, part 2.5, Реш. 140),
// not read off the rights: the rights say who MAY be designated for each act.
