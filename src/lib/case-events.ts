import { randomUUID } from "crypto";
import type { CaseEvent, CaseEventKind } from "./types";
import { getDb, noMemoryFallback } from "./supabase";
import { sofiaToday } from "./clock";

// Per-participant case-file timeline (Phase RT3). Supabase when configured, else
// in-memory — the same graceful fallback as the other stores. Identified by the
// participant CODE only; never store a real name here (§4.2). See migration
// 0010_case_events.sql.

// Shared across all server entry points + HMR (see store.ts) so RSC pages, route
// handlers and server actions see the same timeline in the no-DB dev fallback.
const memStore = globalThis as unknown as { __ptsCaseEventMem?: CaseEvent[] };
const mem: CaseEvent[] = memStore.__ptsCaseEventMem ?? (memStore.__ptsCaseEventMem = []);
let warned = false;

function warn(e: unknown) {
  noMemoryFallback("case-events", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[case-events] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(e: CaseEvent) {
  return {
    id: e.id, scheme_id: e.schemeId, code: e.code, kind: e.kind, at: e.at || null,
    ref: e.ref ?? null, note: e.note ?? null, recorded_by: e.recordedBy,
    recorded_at: e.recordedAt, source: e.source, doc_key: e.docKey ?? null,
    // only when set, so a new entry still inserts where 0017 is not applied yet
    ...(e.voidedAt ? { voided_at: e.voidedAt, voided_by: e.voidedBy ?? null, void_reason: e.voidReason ?? null } : {}),
  } as {
    id: string; scheme_id: string; code: string; kind: string; at: string | null; ref: string | null;
    note: string | null; recorded_by: string; recorded_at: string; source: string; doc_key: string | null;
    voided_at?: string | null; voided_by?: string | null; void_reason?: string | null;
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): CaseEvent {
  return {
    id: r.id, schemeId: r.scheme_id, code: r.code, kind: r.kind as CaseEventKind,
    at: (r.at as string | null) ?? "", ref: r.ref ?? undefined, note: r.note ?? undefined,
    recordedBy: r.recorded_by ?? "", recordedAt: r.recorded_at ?? "", source: (r.source as "auto" | "manual") ?? "manual",
    docKey: (r.doc_key as string | null) ?? undefined,
    voidedAt: r.voided_at ?? undefined, voidedBy: r.voided_by ?? undefined, voidReason: r.void_reason ?? undefined,
  };
}

// Newest-first within a scheme (optionally one code). Sorted by event date, then
// by when it was recorded, so same-day entries keep a stable order.
function sort(a: CaseEvent, b: CaseEvent): number {
  const d = (b.at || "").localeCompare(a.at || "");
  return d !== 0 ? d : (b.recordedAt || "").localeCompare(a.recordedAt || "");
}

// A voided entry (part 0.9) is left out unless asked for: it no longer counts
// toward the matrix, the statuses or the lab's timeline. The case file and the
// audit pack ask for it, to show it struck through with its reason.
/** Every step of one round's case files, voided ones included, oldest first — for
 *  the round export (part 1.10). Paged (a read stops at 1000 rows without a word),
 *  and a database error throws: an export is whole, or it is not made. */
export async function listCaseEventsForScheme(schemeId: string): Promise<CaseEvent[]> {
  const db = getDb();
  const oldest = (a: CaseEvent, b: CaseEvent) => (a.recordedAt || "").localeCompare(b.recordedAt || "");
  if (!db) return mem.filter((e) => e.schemeId === schemeId).sort(oldest);
  const out: CaseEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("case_events").select("*").eq("scheme_id", schemeId).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r) => fromRow(r as Row)));
    if ((data ?? []).length < 1000) return out.sort(oldest);
  }
}

export async function listCaseEvents(schemeId: string, code?: string, opts?: { includeVoided?: boolean }): Promise<CaseEvent[]> {
  const keep = (e: CaseEvent) => !!opts?.includeVoided || !e.voidedAt;
  const db = getDb();
  if (!db) {
    return mem.filter((e) => e.schemeId === schemeId && (!code || e.code === code) && keep(e)).sort(sort);
  }
  try {
    let q = db.from("case_events").select("*").eq("scheme_id", schemeId);
    if (code) q = q.eq("code", code);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row)).filter(keep).sort(sort);
  } catch (e) {
    warn(e);
    return mem.filter((e) => e.schemeId === schemeId && (!code || e.code === code) && keep(e)).sort(sort);
  }
}

export async function addCaseEvent(input: {
  schemeId: string; code: string; kind: CaseEventKind; at?: string;
  ref?: string; note?: string; recordedBy?: string; source?: "auto" | "manual";
  docKey?: string;
}): Promise<CaseEvent> {
  // Bulgaria's day, not the UTC one; callers on a round pass that round's day (1.3)
  const today = sofiaToday(Date.now());
  const e: CaseEvent = {
    id: randomUUID(),
    schemeId: input.schemeId,
    code: input.code,
    kind: input.kind,
    at: (input.at || today),
    ref: input.ref?.trim() || undefined,
    note: input.note?.trim() || undefined,
    recordedBy: input.recordedBy ?? "",
    recordedAt: new Date().toISOString(),
    source: input.source ?? "manual",
    docKey: input.docKey || undefined,
  };
  const db = getDb();
  if (!db) { mem.push(e); return e; }
  try {
    const { error } = await db.from("case_events").insert(toRow(e));
    if (error) throw error;
  } catch (err) {
    warn(err);
    mem.push(e);
  }
  return e;
}

export async function getCaseEvent(id: string): Promise<CaseEvent | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.find((e) => e.id === id) ?? null;
  try {
    const { data, error } = await db.from("case_events").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.find((e) => e.id === id) ?? null;
  }
}

// Void an entry (part 0.9, finding N23) — never delete it. Only a not-yet-voided
// entry changes; returns whether it did.
export async function voidCaseEvent(id: string, by: string, reason: string): Promise<boolean> {
  const at = new Date().toISOString();
  const inMem = () => {
    const e = mem.find((x) => x.id === id && !x.voidedAt);
    if (!e) return false;
    Object.assign(e, { voidedAt: at, voidedBy: by, voidReason: reason });
    return true;
  };
  const db = getDb();
  if (!db) return inMem();
  // Fails CLOSED with a database: a void that was not stored is reported, never
  // kept in memory only (e.g. before migration 0017 is applied).
  const { data, error } = await db.from("case_events")
    .update({ voided_at: at, voided_by: by, void_reason: reason })
    .eq("id", id).is("voided_at", null).select("id");
  // a designed «could not void» — reported to the caller, never thrown (and never memory)
  if (error) { console.error("[case-events] void not stored:", error.message); return false; }
  return (data ?? []).length > 0;
}

/** The coding act (5.3), in memory: a participation's case events follow its new code
 *  (the database does it with the participation, 0040). */
export function recodeMemCaseEvents(schemeId: string, codes: Readonly<Record<string, string>>): void {
  for (const e of mem) if (e.schemeId === schemeId && Object.hasOwn(codes, e.code)) e.code = codes[e.code];
}
