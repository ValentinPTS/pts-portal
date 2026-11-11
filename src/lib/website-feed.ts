// The website's feed — its publications (plan part 10.2; migration 0052). In memory locally. Not a server
// action module: nothing here is callable from a browser.
import { createHash } from "node:crypto";
import { getDb, noMemoryFallback } from "./supabase";
import type { Feed, PublishedFeed } from "./website-feed-model";

/** What the person saw — the feed's fingerprint; a publication goes only if the feed is still that (1.8).
 *  Stored with the publication: «stale» compares fingerprints, never the jsonb read back (its key order
 *  is the database's — 10.2 review). */
export const feedDigest = (feed: Feed) => createHash("sha256").update(JSON.stringify(feed)).digest("hex");

export interface Publication { version: number; at: string; by: string; schemes: number; digest: string; feed: PublishedFeed }

const g = globalThis as unknown as { __ptsWebsiteFeed?: Publication[] };
const mem: Publication[] = g.__ptsWebsiteFeed ?? (g.__ptsWebsiteFeed = []);

type Row = { version: number; published_at: string; published_by: string; schemes: number; digest: string; data: Feed };
const fromRow = (r: Row): Publication => ({ version: r.version, at: r.published_at, by: r.published_by, schemes: r.schemes, digest: r.digest, feed: { ...r.data, version: r.version, published_at: r.published_at } });

/** The publications, the newest first (`limit` of them). */
export async function listPublications(limit = 20): Promise<Publication[]> {
  const db = getDb();
  if (!db) return [...mem].sort((a, b) => b.version - a.version).slice(0, limit);
  try {
    const { data, error } = await db.from("website_feed").select("*").order("version", { ascending: false }).limit(limit);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (e) {
    noMemoryFallback("website-feed", e);
    return [...mem].sort((a, b) => b.version - a.version).slice(0, limit);
  }
}

/** The address the feed's links start with: the portal's own (NEXT_PUBLIC_SITE_URL), whole and valid — or
 *  "" (relative links: fine locally, refused for a publication on a deployment — 10.2 review). */
export function feedBase(env: Record<string, string | undefined> = process.env): string {
  const fixed = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^/\s]+$/.test(fixed) || /^http:\/\/localhost(:\d+)?$/.test(fixed) ? fixed : "";
}
/** On a deployment (a database) the links must be absolute. */
export const feedBaseMissing = () => !!getDb() && !feedBase();

export async function latestPublication(): Promise<Publication | null> {
  return (await listPublications(1))[0] ?? null;
}

/** A new publication — the next version; "conflict" when another was published at that moment. */
export async function publishFeed(feed: Feed, by: string): Promise<{ ok: true; publication: Publication } | { ok: false; error: "conflict" | "failed" }> {
  const db = getDb();
  if (!db) {
    const version = (mem.reduce((m, p) => Math.max(m, p.version), 0)) + 1;
    const at = new Date().toISOString();
    const p: Publication = { version, at, by, schemes: feed.schemes.length, digest: feedDigest(feed), feed: { ...feed, version, published_at: at } };
    mem.push(p);
    return { ok: true, publication: p };
  }
  try {
    const last = await latestPublication();
    const version = (last?.version ?? 0) + 1;
    const { data, error } = await db.from("website_feed").insert({ version, published_by: by, schemes: feed.schemes.length, digest: feedDigest(feed), data: feed }).select("*").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") return { ok: false, error: "conflict" };
      throw error;
    }
    return { ok: true, publication: fromRow(data as Row) };
  } catch (e) {
    console.error("[website-feed] publish:", (e as Error)?.message ?? e);
    return { ok: false, error: "failed" };
  }
}
