import type { Scheme } from "./types";
import { pavingBlocks } from "./seed-paving-blocks";
import { forceCalibration } from "./seed-force";
import { getDb, noMemoryFallback } from "./supabase";
import { readSchemeNumber, sameSchemeNumber } from "./scheme-number";

const SEEDS: Scheme[] = [pavingBlocks, forceCalibration];

// Scheme store. Uses Supabase (Postgres) when configured (see SUPABASE-SETUP.md);
// otherwise — or if the DB is unreachable / not yet migrated — it falls back to an
// in-memory list so the app never crashes. Same async interface either way.

// The in-memory fallback lives on globalThis so it's a true singleton across every
// server entry point (RSC pages, route handlers, server actions) and survives HMR in
// dev — otherwise a route handler would get its own empty copy and not see writes made
// during a page render. (Only used when Supabase isn't configured / is unreachable.)
const memStore = globalThis as unknown as { __ptsSchemeMem?: Scheme[] };
const mem: Scheme[] = memStore.__ptsSchemeMem ?? (memStore.__ptsSchemeMem = [...SEEDS]);

// the year a number starts in — today's form and the archive's alike (3.1)
function yearOf(number: string): string {
  const r = readSchemeNumber(number);
  return r ? `20${r.yy}` : "";
}
function toRow(s: Scheme) {
  return { id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number), folder_id: s.folderId ?? null, data: s };
}

let warned = false;
function warn(e: unknown) {
  noMemoryFallback("store", e); // on a deployment: an error, not memory (1.1)
  if (warned) return;
  warned = true;
  console.warn("[store] Supabase unavailable — using in-memory fallback:", (e as Error)?.message ?? e);
}

// Per-scheme write serialization. updateScheme is a read-modify-write on the whole
// JSONB row, so two overlapping updates to the SAME scheme could each read the old
// row and the second write would clobber the first (lost update). Chaining writes
// per scheme id makes them run one-after-another within this instance, which closes
// the window in the common low-concurrency deployment (a warm instance handling the
// owner's edits). Cross-instance safety would need an optimistic-lock column
// (updated_at check) — a future migration; noted in SECURITY-SCALABILITY-AUDIT.
const writeLocks = new Map<string, Promise<unknown>>();
function withSchemeLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(id) ?? Promise.resolve();
  const result = prev.then(fn, fn); // run after the previous write, whatever its outcome
  const tail = result.then(() => {}, () => {});
  writeLocks.set(id, tail);
  tail.finally(() => { if (writeLocks.get(id) === tail) writeLocks.delete(id); });
  return result;
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

// Part 0.9 (N23): an archived scheme is kept but left out of every read below.
const live = (s: Scheme) => !s.archivedAt;

export async function listSchemes(): Promise<Scheme[]> {
  const db = getDb();
  if (!db) return mem.filter(live);
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data).filter(live);
  } catch (e) {
    warn(e);
    return mem.filter(live);
  }
}

