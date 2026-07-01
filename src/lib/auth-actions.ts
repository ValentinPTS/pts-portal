"use server";

import { redirect } from "next/navigation";
import { createServerSupabase, REQUIRE_2FA, isOwnerEmail } from "./auth";
import { getStaffByEmail } from "./staff";
import { getLabByEmail } from "./labs";

export type AuthState = { error?: string; needsTotp?: boolean };

// ── Smart login ───────────────────────────────────────────────────────────────
// SECURITY PRINCIPLE: privileges are decided by the ACCOUNT (its row in the DB),
// never by which page/URL the person used to sign in. A "team" door and a "lab"
// door may exist for humans, but the server always re-resolves the role from the
// e-mail and routes/enforces 2FA on that basis — so a staff member can never skip
// 2FA by signing in through the lab page, and a lab can never reach the owner app.
type LoginRole = "internal" | "lab";

async function resolveLoginRole(email: string): Promise<LoginRole | null> {
  if (isOwnerEmail(email)) return "internal";            // founders — always internal
  const staff = await getStaffByEmail(email);
  if (staff && staff.status === "active") return "internal"; // manager/staff/auditor
  const lab = await getLabByEmail(email);
  if (lab && lab.status === "active") return "lab";
  return null;                                            // signed in, but no profile
}

// Where to land after a successful sign-in. `next` is only honoured when it stays
// inside the area the account is actually allowed in (defence against an open
// redirect / cross-area jump via a crafted ?next=).
function safeDest(role: LoginRole, next: string): string {
  if (role === "lab") return next.startsWith("/lab") && !next.startsWith("/lab/login") ? next : "/lab";
  const ok = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/lab") && !next.startsWith("/login");
  return ok ? next : "/";
}

// Step 1 of login: email + password. On success we resolve the account's role and
// route by it. Internal accounts must satisfy 2FA (unless REQUIRE_2FA=false); labs
// sign straight in (2FA optional — verified only if they enrolled one). An account
// with no team/lab profile is signed back out with a clear message (never left in a
// half-authenticated state that the proxy would silently bounce).
export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase returns one generic message whether the e-mail is unknown or the
  // password is wrong — no account enumeration. Keep it as-is.
  if (error) return { error: error.message };

  const role = await resolveLoginRole(email);
  if (!role) {
    await supabase.auth.signOut(); // don't leave a dangling session with no role
    return { error: "This account isn't linked to a team member or laboratory profile yet. Please contact PTS." };
  }
  const dest = safeDest(role, next);

  // Labs: 2FA is optional. Verify it only if the lab actually enrolled a factor.
  if (role === "lab") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") redirect(dest);
    if (aal?.nextLevel === "aal2") return { needsTotp: true };
    redirect(dest);
  }

  // Internal: 2FA required by default.
  if (!REQUIRE_2FA) redirect(dest);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(dest);
  if (aal?.nextLevel === "aal2") return { needsTotp: true }; // has a factor → must verify
  redirect("/account?enroll=1"); // signed in, but must enrol an authenticator first
}

// Step 2 of login: verify the authenticator's 6-digit code → raises session to aal2.
// After verifying we re-resolve the role and route by it (again, never trust the
// door / a crafted `next`).
export async function verifyTotpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (!/^\d{6}$/.test(code)) return { needsTotp: true, error: "Enter the 6-digit code." };

  const supabase = await createServerSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { error: "No authenticator enrolled — please sign in again." };
  const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (ce || !ch) return { needsTotp: true, error: ce?.message ?? "Could not start the challenge." };
  const { error: ve } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code });
  if (ve) return { needsTotp: true, error: ve.message };

  const { data: { user } } = await supabase.auth.getUser();
  const role = await resolveLoginRole((user?.email ?? "").toLowerCase());
  if (!role) { await supabase.auth.signOut(); return { error: "This account isn't linked to a profile. Please contact PTS." }; }
  redirect(safeDest(role, next));
}

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

// Lab portal sign-out → back to the lab sign-in.
export async function signOutLabAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/lab/login");
}

// /account: begin enrolling an authenticator — returns the QR + secret to display.
// Clears any half-finished (unverified) factors first to avoid name clashes.
export async function startTotpEnrollAction(): Promise<{
  factorId?: string;
  qr?: string;
  secret?: string;
  error?: string;
}> {
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `authenticator-${Date.now()}`,
  });
  if (error || !data) return { error: error?.message ?? "Could not start enrolment." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

// /account: confirm the authenticator by verifying its first code → activates 2FA.
export async function verifyTotpEnrollAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!factorId || !/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: error.message };
  redirect("/"); // session is now aal2
}
