import { randomUUID } from "crypto";
import type { DocRevision } from "./types";
import { getDb, noMemoryFallback } from "./supabase";

// Document version history (Phase RT5, §8.3). Supabase when configured, else
// in-memory — same graceful fallback as the other stores. Append-only: a save adds
// a new revision; nothing is overwritten. Identical consecutive saves are skipped
// so the history reflects real changes, not every keystroke-save.

// shared across every server entry point, as the other stores are (a module-local
// copy hid entries written from another bundle in dev — part 1.4/1.5)
const memStore = globalThis as unknown as { __ptsRevisionMem?: DocRevision[] };
const mem: DocRevision[] = memStore.__ptsRevisionMem ?? (memStore.__ptsRevisionMem = []);
let warned = false;
function warn(e: unknown) {
  noMemoryFallback("doc-revisions", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[doc-revisions] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(r: DocRevision) {
  return {
    id: r.id, scheme_id: r.schemeId, doc_key: r.docKey, version: r.version,
    bg: r.bg, en: r.en, note: r.note ?? null, saved_by: r.savedBy, saved_at: r.savedAt,
    approved: r.approved, approved_by: r.approvedBy ?? null, approved_at: r.approvedAt ?? null,
  };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): DocRevision {
  return {
    id: r.id, schemeId: r.scheme_id, docKey: r.doc_key, version: r.version ?? 1,
    bg: r.bg ?? "", en: r.en ?? "", note: r.note ?? undefined, savedBy: r.saved_by ?? "",
    savedAt: r.saved_at ?? "", approved: !!r.approved, approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ?? undefined,
  };
}

/** Every saved version of every document of one round — for the round export (part 1.10). Throws on a database error. */
export async function listRevisionsForScheme(schemeId: string): Promise<DocRevision[]> {
  const db = getDb();
  const order = (a: DocRevision, b: DocRevision) => a.docKey.localeCompare(b.docKey) || a.version - b.version;
  if (!db) return mem.filter((r) => r.schemeId === schemeId).sort(order);
  // paged: every save is a version, and a read stops at 1000 rows without a word
  const out: DocRevision[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("doc_revisions").select("*").eq("scheme_id", schemeId).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r) => fromRow(r as Row)));
    if ((data ?? []).length < 1000) return out.sort(order);
  }
}

// Newest version first.
export async function listRevisions(schemeId: string, docKey: string): Promise<DocRevision[]> {
  const db = getDb();
  if (!db) {
    return mem.filter((r) => r.schemeId === schemeId && r.docKey === docKey).sort((a, b) => b.version - a.version);
  }
  try {
    const { data, error } = await db.from("doc_revisions").select("*")
      .eq("scheme_id", schemeId).eq("doc_key", docKey).order("version", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row));
  } catch (e) {
    warn(e);
    return mem.filter((r) => r.schemeId === schemeId && r.docKey === docKey).sort((a, b) => b.version - a.version);
  }
}

export async function getRevision(id: string): Promise<DocRevision | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.find((r) => r.id === id) ?? null;
  try {
    const { data, error } = await db.from("doc_revisions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.find((r) => r.id === id) ?? null;
  }
}

// The latest revision only — used by addRevision to compute the next version number
// and to skip identical saves. Selects a SINGLE row (not the whole history), and only
// the columns needed, so a save doesn't pull every prior revision's full bg+en body
// (which can be large once documents carry images). Returns just version+bg+en.
async function latest(schemeId: string, docKey: string): Promise<{ version: number; bg: string; en: string } | null> {
  const db = getDb();
  if (!db) {
    const m = mem.filter((r) => r.schemeId === schemeId && r.docKey === docKey).sort((a, b) => b.version - a.version)[0];
    return m ? { version: m.version, bg: m.bg, en: m.en } : null;
  }
  try {
    const { data, error } = await db.from("doc_revisions").select("version,bg,en")
      .eq("scheme_id", schemeId).eq("doc_key", docKey)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? { version: (data as { version: number }).version ?? 0, bg: (data as { bg: string }).bg ?? "", en: (data as { en: string }).en ?? "" } : null;
  } catch (e) {
    warn(e);
    const m = mem.filter((r) => r.schemeId === schemeId && r.docKey === docKey).sort((a, b) => b.version - a.version)[0];
    return m ? { version: m.version, bg: m.bg, en: m.en } : null;
  }
}

// Snapshot a save. Returns the (new or unchanged) latest revision. Skips creating a
// revision when the content is identical to the current latest, so saves that don't
// change anything don't pollute the history. Never throws (logging-style helper).
export async function addRevision(input: {
  schemeId: string; docKey: string; bg: string; en: string; note?: string; savedBy?: string;
}): Promise<DocRevision | null> {
  try {
    const prev = await latest(input.schemeId, input.docKey);
    if (prev && prev.bg === input.bg && prev.en === input.en) return null; // no real change → no new revision
    const rev: DocRevision = {
      id: randomUUID(),
      schemeId: input.schemeId,
      docKey: input.docKey,
      version: (prev?.version ?? 0) + 1,
      bg: input.bg,
      en: input.en,
      note: input.note?.trim() || undefined,
      savedBy: input.savedBy ?? "",
      savedAt: new Date().toISOString(),
      approved: false,
    };
    const db = getDb();
    if (!db) { mem.push(rev); return rev; }
    try {
      const { error } = await db.from("doc_revisions").insert(toRow(rev));
      if (error) throw error;
    } catch (e) {
      warn(e);
      mem.push(rev);
    }
    return rev;
  } catch (e) {
    console.warn("[doc-revisions] snapshot failed:", (e as Error)?.message ?? e);
    return null;
  }
}

export async function approveRevision(id: string, approver: string): Promise<void> {
  const at = new Date().toISOString();
  const db = getDb();
  if (db) {
    try {
      const { error } = await db.from("doc_revisions").update({ approved: true, approved_by: approver, approved_at: at }).eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const cur = mem.find((r) => r.id === id);
  if (cur) { cur.approved = true; cur.approvedBy = approver; cur.approvedAt = at; }
}
