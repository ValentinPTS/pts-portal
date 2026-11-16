// The editor's saves, one record per document per browser TAB (round 9, the editor's one save controller; T3 F1/F2).
//
// The version an editor sends with each save (R5UA-3) belonged to each OPENING of the editor, not to the tab. An
// editor opened again in the same tab held an older copy and an older version whenever a save of the editor before it
// answered after that page was gone: Back and Forward bring a page back from Next's cache with the props of its first
// opening, and a reload can be drawn while the last save is still on its way (the closing save, R7UP-5; the words typed
// while a link's save went; an autosave). The editor then showed the document without the words just saved, and every
// save of it was refused as «saved meanwhile from another tab or person».
//
// Here: the version this tab knows is stored, the save of this tab still on its way, and the saves this tab sent.
// Module scope lives through client navigations (Back and Forward included); sessionStorage, a full load of a page in
// the same tab (it is per tab: another tab has its own). Read before an editor takes a keystroke (planOpen), told
// before each save goes (tabSent) and when it is answered (tabAnswered).

/** the autosave: this long after the last edit… */
export const AUTOSAVE_MS = 2500;
/** …and while the typing goes on without a pause, at least this often (round 9: 30 s of steady typing made no save) */
export const AUTOSAVE_MAX_WAIT_MS = 20_000;
/** an editor opened again while a save from this tab may still be on its way: the stored version peeked at this often…
 *  (no body — lib/doc-editor-read editorDocVersion) */
export const SYNC_POLL_MS = 500;
/** …for about this long, whatever the latency (review 3: it was 9 reads — 13 s and more on a slow connection)… */
export const SYNC_POLL_TOTAL_MS = 4000;
/** …then, said on the bar («the last save from this tab is still on its way») and read-only, this often… */
export const SYNC_SLOW_POLL_MS = 2000;
/** …until that save is this old, by this browser's clock: then it is taken as lost on its way (its page died before it
 *  went) and the stored copy is taken — a landing after that is refused and said, never written over (review 3) */
export const SYNC_GIVE_UP_MS = 60_000;
/** a peek or a read that failed on the connection (or a server restarting) tried again this many times more — SYNC_POLL_MS,
 *  then twice as long each time (about 7.5 s in all), never past SYNC_GIVE_UP_MS; a refusal (Next's redirect or
 *  not-found: the right or the session gone) is never tried again (review 3, recheck) */
export const SYNC_RETRIES = 4;
/** a refusal Next's client throws for a server action: its redirect or not-found — never asked again (each a navigation) */
export function isNextRefusal(e: unknown): boolean {
  const d = e && typeof e === "object" ? (e as { digest?: unknown }).digest : undefined;
  return typeof d === "string" && d.startsWith("NEXT_");
}
/** the save of the editor before (the same page's memory) waited for at most this long — a request that hangs never
 *  keeps the editor read-only for good; its version is read after, and a refusal naming it is this tab's own echo */
export const SYNC_WAIT_MS = 15_000;

/** When the autosave goes: AUTOSAVE_MS after this edit, but never later than AUTOSAVE_MAX_WAIT_MS after the first edit
 *  not yet on its way (`dirtySince`); `atLeast` — an act is running, tried again later (R6UP-1). */
export function autosaveWait(dirtySince: number, now: number, atLeast = 0): number {
  return Math.max(atLeast, Math.min(AUTOSAVE_MS, dirtySince + AUTOSAVE_MAX_WAIT_MS - now));
}
/** …now: the first edit not yet on its way noted in `dirty` when there is none (the editor's ref; the clock read here,
 *  never in the component's own code — React's purity rule) */
export function autosaveDelay(dirty: { current: number | null }, atLeast = 0): number {
  const now = Date.now();
  if (dirty.current === null) dirty.current = now;
  return autosaveWait(dirty.current, now, atLeast);
}

/** a time limit read from this browser's clock (the clock read here, never in the component's code — React's purity rule) */
export function deadline(ms: number): { passed: () => boolean } {
  const end = Date.now() + ms;
  return { passed: () => Date.now() >= end };
}

/** the page is leaving (after «pagehide»; a page shown again from the browser's cache, «pageshow», is not): a save broken
 *  off now may well have reached the server — it is not marked answered (T3 F2, traced: marked answered, the next page
 *  drew the version before it and its first save was refused) */
let leaving = false;
export function pageLeaving(): boolean { return leaving; }
export function markLeaving(v: boolean): void { leaving = v; }
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => markLeaving(true));
  window.addEventListener("pageshow", () => markLeaving(false));
}

/** a save's own id — what the server keeps beside the version, and names in a refusal */
export const SAVE_ID = /^[A-Za-z0-9-]{8,64}$/;
export function newSaveId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** what an opening of the editor must do first: wait for this tab's save on its way; read the stored copy (a newer
 *  version is known, or a save of this tab was never answered — `awaitSid`, the stored copy is read until it is that one) */
