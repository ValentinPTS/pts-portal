import { randomUUID } from "crypto";
import type { Notification, NotifyKind } from "./types";
import { getDb } from "./supabase";

// The notification OUTBOX (Phase 1). Supabase when configured, else in-memory —
// the same graceful fallback as every other store here. See migration
// 0015_notifications.sql.
//
// Recording and delivering are deliberately separate. `notify()` only writes the
// row; a transport (e-mail, Phase 2) later reads what has no emailedAt and sends
// it. That means the exchange loop is fully usable before mail exists, and every
// notice raised in the meantime is still there to be delivered or read in-app.
//
// §4.2: a notification may carry the participant CODE. Never put a laboratory
// name in one — the code is the only identifier that travels.

const memStore = globalThis as unknown as { __ptsNotifyMem?: Notification[] };
const mem: Notification[] = memStore.__ptsNotifyMem ?? (memStore.__ptsNotifyMem = []);
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[notifications] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(n: Notification) {
  return {
    id: n.id, kind: n.kind, audience: n.audience,
    lab_id: n.labId ?? null, scheme_id: n.schemeId ?? null, code: n.code ?? null,
    bg: n.bg, en: n.en, href: n.href ?? null,
    created_at: n.createdAt, read_at: n.readAt ?? null, emailed_at: n.emailedAt ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): Notification {
  return {
    id: r.id, kind: r.kind as NotifyKind, audience: r.audience as "provider" | "lab",
    labId: r.lab_id ?? undefined, schemeId: r.scheme_id ?? undefined, code: r.code ?? undefined,
    bg: r.bg ?? "", en: r.en ?? "", href: r.href ?? undefined,
    createdAt: r.created_at ?? "", readAt: r.read_at ?? undefined, emailedAt: r.emailed_at ?? undefined,
  };
}

const newestFirst = (a: Notification, b: Notification) => (b.createdAt || "").localeCompare(a.createdAt || "");

/**
 * Raise a notification. Never throws — a notice failing to record must not roll
 * back the real work that triggered it (approving a lab, sending a document).
 * Returns the row so a caller can chain it if it ever needs to.
 */
export async function notify(input: {
  kind: NotifyKind;
  audience: "provider" | "lab";
  bg: string;
  en: string;
  labId?: string;
  schemeId?: string;
  code?: string;
  href?: string;
}): Promise<Notification | null> {
  const n: Notification = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const db = getDb();
  if (!db) {
    mem.push(n);
    return n;
  }
  try {
    const { error } = await db.from("notifications").insert(toRow(n));
    if (error) throw error;
    return n;
  } catch (e) {
    warn(e);
    mem.push(n);
    return n;
  }
}

/** The provider's feed — everything addressed to PTS, newest first. */
export async function listForProvider(limit = 50): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => n.audience === "provider").sort(newestFirst).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .eq("audience", "provider").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/** One laboratory's feed. Scoped by lab id server-side — never by anything the client sends. */
export async function listForLab(labId: string, limit = 50): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => n.audience === "lab" && n.labId === labId).sort(newestFirst).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .eq("audience", "lab").eq("lab_id", labId)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/** How many unread — for the little count next to the bell. */
export async function unreadCount(audience: "provider" | "lab", labId?: string): Promise<number> {
  const list = audience === "provider" ? await listForProvider(200) : labId ? await listForLab(labId, 200) : [];
  return list.filter((n) => !n.readAt).length;
}

/** Mark a whole feed read. Best-effort: failing to mark read is never worth an error. */
export async function markAllRead(audience: "provider" | "lab", labId?: string): Promise<void> {
  const at = new Date().toISOString();
  const db = getDb();
  if (!db) {
    for (const n of mem) {
      if (n.audience === audience && (audience === "provider" || n.labId === labId) && !n.readAt) n.readAt = at;
    }
    return;
  }
  try {
    let q = db.from("notifications").update({ read_at: at }).is("read_at", null).eq("audience", audience);
    if (audience === "lab") q = q.eq("lab_id", labId ?? "");
    const { error } = await q;
    if (error) throw error;
  } catch (e) {
    warn(e);
  }
}

/**
 * Everything a transport still has to deliver, oldest first. Phase 2 reads this;
 * nothing calls it yet. Kept here so the outbox is complete on its own terms.
 */
export async function listUndelivered(limit = 100): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => !n.emailedAt).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .is("emailed_at", null).order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/** Record that a transport delivered this one. */
export async function markDelivered(id: string): Promise<void> {
  const at = new Date().toISOString();
  const db = getDb();
  if (!db) {
    const n = mem.find((x) => x.id === id);
    if (n) n.emailedAt = at;
    return;
  }
  try {
    const { error } = await db.from("notifications").update({ emailed_at: at }).eq("id", id);
    if (error) throw error;
  } catch (e) {
    warn(e);
  }
}
