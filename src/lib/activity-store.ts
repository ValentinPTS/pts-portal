import { randomUUID } from "crypto";
import type { ActivityEvent } from "./types";
import { getDb, noMemoryFallback } from "./supabase";
import { LAB_ACTOR } from "./redact";
import { getStaffByEmail } from "./staff";

// The journal's store (split from activity.ts in part 1.9 so the parts with no
// request — the message record, the daily job, tests — can write to it without the
// request's session). logActivity, which reads the session, is in activity.ts.
//
// Append-only activity log (Phase RT2) — the audit trail. Supabase when configured,
// else in-memory, same graceful fallback as the other stores. The app ONLY appends:
// there is no update/delete here, and since part 1.9 the database refuses both
// (migration 0021), so the record stays tamper-evident (§8.4).
// Confidentiality (§4.2): never store a real lab name — codes/ids only.
//
// Part 1.9: each entry names the actor — the account's id and the person's name
// AT THE TIME (PTS's checklist: «the journal names a person, not a shared
// account») — what was acted on (subject), and what changed (before → after). A
// write that fails is not swallowed: it is counted and shown on «Дневник» and
// «Проверка на системата» (journalHealth), and reported to the server log.

// shared across every server entry point, as the other stores are (a module-local
// copy hid entries written from another bundle in dev — part 1.4/1.5)
const memStore = globalThis as unknown as { __ptsActivityMem?: ActivityEvent[] };
const mem: ActivityEvent[] = memStore.__ptsActivityMem ?? (memStore.__ptsActivityMem = []);

