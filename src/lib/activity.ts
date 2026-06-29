import { randomUUID } from "crypto";
import type { ActivityEvent } from "./types";
import { getDb } from "./supabase";
import { getRoleContext } from "./roles";

// Append-only activity log (Phase RT2) — the audit trail. Supabase when configured,
// else in-memory, same graceful fallback as the other stores. The app ONLY appends:
// there is no update/delete here, so the record stays tamper-evident (§8.4).
// Confidentiality (§4.2): never store a real lab name — codes/ids only.

const mem: ActivityEvent[] = [];
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[activity] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(e: ActivityEvent) {
  return {
    id: e.id, at: e.at, actor_email: e.actorEmail, actor_role: e.actorRole,
    action: e.action, scheme_id: e.schemeId ?? null, target_code: e.targetCode ?? null,
    summary: e.summary,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): ActivityEvent {
  return {
    id: r.id, at: r.at, actorEmail: r.actor_email ?? "", actorRole: r.actor_role ?? "",
    action: r.action, schemeId: r.scheme_id ?? undefined, targetCode: r.target_code ?? undefined,
    summary: r.summary ?? "",
  };
}

// Low-level append. Pure (no role lookup) so it can't recurse; resilient (never
// throws — a logging failure must not break the action being logged).
export async function appendActivity(input: Omit<ActivityEvent, "id" | "at"> & { at?: string }): Promise<void> {
  const e: ActivityEvent = {
    id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    schemeId: input.schemeId,
    targetCode: input.targetCode,
    summary: input.summary,
  };
  const db = getDb();
  if (!db) { mem.unshift(e); return; }
  try {
    const { error } = await db.from("activity_log").insert(toRow(e));
    if (error) throw error;
  } catch (err) {
    warn(err);
    mem.unshift(e);
  }
}

// Convenience used across server actions: resolves the actor from the request's
// role context and appends. Never throws.
export async function logActivity(
  action: string,
  opts?: { schemeId?: string; targetCode?: string; summary?: string },
): Promise<void> {
  try {
    const ctx = await getRoleContext();
    await appendActivity({
      action,
      actorEmail: ctx.email ?? (ctx.authEnabled ? "unknown" : "build"),
      actorRole: ctx.role ?? "none",
      schemeId: opts?.schemeId,
      targetCode: opts?.targetCode,
      summary: opts?.summary ?? action,
    });
  } catch (e) {
    console.warn("[activity] log failed:", (e as Error)?.message ?? e);
  }
}

export interface ActivityFilter {
  schemeId?: string;
  action?: string;
  actor?: string;
  limit?: number;
}

export async function listActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  const db = getDb();
  if (!db) {
    return mem
      .filter((e) => (!filter.schemeId || e.schemeId === filter.schemeId)
        && (!filter.action || e.action === filter.action)
        && (!filter.actor || e.actorEmail === filter.actor))
      .slice(0, limit);
  }
  try {
    let q = db.from("activity_log").select("*").order("at", { ascending: false }).limit(limit);
    if (filter.schemeId) q = q.eq("scheme_id", filter.schemeId);
    if (filter.action) q = q.eq("action", filter.action);
    if (filter.actor) q = q.eq("actor_email", filter.actor);
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
