import { randomUUID } from "crypto";
import { getDb, noMemoryFallback } from "./supabase";
import { getScheme } from "./store";
import { listStaff } from "./staff";
import { listSchemeRoles, personRoles } from "./scheme-roles";
import { checkProcessing, basisHolds, clipChars, mayApprove, mayProcess, reviewerBasis, MAX_JUSTIFICATION, type Coincidence, type ProcessingProblem, type ReviewerBasis } from "./processing-model";
import { type PersonRoles } from "./role-model";

// Who processes, reviews and approves each scheme (plan part 2.5, Реш. 140;
// migration 0026). The decisions are lib/processing-model.ts; this is the record. A
// designation is never changed or removed: a new one ENDS the current one, so the
// record keeps who was designated, when, and by whom. The database checks the rules
// again and works out the coincidences itself.

export interface ProcessingDesignation {
  id: string;
  schemeId: string;
  processor: string;
  reviewer: string;
  approver: string;
  reviewerBasis: ReviewerBasis;
  coincide: Coincidence[];
  justification: string;
  setBy: string;
  setAt: string;
  endedAt?: string;
  endedBy?: string;
}

const memStore = globalThis as unknown as { __ptsProcessingMem?: ProcessingDesignation[] };
const mem: ProcessingDesignation[] = memStore.__ptsProcessingMem ?? (memStore.__ptsProcessingMem = []);

type Row = {
  id: string; scheme_id: string; processor_email: string; reviewer_email: string; approver_email: string; reviewer_basis: string;
  coincide: string[] | null; justification: string | null; set_by: string; set_at: string; ended_at: string | null; ended_by: string | null;
};
const fromRow = (r: Row): ProcessingDesignation => ({
  id: r.id, schemeId: r.scheme_id, processor: r.processor_email, reviewer: r.reviewer_email, approver: r.approver_email,
  reviewerBasis: r.reviewer_basis as ReviewerBasis, coincide: (r.coincide ?? []) as Coincidence[], justification: r.justification ?? "",
  setBy: r.set_by, setAt: r.set_at, endedAt: r.ended_at ?? undefined, endedBy: r.ended_by ?? undefined,
});
const norm = (e: string) => (e ?? "").trim().toLowerCase();

/** The designations of a scheme — the current one only, or (with `all`) every one,
 *  oldest first. */
export async function listDesignations(q: { schemeId?: string; all?: boolean } = {}): Promise<ProcessingDesignation[]> {
  const keep = (d: ProcessingDesignation) => (!q.schemeId || d.schemeId === q.schemeId) && (q.all || !d.endedAt);
  const db = getDb();
  if (!db) return mem.filter(keep);
  try {
    let query = db.from("processing_roles").select("*").order("set_at", { ascending: true });
    if (q.schemeId) query = query.eq("scheme_id", q.schemeId);
    if (!q.all) query = query.is("ended_at", null);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("processing-roles", e);
    return mem.filter(keep);
  }
}

export async function currentDesignation(schemeId: string): Promise<ProcessingDesignation | null> {
  return (await listDesignations({ schemeId }))[0] ?? null;
}

async function rolesFor(emails: string[]): Promise<(email: string) => PersonRoles> {
  const unique = [...new Set(emails.map(norm).filter(Boolean))];
  const held = new Map(await Promise.all(unique.map(async (e) => [e, await personRoles(e)] as const)));
  return (e) => held.get(norm(e)) ?? { permanent: [], schemes: {} };
}

export type DesignateResult =
  // `unchanged`: the same three (and the same justification) as now — nothing recorded
  | { ok: true; entry: ProcessingDesignation; previous: ProcessingDesignation | null; unchanged?: boolean }
  | { ok: false; error: "scheme" }
  // `conflict`: someone else designated at the same moment; `refused`: the database
  // checked the rules again and refused (`detail` says which) — a role ended in between
  | { ok: false; error: "conflict" | "refused" | "failed"; detail?: string; coincide: Coincidence[] }
  | { ok: false; error: "rules"; problems: ProcessingProblem[]; coincide: Coincidence[] };

const same = (a: ProcessingDesignation, b: { processor: string; reviewer: string; approver: string; justification: string }) =>
  a.processor === b.processor && a.reviewer === b.reviewer && a.approver === b.approver && a.justification === b.justification;

