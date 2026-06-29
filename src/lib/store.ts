import type { Scheme } from "./types";
import { pavingBlocks } from "./seed-paving-blocks";
import { forceCalibration } from "./seed-force";
import { getDb } from "./supabase";

const SEEDS: Scheme[] = [pavingBlocks, forceCalibration];

// Scheme store. Uses Supabase (Postgres) when configured (see SUPABASE-SETUP.md);
// otherwise — or if the DB is unreachable / not yet migrated — it falls back to an
// in-memory list so the app never crashes. Same async interface either way.

const mem: Scheme[] = [...SEEDS];

function yearOf(number: string): string {
  const m = number.match(/(\d{2})\/\d{2}-/);
  return m ? `20${m[1]}` : "";
}
function toRow(s: Scheme) {
  return { id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number), folder_id: s.folderId ?? null, data: s };
}

let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[store] Supabase unavailable — using in-memory fallback:", (e as Error)?.message ?? e);
}

let seeded = false;
async function ensureSeed(db: NonNullable<ReturnType<typeof getDb>>) {
  if (seeded) return;
  seeded = true;
  // Only auto-seed the two demo schemes when explicitly asked (SEED_DEMO=true). On a
  // real configured DB this is off, so the demo schemes are NOT re-inserted and a
  // deleted scheme stays deleted. (The in-memory fallback still carries them for
  // no-DB local dev.)
  if (process.env.SEED_DEMO !== "true") return;
  await db.from("schemes").upsert(SEEDS.map(toRow), { onConflict: "id", ignoreDuplicates: true });
}

export async function listSchemes(): Promise<Scheme[]> {
  const db = getDb();
  if (!db) return mem;
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data);
  } catch (e) {
    warn(e);
    return mem;
  }
}

// A lightweight scheme row for list/nav pages that don't need the full document
// payload. Selects only the scalar columns (no JSONB `data`) so the home, type and
// sidebar-tree pages stay cheap as the scheme count grows.
export interface SchemeSummary {
  id: string;
  number: string;
  type: "T" | "C";
  status: Scheme["status"];
  year: string;
  folderId?: string;
}

export async function listSchemeSummaries(): Promise<SchemeSummary[]> {
  const db = getDb();
  const fromMem = (): SchemeSummary[] =>
    mem.map((s) => ({ id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number), folderId: s.folderId }));
  if (!db) return fromMem();
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("id,number,type,status,year,folder_id").order("id");
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as { id: string; number: string; type: "T" | "C"; status: Scheme["status"]; year: string | null; folder_id: string | null };
      return { id: row.id, number: row.number, type: row.type, status: row.status, year: row.year || yearOf(row.number), folderId: row.folder_id ?? undefined };
    });
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

// Full schemes directly inside one folder (folderId null = under the type root).
// The folder tiles show built-count + date, so this loads the full schemes — but
// only the ones in this folder.
export async function listSchemesInFolder(type: "T" | "C", folderId: string | null): Promise<Scheme[]> {
  const db = getDb();
  const inFolder = (s: Scheme) => s.type === type && (s.folderId ?? null) === (folderId ?? null);
  if (!db) return mem.filter(inFolder);
  try {
    await ensureSeed(db);
    let q = db.from("schemes").select("data").eq("type", type);
    q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
    const { data, error } = await q.order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data);
  } catch (e) {
    warn(e);
    return mem.filter(inFolder);
  }
}

// Full schemes for ONE type+year only (the year-folder tiles need docs/dates), so
// the page loads just that year rather than every scheme.
export async function listSchemesByYear(type: "T" | "C", year: string): Promise<Scheme[]> {
  const db = getDb();
  const fromMem = (): Scheme[] => mem.filter((s) => s.type === type && yearOf(s.number) === year);
  if (!db) return fromMem();
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").eq("type", type).eq("year", year).order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data);
  } catch (e) {
    warn(e);
    return fromMem();
  }
}

// True if a scheme already uses this official number (YY/MM-X-N is meant to be
// unique system-wide). `exceptId` lets a scheme keep its own number on edit.
export async function schemeNumberExists(number: string, exceptId?: string): Promise<boolean> {
  const n = number.trim();
  if (!n) return false;
  const db = getDb();
  if (!db) return mem.some((s) => s.number === n && s.id !== exceptId);
  try {
    await ensureSeed(db);
    let q = db.from("schemes").select("id").eq("number", n).limit(1);
    if (exceptId) q = q.neq("id", exceptId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (e) {
    warn(e);
    return mem.some((s) => s.number === n && s.id !== exceptId);
  }
}

export async function getScheme(id: string): Promise<Scheme | undefined> {
  const db = getDb();
  if (!db) return mem.find((s) => s.id === id);
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? (data as { data: Scheme }).data : undefined;
  } catch (e) {
    warn(e);
    return mem.find((s) => s.id === id);
  }
}

// Fetch several schemes by id in one query (the lab portal loads only the schemes
// the lab participates in — avoids an N+1 of getScheme per participation).
export async function getSchemesByIds(ids: string[]): Promise<Scheme[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const db = getDb();
  if (!db) return mem.filter((s) => unique.includes(s.id));
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").in("id", unique);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data);
  } catch (e) {
    warn(e);
    return mem.filter((s) => unique.includes(s.id));
  }
}

export async function addScheme(s: Scheme): Promise<void> {
  const db = getDb();
  if (!db) {
    mem.push(s);
    return;
  }
  try {
    const { error } = await db.from("schemes").insert(toRow(s));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.push(s);
  }
}

// Delete a scheme (folder). Participants cascade (FK on delete cascade); the
// scheme's applications/docs live in its JSONB row, so they go with it. Owners only
// (enforced in the action). Seeds may reappear on a fresh process — that's fine.
export async function deleteScheme(id: string): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const { error } = await db.from("schemes").delete().eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const i = mem.findIndex((s) => s.id === id);
  if (i !== -1) mem.splice(i, 1);
}

export async function updateScheme(id: string, patch: Partial<Scheme>): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const current = await getScheme(id);
      if (!current) return;
      const next = { ...current, ...patch };
      const { error } = await db
        .from("schemes")
        .update({ ...toRow(next), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const i = mem.findIndex((s) => s.id === id);
  if (i !== -1) mem[i] = { ...mem[i], ...patch };
}
