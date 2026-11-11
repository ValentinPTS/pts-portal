// The public forms' limit — the registration, the online application, the password reset (the
// security sweep, 2026-11-11; migration 0055). Each request of these forms writes rows the database
// keeps for years (a pending registration six years, an opening of the identity store, a journal
// line, its documents); the limit lived in one server's memory — every new instance, and every
// IPv6 address, started at zero. Now a count in the database, per hour: per address (a keyed hash
// that includes the hour; an IPv6 address by its /64 — never the address itself) and for everyone.
// Not a server action module: nothing here is callable from a browser.
import { createHmac, randomBytes } from "node:crypto";
import { getDb } from "./supabase";
import { normAddress } from "./cert-register";

export const FORM_CEILINGS = {
  // a valid registration only is counted (after the form is read); an office behind one address may
  // register a few organisations — the old limit was 8 a quarter of an hour, in one server's memory
  registration: { perAddress: 10, all: 100 },
  application: { perAddress: 8, all: 100 },
  password_reset: { perAddress: 10, all: 200 },
} as const;
export type PublicForm = keyof typeof FORM_CEILINGS;

type Mem = { counts: Map<string, number>; key?: string; warned?: boolean };
const g = globalThis as unknown as { __ptsPublicForms?: Mem };
const mem: Mem = g.__ptsPublicForms ?? (g.__ptsPublicForms = { counts: new Map<string, number>() });

/** The hashes' key: the register's own secret (REGISTER_HASH_KEY). Without it on a deployment the
 *  forms are not shut (a password reset must work): a key of this instance's own — the address is
 *  then counted per instance, everyone's ceiling still in the database. Locally, a fixed one. */
function formKey(): string {
  const k = (process.env.REGISTER_HASH_KEY ?? "").trim();
  if (k.length >= 16) return k;
  if (!getDb()) return "pts-local-form-key";
  if (!mem.warned) { mem.warned = true; console.error("[public-limit] REGISTER_HASH_KEY is not set — the public forms are counted per address on this instance only"); }
  return (mem.key ??= randomBytes(32).toString("hex"));
}
const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");
export const hourOfForm = (ms: number) => new Date(ms).toISOString().slice(0, 13);

/** May this request of a public form go on? Counted whether or not it then succeeds; refused at a
 *  ceiling — of its address, or of everyone. A database that cannot count refuses (fail closed). */
export async function publicFormAllowed(form: PublicForm, address: string, nowMs = Date.now()): Promise<boolean> {
  const hour = hourOfForm(nowMs);
  const bucket = `a:${hmac(formKey(), `${hour}|${form}|${normAddress(address)}`)}`;
  const c = FORM_CEILINGS[form];
  const db = getDb();
  if (!db) {
    for (const k of [...mem.counts.keys()]) if (k.split("|")[1] < hour) mem.counts.delete(k);
    const a = mem.counts.get(`${bucket}|${hour}`) ?? 0, all = mem.counts.get(`g:${form}|${hour}`) ?? 0;
    if (a >= c.perAddress || all >= c.all) return false;
    mem.counts.set(`${bucket}|${hour}`, a + 1);
    mem.counts.set(`g:${form}|${hour}`, all + 1);
    return true;
  }
  const { data, error } = await db.rpc("public_form_try", { p_form: form, p_hour: hour, p_address: bucket, p_per_address: c.perAddress, p_global: c.all });
  if (error) { console.error(`[public-limit] ${form}:`, error.message); return false; }
  return data === true;
}
