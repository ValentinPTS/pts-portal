import { randomUUID } from "crypto";
import type { CaseEvent, CaseEventKind } from "./types";
import { getDb } from "./supabase";

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
  if (warned) return;
  warned = true;
  console.warn("[case-events] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(e: CaseEvent) {
  return {
    id: e.id, scheme_id: e.schemeId, code: e.code, kind: e.kind, at: e.at || null,
    ref: e.ref ?? null, note: e.note ?? null, recorded_by: e.recordedBy,
    recorded_at: e.recordedAt, source: e.source, doc_key: e.docKey ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): CaseEvent {
  return {
    id: r.id, schemeId: r.scheme_id, code: r.code, kind: r.kind as CaseEventKind,
    at: (r.at as string | null) ?? "", ref: r.ref ?? undefined, note: r.note ?? undefined,
    recordedBy: r.recorded_by ?? "", recordedAt: r.recorded_at ?? "", source: (r.source as "auto" | "manual") ?? "manual",
    docKey: (r.doc_key as string | null) ?? undefined,
  };
}

// Newest-first within a scheme (optionally one code). Sorted by event date, then
// by when it was recorded, so same-day entries keep a stable order.
function sort(a: CaseEvent, b: CaseEvent): number {
  const d = (b.at || "").localeCompare(a.at || "");
  return d !== 0 ? d : (b.recordedAt || "").localeCompare(a.recordedAt || "");
}

export async function listCaseEvents(schemeId: string, code?: string): Promise<CaseEvent[]> {
  const db = getDb();
  if (!db) {
    return mem.filter((e) => e.schemeId === schemeId && (!code || e.code === code)).sort(sort);
  }
  try {
    let q = db.from("case_events").select("*").eq("scheme_id", schemeId);
    if (code) q = q.eq("code", code);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row)).sort(sort);
  } catch (e) {
    warn(e);
    return mem.filter((e) => e.schemeId === schemeId && (!code || e.code === code)).sort(sort);
  }
}

export async function addCaseEvent(input: {
  schemeId: string; code: string; kind: CaseEventKind; at?: string;
  ref?: string; note?: string; recordedBy?: string; source?: "auto" | "manual";
  docKey?: string;
}): Promise<CaseEvent> {
  const today = new Date().toISOString().slice(0, 10);
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

export async function deleteCaseEvent(id: string): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const { error } = await db.from("case_events").delete().eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const i = mem.findIndex((e) => e.id === id);
  if (i >= 0) mem.splice(i, 1);
}
