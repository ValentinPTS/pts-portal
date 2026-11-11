// The certificate register's lookup — the shared core of the portal's page and the website's question
// (plan part 10.4; D20; Реш. 55, 56, 93, 115; migration 0054). Not a server action module: nothing here is
// callable from a browser. The code typed and the address are never kept: the address and the number
// only as keyed hashes that include the hour, the outcome only as a day's count.
//
// Every lookup TAKES A TICKET before it looks (10.4 review: a scheme's codes are only 01–99 — a check first
// and a count after let a burst of them through at once): counted as failed for its address, its number and
// everyone, under the hour's lock; a valid answer gives it back. Ceilings an hour: an address 10 failed and
// 30 in all (an IPv6 address by its /64), a number 20 failed, everyone 300 failed. No ticket — no lookup.
// And a DAY's ceiling per scheme and code (the security sweep, SC-2): a report names the codes, so the
// only secret is a number's five digits — each guess a new number never filled the number's ceiling,
// and 300 an hour found a chosen code's laboratory in about a week. Now 20 failed a day per code.
import { createHmac } from "node:crypto";
import { foldSchemeNumber } from "./scheme-number";
import { getDb } from "./supabase";
import { listStartedSchemes } from "./store";
import { listParticipants, withIdentities } from "./participants";
import { readQuery, findCertificate, answerOf, hourOf, MAX_FAILED_PER_HOUR, type RegisterAnswer } from "./cert-register-model";

type Outcome = "valid" | "invalid" | "incomplete" | "limited";
export const CEILINGS = { addressFailed: MAX_FAILED_PER_HOUR, addressTries: 30, numberFailed: 20, allFailed: 300, codeFailedPerDay: 20 };
type Bucket = { failed: number; tries: number };
const g = globalThis as unknown as { __ptsRegisterTickets?: { buckets: Map<string, Bucket>; lookups: Map<string, number> } };
const mem = g.__ptsRegisterTickets ?? (g.__ptsRegisterTickets = { buckets: new Map(), lookups: new Map() });

/** The key of the hashes — its own secret (REGISTER_HASH_KEY); required on a deployment (10.4 review: never
 *  the database's key, never a constant there). Locally, a fixed one. */
function hashKey(): string | null {
  const k = (process.env.REGISTER_HASH_KEY ?? "").trim();
  if (k.length >= 16) return k;
  return getDb() ? null : "pts-local-register-key";
}
const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");

