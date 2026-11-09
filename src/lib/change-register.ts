import { randomUUID } from "crypto";
import { getDb, noMemoryFallback } from "./supabase";

// The change register (plan part 1.11; ISO/IEC 17043 §7.5.2, Реш. 67, ground rule 7):
// every release, every update of a dependency or the platform, and every change of
// a system setting — authorised, documented and validated before it is put to use.
//
//   release / update — proposed by a manager (what changed, how it was validated,
//                      for a release the commit), authorised or rejected by the head
//                      of the PT provider; a release is marked deployed when its
//                      commit starts in production. The build gate
//                      (scripts/check-release.mjs) deploys to production only a
//                      commit with an authorised entry.
//   setting          — a change made in the portal itself (an approved reminder text,
//                      a person's role): recorded as made, with who made it — the
//                      person who saved it is its authorisation.
//
// A record: an entry is never removed, its words never change, its status only moves
// forward — enforced in the database (migration 0022) and mirrored here.

export type ChangeKind = "release" | "update" | "setting";
export type ChangeStatus = "proposed" | "authorised" | "deployed" | "rejected";

export interface ChangeEntry {
  id: string;
  createdAt: string;
  kind: ChangeKind;
  title: string;
  what: string;
  validation: string;
  ref?: string;
  requestedBy: string;
  status: ChangeStatus;
  authorisedBy?: string;
  authorisedAt?: string;
  deployedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  reason?: string;
}

const memStore = globalThis as unknown as { __ptsChangeMem?: ChangeEntry[] };
const mem: ChangeEntry[] = memStore.__ptsChangeMem ?? (memStore.__ptsChangeMem = []);

type Row = {
  id: string; created_at: string; kind: string; title: string; what: string; validation: string; ref: string | null;
  requested_by: string; status: string; authorised_by: string | null; authorised_at: string | null; deployed_at: string | null;
  rejected_by: string | null; rejected_at: string | null; reason: string | null;
};
const toRow = (e: ChangeEntry): Row => ({
  id: e.id, created_at: e.createdAt, kind: e.kind, title: e.title, what: e.what, validation: e.validation, ref: e.ref ?? null,
  requested_by: e.requestedBy, status: e.status, authorised_by: e.authorisedBy ?? null, authorised_at: e.authorisedAt ?? null,
  deployed_at: e.deployedAt ?? null, rejected_by: e.rejectedBy ?? null, rejected_at: e.rejectedAt ?? null, reason: e.reason ?? null,
});
const fromRow = (r: Row): ChangeEntry => ({
  id: r.id, createdAt: r.created_at, kind: r.kind as ChangeKind, title: r.title, what: r.what, validation: r.validation,
  ref: r.ref ?? undefined, requestedBy: r.requested_by, status: r.status as ChangeStatus,
  authorisedBy: r.authorised_by ?? undefined, authorisedAt: r.authorised_at ?? undefined, deployedAt: r.deployed_at ?? undefined,
  rejectedBy: r.rejected_by ?? undefined, rejectedAt: r.rejected_at ?? undefined, reason: r.reason ?? undefined,
});

/** A commit as the register names it: all 40 hexadecimal characters — a short form
 *  is a prefix that a crafted commit can share in minutes. */
export const isCommit = (s: string | undefined): s is string => !!s && /^[0-9a-f]{40}$/.test(s);
/** Does this register entry name exactly this commit? */
export const namesCommit = (ref: string | undefined, sha: string) => isCommit(ref) && ref === sha.toLowerCase();
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// register lines that could not be written on this instance (shown on /system)
const healthStore = globalThis as unknown as { __ptsRegisterHealth?: { failures: number; last?: string } };
const health = healthStore.__ptsRegisterHealth ?? (healthStore.__ptsRegisterHealth = { failures: 0 });
export const registerHealth = () => ({ ...health });

/** The step forward this would be, or why not — the same rule as the database. */
export function nextStatus(cur: ChangeStatus, to: ChangeStatus): boolean {
  return (cur === "proposed" && (to === "authorised" || to === "rejected")) || (cur === "authorised" && to === "deployed");
}

export type ProposeProblem = "title" | "what" | "validation" | "commit" | "kind";
export function proposalProblem(p: { kind: string; title: string; what: string; validation: string; ref?: string }): ProposeProblem | null {
  if (p.kind !== "release" && p.kind !== "update") return "kind";
  if (!p.title.trim() || p.title.length > 200) return "title";
  if (!p.what.trim() || p.what.length > 5000) return "what";
  if (!p.validation.trim() || p.validation.length > 5000) return "validation";
  if (p.kind === "release" && !isCommit(p.ref?.trim().toLowerCase())) return "commit";
  return null;
}

