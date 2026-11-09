import { randomUUID } from "crypto";
import { getDb, noMemoryFallback, dbMode } from "./supabase";
import { sendEmail, isMailConfigured, looksLikeEmail, type MailResult } from "./mail";
import { mailAllowedHere } from "./environment";
import { logAs } from "./activity-store";

// ─────────────────────────────────────────────────────────────────────────────
// Send control (plan part 1.8, Реш. 138). THE one way the portal e-mails a
// laboratory: sendToLab. Every message to a participant has a class and an
// approval, and is stored — who approved it, the exact subject and text, the
// recipient — BEFORE it is handed to the transport. No record, no e-mail. Its
// outcome is set once the transport has answered. See migration 0020.
//
//   provider  — documents, notices, invitations, reports, certificates: a person
//               saw the exact text and pressed «Изпрати» (approval = that person)
//   reminder  — an automatic reminder from a template PTS approved (approval = the
//               template's version and who approved it)
//   triggered — what the person asks for themself (a new password): a fixed text
//               kept in the code (approval = that text's key)
//   chain     — «the device is on its way to you» (D19): waits for «Изпрати» like
//               a provider notice
//
// Messages to PTS itself (the provider's inbox, a test e-mail to one's own
// address) are not to a participant and do not pass here.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageClass = "provider" | "reminder" | "triggered" | "chain";
export const MESSAGE_CLASSES: readonly MessageClass[] = ["provider", "reminder", "triggered", "chain"];

export interface Approval {
  by: string;  // a person's e-mail, or "template:<kind>@v<n> by <person>", or "fixed:<key>"
  ref: string; // what was approved: "notice:<id>", "template:<kind>@v<n>", "invite:<text key>", "fixed:<key>@<text key>"
}

export interface SentMessage {
  id: string;
  sentAt: string;
  class: MessageClass;
  kind: string;
  labId?: string;
  /** a participant's user's legal entity (4.4) — as a laboratory account's id names it */
  entityId?: string;
  schemeId?: string;
  code?: string;
  to: string;
  subject: string;
  body: string;
  approvedBy: string;
  approvalRef: string;
  outcome: "pending" | "sent" | "failed";
  error?: string;
}

// what the journal line says once the outcome is known (part 1.9) — kept from the
// record to its outcome, in the same request
const pendingMeta = new Map<string, Pick<SentMessage, "class" | "kind" | "schemeId" | "code" | "approvedBy">>();

const memStore = globalThis as unknown as { __ptsSentMem?: SentMessage[] };
const mem: SentMessage[] = memStore.__ptsSentMem ?? (memStore.__ptsSentMem = []);

