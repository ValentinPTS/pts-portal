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
  return { id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number), data: s };
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
}

export async function listSchemeSummaries(): Promise<SchemeSummary[]> {
  const db = getDb();
  const fromMem = (): SchemeSummary[] =>
    mem.map((s) => ({ id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number) }));
  if (!db) return fromMem();
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("id,number,type,status,year").order("id");
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as { id: string; number: string; type: "T" | "C"; status: Scheme["status"]; year: string | null };
      return { id: row.id, number: row.number, type: row.type, status: row.status, year: row.year || yearOf(row.number) };
    });
  } catch (e) {
    warn(e);
    return fromMem();
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
