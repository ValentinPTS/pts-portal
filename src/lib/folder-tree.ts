import { randomUUID } from "crypto";
import type { Folder } from "./types";
import { getDb } from "./supabase";

// Real-folder store for the explorer tree. Supabase when configured, else in-memory
// — the same graceful fallback as the other stores. See migration 0012_folders.sql.
// Display helpers (labels, accents, status chips) stay in folders.ts; this file is
// the persistence + tree navigation.

type FType = "T" | "C";

const mem: Folder[] = [];
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[folders] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function toRow(f: Folder) {
  return { id: f.id, type: f.type, name: f.name, parent_id: f.parentId, created_at: f.createdAt };
}
type Row = ReturnType<typeof toRow>;
function fromRow(r: Row): Folder {
  return {
    id: r.id, type: (r.type as FType) ?? "T", name: r.name ?? "",
    parentId: r.parent_id ?? null, createdAt: r.created_at ?? "",
  };
}

const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, undefined, { numeric: true });

// All folders for a type (used by the sidebar to build the tree in one query).
export async function listFolders(type: FType): Promise<Folder[]> {
  const db = getDb();
  if (!db) return mem.filter((f) => f.type === type).sort(byName);
  try {
    const { data, error } = await db.from("folders").select("*").eq("type", type);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow(r as Row)).sort(byName);
  } catch (e) {
    warn(e);
    return mem.filter((f) => f.type === type).sort(byName);
  }
}

export async function listChildFolders(type: FType, parentId: string | null): Promise<Folder[]> {
  return (await listFolders(type)).filter((f) => (f.parentId ?? null) === (parentId ?? null));
}

export async function getFolder(id: string): Promise<Folder | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) return mem.find((f) => f.id === id) ?? null;
  try {
    const { data, error } = await db.from("folders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Row) : null;
  } catch (e) {
    warn(e);
    return mem.find((f) => f.id === id) ?? null;
  }
}

export async function createFolder(input: { type: FType; parentId: string | null; name: string }): Promise<Folder> {
  const f: Folder = {
    id: randomUUID(),
    type: input.type,
    name: input.name.trim().slice(0, 80),
    parentId: input.parentId ?? null,
    createdAt: new Date().toISOString(),
  };
  const db = getDb();
  if (!db) { mem.push(f); return f; }
  try {
    const { error } = await db.from("folders").insert(toRow(f));
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.push(f);
  }
  return f;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return;
  const db = getDb();
  if (db) {
    try {
      const { error } = await db.from("folders").update({ name: clean }).eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const cur = mem.find((f) => f.id === id);
  if (cur) cur.name = clean;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const { error } = await db.from("folders").delete().eq("id", id);
      if (error) throw error;
      return;
    } catch (e) {
      warn(e);
    }
  }
  const i = mem.findIndex((f) => f.id === id);
  if (i >= 0) mem.splice(i, 1);
}

// Root → … → this folder, for breadcrumbs and the sidebar's open path. Guards
// against cycles. Returns [] for an unknown id.
export async function ancestry(type: FType, id: string): Promise<Folder[]> {
  const all = await listFolders(type);
  const byId = new Map(all.map((f) => [f.id, f]));
  const chain: Folder[] = [];
  let cur = byId.get(id) ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return chain;
}
