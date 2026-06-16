import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Returns a Supabase client if credentials are configured (env), else null.
// When null, the store falls back to in-memory — so the app runs with or without
// a database. Used server-side only; the key is never sent to the browser.
let cached: SupabaseClient | null | undefined;

export function getDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function isDbConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_KEY);
}