function toRow(m: SentMessage) {
  return {
    id: m.id, sent_at: m.sentAt, class: m.class, kind: m.kind,
    lab_id: m.labId ?? null, entity_id: m.entityId ?? null, scheme_id: m.schemeId ?? null, code: m.code ?? null,
    to_address: m.to, subject: m.subject, body: m.body,
    approved_by: m.approvedBy, approval_ref: m.approvalRef, outcome: m.outcome, error: m.error ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): SentMessage {
  return {
    id: r.id, sentAt: r.sent_at ?? "", class: r.class as MessageClass, kind: r.kind ?? "",
    labId: r.lab_id ?? undefined, entityId: r.entity_id ?? undefined, schemeId: r.scheme_id ?? undefined, code: r.code ?? undefined,
    to: r.to_address ?? "", subject: r.subject ?? "", body: r.body ?? "",
    approvedBy: r.approved_by ?? "", approvalRef: r.approval_ref ?? "",
    outcome: (r.outcome as SentMessage["outcome"]) ?? "pending", error: r.error ?? undefined,
  };
}

/** Is this an approval at all? Both halves, not blank. */
export const isApproval = (a: Approval | null | undefined): a is Approval =>
  !!a && typeof a.by === "string" && typeof a.ref === "string" && a.by.trim().length > 0 && a.ref.trim().length > 0;

export type SendResult = MailResult & { recordId?: string };

// what the record shows in place of a secret (an invitation's sign-in link): the
// record keeps the words, never a link that would still work
export const REDACTED = "‹връзката — не се пази · the link — not kept›";
const redact = (text: string, secrets: readonly string[] = []) =>
  secrets.filter((x) => x.length >= 8).reduce((t, x) => t.split(x).join(REDACTED), text);

type Outgoing = { class: MessageClass; kind: string; labId?: string; entityId?: string; schemeId?: string; code?: string; to: string; subject: string; body: string; secrets?: string[] };

/**
 * Put a message on record BEFORE it is handed to any transport — the portal's
 * mailer or Supabase's. Returns the record's id, or null when there is no approval
 * or no record could be made: then nothing may be sent.
 */
export async function recordPending(msg: Outgoing, approval: Approval | null | undefined): Promise<string | null> {
  if (!isApproval(approval) || !MESSAGE_CLASSES.includes(msg.class)) return null;
  const rec: SentMessage = {
    id: randomUUID(), sentAt: new Date().toISOString(), class: msg.class, kind: msg.kind,
    labId: msg.labId, entityId: msg.entityId, schemeId: msg.schemeId, code: msg.code, to: msg.to.trim(),
    subject: msg.subject, body: redact(msg.body, msg.secrets), approvedBy: approval.by.trim(), approvalRef: approval.ref.trim(),
    outcome: "pending",
  };
  const db = getDb();
  const kept = () => { pendingMeta.set(rec.id, { class: rec.class, kind: rec.kind, schemeId: rec.schemeId, code: rec.code, approvedBy: rec.approvedBy }); return rec.id; };
  if (!db) {
    if (dbMode().strict) return null; // a deployment with no database: a record in memory dies with it
    mem.push(rec);
    return kept();
  }
  try {
    const { error } = await db.from("sent_messages").insert(toRow(rec));
    if (error) throw error;
    return kept();
  } catch (e) {
    try { noMemoryFallback("sent-messages", e); } catch { return null; } // a deployment: no record, no e-mail
    console.warn("[sent-messages] Supabase unavailable — in-memory record:", (e as Error)?.message ?? e);
    mem.push(rec);
    return kept();
  }
}

/** The transport's answer, set once on a pending record — and a journal line (1.9). */
export async function settle(id: string, ok: boolean, error?: string): Promise<void> {
  const outcome: SentMessage["outcome"] = ok ? "sent" : "failed";
  const err = ok ? undefined : (error ?? "failed").slice(0, 300);
  const local = mem.find((m) => m.id === id);
  if (local) { if (local.outcome === "pending") Object.assign(local, { outcome, error: err }); }
  else {
    const db = getDb();
    if (db) {
      const { error: ue } = await db.from("sent_messages").update({ outcome, error: err ?? null }).eq("id", id).eq("outcome", "pending");
      if (ue) console.warn("[sent-messages] outcome not recorded for", id, ue.message); // stays «pending»: on record either way
    }
  }
  // the journal: what, by code, approved by whom — never the address (§4.2)
  const m = pendingMeta.get(id);
  pendingMeta.delete(id);
  if (m) {
    await logAs({ kind: "system" }, ok ? "message.sent" : "message.failed", {
      schemeId: m.schemeId, targetCode: m.code, subject: `message:${id}`,
      // a provider's error may quote the address: never in the journal
      summary: `E-mail to a laboratory ${ok ? "sent" : "NOT sent"}: ${m.class} · ${m.kind}; approved by ${m.approvedBy}${err ? ` — ${err.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "‹address›").slice(0, 120)}` : ""}`,
    });
  }
}

/**
 * E-mail a laboratory. Refuses without an approval and without a class; sends
 * nothing it could not record first. Never throws (a background flush calls it).
 */
export async function sendToLab(msg: Outgoing, approval: Approval | null | undefined): Promise<SendResult> {
  if (!isApproval(approval)) return { ok: false, error: "no approval — not sent (Реш. 138)" };
  if (!MESSAGE_CLASSES.includes(msg.class)) return { ok: false, error: "no message class — not sent" };
  // nothing to record when nothing can be sent: the transport is off, the address
  // is not one, or the test environment does not write to it (1.2)
  if (!isMailConfigured()) return { ok: false, skipped: true, error: "mail not configured" };
  if (!looksLikeEmail(msg.to)) return { ok: false, error: "bad recipient" };
  if (!mailAllowedHere(msg.to)) return { ok: false, skipped: true, error: "test environment: only @ptsbg.eu is mailed" };
  // 1) the record — no record, no e-mail
  const id = await recordPending(msg, approval);
  if (!id) return { ok: false, error: "the message could not be recorded — not sent" };
  // 2) the e-mail, 3) its outcome
  const res = await sendEmail({ to: msg.to.trim(), subject: msg.subject, text: msg.body });
  await settle(id, res.ok, res.ok ? undefined : res.error);
  return { ...res, recordId: id };
}

/** How many attempts on this approval failed (a notice is given up after a few, part 1.8). */
export async function failedAttempts(approvalRef: string): Promise<number> {
  const local = () => mem.filter((m) => m.approvalRef === approvalRef && m.outcome === "failed").length;
  const db = getDb();
  if (!db) return local();
  const { count, error } = await db.from("sent_messages").select("id", { count: "exact", head: true }).eq("approval_ref", approvalRef).eq("outcome", "failed");
  if (error) throw error;
  return count ?? 0;
}

