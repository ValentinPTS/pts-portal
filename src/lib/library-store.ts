import { randomUUID } from "crypto";
import { getDb } from "./supabase";

// The owner's saved snippet library (global). Supabase when configured, else
// in-memory (same graceful-fallback pattern as the participant store).
export interface LibraryItem {
  id: string;
  name: string;
  category: string;
  bg: string;
  en: string;
}

// Shared across all server entry points + HMR (see store.ts) so a client that just
// added an item and reloads still sees it in the no-DB dev fallback. Prod uses the DB.
const memStore = globalThis as unknown as { __ptsLibraryMem?: LibraryItem[] };
const mem: LibraryItem[] = memStore.__ptsLibraryMem ?? (memStore.__ptsLibraryMem = []);
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[library] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

export async function listLibraryItems(): Promise<LibraryItem[]> {
  const db = getDb();
  if (!db) return [...mem];
  try {
    const { data, error } = await db.from("library_items").select("*").order("created_at");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, name: r.name, category: r.category ?? "My items", bg: r.bg ?? "", en: r.en ?? "",
    }));
  } catch (e) {
    warn(e);
    return [...mem];
  }
}

export async function addLibraryItem(input: { name: string; bg: string; en: string; category?: string }): Promise<LibraryItem> {
  const item: LibraryItem = {
    id: randomUUID(),
    name: input.name,
    category: input.category ?? "My items",
    bg: input.bg,
    en: input.en,
  };
  const db = getDb();
  if (!db) {
    mem.push(item);
    return item;
  }
  try {
    const { error } = await db.from("library_items").insert({
      id: item.id, kind: "snippet", name: item.name, category: item.category, bg: item.bg, en: item.en,
    });
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.push(item);
  }
  return item;
}

export async function updateLibraryItem(
  id: string,
  patch: { name: string; bg: string; en: string; category: string }
): Promise<LibraryItem | null> {
  const db = getDb();
  if (!db) {
    const i = mem.findIndex((x) => x.id === id);
    if (i === -1) return null;
    mem[i] = { ...mem[i], ...patch };
    return mem[i];
  }
  try {
    const { data, error } = await db
      .from("library_items")
      .update({ name: patch.name, category: patch.category, bg: patch.bg, en: patch.en })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, name: data.name, category: data.category ?? "My items", bg: data.bg ?? "", en: data.en ?? "" };
  } catch (e) {
    warn(e);
    const i = mem.findIndex((x) => x.id === id);
    if (i === -1) return null;
    mem[i] = { ...mem[i], ...patch };
    return mem[i];
  }
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const i = mem.findIndex((x) => x.id === id);
    if (i !== -1) mem.splice(i, 1);
    return;
  }
  try {
    const { error } = await db.from("library_items").delete().eq("id", id);
    if (error) throw error;
  } catch (e) {
    warn(e);
    const i = mem.findIndex((x) => x.id === id);
    if (i !== -1) mem.splice(i, 1);
  }
}