async function insert(e: ChangeEntry): Promise<ChangeEntry> {
  const db = getDb();
  if (!db) { mem.unshift(e); return e; }
  try {
    const { error } = await db.from("change_register").insert(toRow(e));
    if (error) throw error;
    return e;
  } catch (err) {
    noMemoryFallback("change-register", err); // a deployment: an error, never memory
    mem.unshift(e);
    return e;
  }
}

/** A release or an update, proposed. */
export async function proposeChange(p: { kind: "release" | "update"; title: string; what: string; validation: string; ref?: string; by: string }): Promise<ChangeEntry> {
  return insert({
    id: randomUUID(), createdAt: new Date().toISOString(), kind: p.kind, title: p.title.trim(), what: p.what.trim(),
    validation: p.validation.trim(), ref: p.ref?.trim().toLowerCase() || undefined, requestedBy: p.by, status: "proposed",
  });
}

/** A setting changed in the portal, recorded as made — the person who made it is its authorisation. */
export async function recordSettingChange(p: { title: string; what: string; validation: string; ref: string; by: string }): Promise<ChangeEntry | null> {
  const at = new Date().toISOString();
  try {
    return await insert({
      id: randomUUID(), createdAt: at, kind: "setting", title: p.title, what: p.what, validation: p.validation, ref: p.ref,
      requestedBy: p.by, status: "deployed", authorisedBy: p.by, authorisedAt: at, deployedAt: at,
    });
  } catch (e) {
    // the setting is already made; a missing register line is reported, never silent
    health.failures++;
    health.last = p.title.slice(0, 120);
    console.error("[change-register] setting change NOT recorded:", p.title, (e as Error)?.message ?? e);
    return null;
  }
}

/** Move an entry one step forward, if it is still where the person saw it — and never
 *  by the person who proposed it (two people: one proposes, the head decides). */
export async function decideChange(id: string, to: "authorised" | "rejected", by: string, reason?: string, opts?: { localSelf?: boolean }): Promise<ChangeEntry | null> {
  if (!isId(id)) return null;
  const at = new Date().toISOString();
  const patch = to === "authorised" ? { status: to, authorised_by: by, authorised_at: at } : { status: to, rejected_by: by, rejected_at: at, reason: reason?.slice(0, 500) ?? null };
  const db = getDb();
  if (!db) {
    const e = mem.find((x) => x.id === id);
    // locally, with login off, everyone is «build»: the two-person rule needs a login
    if (!e || !nextStatus(e.status, to) || (e.requestedBy === by && !opts?.localSelf)) return null;
    Object.assign(e, to === "authorised" ? { status: to, authorisedBy: by, authorisedAt: at } : { status: to, rejectedBy: by, rejectedAt: at, reason: reason?.slice(0, 500) });
    return e;
  }
  const { data, error } = await db.from("change_register").update(patch).eq("id", id).eq("status", "proposed").neq("requested_by", by).select("*");
  if (error) throw error;
  return data?.[0] ? fromRow(data[0] as Row) : null;
}

/** The commit now running in production: its authorised release becomes deployed. Never throws. */
export async function markDeployed(sha: string): Promise<boolean> {
  if (!isCommit(sha)) return false;
  try {
    const at = new Date().toISOString();
    const db = getDb();
    if (!db) {
      const e = mem.find((x) => x.kind === "release" && x.status === "authorised" && namesCommit(x.ref, sha));
      if (!e) return false;
      Object.assign(e, { status: "deployed", deployedAt: at });
      return true;
    }
    const { data, error } = await db.from("change_register").update({ status: "deployed", deployed_at: at })
      .eq("kind", "release").eq("status", "authorised").eq("ref", sha.toLowerCase()).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (e) {
    console.error("[change-register] could not mark the release deployed:", (e as Error)?.message ?? e);
    return false;
  }
}

export async function listChanges(limit = 200): Promise<ChangeEntry[]> {
  const db = getDb();
  if (!db) return mem.slice(0, limit);
  try {
    const { data, error } = await db.from("change_register").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("change-register", e);
    return mem.slice(0, limit);
  }
}

/** Is this commit authorised (or already deployed)? For the system check. */
export async function releaseFor(sha: string): Promise<ChangeEntry | null> {
  const ref = sha.toLowerCase();
  if (!isCommit(ref)) return null;
  const db = getDb();
  if (!db) return mem.find((e) => e.kind === "release" && (e.status === "authorised" || e.status === "deployed") && e.ref === ref) ?? null;
  const { data, error } = await db.from("change_register").select("*").eq("kind", "release").eq("ref", ref).in("status", ["authorised", "deployed"]).limit(1);
  if (error) throw error;
  return data?.[0] ? fromRow(data[0] as Row) : null;
}