/** The addresses a message on this approval already reached (outcome «sent»), lower
 *  case — a notice to several people is never written twice to one of them (4.6). */
export async function sentAddresses(approvalRef: string): Promise<Set<string>> {
  const local = () => new Set(mem.filter((m) => m.approvalRef === approvalRef && m.outcome === "sent").map((m) => m.to.trim().toLowerCase()));
  const db = getDb();
  if (!db) return local();
  const { data, error } = await db.from("sent_messages").select("to_address").eq("approval_ref", approvalRef).eq("outcome", "sent");
  if (error) throw error;
  return new Set(((data ?? []) as { to_address: string }[]).map((r) => r.to_address.trim().toLowerCase()));
}

/** How many attempts on this approval failed, per address (lower case) — a notice to
 *  several people gives up on one address, not on all (4.6 review). */
export async function failuresByAddress(approvalRef: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (to: string) => { const k = to.trim().toLowerCase(); out.set(k, (out.get(k) ?? 0) + 1); };
  const db = getDb();
  if (!db) { for (const m of mem) if (m.approvalRef === approvalRef && m.outcome === "failed") add(m.to); return out; }
  const { data, error } = await db.from("sent_messages").select("to_address").eq("approval_ref", approvalRef).eq("outcome", "failed");
  if (error) throw error;
  for (const r of (data ?? []) as { to_address: string }[]) add(r.to_address);
  return out;
}

/** How many messages of this kind went to this laboratory since then — a durable throttle. */
export async function recentCount(labId: string, kind: string, sinceMs: number): Promise<number> {
  const since = new Date(sinceMs).toISOString();
  const local = () => mem.filter((m) => m.labId === labId && m.kind === kind && m.sentAt >= since).length;
  const db = getDb();
  if (!db) return local();
  const { count, error } = await db.from("sent_messages").select("id", { count: "exact", head: true }).eq("lab_id", labId).eq("kind", kind).gte("sent_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** How many messages of this kind went to this address since then — a durable throttle
 *  for a participant's user, who has no laboratory account (4.4). */
export async function recentCountTo(to: string, kind: string, sinceMs: number): Promise<number> {
  const since = new Date(sinceMs).toISOString();
  const addr = to.trim();
  const local = () => mem.filter((m) => m.to.toLowerCase() === addr.toLowerCase() && m.kind === kind && m.sentAt >= since).length;
  const db = getDb();
  if (!db) return local();
  const { count, error } = await db.from("sent_messages").select("id", { count: "exact", head: true }).ilike("to_address", addr.replace(/[\\%_]/g, (c) => `\\${c}`)).eq("kind", kind).gte("sent_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** The latest outcome of a kind of message, per legal entity (4.4: the notice of a
 *  confirmation, to send again where it did not go). Throws on a database error. */
export async function latestOutcomeByEntity(kind: string): Promise<Map<string, SentMessage["outcome"]>> {
  const out = new Map<string, SentMessage["outcome"]>();
  const take = (rows: { entityId?: string; outcome: SentMessage["outcome"] }[]) => { for (const r of rows) if (r.entityId && !out.has(r.entityId)) out.set(r.entityId, r.outcome); return out; };
  const db = getDb();
  if (!db) return take(mem.filter((m) => m.kind === kind).sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
  const { data, error } = await db.from("sent_messages").select("entity_id,outcome,sent_at").eq("kind", kind).not("entity_id", "is", null).order("sent_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return take(((data ?? []) as { entity_id: string; outcome: SentMessage["outcome"] }[]).map((r) => ({ entityId: r.entity_id, outcome: r.outcome })));
}

/** Every message of one round, oldest first — for the round export (part 1.10). Throws on a database error. */
export async function listSentForScheme(schemeId: string): Promise<SentMessage[]> {
  const db = getDb();
  if (!db) return mem.filter((m) => m.schemeId === schemeId).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const out: SentMessage[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("sent_messages").select("*").eq("scheme_id", schemeId).order("sent_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]).map(fromRow));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Newest first. A manager sees the address; the page decides who sees what. */
export async function listSent(limit = 100, labId?: string): Promise<SentMessage[]> {
  const local = () => mem.filter((m) => !labId || m.labId === labId).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, limit);
  const db = getDb();
  if (!db) return local();
  try {
    let q = db.from("sent_messages").select("*").order("sent_at", { ascending: false }).limit(limit);
    if (labId) q = q.eq("lab_id", labId);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("sent-messages", e);
    return local();
  }
}
