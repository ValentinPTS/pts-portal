import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Returns a Supabase client if credentials are configured (env), else null.
// When null, the store falls back to in-memory — so the app runs with or without
// a database. Used server-side only; the key is never sent to the browser.
let cached: SupabaseClient | null | undefined;

// No memory fallback on a deployment (part 1.1). On Vercel the memory belongs to
// one short-lived instance: a write "kept in memory" is a write lost, and a read
// from it shows data that is not there. So on a deployment a database problem is
// an error, never papered over — and production without a database does not run.
// Locally (no VERCEL_ENV) the fallback stays, so the app runs without a database.
// VERCEL is always set on Vercel; VERCEL_ENV only when system variables are exposed
// — so a Vercel run without VERCEL_ENV counts as production, the strict side.
const ON_DEPLOYMENT = !!process.env.VERCEL || !!process.env.VERCEL_ENV || process.env.PTS_STRICT_DB === "1";
const IN_PRODUCTION = process.env.VERCEL_ENV === "production" || (!!process.env.VERCEL && !process.env.VERCEL_ENV);

/** Where a store would fall back to memory after a database error: on a deployment
 *  this throws instead. `where` names the store in the message. */
export function noMemoryFallback(where: string, e: unknown): void {
  if (!ON_DEPLOYMENT) return;
  throw new Error(`[${where}] database error — not falling back to memory: ${(e as Error)?.message ?? String(e)}`, { cause: e });
}

/** For the few writes that must never fail the work around them — a notice, «mark
 *  read»: on a deployment the error is logged and that one write is dropped (no
 *  memory, no throw). True = the caller stops there. Locally: false, memory as ever. */
export function dropOnDeployment(where: string, e: unknown): boolean {
  if (!ON_DEPLOYMENT) return false;
  console.error(`[${where}] database error — this write is dropped, not kept in memory:`, (e as Error)?.message ?? e);
  return true;
}

/** What the system check shows (part 1.1). */
export function dbMode(): { configured: boolean; strict: boolean; production: boolean } {
  return { configured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_KEY), strict: ON_DEPLOYMENT, production: IN_PRODUCTION };
}

export function getDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  // production with no database would quietly run on an empty memory — refuse
  if (IN_PRODUCTION && !(url && key)) throw new Error("[db] production has no database configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_KEY)");
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}