export type OpenPlan = { wait: Promise<unknown> | null; read: boolean; awaitSid: string | null };

type Mem = { rev: number | null; pending: Promise<unknown> | null; mine: string[] };
type Kept = { rev?: number; sent?: string; sentAt?: number; done?: string; mine?: string[] };
type Store = Pick<Storage, "getItem" | "setItem">;
const MINE_MAX = 30;
const mem = new Map<string, Mem>();
let store: Store | null | undefined;
const storage = (): Store | null => {
  if (store !== undefined) return store;
  try { store = typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null; } catch { store = null; }
  return store;
};
const keyOf = (schemeId: string, docKey: string) => `pts.doc.${schemeId}.${docKey}`;
const memOf = (k: string): Mem => {
  let m = mem.get(k);
  if (!m) { m = { rev: null, pending: null, mine: [] }; mem.set(k, m); }
  return m;
};
function load(k: string): Kept {
  try {
    const v = storage()?.getItem(k);
    const o: unknown = v ? JSON.parse(v) : null;
    return o && typeof o === "object" ? (o as Kept) : {};
  } catch { return {}; }
}
function keep(k: string, o: Kept): void {
  // storage full or blocked: the module's record still holds while this page lives
  try { storage()?.setItem(k, JSON.stringify(o)); } catch { /* kept in memory only */ }
}

/** tests only: a storage of their own and a fresh module state — as a full load of a page in the same tab */
export function __tabForTests(s: Store | null): void { store = s; mem.clear(); }

export function planOpen(schemeId: string, docKey: string, pageRev: number): OpenPlan {
  const k = keyOf(schemeId, docKey), m = mem.get(k), s = load(k);
  const known = Math.max(m?.rev ?? -1, typeof s.rev === "number" ? s.rev : -1);
  const awaitSid = s.sent && s.sent !== s.done ? s.sent : null;
  const wait = m?.pending ?? null;
  return { wait, read: !!wait || !!awaitSid || known > pageRev, awaitSid };
}

/** the save chain of an editor: the next opening of this document in this tab waits for it */
export function tabTrack(schemeId: string, docKey: string, p: Promise<unknown>): void {
  const m = memOf(keyOf(schemeId, docKey));
  m.pending = p;
  const clear = () => { if (m.pending === p) m.pending = null; };
  p.then(clear, clear);
}

/** a save is about to go — written before the request, so a page left at once still says so */
export function tabSent(schemeId: string, docKey: string, sid: string): void {
  const k = keyOf(schemeId, docKey), m = memOf(k), s = load(k);
  m.mine = [...m.mine, sid].slice(-MINE_MAX);
  keep(k, { ...s, sent: sid, sentAt: Date.now(), mine: [...(s.mine ?? []), sid].slice(-MINE_MAX) });
}

/** how long ago, by this browser's clock, the last save of this tab went without an answer seen; -1: none such */
export function unansweredAge(schemeId: string, docKey: string): number {
  const s = load(keyOf(schemeId, docKey));
  if (!s.sent || s.sent === s.done) return -1;
  return typeof s.sentAt === "number" ? Math.max(0, Date.now() - s.sentAt) : Number.POSITIVE_INFINITY;
}

/** the server answered that save — `rev` the version it stored, null when it refused it */
export function tabAnswered(schemeId: string, docKey: string, sid: string, rev: number | null): void {
  const k = keyOf(schemeId, docKey), m = memOf(k), s = load(k);
  if (rev !== null) m.rev = Math.max(m.rev ?? -1, rev);
  keep(k, { ...s, ...(s.sent === sid ? { done: sid } : {}), ...(rev !== null ? { rev: Math.max(typeof s.rev === "number" ? s.rev : -1, rev) } : {}) });
}

/** an opening of the editor took the stored copy (version `rev`): the version the tab knows never goes back (another
 *  opening's save may have answered higher meanwhile), and only the save it waited for — `settled`, when that is still
 *  the tab's last — is settled: a newer one, of an editor still on its way, stays unanswered (review 3) */
export function tabAdopt(schemeId: string, docKey: string, rev: number, settled: string | null = null): void {
  const k = keyOf(schemeId, docKey), m = memOf(k), s = load(k);
  m.rev = Math.max(m.rev ?? -1, rev);
  keep(k, { ...s, rev: Math.max(typeof s.rev === "number" ? s.rev : -1, rev), ...(settled && s.sent === settled ? { done: settled } : {}) });
}

/** the stored copy is one this tab saved (a refusal naming it is this tab's own echo, not another tab or person) */
export function isOwnSave(schemeId: string, docKey: string, sid: string | null | undefined): boolean {
  if (!sid) return false;
  const k = keyOf(schemeId, docKey);
  return memOf(k).mine.includes(sid) || (load(k).mine ?? []).includes(sid);
}
