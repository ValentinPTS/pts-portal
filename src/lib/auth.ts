import { cookies } from "next/headers";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { isSharedMailbox } from "./provider-people";

// ─────────────────────────────────────────────────────────────────────────────
// Owner authentication & authorization (Phase 2).
//
// SCAFFOLDED OFF: while AUTH_ENABLED is not "true", requireOwner() is a no-op and
// the whole app stays open (so we can keep building). To switch it on later:
//   1. add to .env.local:  AUTH_ENABLED=true
//      NEXT_PUBLIC_SUPABASE_ANON_KEY=<the sb_publishable_… / anon key>
//      OWNER_EMAILS=belovski@…,kasabova@…,partner@…   (the 3 owners)
//   2. create those users in Supabase Auth and have each enrol an authenticator (TOTP).
// The authorization boundary is requireOwner() called inside every owner page AND
// every owner Server Action — proxy.ts alone is NOT sufficient (Server Actions can
// be POSTed directly; see node_modules/next/dist/docs … proxy.md).
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";
// Two-factor (TOTP) is required for the owner area by default. Set REQUIRE_2FA=false
// (e.g. in local/test) to sign in with just email + password — useful when hopping
// between Manager/Staff/Auditor accounts. Keep it ON (unset/true) for real use.
export const REQUIRE_2FA = process.env.REQUIRE_2FA !== "false";

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // a shared mailbox is never a founder, even if it is still in OWNER_EMAILS (Реш. 139)
  if (isSharedMailbox(email)) return false;
  const list = ownerEmails();
  return list.length > 0 && list.includes(email.toLowerCase());
}

// Cookie-bound Supabase client (anon/publishable key) for the user's session.
// Separate from getDb() in supabase.ts, which uses the SECRET key for data ops.
export async function createServerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only — the
          // session is refreshed in proxy.ts instead. Safe to ignore.
        }
      },
    },
  });
}

export interface OwnerSession {
  userId: string;
  email: string;
  aal2: boolean; // has completed 2FA this session
  // signed in with a temporary password a manager handed out: it must be changed
  // before anything else (part 1.5). In app_metadata — the user cannot write it —
  // set at creation, cleared by the server when a new password is set.
  mustChangePassword: boolean;
  // an authenticator is enrolled but not yet passed this session (aal1 of an aal2
  // account): nothing but the code step is open to it
  needsAal2: boolean;
}

// Memoized per request (React cache): the root layout's header, the page's
// requireOwner(), and any /account read share a single getUser() round-trip.
export const getSessionUser = cache(async (): Promise<OwnerSession | null> => {
  // No configured project (or a key-less local env) → no session, never a crash —
  // the same silent fallback the data stores use. createServerClient throws on an
  // empty url/key, so both are guarded here.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // An unconfirmed e-mail is no session at all (part 0.5) — the same rule as at
  // sign-in, so a session that predates it cannot carry on.
  if (!user || !user.email_confirmed_at) return null;
  // a shared mailbox is no session in the portal however one was made — a link, a
  // session from before part 1.6 (Реш. 139); every role and lab check reads this
  if (isSharedMailbox(user.email)) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    userId: user.id, email: (user.email ?? "").toLowerCase(), aal2: aal?.currentLevel === "aal2",
    mustChangePassword: user.app_metadata?.must_change_password === true,
    needsAal2: aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2",
  };
});