/** An address as counted: an IPv4-in-IPv6 as its IPv4; an IPv6 by its /64 (one household or one host). */
export function normAddress(raw: string): string {
  const a = (raw ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];
  if (!a.includes(":")) return a || "unknown";
  const [head, tail = ""] = a.split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = a.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
/** The number as counted: its five random digits when it reads as a certificate number (every spelling of
 *  it one bucket); else the whole, folded. */
const numberMark = (n: string) => { const m = String(n ?? "").match(/(\d{5})\s*$/); return m ? m[1] : String(n ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 60); };
/** The scheme and the code a lookup names, as counted for the day: every spelling of the scheme's number
 *  and of the code one bucket (SC-2). */
export const codeMark = (number: string, code: string) => {
  const n = String(number ?? "").trim().replace(/[\u2010-\u2015\u2212]/g, "-");
  const m = n.match(/^(.+?)\s*-\s*\d{5}\s*$/);
  const scheme = m ? foldSchemeNumber(m[1]) : n.replace(/\s+/g, "").toUpperCase().slice(0, 60);
  return `${scheme}|${String(code ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 40)}`;
};
/** The address as kept: a keyed hash of the hour and the address — never the address itself. */
export const addressKey = (address: string, hour: string, key = hashKey() ?? "") => hmac(key, `${hour}|a|${normAddress(address)}`);

// the day's window of a code's bucket: the day's first hour, in the hours' own form
const dayOf = (hour: string) => `${hour.slice(0, 10)}T00`;
async function takeTicket(hour: string, a: string, n: string, c: string): Promise<boolean> {
  const db = getDb();
  const day = dayOf(hour);
  if (!db) {
    // one process, no await between the look and the count — a burst cannot slip between them
    for (const k of [...mem.buckets.keys()]) { const [b, w] = k.split("|"); if (w < (b.startsWith("c:") ? day : hour)) mem.buckets.delete(k); }
    const key = (b: string) => `${b}|${b.startsWith("c:") ? day : hour}`;
    const get = (b: string) => mem.buckets.get(key(b)) ?? { failed: 0, tries: 0 };
    const A = get(a), N = get(n), G = get("g"), C = get(c);
    if (A.failed >= CEILINGS.addressFailed || A.tries >= CEILINGS.addressTries || N.failed >= CEILINGS.numberFailed || G.failed >= CEILINGS.allFailed || C.failed >= CEILINGS.codeFailedPerDay) return false;
    for (const b of [a, n, "g", c]) { const x = get(b); mem.buckets.set(key(b), { failed: x.failed + 1, tries: x.tries + 1 }); }
    return true;
  }
  const { data, error } = await db.rpc("register_try", { p_hour: hour, p_day: day, p_address: a, p_number: n, p_code: c });
  if (error) throw error;
  return data === true;
}
async function refund(hour: string, a: string, n: string, c: string): Promise<void> {
  const db = getDb();
  const day = dayOf(hour);
  if (!db) { for (const b of [a, n, "g", c]) { const x = mem.buckets.get(`${b}|${b.startsWith("c:") ? day : hour}`); if (x) x.failed = Math.max(0, x.failed - 1); } return; }
  const { error } = await db.rpc("register_refund", { p_hour: hour, p_day: day, p_address: a, p_number: n, p_code: c });
  if (error) console.error("[register] refund:", error.message);
}
async function countOutcome(o: Outcome): Promise<void> {
  const db = getDb();
  if (!db) { const day = new Date().toISOString().slice(0, 10); mem.lookups.set(`${day}|${o}`, (mem.lookups.get(`${day}|${o}`) ?? 0) + 1); return; }
  const { error } = await db.rpc("register_count", { p_outcome: o });
  if (error) console.error("[register] count:", error.message);
}

export type LookupResult = { state: "valid"; answer: RegisterAnswer } | { state: "invalid" | "incomplete" | "limited" | "failed" };

/** One lookup by number AND code, from one address: «valid» with Реш. 56's data, or why not — the same
 *  «invalid» whichever part was wrong, and for a matched certificate that cannot be answered (10.4 review:
 *  never a different answer once the pair matched). */
export async function lookupCertificate(input: { number?: unknown; code?: unknown }, address: string, nowMs = Date.now()): Promise<LookupResult> {
  const hour = hourOf(nowMs);
  const key = hashKey();
  if (!key) { console.error("[register] REGISTER_HASH_KEY is not set — the register answers nothing until it is"); return { state: "failed" }; }
  const q = readQuery(input);
  const a = `a:${addressKey(address, hour, key)}`;
  const n = `n:${hmac(key, `${hour}|n|${numberMark(q?.number ?? String(input.number ?? ""))}`)}`;
  // (an incomplete query names no code: its own bucket, by its address)
  const c = `c:${hmac(key, q ? `${dayOf(hour)}|c|${codeMark(q.number, q.code)}` : `${dayOf(hour)}|c-none|${a}`)}`;
  let ticket: boolean;
  try { ticket = await takeTicket(hour, a, n, c); } catch (e) { console.error("[register] ticket:", (e as Error)?.message ?? e); return { state: "failed" }; }
  if (!ticket) { await countOutcome("limited"); return { state: "limited" }; }
  if (!q) { await countOutcome("incomplete"); return { state: "incomplete" }; }
  let hit;
  try { hit = findCertificate(await listStartedSchemes(), q); } catch (e) { console.error("[register] lookup:", (e as Error)?.message ?? e); return { state: "failed" }; }
  if (!hit) { await countOutcome("invalid"); return { state: "invalid" }; }
  try {
    // the laboratory's name as its certificate prints it — opened for the register, on record (2.3)
    const coded = (await listParticipants(hit.scheme.id)).filter((p) => p.code === hit.code);
    // under its own purpose — an outsider's lookup, never «a job of the portal» (the security sweep, SC-4)
    const [p] = await withIdentities(coded, hit.scheme.id, { actor: "public:register", purpose: "register" });
    if (!p?.labName) throw new Error("no laboratory name for a released certificate");
    const answer = answerOf(hit, p.labName);
    await refund(hour, a, n, c);
    await countOutcome("valid");
    return { state: "valid", answer };
  } catch (e) {
    // matched, but not answerable: told PTS (the server's log), «invalid» to the asker — never a sign the pair was right
    console.error(`[register] a released certificate of ${hit.scheme.id} could not be answered:`, (e as Error)?.message ?? e);
    await countOutcome("invalid");
    return { state: "invalid" };
  }
}

/** The address a request came from — the platform's own header first (Vercel overwrites these; behind
 *  another host, revisit — 10.4 review), else the first forwarded address. */
export function requestAddress(h: { get(name: string): string | null }): string {
  return (h.get("x-vercel-forwarded-for") ?? "").split(",")[0].trim() || (h.get("x-real-ip") ?? "").trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
