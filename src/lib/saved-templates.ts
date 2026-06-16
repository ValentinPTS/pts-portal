import { randomUUID } from "crypto";
import { getDb } from "./supabase";

// Saved whole-document templates (the builder's "save your own template").
// Supabase when configured, else in-memory — same graceful fallback as the
// snippet library and the scheme store.
export interface SavedTemplate {
  id: string;
  docKey: string;
  type: "T" | "C";
  name: string;
  bg: string;
  en: string;
}

const mem: SavedTemplate[] = [];
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[templates] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

export async function listSavedTemplates(docKey: string, type: "T" | "C"): Promise<SavedTemplate[]> {
  const db = getDb();
  if (!db) return mem.filter((t) => t.docKey === docKey && t.type === type);
  try {
    const { data, error } = await db
      .from("doc_templates")
      .select("*")
      .eq("doc_key", docKey)
      .eq("scheme_type", type)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, docKey: r.doc_key, type: r.scheme_type === "C" ? "C" : "T", name: r.name, bg: r.bg ?? "", en: r.en ?? "",
    }));
  } catch (e) {
    warn(e);
    return mem.filter((t) => t.docKey === docKey && t.type === type);
  }
}

export async function addSavedTemplate(input: { docKey: string; type: "T" | "C"; name: string; bg: string; en: string }): Promise<SavedTemplate> {
  const item: SavedTemplate = {
    id: randomUUID(), docKey: input.docKey, type: input.type, name: input.name, bg: input.bg, en: input.en,
  };
  const db = getDb();
  if (!db) {
    mem.push(item);
    return item;
  }
  try {
    const { error } = await db.from("doc_templates").insert({
      id: item.id, doc_key: item.docKey, scheme_type: item.type, name: item.name, bg: item.bg, en: item.en,
    });
    if (error) throw error;
  } catch (e) {
    warn(e);
    mem.push(item);
  }
  return item;
}

export async function deleteSavedTemplate(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const i = mem.findIndex((t) => t.id === id);
    if (i !== -1) mem.splice(i, 1);
    return;
  }
  try {
    const { error } = await db.from("doc_templates").delete().eq("id", id);
    if (error) throw error;
  } catch (e) {
    warn(e);
    const i = mem.findIndex((t) => t.id === id);
    if (i !== -1) mem.splice(i, 1);
  }
}
