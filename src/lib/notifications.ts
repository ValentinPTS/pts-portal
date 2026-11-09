import { randomUUID } from "crypto";
import type { Notification, NotifyKind } from "./types";
import { getDb, noMemoryFallback, dropOnDeployment } from "./supabase";
import { REMINDER_KINDS } from "./reminder-templates";

/** A reminder a template may release (part 1.8): one of the reminder kinds. */
export const isReminderKind = (kind: string): boolean => (REMINDER_KINDS as readonly string[]).includes(kind);

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
//
// Реш. 138 (part 0.8): a notice to a LABORATORY is recorded held. It reaches the
// lab's portal and the transport only once a person has released it from the list
// of held notices, after seeing its exact text (releaseNotice). Until part 1.8
// brings approved templates, that includes the day-before reminder. Notices to the
// provider itself are not held. See migration 0016_notification_release.sql.

const memStore = globalThis as unknown as { __ptsNotifyMem?: Notification[] };
const mem: Notification[] = memStore.__ptsNotifyMem ?? (memStore.__ptsNotifyMem = []);
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("notifications", e); // on a deployment: an error, not memory (1.1)
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
    // only when set: a fresh notice then inserts even where migration 0016 has not
    // been applied yet (its reads then fall back, showing and sending nothing held)
    ...(n.releasedAt ? { released_at: n.releasedAt, released_by: n.releasedBy ?? null } : {}),
    ...(n.withheldAt ? { withheld_at: n.withheldAt, withheld_by: n.withheldBy ?? null } : {}),
    // only when set (5.10, migration 0041): every other notice inserts as before
    ...(n.entityId ? { entity_id: n.entityId } : {}),
  } as {
    id: string; kind: string; audience: string; lab_id: string | null; scheme_id: string | null;
    code: string | null; bg: string; en: string; href: string | null; created_at: string;
    read_at: string | null; emailed_at: string | null; released_at?: string | null;
    released_by?: string | null; withheld_at?: string | null; withheld_by?: string | null;
    entity_id?: string | null;
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): Notification {
  return {
    id: r.id, kind: r.kind as NotifyKind, audience: r.audience as "provider" | "lab",
    labId: r.lab_id ?? undefined, schemeId: r.scheme_id ?? undefined, code: r.code ?? undefined,
    bg: r.bg ?? "", en: r.en ?? "", href: r.href ?? undefined,
    createdAt: r.created_at ?? "", readAt: r.read_at ?? undefined, emailedAt: r.emailed_at ?? undefined,
    releasedAt: r.released_at ?? undefined, releasedBy: r.released_by ?? undefined,
    withheldAt: r.withheld_at ?? undefined, withheldBy: r.withheld_by ?? undefined,
    entityId: r.entity_id ?? undefined,
  };
}

// May this notice be seen in the portal? Provider notices always; a laboratory's
// only once released and never if withheld.
export const isOut = (n: Notification): boolean =>
  n.audience === "provider" || (!!n.releasedAt && !n.withheldAt);

// May a transport e-mail it? As isOut — except the backlog migration 0016 marked
// released for the portal only: no person saw it, so it never goes out by e-mail.
export const BACKFILL_RELEASE = "migration-0016";
export const isDeliverable = (n: Notification): boolean =>
  isOut(n) && (n.audience === "provider" || n.releasedBy !== BACKFILL_RELEASE);

const newestFirst = (a: Notification, b: Notification) => (b.createdAt || "").localeCompare(a.createdAt || "");

// a template's approval releases a LABORATORY reminder only (part 1.8)
function build(input: Parameters<typeof notify>[0]): Notification {
  const { releasedByTemplate, releasedByWriter, ...rest } = input;
  const createdAt = new Date().toISOString();
  // …and only a reminder of the template's own kind (results.due; receipt.due since 5.6)
  const byTemplate = !!releasedByTemplate && rest.audience === "lab" && isReminderKind(rest.kind) && releasedByTemplate.startsWith(`template:${rest.kind}@`);
  // a one-way message (5.10): its writer is the person who saw its exact text (Реш. 138) —
  // released by them, and by a person only (never a system or a template)
  const byWriter = !byTemplate && isWriterRelease(rest.kind, rest.audience, releasedByWriter);
  return { id: randomUUID(), createdAt, ...rest, ...(byTemplate ? { releasedAt: createdAt, releasedBy: releasedByTemplate } : byWriter ? { releasedAt: createdAt, releasedBy: releasedByWriter!.trim() } : {}) };
}

