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

const mem: LibraryItem[] = [];
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
