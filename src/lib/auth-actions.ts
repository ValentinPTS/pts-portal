"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "./auth";

export type AuthState = { error?: string; needsTotp?: boolean };

// Step 1 of login: email + password. If the account already has an authenticator,
// we return needsTotp (the form then asks for the 6-digit code). If it has no 2FA
// yet, we send the owner to /account to enrol one. No 2FA → no admin access.
export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(next);
  if (aal?.nextLevel === "aal2") return { needsTotp: true }; // has a factor → must verify
  // No 2FA yet: owners MUST enrol; labs may sign in without it (2FA optional).
  redirect(next.startsWith("/lab") ? next : "/account?enroll=1");
}

// Step 2 of login: verify the authenticator's 6-digit code → raises session to aal2.
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
  redirect(next);
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
