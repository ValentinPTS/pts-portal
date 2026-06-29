import { getDb } from "./supabase";
import { sanitizeSkinData, type CustomSkinData } from "../skins/custom";

// Storage for user-created (custom) skins + the persisted per-type default skin.
// Supabase when configured, else in-memory — the same graceful fallback used by
// the scheme store, snippet library and saved templates, so the app runs with or
// without a database.
//
// Defence-in-depth: rows are re-validated with sanitizeSkinData() on the way OUT,
// so even a hand-edited DB row can never inject CSS/HTML into a document.

type SkinType = "T" | "C";

const memSkins = new Map<string, CustomSkinData>();
const memSettings = new Map<string, string>();
let warned = false;
function warn(e: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[skins] Supabase unavailable — in-memory fallback:", (e as Error)?.message ?? e);
}

function clean(id: string, data: unknown): CustomSkinData {
  return sanitizeSkinData(data, id);
}

export async function listCustomSkins(type?: SkinType): Promise<CustomSkinData[]> {
  const db = getDb();
  if (!db) {
    const all = [...memSkins.values()];
    const list = type ? all.filter((s) => s.scope === "both" || s.scope === type) : all;
    return list.map((s) => clean(s.id, s));
  }
  try {
    let q = db.from("custom_skins").select("id,data").order("created_at");
    if (type) q = q.or(`scope.eq.both,scope.eq.${type}`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => clean(String(r.id), r.data));
  } catch (e) {
    warn(e);
    const all = [...memSkins.values()];
    const list = type ? all.filter((s) => s.scope === "both" || s.scope === type) : all;
    return list.map((s) => clean(s.id, s));
  }
}

export async function getCustomSkin(id: string): Promise<CustomSkinData | null> {
  if (!id) return null;
  const db = getDb();
  if (!db) {
    const s = memSkins.get(id);
    return s ? clean(s.id, s) : null;
  }
  try {
    const { data, error } = await db.from("custom_skins").select("id,data").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? clean(String(data.id), data.data) : null;
  } catch (e) {
    warn(e);
    const s = memSkins.get(id);
    return s ? clean(s.id, s) : null;
  }
}

// Insert or update a skin (the caller has already sanitized `data`, id included).
export async function upsertCustomSkin(data: CustomSkinData): Promise<void> {
  const db = getDb();
  if (!db) {
    memSkins.set(data.id, data);
    return;
  }
  try {
    const { error } = await db.from("custom_skins").upsert({
      id: data.id, name: data.name, scope: data.scope, data, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    warn(e);
    memSkins.set(data.id, data);
  }
}

export async function deleteCustomSkin(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    memSkins.delete(id);
    return;
  }
  try {
    const { error } = await db.from("custom_skins").delete().eq("id", id);
    if (error) throw error;
  } catch (e) {
    warn(e);
    memSkins.delete(id);
  }
}

// ── Persisted per-type default skin (app_settings key/value) ──────────────────
const defKey = (type: SkinType) => `default_skin_${type}`;

export async function getDefaultSkinId(type: SkinType): Promise<string | null> {
  const db = getDb();
  if (!db) return memSettings.get(defKey(type)) ?? null;
  try {
    const { data, error } = await db.from("app_settings").select("value").eq("key", defKey(type)).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  } catch (e) {
    warn(e);
    return memSettings.get(defKey(type)) ?? null;
  }
}

export async function setDefaultSkinId(type: SkinType, id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    memSettings.set(defKey(type), id);
    return;
  }
  try {
    const { error } = await db.from("app_settings").upsert({
      key: defKey(type), value: id, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    warn(e);
    memSettings.set(defKey(type), id);
  }
}

// ── Global default title-page photo (one photo, used on every title page) ──────
const COVER_KEY = "default_cover_image";

export async function getDefaultCoverImage(): Promise<string | null> {
  const db = getDb();
  if (!db) return memSettings.get(COVER_KEY) ?? null;
  try {
    const { data, error } = await db.from("app_settings").select("value").eq("key", COVER_KEY).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  } catch (e) {
    warn(e);
    return memSettings.get(COVER_KEY) ?? null;
  }
}

// Pass an empty string to clear it.
export async function setDefaultCoverImage(url: string): Promise<void> {
  const db = getDb();
  if (!db) {
    if (url) memSettings.set(COVER_KEY, url); else memSettings.delete(COVER_KEY);
    return;
  }
  try {
    const { error } = await db.from("app_settings").upsert({
      key: COVER_KEY, value: url, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    warn(e);
    if (url) memSettings.set(COVER_KEY, url); else memSettings.delete(COVER_KEY);
  }
}
