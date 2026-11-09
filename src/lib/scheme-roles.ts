import { randomUUID } from "crypto";
import { getDb, noMemoryFallback } from "./supabase";
import { getStaffByEmail } from "./staff";
import { isProviderHead, isFounder } from "./provider-people";
import { assignmentProblem, effectiveRoles, SCHEME_ROLES, type PersonRoles, type SchemeRole, type PermanentRole } from "./role-model";
import { getScheme } from "./store";

// The roles of each scheme, from its Order (plan part 2.1; migration 0023). A role is
// never removed — it is ENDED, so the record keeps who held what, and when. The
// software administrator holds none (П 7.4.1 т. 3), refused here and in the database.

export interface SchemeRoleEntry {
  id: string;
  schemeId: string;
  personEmail: string;
  role: SchemeRole;
  orderRef?: string;
  assignedBy: string;
  assignedAt: string;
  endedAt?: string;
  endedBy?: string;
}

const memStore = globalThis as unknown as { __ptsSchemeRolesMem?: SchemeRoleEntry[] };
const mem: SchemeRoleEntry[] = memStore.__ptsSchemeRolesMem ?? (memStore.__ptsSchemeRolesMem = []);

type Row = { id: string; scheme_id: string; person_email: string; role: string; order_ref: string | null; assigned_by: string; assigned_at: string; ended_at: string | null; ended_by: string | null };
const toRow = (e: SchemeRoleEntry): Row => ({ id: e.id, scheme_id: e.schemeId, person_email: e.personEmail, role: e.role, order_ref: e.orderRef ?? null, assigned_by: e.assignedBy, assigned_at: e.assignedAt, ended_at: e.endedAt ?? null, ended_by: e.endedBy ?? null });
const fromRow = (r: Row): SchemeRoleEntry => ({ id: r.id, schemeId: r.scheme_id, personEmail: r.person_email, role: r.role as SchemeRole, orderRef: r.order_ref ?? undefined, assignedBy: r.assigned_by, assignedAt: r.assigned_at, endedAt: r.ended_at ?? undefined, endedBy: r.ended_by ?? undefined });
const norm = (e: string) => e.trim().toLowerCase();

/** One of PTS's people who may hold a role now: an active team member — or, with no
 *  team row, the head or a founder (configuration, not a row). A deactivated row is
 *  out, whatever the settings say. */
function eligible(email: string, staff: { status: string; role?: string } | null | undefined): boolean {
  // the auditor (read-only, outside the model) takes no role (2.4)
  return staff ? staff.status === "active" && staff.role !== "auditor" : isProviderHead(email) || isFounder(email);
}

/** The roles held now (or ever, with `all`) — of one scheme, or of one person. */
export async function listSchemeRoles(q: { schemeId?: string; personEmail?: string; all?: boolean } = {}): Promise<SchemeRoleEntry[]> {
  const keep = (e: SchemeRoleEntry) => (!q.schemeId || e.schemeId === q.schemeId) && (!q.personEmail || e.personEmail === norm(q.personEmail)) && (q.all || !e.endedAt);
  const db = getDb();
  if (!db) return mem.filter(keep);
  try {
    let query = db.from("scheme_roles").select("*").order("assigned_at", { ascending: true });
    if (q.schemeId) query = query.eq("scheme_id", q.schemeId);
    if (q.personEmail) query = query.eq("person_email", norm(q.personEmail));
    if (!q.all) query = query.is("ended_at", null);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("scheme-roles", e);
    return mem.filter(keep);
  }
}

/** Every role a person holds: permanent (the head from PROVIDER_HEAD_EMAILS, the
 *  others from staff_users) and per scheme (from the Orders) — conflicts resolved
 *  closed: a software administrator keeps only that (role-model effectiveRoles). */
export async function personRoles(email: string): Promise<PersonRoles> {
  return effectiveRoles(await heldRoles(email));
}

