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
  // everyone's ceilings with room: reached, they are SAID («try later») — never a silent drop for everyone
  // (round 2, R2S-4: about twenty addresses could shut the password reset for the whole portal, unsaid)
  application: { perAddress: 8, all: 300 },
  password_reset: { perAddress: 10, all: 600 },
  // sign-in and its second factor (round 5, R5SB-1): the sign-in service counts by the address it sees —
  // the server's, the same for everyone. Counted here per person's address, per account (its e-mail,
  // keyed), and per user for the 6-digit code and the current password; everyone's ceilings far above use
  // — never an everyone-ceiling: one outsider must not shut sign-in for all (round 6, R6S-3); an account's
  // tight limit is per account AND address (a stranger's tries never lock the person out from their own),
  // with a far higher ceiling for the account from everywhere
  sign_in: { perAddress: 30, all: 1_000_000_000 },
  sign_in_pair: { perAddress: 15, all: 1_000_000_000 },
  sign_in_account: { perAddress: 200, all: 1_000_000_000 },
  second_factor: { perAddress: 10, all: 1_000_000_000 },
  password_check: { perAddress: 10, all: 1_000_000_000 },
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

/** A browser where this account has signed in before («a known device», round 7, R7S-2): a mark kept in an
 *  httpOnly cookie, keyed by the server's secret — a stranger cannot make one. Such a browser is not shut by
 *  the account's ceiling from everywhere (the per-address limits still hold), so another's wrong passwords
 *  never lock the person out of their own browser. */
// A mark is «<browser id>-<HMAC of e-mail, id and month>»: a random id per browser, so one browser's mark is
// not another's, and a month, so it lapses three months after the last sign-in there (round 7 review, RV7-7:
// a pure function of the e-mail was the same everywhere, for ever — a former colleague's PC kept it).
export const KNOWN_DEVICE_COOKIE = "pts_kd";
const monthOf = (ms: number, back = 0) => { const d = new Date(ms); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
export const knownDeviceMark = (email: string, id: string, month: string) => hmac(formKey(), `known|${email.trim().toLowerCase()}|${id}|${month}`).slice(0, 32);
const entries = (v: string | undefined) => (v ?? "").split(".").map((e) => /^([0-9a-f]{16})-([0-9a-f]{32})$/.exec(e)).filter((m): m is RegExpExecArray => !!m);
export function knownDevice(cookieValue: string | undefined, email: string, nowMs = Date.now()): boolean {
  const months = [0, 1, 2].map((b) => monthOf(nowMs, b));
  return entries(cookieValue).some(([, id, mac]) => months.some((m) => knownDeviceMark(email, id, m) === mac));
}
/** The cookie's value with this account's mark renewed for this month (the last four accounts kept). */
export function withKnownDevice(cookieValue: string | undefined, email: string, nowMs = Date.now()): string {
  const months = [0, 1, 2].map((b) => monthOf(nowMs, b));
  const kept = entries(cookieValue).filter(([, id, mac]) => !months.some((m) => knownDeviceMark(email, id, m) === mac)).map((m) => m[0]);
  const id = randomBytes(8).toString("hex");
  return [...kept, `${id}-${knownDeviceMark(email, id, months[0])}`].slice(-4).join(".");
}

/** May this request of a public form go on? «ok», or why not: its ADDRESS reached its ceiling (the
 *  form may then answer as if it went — nothing learned of anyone), or EVERYONE's did / the count failed
 *  (said: «try later» — round 2, R2S-4). Counted whether or not it then succeeds; fail closed. */
export type FormLimit = "ok" | "address" | "all";
export async function publicFormAllowed(form: PublicForm, address: string, nowMs = Date.now()): Promise<boolean> {
  return (await publicFormLimit(form, address, nowMs)) === "ok";
}
/** An attempt to sign in (or to give the 6-digit code, the current password): «ok», or why not. Unlike the
 *  forms, a count that FAILS lets it through (said in the server's log) — signing in must not depend on the
 *  counter; a ceiling reached does not. `key`: an address, or «account-…»/«user-…» (never with «:»). */
export async function attemptLimit(kind: "sign_in" | "sign_in_pair" | "sign_in_account" | "second_factor" | "password_check", key: string, nowMs = Date.now()): Promise<FormLimit> {
  const r = await publicFormLimit(kind, key.replace(/:/g, "_"), nowMs, true);
  return r === "error" ? "ok" : r;
}
export async function publicFormLimit(form: PublicForm, address: string, nowMs = Date.now(), failOpen = false): Promise<FormLimit | "error"> {
  const hour = hourOfForm(nowMs);
  const bucket = `a:${hmac(formKey(), `${hour}|${form}|${normAddress(address)}`)}`;
  const c = FORM_CEILINGS[form];
  const db = getDb();
  if (!db) {
    for (const k of [...mem.counts.keys()]) if (k.split("|")[1] < hour) mem.counts.delete(k);
    const a = mem.counts.get(`${bucket}|${hour}`) ?? 0, all = mem.counts.get(`g:${form}|${hour}`) ?? 0;
    if (all >= c.all) return "all";
    if (a >= c.perAddress) return "address";
    mem.counts.set(`${bucket}|${hour}`, a + 1);
    mem.counts.set(`g:${form}|${hour}`, all + 1);
    return "ok";
  }
  const { data, error } = await db.rpc("public_form_try", { p_form: form, p_hour: hour, p_address: bucket, p_per_address: c.perAddress, p_global: c.all });
  if (error) { console.error(`[public-limit] ${form}:`, error.message); return failOpen ? "error" : "all"; }
  return data === "ok" || data === "address" ? data : "all";
}