/** May this notice be released by the person who wrote it? Only a laboratory's MESSAGE, and only
 *  by a person — the actor of a session (an e-mail; «build» locally with login off), never a
 *  system job, a template or the 0016 backlog (5.10). */
export const isWriterRelease = (kind: string, audience: string, by: string | undefined): boolean =>
  kind === "message" && audience === "lab" && !!by?.trim() && !/^(system|template):/i.test(by.trim()) && by.trim() !== BACKFILL_RELEASE && by.trim() !== "unknown";

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
  // part 1.8: only the reminder job passes this — an approved template's approval
  // ("template:<kind>@v<n> (approved by …)"); the notice is then out at once
  releasedByTemplate?: string;
  // part 5.10: a one-way message's writer (their e-mail) — out at once, for the kind
  // «message» only (isWriterRelease)
  releasedByWriter?: string;
  // part 5.10: a message to one organisation (migration 0041)
  entityId?: string;
}): Promise<Notification | null> {
  const n = build(input);
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
    // never throws (above): on a deployment the notice is lost and logged, the
    // action that raised it stands; locally it goes to memory as before
    if (dropOnDeployment("notifications", e)) return null;
    warn(e);
    mem.push(n);
    return n;
  }
}

/** Every notice of one round, oldest first — for the round export (part 1.10).
 *  A database error throws: an export is whole, or it is not made. */
