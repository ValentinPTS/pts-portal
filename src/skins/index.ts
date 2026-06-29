import type { Scheme } from "../lib/types";
import { classicSkin } from "../lib/doc-shell";
import type { Skin, SchemeType } from "./types";
import { modernSkin } from "./testing/modern";
import { minimalSkin } from "./shared/minimal";
import { compileSkin } from "./custom";
import {
  listCustomSkins,
  getCustomSkin,
  getDefaultSkinId,
  setDefaultSkinId,
  getDefaultCoverImage,
} from "../lib/custom-skins";

// The skin registry. Two kinds of skin coexist:
//   • built-in skins  — hand-written code (classic/modern/minimal), always present.
//   • custom skins     — user-created DATA in the DB, compiled on demand (custom.ts).
//
// The SYNC helpers below see only the built-ins (used by unit tests + as a safe
// fallback). The ASYNC helpers also merge the DB-backed custom skins and the
// persisted per-type default; the app's render path and UI use the async ones.
export const SKINS: Skin[] = [classicSkin, modernSkin, minimalSkin];

export function getSkin(id?: string | null): Skin {
  return SKINS.find((s) => s.meta.id === id) ?? classicSkin;
}

export function skinsForType(type: SchemeType): Skin[] {
  return SKINS.filter((s) => s.meta.types.includes(type));
}

// ── Async (DB-aware) resolution — built-ins + custom skins + persisted defaults ──
export async function getSkinAsync(id?: string | null): Promise<Skin> {
  const builtin = SKINS.find((s) => s.meta.id === id);
  if (builtin) return builtin;
  if (id) {
    const custom = await getCustomSkin(id);
    if (custom) return compileSkin(custom);
  }
  return classicSkin; // unknown / deleted → safe fallback
}

export async function skinsForTypeAsync(type: SchemeType): Promise<Skin[]> {
  const custom = (await listCustomSkins(type)).map(compileSkin);
  return [...skinsForType(type), ...custom];
}

export async function getDefaultSkinIdAsync(type: SchemeType): Promise<string> {
  return (await getDefaultSkinId(type)) ?? "classic";
}

export async function setDefaultSkinAsync(type: SchemeType, id: string): Promise<void> {
  await setDefaultSkinId(type, id);
}

// The skin a scheme renders in: its chosen skin, else the type's persisted default.
// Carries the global default title-page photo so coverImgTag can fall back to it
// (one uploaded photo → every title page). Returned as a copy so the shared skin
// constants are never mutated.
export async function resolveSkinAsync(s: Scheme): Promise<Skin> {
  const base = s.skin ? await getSkinAsync(s.skin) : await getSkinAsync(await getDefaultSkinIdAsync(s.type));
  const defaultCover = (await getDefaultCoverImage()) ?? undefined;
  return defaultCover ? { ...base, defaultCover } : base;
}

// ── Sync fallback (built-ins only) — kept for unit tests + sync render fallback ──
export function resolveSkin(s: Scheme): Skin {
  return s.skin ? getSkin(s.skin) : classicSkin;
}

export type { Skin, SchemeType } from "./types";
