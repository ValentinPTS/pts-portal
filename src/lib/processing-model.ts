import { type PersonRoles } from "./role-model";

// The three processing acts of a scheme (plan part 2.5; Реш. 140; П 7.4.1 т. 3).
// Pure: no I/O. Per scheme, three people are DESIGNATED — who processes, who reviews,
// who approves — and the portal records all three:
//
//   process  — the statistical processing; the assigned or reference value and its
//              uncertainty; the performance statistics: the statistics expert OR a
//              technical expert of this scheme
//   review   — the independent review of the processing (input data, logical checks,
//              traceability of corrections and versions; the final report consistent
//              and impartial): the quality manager OR an authorised person from the
//              scheme's Order
//   approve  — the final dataset, the final statistical analysis and conclusions:
//              the scheme manager
//
// When two of the three are one person the portal WARNS and asks for a written
// justification to go on. When the quality manager processes (they are also a
// statistics expert), the review is an authorised person's from the Order — never
// theirs, justification or not. The acts themselves are recorded later (7.3, 7.4).
//
// The database checks the same rules again when a designation is written (migration
// 0026), and works out the coincidences itself.

export const ACTS = ["process", "review", "approve"] as const;
export type Act = (typeof ACTS)[number];

export const COINCIDENCES = ["process-review", "process-approve", "review-approve"] as const;
export type Coincidence = (typeof COINCIDENCES)[number];

/** On what ground the reviewer reviews: the permanent role, or the Order. */
export type ReviewerBasis = "quality" | "order";

export type ProcessingProblem =
  | "processor-role"     // not a statistics or technical expert of this scheme
  | "reviewer-role"      // neither the quality manager nor an authorised person from the Order
  | "approver-role"      // not the scheme manager of this scheme
  | "quality-processes"  // the quality manager processes: the reviewer must be from the Order, and someone else
  | "justification";     // two acts coincide, and no written justification

export const MIN_JUSTIFICATION = 10;
export const MAX_JUSTIFICATION = 2000;

export interface ProcessingPeople {
  processor: string;
  reviewer: string;
  approver: string;
}

const norm = (e: string) => (e ?? "").trim().toLowerCase();

// a justification is measured in characters, as the database's char_length counts
// them — not in UTF-16 units, so an emoji or a rare letter counts once
export const charCount = (s: string) => [...(s ?? "").trim()].length;
export const clipChars = (s: string, max: number) => [...(s ?? "").trim()].slice(0, max).join("");

/** Which of the three acts fall to one person. */
export function coincidences(p: ProcessingPeople): Coincidence[] {
  const [a, b, c] = [norm(p.processor), norm(p.reviewer), norm(p.approver)];
  const out: Coincidence[] = [];
  if (a && a === b) out.push("process-review");
  if (a && a === c) out.push("process-approve");
  if (b && b === c) out.push("review-approve");
  return out;
}

const holds = (r: PersonRoles, schemeId: string, roles: string[]) => (r.schemes[schemeId] ?? []).some((x) => roles.includes(x));

/** The ground on which this person may review in this scheme — the Order first (it
 *  names them for this scheme), then the quality manager's permanent role — or null. */
export function reviewerBasis(r: PersonRoles, schemeId: string): ReviewerBasis | null {
  if (holds(r, schemeId, ["reviewer"])) return "order";
  if (r.permanent.includes("quality")) return "quality";
  return null;
}

/** Does the ground a reviewer was designated on still hold? */
export function basisHolds(r: PersonRoles, schemeId: string, basis: ReviewerBasis): boolean {
  return basis === "order" ? holds(r, schemeId, ["reviewer"]) : r.permanent.includes("quality");
}

export const mayProcess = (r: PersonRoles, schemeId: string) => holds(r, schemeId, ["statistics_expert", "technical_expert"]);
export const mayApprove = (r: PersonRoles, schemeId: string) => holds(r, schemeId, ["scheme_manager"]);

export interface ProcessingCheck {
  problems: ProcessingProblem[];
  coincide: Coincidence[];
  basis: ReviewerBasis | null;
}

/** Is this designation allowed — with these people's roles NOW (effective roles:
 *  a software administrator, an inactive person or an auditor holds nothing here,
 *  so they are refused for every act)? */
export function checkProcessing(p: ProcessingPeople, rolesOf: (email: string) => PersonRoles, schemeId: string, justification: string): ProcessingCheck {
  const [proc, rev, appr] = [rolesOf(norm(p.processor)), rolesOf(norm(p.reviewer)), rolesOf(norm(p.approver))];
  const problems: ProcessingProblem[] = [];
  if (!norm(p.processor) || !mayProcess(proc, schemeId)) problems.push("processor-role");
  const basis = norm(p.reviewer) ? reviewerBasis(rev, schemeId) : null;
  if (!basis) problems.push("reviewer-role");
  if (!norm(p.approver) || !mayApprove(appr, schemeId)) problems.push("approver-role");
  // the quality manager processes: the independent review is an authorised person's,
  // from the Order — and not their own
  if (proc.permanent.includes("quality") && (basis !== "order" || norm(p.reviewer) === norm(p.processor))) problems.push("quality-processes");
  const coincide = coincidences(p);
  if (coincide.length && charCount(justification) < MIN_JUSTIFICATION) problems.push("justification");
  return { problems, coincide, basis };
}