// Open schemes only — for the PUBLIC apply landing, which showed the small subset
// of open schemes but was loading every scheme's full document payload to do it.
// Scoping the ROWS by status at the DB keeps the closed-scheme history out of each
// anonymous request (the rendered fields — title/object/dates — live in `data`, so
// we still select `data`, just for the few open rows).
export async function listOpenSchemes(): Promise<Scheme[]> {
  const db = getDb();
  if (!db) return mem.filter((s) => s.status === "open" && live(s));
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").eq("status", "open").order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data).filter(live);
  } catch (e) {
    warn(e);
    return mem.filter((s) => s.status === "open" && live(s));
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

// `includeArchived` is for numbering only: an archived scheme keeps its number and
// id for good (a number is never reused), so the next free one must skip it.
export async function listSchemeSummaries(opts?: { includeArchived?: boolean }): Promise<SchemeSummary[]> {
  const db = getDb();
  const all = !!opts?.includeArchived;
  const fromMem = (): SchemeSummary[] =>
    mem.filter((s) => all || live(s)).map((s) => ({ id: s.id, number: s.number, type: s.type, status: s.status, year: yearOf(s.number), folderId: s.folderId }));
  if (!db) return fromMem();
  try {
    await ensureSeed(db);
    // the archive mark lives in the JSONB — read just that key alongside the columns
    const { data, error } = await db.from("schemes").select("id,number,type,status,year,folder_id,archived:data->>archivedAt").order("id");
    if (error) throw error;
    return (data ?? []).filter((r) => all || !(r as { archived?: string | null }).archived).map((r) => {
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
  const inFolder = (s: Scheme) => s.type === type && (s.folderId ?? null) === (folderId ?? null) && live(s);
  if (!db) return mem.filter(inFolder);
  try {
    await ensureSeed(db);
    let q = db.from("schemes").select("data").eq("type", type);
    q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
    const { data, error } = await q.order("id");
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data).filter(live);
  } catch (e) {
    warn(e);
    return mem.filter(inFolder);
  }
}

// True if a scheme already uses this official number (YY/MM-X-N is meant to be
// unique system-wide). `exceptId` lets a scheme keep its own number on edit.
// Is this number taken by another scheme — archived ones included (0.9)? Т/T and
// С/C count as one letter (E4.a), so the comparison runs on the folded form over
// every number rather than as an exact database match.
export async function schemeNumberExists(number: string, exceptId?: string): Promise<boolean> {
  if (!number.trim()) return false;
  const all = await listSchemeSummaries({ includeArchived: true });
  return all.some((s) => s.id !== exceptId && sameSchemeNumber(s.number, number));
}

// Is this id taken at all — by a live OR an archived scheme? For creating new ids:
// an archived scheme's row still holds its id (part 0.9).
export async function schemeIdTaken(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return mem.some((s) => s.id === id);
  try {
    const { data, error } = await db.from("schemes").select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (e) {
    warn(e);
    return mem.some((s) => s.id === id);
  }
}

// An archived scheme answers like a missing one (N23).
export async function getScheme(id: string): Promise<Scheme | undefined> {
  const db = getDb();
  if (!db) return mem.find((s) => s.id === id && live(s));
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").eq("id", id).maybeSingle();
    if (error) throw error;
    const s = data ? (data as { data: Scheme }).data : undefined;
    return s && live(s) ? s : undefined;
  } catch (e) {
    warn(e);
    return mem.find((s) => s.id === id && live(s));
  }
}

/** One scheme, archived or not — for the round export only (part 1.10): an archive
 *  is kept to be read. Every other read leaves an archived scheme out (N23). */
export async function getSchemeIncludingArchived(id: string): Promise<Scheme | undefined> {
  const db = getDb();
  if (!db) return mem.find((s) => s.id === id);
  await ensureSeed(db);
  const { data, error } = await db.from("schemes").select("data").eq("id", id).maybeSingle();
  if (error) throw error; // an export is whole, or it is not made
  return data ? (data as { data: Scheme }).data : undefined;
}

// Fetch several schemes by id in one query (the lab portal loads only the schemes
// the lab participates in — avoids an N+1 of getScheme per participation).
export async function getSchemesByIds(ids: string[]): Promise<Scheme[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const db = getDb();
  if (!db) return mem.filter((s) => unique.includes(s.id) && live(s));
  try {
    await ensureSeed(db);
    const { data, error } = await db.from("schemes").select("data").in("id", unique);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { data: Scheme }).data).filter(live);
  } catch (e) {
    warn(e);
    return mem.filter((s) => unique.includes(s.id) && live(s));
  }
}

// false = a scheme with this id already exists (two creates of one number at once):
// a duplicate is not a database outage, so it is never parked in memory instead.
export async function addScheme(s: Scheme): Promise<boolean> {
  const db = getDb();
  if (!db) {
    if (mem.some((x) => x.id === s.id)) return false;
    mem.push(s);
    return true;
  }
  try {
    const { error } = await db.from("schemes").insert(toRow(s));
    if (error) throw error;
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") return false; // unique violation
    warn(e);
    mem.push(s);
    return true;
  }
}

// Archive a scheme (part 0.9, finding N23). A scheme is never deleted: deleting
// used to remove the row and, through the foreign key, every participant with it.
// Archiving only stamps the scheme; every read above then leaves it out, so it
// answers like a missing one, while its row, participants, documents and journal
// stay. Bringing one back is a database act for the software administrator.
export async function archiveScheme(id: string, by: string): Promise<boolean> {
  if (!(await getScheme(id))) return false;
  await updateSchemeWith(id, () => ({ archivedAt: new Date().toISOString(), archivedBy: by }));
  // locally the write may fall back to memory (on a deployment it throws, 1.1) —
  // so check that it really took
  return !(await getScheme(id));
}

// Locked read-modify-write: `mutate` receives the FRESH current scheme inside the
// per-scheme write lock and returns the patch. Use this whenever the patch is
// COMPUTED FROM scheme state (e.g. remapping applications after a standards
// reorder, appending to a JSONB array) — a plain read→compute→updateScheme spans
// the lock and can clobber a write that landed in between.
export async function updateSchemeWith(
  id: string,
  mutate: (current: Scheme) => Partial<Scheme>
): Promise<void> {
  return withSchemeLock(id, async () => {
    const current = await getScheme(id);
    if (!current) return;
    const patch = mutate(current);
    const next = { ...current, ...patch };
    const db = getDb();
    if (db) {
      try {
        const { error } = await db
          .from("schemes")
          .update({ ...toRow(next), updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        const mi = mem.findIndex((s) => s.id === id);
        if (mi !== -1) mem[mi] = next;
        return;
      } catch (e) {
        warn(e);
      }
    }
    const i = mem.findIndex((s) => s.id === id);
    if (i !== -1) mem[i] = { ...mem[i], ...patch };
  });
}

export async function updateScheme(id: string, patch: Partial<Scheme>): Promise<void> {
  return withSchemeLock(id, async () => {
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
        // Keep the in-memory mirror coherent with the DB so a later DB-unavailable
        // read doesn't serve a stale scheme (the mirror is only consulted on failure,
        // but it must not drift when it IS consulted).
        const mi = mem.findIndex((s) => s.id === id);
        if (mi !== -1) mem[mi] = next;
        return;
      } catch (e) {
        warn(e);
        // fall through: persist the change in the in-memory mirror so it isn't lost
        // within this instance while the DB is unreachable.
      }
    }
    const i = mem.findIndex((s) => s.id === id);
    if (i !== -1) mem[i] = { ...mem[i], ...patch };
  });
}