async function heldRoles(email: string): Promise<PersonRoles> {
  const e = norm(email);
  const permanent: PermanentRole[] = [];
  if (isProviderHead(e)) permanent.push("head");
  const staff = await getStaffByEmail(e);
  // the auditor (read-only, outside the model) holds no permanent role either (2.4)
  if (staff?.status === "active" && staff.role !== "auditor" && staff.permanentRole) permanent.push(staff.permanentRole);
  const schemes: Record<string, SchemeRole[]> = {};
  if (eligible(e, staff)) {
    for (const r of await listSchemeRoles({ personEmail: e })) (schemes[r.schemeId] ??= []).push(r.role);
  }
  return { permanent, schemes };
}

export type AssignProblem = "role" | "person" | "scheme" | "order" | "software-admin" | "already" | "failed";

/** Give a person a role in a scheme, from its Order. */
export async function assignSchemeRole(p: { schemeId: string; personEmail: string; role: string; orderRef?: string; by: string }): Promise<{ ok: true; entry: SchemeRoleEntry } | { ok: false; error: AssignProblem }> {
  if (!(SCHEME_ROLES as readonly string[]).includes(p.role)) return { ok: false, error: "role" };
  if (!(await getScheme(p.schemeId))) return { ok: false, error: "scheme" }; // a typo is no permanent row
  const orderRef = (p.orderRef ?? "").trim().slice(0, 120);
  if (!orderRef) return { ok: false, error: "order" }; // a role from the Order names it: its number and date (the Order itself is the scheme's «Заповед», 2.6)
  const email = norm(p.personEmail);
  const staff = await getStaffByEmail(email);
  if (!eligible(email, staff)) return { ok: false, error: "person" }; // PTS's own people only
  const problem = assignmentProblem(await heldRoles(email), p.role as SchemeRole, p.schemeId);
  if (problem) return { ok: false, error: problem };
  const entry: SchemeRoleEntry = {
    id: randomUUID(), schemeId: p.schemeId, personEmail: email, role: p.role as SchemeRole,
    orderRef, assignedBy: p.by, assignedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (!db) { mem.push(entry); return { ok: true, entry }; }
  const { error } = await db.from("scheme_roles").insert(toRow(entry));
  if (error) {
    // two at once: the database's «held once» index answers
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "already" };
    console.error("[scheme-roles] not assigned:", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, entry };
}

/** Why this person may not take this permanent role now, or null: nobody BECOMES the
 *  software administrator while holding a scheme role, or while named the head. */
export async function permanentRoleProblem(email: string, role: string | null): Promise<"role" | "holds-scheme-roles" | "head" | null> {
  if (role !== null && role !== "quality" && role !== "software_admin") return "role";
  if (role === "software_admin") {
    if (isProviderHead(email)) return "head";
    if ((await listSchemeRoles({ personEmail: email })).length) return "holds-scheme-roles";
  }
  return null;
}

/** End every role a person holds — when they are deactivated; on record, with who.
 *  Returns the roles it ended; run again after a failure, it ends what is left. */
export async function endAllRolesOf(email: string, by: string): Promise<SchemeRoleEntry[]> {
  const ended: SchemeRoleEntry[] = [];
  for (const r of await listSchemeRoles({ personEmail: email })) {
    const e = await endSchemeRole(r.id, by);
    if (e) ended.push(e);
  }
  return ended;
}

/** End a role — it stays on record, with when and by whom. */
export async function endSchemeRole(id: string, by: string): Promise<SchemeRoleEntry | null> {
  const at = new Date().toISOString();
  const db = getDb();
  if (!db) {
    const e = mem.find((x) => x.id === id && !x.endedAt);
    if (!e) return null;
    Object.assign(e, { endedAt: at, endedBy: by });
    return e;
  }
  const { data, error } = await db.from("scheme_roles").update({ ended_at: at, ended_by: by }).eq("id", id).is("ended_at", null).select("*");
  if (error) throw error;
  return data?.[0] ? fromRow(data[0] as Row) : null;
}
