// A legal entity's users (plan part 4.3) — in the identity store (migration 0033), the
// ONLY way in: every opening names who opens it, for what and WHICH users, recorded in
// identity.openings before a row returns. In memory, locally, the same rules and the
// same record. The role is checked by the caller's gate (labs.manage — lib/access).
import { getDb } from "./supabase";
import { checkOpener, recordMemOpening, identityWarn, type Opener } from "./identity-store";
import { UUID_RE } from "./entities-model";
import { memEntityState, memEntityErased } from "./entities";
import { emailKey, leavesNoAdmin, type EntityUser } from "./entity-users-model";

// job_position: the database's name for the position in what it returns (POSITION is a
// keyword there — 4.3 review)
type Row = { id: string; entity_id: string; email: string; name: string; job_position?: string; position?: string; phone: string; role: string; two_factor_required: boolean; receives_notices?: boolean; state: string; auth_user_id: string | null; created_at: string; created_by: string };
const fromRow = (r: Row): EntityUser => ({
  id: r.id, entityId: r.entity_id, email: r.email, name: r.name, position: r.job_position ?? r.position ?? "", phone: r.phone ?? "",
  role: r.role === "admin" ? "admin" : "user", twoFactorRequired: !!r.two_factor_required, receivesNotices: r.receives_notices !== false,
  state: r.state === "active" || r.state === "inactive" ? r.state : "invited", authUserId: r.auth_user_id ?? undefined, createdAt: r.created_at, createdBy: r.created_by,
});
const COLS: [keyof EntityUser, string][] = [["entityId", "entity_id"], ["email", "email"], ["name", "name"], ["position", "position"], ["phone", "phone"], ["role", "role"], ["twoFactorRequired", "two_factor_required"], ["receivesNotices", "receives_notices"], ["state", "state"]];
// (never the sign-in account: it is linked only when the invitation is accepted — 4.4)
const toFields = (patch: Partial<EntityUser>) => Object.fromEntries(COLS.filter(([k]) => k in patch).map(([k, col]) => [col, patch[k] ?? null]));

const memStore = globalThis as unknown as { __ptsEntityUsersMem?: EntityUser[] };
const mem: EntityUser[] = memStore.__ptsEntityUsersMem ?? (memStore.__ptsEntityUsersMem = []);

/** The users — of one entity, one user, or all — recorded as an opening first. An id
 *  that is no id opens nothing. */
export async function openEntityUsers(who: Opener, q: { entityId?: string; userId?: string } = {}): Promise<EntityUser[]> {
  checkOpener(who);
  if ((q.entityId !== undefined && !UUID_RE.test(q.entityId)) || (q.userId !== undefined && !UUID_RE.test(q.userId))) return [];
  const fromMem = () => {
    const out = mem.filter((u) => (q.entityId === undefined || u.entityId === q.entityId) && (q.userId === undefined || u.id === q.userId))
      .map((u) => ({ ...u })).sort((a, b) => a.name.localeCompare(b.name, "bg"));
    recordMemOpening({ actor: who.actor.trim(), purpose: who.purpose, entityId: q.entityId, userIds: out.map((u) => u.id), rows: out.length });
    return out;
  };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.rpc("identity_entity_users", { p_actor: who.actor.trim(), p_purpose: who.purpose, p_entity: q.entityId ?? null, p_user: q.userId ?? null });
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    identityWarn(e);
    return fromMem();
  }
}

/** Is this login e-mail already another user's? The question only — recorded. */
export async function userEmailTaken(actor: string, email: string, except?: string): Promise<boolean> {
  checkOpener({ actor, purpose: "write" });
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_user_email_taken", { p_actor: actor.trim(), p_email: email, p_except: except ?? null });
    if (error) throw new Error(`The e-mail could not be checked: ${error.message}`, { cause: error });
    return data === true;
  }
  const hit = mem.find((u) => u.email === emailKey(email) && u.id !== except);
  recordMemOpening({ actor: actor.trim(), purpose: "write", userIds: hit ? [hit.id] : undefined, rows: hit ? 1 : 0 });
  return !!hit;
}