let warned = false;
function warn(e: unknown) {
  noMemoryFallback("activity", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[activity] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(e: ActivityEvent) {
  return {
    id: e.id, at: e.at, actor_email: e.actorEmail, actor_role: e.actorRole,
    action: e.action, scheme_id: e.schemeId ?? null, target_code: e.targetCode ?? null,
    summary: e.summary,
    // 0021's columns only when set (the build gate makes sure 0021 is there first)
    ...(e.actorId ? { actor_id: e.actorId } : {}),
    ...(e.actorName ? { actor_name: e.actorName } : {}),
    ...(e.subject ? { subject: e.subject } : {}),
    ...(e.before !== undefined ? { before: e.before } : {}),
    ...(e.after !== undefined ? { after: e.after } : {}),
  } as {
    id: string; at: string; actor_email: string; actor_role: string; action: string;
    scheme_id: string | null; target_code: string | null; summary: string;
    actor_id?: string | null; actor_name?: string | null; subject?: string | null; before?: unknown; after?: unknown;
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): ActivityEvent {
  return {
    id: r.id, at: r.at, actorEmail: r.actor_email ?? "", actorRole: r.actor_role ?? "",
    action: r.action, schemeId: r.scheme_id ?? undefined, targetCode: r.target_code ?? undefined,
    summary: r.summary ?? "",
    actorId: r.actor_id ?? undefined, actorName: r.actor_name ?? undefined, subject: r.subject ?? undefined,
    before: r.before ?? undefined, after: r.after ?? undefined,
  };
}

// writes that failed on this server instance (1.9) — visible, not swallowed
export interface JournalHealth { failures: number; since: string; lastAt?: string; lastAction?: string; lastError?: string }
const healthStore = globalThis as unknown as { __ptsJournalHealth?: JournalHealth };
const health: JournalHealth = healthStore.__ptsJournalHealth ?? (healthStore.__ptsJournalHealth = { failures: 0, since: new Date().toISOString() });
export const journalHealth = (): JournalHealth => ({ ...health });
export function failed(action: string, err: unknown) {
  health.failures++;
  health.lastAt = new Date().toISOString();
  health.lastAction = action;
  health.lastError = ((err as Error)?.message ?? String(err)).slice(0, 200);
  console.error(`[activity] journal entry NOT written (${action}):`, health.lastError);
}

// Low-level append. Pure (no role lookup) so it can't recurse; resilient (never
// throws — a logging failure must not break the action being logged). Returns
// whether the entry was written; a failure is counted and reported (1.9).
export async function appendActivity(input: Omit<ActivityEvent, "id" | "at"> & { at?: string }): Promise<boolean> {
  const e: ActivityEvent = {
    id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    schemeId: input.schemeId,
    targetCode: input.targetCode,
    summary: input.summary,
    actorId: input.actorId,
    actorName: input.actorName,
    subject: input.subject,
    before: input.before,
    after: input.after,
  };
  const db = getDb();
  if (!db) { mem.unshift(e); return true; }
  try {
    const { error } = await db.from("activity_log").insert(toRow(e));
    if (error) throw error;
    return true;
  } catch (err) {
    try {
      warn(err); // locally: memory, as before
      mem.unshift(e);
      return true;
    } catch {
      failed(e.action, err); // a deployment: the entry is lost — say so
      return false;
    }
  }
}

/** The person behind an internal address, at the time: a team member's name, else the address. */
export async function nameOf(email: string): Promise<string> {
  try { return (await getStaffByEmail(email))?.name?.trim() || email; } catch { return email; }
}

export type JournalOpts = { schemeId?: string; targetCode?: string; summary?: string; subject?: string; before?: unknown; after?: unknown };

/**
 * An entry whose actor is not the request's session: a sign-in (the session is
 * being made), or the portal itself (the daily job, a message handed to the
 * transport). A laboratory is only «laboratory» (§4.2).
 */
export async function logAs(
  actor: { kind: "person"; userId: string; email: string; role: string } | { kind: "lab"; userId: string } | { kind: "system" },
  action: string,
  opts?: JournalOpts,
): Promise<boolean> {
  const who = actor.kind === "system"
    ? { actorEmail: "system", actorRole: "system", actorName: "портал / portal" }
    : actor.kind === "lab"
      ? { actorEmail: LAB_ACTOR, actorRole: "lab", actorId: actor.userId, actorName: LAB_ACTOR }
      : { actorEmail: actor.email, actorRole: actor.role, actorId: actor.userId, actorName: await nameOf(actor.email) };
  return appendActivity({ action, ...who, schemeId: opts?.schemeId, targetCode: opts?.targetCode, summary: opts?.summary ?? action, subject: opts?.subject, before: opts?.before, after: opts?.after });
}

/** The whole journal of one round, oldest first — for the round export (part 1.10). Throws on a database error. */
export async function listActivityForScheme(schemeId: string): Promise<ActivityEvent[]> {
  const db = getDb();
  if (!db) return mem.filter((e) => e.schemeId === schemeId).sort((a, b) => a.at.localeCompare(b.at));
  const out: ActivityEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("activity_log").select("*").eq("scheme_id", schemeId).order("at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r) => fromRow(r as Row)));
    if ((data ?? []).length < 1000) return out;
  }
}

export interface ActivityFilter {
  schemeId?: string;
  action?: string;
  actor?: string;
  /** e.g. "lab" — a laboratory's own entries (5.4: its downloads) */
  actorRole?: string;
  /** only these subjects (5.5: the editions a participation holds) */
  subjects?: readonly string[];
  /** only these participations' codes (5.5) */
  targetCodes?: readonly string[];
  limit?: number;
}

export async function listActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  const db = getDb();
  if (!db) {
    return mem
      .filter((e) => (!filter.schemeId || e.schemeId === filter.schemeId)
        && (!filter.action || e.action === filter.action)
        && (!filter.actor || e.actorEmail === filter.actor)
        && (!filter.actorRole || e.actorRole === filter.actorRole)
        && (!filter.subjects || (!!e.subject && filter.subjects.includes(e.subject)))
        && (!filter.targetCodes || (!!e.targetCode && filter.targetCodes.includes(e.targetCode))))
      .slice(0, limit);
  }
  try {
    let q = db.from("activity_log").select("*").order("at", { ascending: false }).limit(limit);
    if (filter.schemeId) q = q.eq("scheme_id", filter.schemeId);
    if (filter.action) q = q.eq("action", filter.action);
    if (filter.actor) q = q.eq("actor_email", filter.actor);
    if (filter.actorRole) q = q.eq("actor_role", filter.actorRole);
    if (filter.subjects) q = q.in("subject", [...filter.subjects]);
    if (filter.targetCodes) q = q.in("target_code", [...filter.targetCodes]);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return mem.slice(0, limit);
  }
}

// Distinct action keys present (for the viewer's filter dropdown). Cheap in mem;
// a small scan server-side (the log viewer is a low-traffic admin page).
export async function listActivityActions(): Promise<string[]> {
  const db = getDb();
  if (!db) return [...new Set(mem.map((e) => e.action))].sort();
  try {
    const { data, error } = await db.from("activity_log").select("action").limit(1000);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => (r as { action: string }).action))].sort();
  } catch (e) {
    warn(e);
    return [...new Set(mem.map((e) => e.action))].sort();
  }
}