/** Designate the three people of a scheme — checked against their roles NOW. */
export async function designateProcessing(p: { schemeId: string; processor: string; reviewer: string; approver: string; justification?: string; by: string }): Promise<DesignateResult> {
  if (!(await getScheme(p.schemeId))) return { ok: false, error: "scheme" };
  const people = { processor: norm(p.processor), reviewer: norm(p.reviewer), approver: norm(p.approver) };
  const justification = clipChars(p.justification ?? "", MAX_JUSTIFICATION);
  const check = checkProcessing(people, await rolesFor([people.processor, people.reviewer, people.approver]), p.schemeId, justification);
  if (check.problems.length || !check.basis) return { ok: false, error: "rules", problems: check.problems, coincide: check.coincide };
  const entry: ProcessingDesignation = {
    id: randomUUID(), schemeId: p.schemeId, ...people, reviewerBasis: check.basis, coincide: check.coincide,
    // a justification is kept only where two acts coincide — that is what it answers
    justification: check.coincide.length ? justification : "", setBy: p.by, setAt: new Date().toISOString(),
  };
  // the same again: no second record, journal line or register entry
  const now = await currentDesignation(p.schemeId);
  if (now && same(now, entry) && now.reviewerBasis === entry.reviewerBasis) return { ok: true, entry: now, previous: now, unchanged: true };
  const db = getDb();
  if (!db) {
    const previous = mem.find((d) => d.schemeId === p.schemeId && !d.endedAt) ?? null;
    if (previous) Object.assign(previous, { endedAt: entry.setAt, endedBy: p.by });
    mem.push(entry);
    return { ok: true, entry, previous };
  }
  const { data, error } = await db.rpc("processing_roles_set", {
    p_id: entry.id, p_scheme_id: entry.schemeId, p_processor: entry.processor, p_reviewer: entry.reviewer, p_approver: entry.approver,
    p_reviewer_basis: entry.reviewerBasis, p_justification: entry.justification, p_by: entry.setBy,
  });
  const got = data as { entry?: Row; previous?: Row | null } | null;
  if (error || !got?.entry) {
    console.error("[processing-roles] not designated:", error?.message);
    const code = (error as { code?: string } | null)?.code;
    // two at once: the «one current per scheme» index answers
    if (code === "23505") return { ok: false, error: "conflict", coincide: check.coincide };
    // the database's own check of the rules (raise exception) — say which
    if (code === "P0001") return { ok: false, error: "refused", detail: (error?.message ?? "").replace(/^processing_roles:\s*/, ""), coincide: check.coincide };
    return { ok: false, error: "failed", coincide: check.coincide };
  }
  // the one the database itself ended — not one read before, which another may have replaced
  return { ok: true, entry: fromRow(got.entry), previous: got.previous ? fromRow(got.previous) : null };
}

export interface DesignationStatus {
  current: ProcessingDesignation | null;
  // what no longer holds — a person's role ended or changed since: designate again
  problems: ProcessingProblem[];
}

/** The current designation of a scheme, checked again against today's roles. */
export async function designationStatus(schemeId: string): Promise<DesignationStatus> {
  const current = await currentDesignation(schemeId);
  if (!current) return { current: null, problems: [] };
  const roles = await rolesFor([current.processor, current.reviewer, current.approver]);
  const { problems } = checkProcessing(current, roles, schemeId, current.justification);
  // …and the ground the reviewer was designated on: an authorised person whose Order
  // role ended is no longer reviewing «by the Order», even if they may still on another
  if (!basisHolds(roles(current.reviewer), schemeId, current.reviewerBasis) && !problems.includes("reviewer-role")) problems.push("reviewer-role");
  return { current, problems };
}

export interface Candidate { email: string; name: string; basis?: ReviewerBasis }

/** Who may be designated for each act in this scheme, now. */
export async function processingCandidates(schemeId: string): Promise<{ processors: Candidate[]; reviewers: Candidate[]; approvers: Candidate[] }> {
  const [held, staff] = await Promise.all([listSchemeRoles({ schemeId }), listStaff()]);
  const quality = staff.filter((u) => u.status === "active" && u.permanentRole === "quality").map((u) => u.email);
  const emails = [...new Set([...held.map((r) => r.personEmail), ...quality].map(norm))];
  const rolesOf = await rolesFor(emails);
  const name = (e: string) => staff.find((u) => norm(u.email) === e)?.name ?? "";
  const pick = (ok: (r: PersonRoles) => boolean) => emails.filter((e) => ok(rolesOf(e))).map((e) => ({ email: e, name: name(e) }));
  return {
    processors: pick((r) => mayProcess(r, schemeId)),
    reviewers: emails.flatMap((e) => { const basis = reviewerBasis(rolesOf(e), schemeId); return basis ? [{ email: e, name: name(e), basis }] : []; }),
    approvers: pick((r) => mayApprove(r, schemeId)),
  };
}