/** A new user of an entity (not inactive), or some fields of one — recorded as a write;
 *  never its entity, sign-in account, maker or creation changed by it. The database
 *  holds the rules (0033), and memory the same: one login once; the first user while
 *  the entity has no active administrator is its administrator; a changed login is
 *  unlinked and «поканен» again unless inactive; active only with a sign-in account;
 *  an active administrator kept (4.3 review). */
export async function putEntityUser(id: string, patch: Partial<EntityUser>, actor: string): Promise<void> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(id)) throw new Error("The user could not be saved: no such user");
  const db = getDb();
  if (db) {
    const { error } = await db.rpc("identity_entity_user_put", { p_actor: actor.trim(), p_user: id, p_fields: toFields(patch) });
    if (error) throw new Error(`The user could not be saved: ${error.message}`, { cause: error });
    return;
  }
  const { id: _i, createdAt: _c, createdBy: _b, entityId: _e, authUserId: _a, ...rest } = patch; void _i; void _c; void _b; void _e; void _a;
  const i = mem.findIndex((u) => u.id === id);
  if (memEntityErased(i >= 0 ? mem[i].entityId : patch.entityId)) throw new Error("The user could not be saved: identity: an erased profile is never changed");
  if (rest.email && mem.some((u) => u.id !== id && u.email === emailKey(rest.email!))) throw new Error("The user could not be saved: duplicate key (email)");
  let next: EntityUser;
  if (i >= 0) {
    const was = mem[i];
    next = { ...was, ...rest, ...(rest.email ? { email: emailKey(rest.email) } : {}) };
    // a changed login: unlinked, its old sign-in kept in mind for the erasure (0037)
    if (next.email !== was.email) next = { ...next, authUserId: undefined, pastAuthUserIds: [...(was.pastAuthUserIds ?? []), ...(was.authUserId ? [was.authUserId] : [])], state: next.state === "active" ? "invited" : next.state };
  } else {
    const entityId = patch.entityId ?? "";
    const hasAdmin = mem.some((u) => u.entityId === entityId && u.role === "admin" && u.state !== "inactive");
    next = { position: "", phone: "", role: "user", twoFactorRequired: false, receivesNotices: true, state: "invited", ...rest, ...(hasAdmin ? {} : { role: "admin" as const }), email: emailKey(rest.email ?? ""), entityId, id, createdAt: new Date().toISOString(), createdBy: actor.trim() } as EntityUser;
  }
  if (!next.email || !next.name?.trim() || (next.state === "active" && !next.authUserId)) throw new Error("The user could not be saved: violates not-null or check constraint");
  const entityState = memEntityState(next.entityId);
  if (next.state !== "inactive" && !["pending", "active"].includes(entityState ?? "")) throw new Error("The user could not be saved: identity: no such entity, or it is inactive");
  if (i >= 0 && entityState !== "inactive" && leavesNoAdmin(mem.filter((u) => u.entityId === next.entityId), { id, role: next.role, state: next.state })) throw new Error("The user could not be saved: identity: the entity keeps at least one active administrator");
  if (i >= 0) mem[i] = next; else mem.push(next);
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId: next.entityId, userIds: [id], rows: 1 });
}

// ── the sign-in account (4.4) ─────────────────────────────────────────────────────
// Linked at the invitation — only an invited user, only the account of the user's own
// login (the database compares auth.users) — and accepted when the password is set.

