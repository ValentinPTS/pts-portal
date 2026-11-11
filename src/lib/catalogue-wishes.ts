// «Уведоми ме при следваща» — the organisations' wishes (plan part 10.1; К25; migration 0051). In
// memory locally. Not a server action module: nothing here is callable from a browser.
import { randomUUID } from "node:crypto";
import { getDb, noMemoryFallback } from "./supabase";
import type { CatalogueWish } from "./catalogue-model";

const g = globalThis as unknown as { __ptsCatalogueWishes?: CatalogueWish[] };
const mem: CatalogueWish[] = g.__ptsCatalogueWishes ?? (g.__ptsCatalogueWishes = []);

type Row = { id: string; entity_id: string; scheme_id: string; subject: string; object_bg: string; object_en: string; asked_by: string; asked_at: string; cancelled_at: string | null; cancelled_by: string | null; notified_scheme_id: string | null; notified_notice_id: string | null; notified_at: string | null };
const fromRow = (r: Row): CatalogueWish => ({
  id: r.id, entityId: r.entity_id, schemeId: r.scheme_id, subject: r.subject, objectBg: r.object_bg ?? "", objectEn: r.object_en ?? "", by: r.asked_by, at: r.asked_at,
  ...(r.cancelled_at ? { cancelledAt: r.cancelled_at, cancelledBy: r.cancelled_by ?? "" } : {}),
  ...(r.notified_at ? { notified: { schemeId: r.notified_scheme_id ?? "", ...(r.notified_notice_id ? { noticeId: r.notified_notice_id } : {}), at: r.notified_at } } : {}),
});
const standing = (w: CatalogueWish) => !w.cancelledAt && !w.notified;

/** The wishes — an organisation's (every one, on record), or the standing ones of a subject. */
export async function listWishes(q: { entityId: string } | { subject: string }): Promise<CatalogueWish[]> {
  const pick = (w: CatalogueWish) => ("entityId" in q ? w.entityId === q.entityId : w.subject === q.subject && standing(w));
  const db = getDb();
  if (!db) return mem.filter(pick).map((w) => ({ ...w }));
  try {
    let query = db.from("catalogue_wishes").select("*");
    query = "entityId" in q ? query.eq("entity_id", q.entityId) : query.eq("subject", q.subject).is("cancelled_at", null).is("notified_at", null);
    const { data, error } = await query.order("asked_at");
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("catalogue-wishes", e);
    return mem.filter(pick).map((w) => ({ ...w }));
  }
}

/** A new standing wish — "already" when the organisation has one for the subject (made at once elsewhere too). */
export async function addWish(w: Omit<CatalogueWish, "id" | "at" | "cancelledAt" | "cancelledBy" | "notified">): Promise<{ ok: true; wish: CatalogueWish } | { ok: false; error: "already" | "failed" }> {
  const wish: CatalogueWish = { ...w, id: randomUUID(), at: new Date().toISOString() };
  const db = getDb();
  if (!db) {
    if (mem.some((x) => x.entityId === w.entityId && x.subject === w.subject && standing(x))) return { ok: false, error: "already" };
    mem.push(wish);
    return { ok: true, wish: { ...wish } };
  }
  try {
    const { data, error } = await db.from("catalogue_wishes").insert({ id: wish.id, entity_id: w.entityId, scheme_id: w.schemeId, subject: w.subject, object_bg: w.objectBg, object_en: w.objectEn, asked_by: w.by }).select("*").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") return { ok: false, error: "already" };
      throw error;
    }
    return { ok: true, wish: fromRow(data as Row) };
  } catch (e) {
    console.error("[catalogue-wishes] add:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }
}

/** Cancel a standing wish, or mark it used — once; false when it was not standing any more. */
export async function closeWish(id: string, how: { cancelledBy: string } | { notified: { schemeId: string; noticeId?: string } }): Promise<boolean> {
  const at = new Date().toISOString();
  const db = getDb();
  if (!db) {
    const w = mem.find((x) => x.id === id);
    if (!w || !standing(w)) return false;
    if ("cancelledBy" in how) Object.assign(w, { cancelledAt: at, cancelledBy: how.cancelledBy });
    else w.notified = { ...how.notified, at };
    return true;
  }
  try {
    const patch = "cancelledBy" in how
      ? { cancelled_at: at, cancelled_by: how.cancelledBy }
      : { notified_at: at, notified_scheme_id: how.notified.schemeId, notified_notice_id: how.notified.noticeId ?? null };
    const { data, error } = await db.from("catalogue_wishes").update(patch).eq("id", id).is("cancelled_at", null).is("notified_at", null).select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  } catch (e) {
    console.error("[catalogue-wishes] close:", (e as Error)?.message ?? e);
    return false;
  }
}

/** The organisation's erasure (Phase 4): its wishes go with it. */
export async function eraseWishesOf(entityId: string): Promise<void> {
  const db = getDb();
  if (!db) {
    for (let i = mem.length - 1; i >= 0; i--) if (mem[i].entityId === entityId) mem.splice(i, 1);
    return;
  }
  const { error } = await db.from("catalogue_wishes").delete().eq("entity_id", entityId);
  if (error) throw error;
}
