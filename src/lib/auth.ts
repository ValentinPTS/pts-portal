import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

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
}

// Memoized per request (React cache): the root layout's header, the page's
// requireOwner(), and any /account read share a single getUser() round-trip.
export const getSessionUser = cache(async (): Promise<OwnerSession | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { userId: user.id, email: (user.email ?? "").toLowerCase(), aal2: aal?.currentLevel === "aal2" };
});

// THE gate. No-op while auth is off. When on: must be a signed-in owner who has
// completed 2FA. Redirects (never returns) on failure.
export async function requireOwner(): Promise<OwnerSession | void> {
  if (!AUTH_ENABLED) return;
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!isOwnerEmail(session.email)) redirect("/login?denied=1");
  if (REQUIRE_2FA && !session.aal2) redirect("/account?enroll=1"); // sign-in ok, but 2FA not satisfied
  return session;
}