/** Link the sign-in account made for an invited user's login — recorded as a write. */
export async function linkEntityUserAccount(userId: string, authUserId: string, actor: string): Promise<void> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(userId) || !UUID_RE.test(authUserId)) throw new Error("The sign-in could not be linked: no such user");
  const db = getDb();
  if (db) {
    const { error } = await db.rpc("identity_entity_user_link", { p_actor: actor.trim(), p_user: userId, p_auth: authUserId });
    if (error) throw new Error(`The sign-in could not be linked: ${error.message}`, { cause: error });
    return;
  }
  // memory: no sign-in accounts to compare — the rest of the database's rules
  const u = mem.find((x) => x.id === userId);
  if (!u) throw new Error("The sign-in could not be linked: identity: no such user");
  if (u.state !== "invited") throw new Error("The sign-in could not be linked: identity: only an invited user is linked to a sign-in account");
  if (u.authUserId && u.authUserId !== authUserId) throw new Error("The sign-in could not be linked: identity: the user is linked to another sign-in account");
  if (mem.some((x) => x.id !== userId && x.authUserId === authUserId)) throw new Error("The sign-in could not be linked: duplicate key (auth_user_id)");
  u.authUserId = authUserId;
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId: u.entityId, userIds: [userId], rows: 1 });
}

/** The invitation accepted: the invited user of this sign-in account becomes active.
 *  Returns the user's id, or null when there is none to accept. */
export async function acceptEntityUserInvitation(authUserId: string, actor: string): Promise<string | null> {
  checkOpener({ actor, purpose: "write" });
  if (!UUID_RE.test(authUserId)) return null;
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_user_accept", { p_actor: actor.trim(), p_auth: authUserId });
    if (error) throw new Error(`The invitation could not be accepted: ${error.message}`, { cause: error });
    return typeof data === "string" && UUID_RE.test(data) ? data : null;
  }
  const u = mem.find((x) => x.authUserId === authUserId && x.state === "invited");
  if (!u) return null;
  if (!["pending", "active"].includes(memEntityState(u.entityId) ?? "")) throw new Error("The invitation could not be accepted: identity: no such entity, or it is inactive");
  u.state = "active";
  recordMemOpening({ actor: actor.trim(), purpose: "write", entityId: u.entityId, userIds: [u.id], rows: 1 });
  return u.id;
}

/** The user of a sign-in account — the laboratory's own opening (lab.own), at most one,
 *  recorded. A database that cannot answer answers nothing: a sign-in is never made
 *  from memory. */
export async function entityUserByAuth(authUserId: string, actor: string): Promise<EntityUser | null> {
  checkOpener({ actor, purpose: "lab.own" });
  if (!UUID_RE.test(authUserId)) return null;
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_user_by_auth", { p_actor: actor.trim(), p_auth: authUserId });
    if (error) { identityWarn(error); return null; }
    const rows = (data ?? []) as Row[];
    return rows.length === 1 ? fromRow(rows[0]) : null;
  }
  const hit = mem.filter((u) => u.authUserId === authUserId);
  recordMemOpening({ actor: actor.trim(), purpose: "lab.own", entityId: hit[0]?.entityId, userIds: hit.map((u) => u.id), rows: hit.length });
  return hit.length === 1 ? { ...hit[0] } : null;
}

/** The user of a login — for a new password asked for by its address (4.4 review): its
 *  id, entity, state and whether it has a sign-in account; null when none. Recorded
 *  (purpose «send»). Throws when the database cannot say. */
export async function entityUserForLogin(email: string, actor: string): Promise<{ id: string; entityId: string; state: EntityUser["state"]; linked: boolean } | null> {
  checkOpener({ actor, purpose: "send" });
  const db = getDb();
  if (db) {
    const { data, error } = await db.rpc("identity_entity_user_for_login", { p_actor: actor.trim(), p_email: email });
    if (error) throw new Error(`The login could not be looked up: ${error.message}`, { cause: error });
    const r = ((data ?? []) as { id: string; entity_id: string; state: string; linked: boolean }[])[0];
    return r ? { id: r.id, entityId: r.entity_id, state: r.state === "active" || r.state === "inactive" ? r.state : "invited", linked: !!r.linked } : null;
  }
  const u = mem.find((x) => x.email === emailKey(email));
  recordMemOpening({ actor: actor.trim(), purpose: "send", entityId: u?.entityId, userIds: u ? [u.id] : undefined, rows: u ? 1 : 0 });
  return u ? { id: u.id, entityId: u.entityId, state: u.state, linked: !!u.authUserId } : null;
}