export async function listNoticesForScheme(schemeId: string): Promise<Notification[]> {
  const db = getDb();
  const oldest = (a: Notification, b: Notification) => (a.createdAt || "").localeCompare(b.createdAt || "");
  if (!db) return mem.filter((n) => n.schemeId === schemeId).sort(oldest);
  const out: Notification[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("notifications").select("*").eq("scheme_id", schemeId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]).map(fromRow));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Is there already a notice of this kind for this participation whose text names
 *  this (a deadline's date — every reminder text must hold {date})? The reminder
 *  job's guard against raising one twice, even across an edit of its words (1.8). */
export async function noticeExists(q: { kind: NotifyKind; labId?: string; schemeId: string; code?: string; bgIncludes: string }): Promise<boolean> {
  const db = getDb();
  if (!db) return mem.some((n) => n.kind === q.kind && n.labId === q.labId && n.schemeId === q.schemeId && n.code === q.code && n.bg.includes(q.bgIncludes));
  const pattern = `%${q.bgIncludes.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // a participation linked by its copy has no laboratory account (4.6)
  let query = db.from("notifications").select("id").eq("kind", q.kind).eq("scheme_id", q.schemeId).like("bg", pattern).limit(1);
  query = q.labId ? query.eq("lab_id", q.labId) : query.is("lab_id", null);
  query = q.code ? query.eq("code", q.code) : query.is("code", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** As notify(), but a notice that could not be recorded is an error — for the
 *  reminder job, which must not stamp a round «reminded» when nobody was. */
export async function notifyOrThrow(input: Parameters<typeof notify>[0]): Promise<Notification> {
  const db = getDb();
  if (!db) return (await notify(input))!;
  const n = build(input);
  const { error } = await db.from("notifications").insert(toRow(n));
  if (error) throw new Error(`[notifications] reminder not recorded: ${error.message}`, { cause: error });
  return n;
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

/** One laboratory's feed — RELEASED notices only (Реш. 138). Scoped by lab id
 *  server-side — never by anything the client sends. */
export async function listForLab(labId: string, limit = 50): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => n.audience === "lab" && n.labId === labId && isOut(n)).sort(newestFirst).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .eq("audience", "lab").eq("lab_id", labId)
      .not("released_at", "is", null).is("withheld_at", null)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

// ── read state, per person (plan part 4.6, N28) ───────────────────────────────
// A notice read by one person is no longer «read» for everyone: each reader has its own
// read — PTS's people by their e-mail, a laboratory account or a participant's user by
// its id (never a name) — set once (migration 0036). The notice's own read_at (the
// first read by anyone, before 4.6) is no longer what the bell shows.
export const readerKey = {
  staff: (email: string) => `staff:${email.trim().toLowerCase()}`,
  labAccount: (authUserId: string) => `lab-account:${authUserId}`,
  participant: (entityUserId: string) => `entityuser:${entityUserId}`,
};
const memReads = (globalThis as unknown as { __ptsReadsMem?: { notificationId: string; reader: string; readAt: string }[] });
const reads = memReads.__ptsReadsMem ?? (memReads.__ptsReadsMem = []);

/** When this reader read each of these notices (none: unread for them). */
export async function readsFor(reader: string, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!reader || !ids.length) return out;
  const fromMem = () => { for (const r of reads) if (r.reader === reader && ids.includes(r.notificationId)) out.set(r.notificationId, r.readAt); return out; };
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.from("notification_reads").select("notification_id,read_at").eq("reader", reader).in("notification_id", [...ids]);
    if (error) throw error;
    for (const r of (data ?? []) as { notification_id: string; read_at: string }[]) out.set(r.notification_id, r.read_at);
    return out;
  } catch (e) {
    if (dropOnDeployment("notifications", e)) return out; // the bell is never worth the page: unread, said by the count
    warn(e);
    return fromMem();
  }
}

/** The feed as THIS reader sees it: read where they read it — or where it was read
 *  before 4.6 (the notice's own read_at, written no more: frozen then, review). */
export async function withReadState(items: Notification[], reader: string): Promise<Notification[]> {
  const r = await readsFor(reader, items.map((n) => n.id));
  return items.map((n) => ({ ...n, readAt: r.get(n.id) ?? n.readAt }));
}

/** This reader has read these notices — set once each; best-effort, never an error. */
export async function markRead(reader: string, ids: readonly string[]): Promise<void> {
  if (!reader || !ids.length) return;
  const at = new Date().toISOString();
  const inMem = () => { for (const id of ids) if (!reads.some((r) => r.reader === reader && r.notificationId === id)) reads.push({ notificationId: id, reader, readAt: at }); };
  const db = getDb();
  if (!db) return inMem();
  try {
    const { error } = await db.from("notification_reads").upsert(ids.map((id) => ({ notification_id: id, reader, read_at: at })), { onConflict: "notification_id,reader", ignoreDuplicates: true });
    if (error) throw error;
  } catch (e) {
    if (dropOnDeployment("notifications", e)) return;
    warn(e);
    inMem();
  }
}

/** The released notices of these participations (scheme + code) — a participant's user's
 *  feed (4.6): never a held or withheld one, never another participation's. */
export async function listForParticipations(pairs: readonly { schemeId: string; code: string }[], limit = 50): Promise<Notification[]> {
  if (!pairs.length) return [];
  const key = new Set(pairs.map((p) => `${p.schemeId}\u0000${p.code}`));
  const mine = (n: Notification) => n.audience === "lab" && isOut(n) && !!n.schemeId && !!n.code && key.has(`${n.schemeId}\u0000${n.code}`);
  const fromMem = () => mem.filter(mine).sort(newestFirst).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    // by scheme AND code in the query — no other participation's notices crowd them out (review)
    const { data, error } = await db.from("notifications").select("*")
      .eq("audience", "lab").in("scheme_id", [...new Set(pairs.map((p) => p.schemeId))]).in("code", [...new Set(pairs.map((p) => p.code))])
      .not("released_at", "is", null).is("withheld_at", null)
      .order("created_at", { ascending: false }).limit(Math.max(limit * 4, 200));
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row)).filter(mine).slice(0, limit);
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/**
 * Everything a transport still has to deliver, oldest first — never a held or a
 * withheld laboratory notice (Реш. 138, part 0.8).
 */
export async function listUndelivered(limit = 100): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => !n.emailedAt && isDeliverable(n)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .is("emailed_at", null).is("withheld_at", null)
      .or(`audience.eq.provider,and(released_at.not.is.null,released_by.neq.${BACKFILL_RELEASE})`)
      .order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    // belt and braces: the rule is applied again to whatever came back
    return (data ?? []).map((r) => fromRow(r as Row)).filter(isDeliverable);
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/** The laboratory notices waiting for a person — oldest first, with their exact text. */
/** One notice, by id — whichever list it is in (part 2.4: deciding one is checked in
 *  its own scheme). A database error is an error, never «not found». */
export async function getNotice(id: string): Promise<Notification | null> {
  const db = getDb();
  if (!db) return mem.find((n) => n.id === id) ?? null;
  const { data, error } = await db.from("notifications").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : null;
}

export async function listHeld(limit = 200): Promise<Notification[]> {
  const fromMem = () => mem
    .filter((n) => n.audience === "lab" && !n.releasedAt && !n.withheldAt)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .eq("audience", "lab").is("released_at", null).is("withheld_at", null)
      .order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

/**
 * A person decides about one held notice: release it (it appears in the lab's
 * portal and goes to the transport) or withhold it (it is never sent; the row
 * stays). Only a still-held laboratory notice changes; returns whether it did.
 */
export async function decideNotice(id: string, decision: "release" | "withhold", by: string): Promise<boolean> {
  const at = new Date().toISOString();
  const patch = decision === "release" ? { releasedAt: at, releasedBy: by } : { withheldAt: at, withheldBy: by };
  const inMem = () => {
    const n = mem.find((x) => x.id === id && x.audience === "lab" && !x.releasedAt && !x.withheldAt);
    if (!n) return false;
    Object.assign(n, patch);
    return true;
  };
  const db = getDb();
  if (!db) return inMem();
  try {
    const row = decision === "release" ? { released_at: at, released_by: by } : { withheld_at: at, withheld_by: by };
    const { data, error } = await db.from("notifications").update(row)
      .eq("id", id).eq("audience", "lab").is("released_at", null).is("withheld_at", null)
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (e) {
    warn(e);
    return inMem();
  }
}

/** Record that a transport delivered this one. Falls back to memory like the rest. */
export async function markDelivered(id: string): Promise<void> {
  const at = new Date().toISOString();
  const inMem = () => {
    const n = mem.find((x) => x.id === id);
    if (n) n.emailedAt = at;
  };
  const db = getDb();
  if (!db) return inMem();
  try {
    const { error } = await db.from("notifications").update({ emailed_at: at }).eq("id", id);
    if (error) throw error;
  } catch (e) {
    warn(e);
    inMem();
  }
}

/** The coding act (5.3), in memory: a participation's notices follow its new code (the
 *  database does it with the participation, 0040). */
export function recodeMemNotifications(schemeId: string, codes: Readonly<Record<string, string>>): void {
  for (const n of mem) if (n.schemeId === schemeId && n.code && Object.hasOwn(codes, n.code)) n.code = codes[n.code];
}

/** One organisation's messages (5.10) — released, newest first: what its users see on «Начало»
 *  beside their participations' notices. Scoped by the entity the SESSION's user belongs to,
 *  never by anything the client sends. */
export async function listForEntity(entityId: string, limit = 50): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => n.audience === "lab" && n.entityId === entityId && isOut(n)).sort(newestFirst).slice(0, limit);
  if (!entityId) return [];
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db
      .from("notifications").select("*")
      .eq("audience", "lab").eq("entity_id", entityId)
      .not("released_at", "is", null).is("withheld_at", null)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    // before migration 0041 the column is not there: no organisation messages, said by none
    if (dropOnDeployment("notifications", e)) return [];
    warn(e);
    return fromMem();
  }
}

/** The messages to organisations (5.10) — for «Организации»'s history, newest first: the notices
 *  that name an entity. Before migration 0041, none. */
export async function listEntityMessages(limit = 300): Promise<Notification[]> {
  const fromMem = () => mem.filter((n) => n.audience === "lab" && !!n.entityId).sort(newestFirst).slice(0, limit);
  const db = getDb();
  if (!db) return fromMem();
  try {
    const { data, error } = await db.from("notifications").select("*").eq("audience", "lab").not("entity_id", "is", null).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    if (dropOnDeployment("notifications", e)) return [];
    warn(e);
    return fromMem();
  }
}

/** An organisation erased on request (4.7): the messages PTS wrote to it are blanked and closed
 *  off — their text may name it or its people (5.10 review). The row stays: who, when, that a
 *  message was sent. Returns how many. Throws on a database error — the erasure says what is left. */
export const ERASED_TEXT = "‹изтрито по искане · erased on request›";
export async function eraseEntityNotices(entityId: string): Promise<number> {
  if (!entityId) return 0;
  const at = new Date().toISOString();
  const db = getDb();
  if (!db) {
    let n = 0;
    for (const x of mem) if (x.entityId === entityId) { x.bg = ERASED_TEXT; x.en = ERASED_TEXT; x.emailedAt = x.emailedAt ?? at; n++; }
    return n;
  }
  const { data, error } = await db.from("notifications").update({ bg: ERASED_TEXT, en: ERASED_TEXT }).eq("entity_id", entityId).select("id");
  if (error) throw new Error(`[notifications] organisation messages not blanked: ${error.message}`, { cause: error });
  const { error: e2 } = await db.from("notifications").update({ emailed_at: at }).eq("entity_id", entityId).is("emailed_at", null);
  if (e2) throw new Error(`[notifications] organisation messages not closed off: ${e2.message}`, { cause: e2 });
  return (data ?? []).length;
}
