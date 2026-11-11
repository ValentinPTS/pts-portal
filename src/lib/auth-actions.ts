"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AUTH_ENABLED, createServerSupabase, REQUIRE_2FA, isOwnerEmail, getSessionUser } from "./auth";
import { afterLinkDest, authErrorText, isOtpType, passwordProblem, RESET_RETURN, safeDest, safeNext, siteOrigin, type PasswordProblem } from "./auth-links";
import { mailAllowedHere } from "./environment";
import { logActivity, logAs } from "./activity";
import { getDb } from "./supabase";
import { isSharedMailbox } from "./provider-people";
import { getStaffByEmail } from "./staff";
import { getLabByEmail } from "./labs";
import { recordPending, settle, recentCount, recentCountTo } from "./sent-messages";
import { entityUserByAuth, acceptEntityUserInvitation, entityUserForLogin } from "./entity-users";
import { SUPABASE_TEMPLATES, fixedApproval } from "./fixed-texts";
import { publicFormLimit } from "./public-limit";
import { requestAddress } from "./cert-register";

export type AuthState = { error?: string; needsTotp?: boolean };

// ── Smart login ───────────────────────────────────────────────────────────────
// SECURITY PRINCIPLE: privileges are decided by the ACCOUNT (its row in the DB),
// never by which page/URL the person used to sign in. A "team" door and a "lab"
// door may exist for humans, but the server always re-resolves the role from the
// e-mail and routes/enforces 2FA on that basis — so a staff member can never skip
// 2FA by signing in through the lab page, and a lab can never reach the owner app.
type LoginRole = "internal" | "lab";

async function resolveLoginRole(email: string, userId?: string): Promise<LoginRole | null> {
  if (isSharedMailbox(email)) return null;               // a shared mailbox signs in as nobody (Реш. 139)
  if (isOwnerEmail(email)) return "internal";            // founders — always internal
  const staff = await getStaffByEmail(email);
  if (staff && staff.status === "active") return "internal"; // manager/staff/auditor
  const lab = await getLabByEmail(email);
  if (lab && lab.status === "active") return "lab";
  // a participant's user of a legal entity (4.4) — by its sign-in account, linked at
  // the invitation, and ACTIVE: an invited one has no sign-in role until it accepts by
  // its invitation's link (4.4 review)
  if (userId && (await participantUserOf(userId, email))) return "lab";
  return null;                                            // signed in, but no profile
}

/** The participant's user of this sign-in account — active (or, `invited`, still
 *  invited), never inactive (its entity inactive makes it inactive too, 0033); and only
 *  while the account's e-mail is still the user's login (4.4 review). None when it
 *  cannot be said. */
async function participantUserOf(userId: string, email: string, invited = false) {
  const u = await entityUserByAuth(userId, `auth:${userId}`).catch(() => null);
  if (!u || u.email !== email.trim().toLowerCase()) return null;
  return u.state === "active" || (invited && u.state === "invited") ? u : null;
}

/** Did an e-mail link — an invitation's or a new password's — make this session, within
 *  the hour? Only such a session accepts an invitation (4.4 review): a password, or a
 *  session from before, does not. Read from the session's own authentication methods. */
async function cameByEmailLink(): Promise<boolean> {
  try {
    const { data } = await (await createServerSupabase()).auth.mfa.getAuthenticatorAssuranceLevel();
    const now = Date.now() / 1000;
    return (data?.currentAuthenticationMethods ?? []).some((m) => typeof m === "object" && ["invite", "recovery", "otp", "magiclink"].includes(String(m.method)) && now - Number(m.timestamp) < 60 * 60);
  } catch {
    return false;
  }
}

// Where to land after a successful sign-in. `next` is only honoured when it stays
// inside the area the account is actually allowed in (defence against an open
// redirect / cross-area jump via a crafted ?next=).
// (safeDest: lib/auth-links — a pure module, tested; the security sweep, SA-2)

// Step 1 of login: email + password. On success we resolve the account's role and
// route by it. Internal accounts must satisfy 2FA (unless REQUIRE_2FA=false); labs
// sign straight in (2FA optional — verified only if they enrolled one). An account
// with no team/lab profile is signed back out with a clear message (never left in a
// half-authenticated state that the proxy would silently bounce).
// A completed sign-in, in the journal (part 1.9). The session is being made in
// this very request, so the actor is named explicitly: the account, and — for the
// team — the person and their role; a laboratory is only «laboratory» (§4.2).
async function journalSignIn(userId: string, email: string, role: "internal" | "lab", how: string): Promise<void> {
  if (role === "lab") { await logAs({ kind: "lab", userId }, "auth.login", { summary: `Signed in (${how})` }); return; }
  const staffRole = isOwnerEmail(email) ? "manager" : (await getStaffByEmail(email).catch(() => null))?.role ?? "internal";
  await logAs({ kind: "person", userId, email, role: staffRole }, "auth.login", { summary: `Signed in (${how})` });
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  if (!email || !password) return { error: "Enter your email and password." };
  // sign-in off, or no sign-in service configured: said plainly — never the client library's own
  // error page (the security sweep, UP Q2: «Your project's URL and Key are required…»)
  if (!AUTH_ENABLED || !process.env.NEXT_PUBLIC_SUPABASE_URL || !(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
    return { error: "Влизането не е включено тук. · Sign-in is not available here." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase returns one generic message whether the e-mail is unknown or the
  // password is wrong — no account enumeration. Keep it as-is.
  if (error) return { error: error.message };
  // A confirmed e-mail is required (part 0.5). Saying so reveals nothing: the
  // password was already right.
  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut();
    return { error: "This e-mail address has not been confirmed yet. Open the confirmation link sent to it, then sign in." };
  }

  const role = await resolveLoginRole(email, data.user?.id);
  if (!role) {
    await supabase.auth.signOut(); // don't leave a dangling session with no role
    return { error: "This account isn't linked to a team member or laboratory profile yet. Please contact PTS." };
  }
  // a temporary password a manager handed out is changed before anything else (1.5)
  const dest = data.user?.app_metadata?.must_change_password === true ? "/auth/set-password?must=1" : safeDest(role, next);

  const uid = data.user?.id ?? "";
  const must = dest.startsWith("/auth/set-password") ? ", a temporary password to change" : "";
  // Labs: 2FA is optional. Verify it only if the lab actually enrolled a factor.
  if (role === "lab") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") return { needsTotp: true };
    await journalSignIn(uid, email, role, `password${must}`);
    redirect(dest);
  }

  // Internal: 2FA required by default.
  if (!REQUIRE_2FA) { await journalSignIn(uid, email, role, `password, two-factor not required here${must}`); redirect(dest); }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") { await journalSignIn(uid, email, role, `password + two-factor${must}`); redirect(dest); }
  if (aal?.nextLevel === "aal2") return { needsTotp: true }; // has a factor → must verify
  await journalSignIn(uid, email, role, "password; must enrol two-factor before anything else");
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
  const role = await resolveLoginRole((user?.email ?? "").toLowerCase(), user?.id);
  if (!role) { await supabase.auth.signOut(); return { error: "This account isn't linked to a profile. Please contact PTS." }; }
  await journalSignIn(user?.id ?? "", (user?.email ?? "").toLowerCase(), role, "password + two-factor");
  redirect(safeDest(role, next));
}

export async function signOutAction() {
  await logActivity("auth.logout", { summary: "Signed out" }); // while the session still names who
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

// Lab portal sign-out → back to the lab sign-in.
export async function signOutLabAction() {
  await logActivity("auth.logout", { summary: "Signed out" });
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
  // session is now aal2 — a participant's user back to its review (4.4), anyone else home
  redirect(String(formData.get("after") ?? "") === "/lab/confirm" ? "/lab/confirm" : "/");
}


// ── Passwords and account links (plan part 1.5, finding P4.b) ────────────────
// Accept an e-mail link; set a password after an invitation, a reset or a temporary
// password; change one's own; ask for a reset. Supabase holds the password — the
// portal never sees or stores it — and every change is journalled without the
// address. Supabase's own error codes are shown in plain words (authErrorText).

export type PasswordState = { error?: PasswordProblem | "session" | "supabase" | "current" | "totp"; message?: string; sent?: boolean };

const PASSWORD_ERRORS: Record<PasswordProblem, string> = {
  short: "Паролата трябва да е поне 10 знака. · The password must be at least 10 characters.",
  long: "Паролата е твърде дълга. · The password is too long.",
  mismatch: "Двете пароли не са еднакви. · The two passwords differ.",
  "is-email": "Паролата не може да е имейлът. · The password cannot be the e-mail address.",
};

// A session made by an e-mail link (an invitation, a new password, a confirmed
// address) is a sign-in too (1.9) — journalled once the account has a role.
async function journalLinkSignIn(userId: string, email: string, how: string): Promise<void> {
  const role = await resolveLoginRole(email.toLowerCase(), userId).catch(() => null);
  if (role) await journalSignIn(userId, email.toLowerCase(), role, `e-mail link: ${how}`);
}

/** «Продължи» on /auth/confirm: the one-time token is spent HERE, by a POST the
 *  person made — never by merely opening the link. */
export async function acceptLinkAction(formData: FormData): Promise<void> {
  const bad = "/auth/confirmed?error=link";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect(bad);
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  const code = String(formData.get("code") ?? "");
  let dest = bad;
  try {
    const supabase = await createServerSupabase();
    if (tokenHash && isOtpType(type)) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) dest = safeNext(String(formData.get("next") ?? ""), afterLinkDest(type));
      // a link to a shared mailbox makes no session (Реш. 139)
      if (!error && isSharedMailbox(data.user?.email)) { await supabase.auth.signOut({ scope: "local" }); dest = "/login?denied=1"; }
      else if (!error && data.user) await journalLinkSignIn(data.user.id, data.user.email ?? "", type);
    } else if (code) {
      // a PKCE link — its verifier cookie lives only in the browser that asked
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) dest = safeNext(String(formData.get("next") ?? ""), "/auth/confirmed");
      if (!error && isSharedMailbox(data.user?.email)) { await supabase.auth.signOut({ scope: "local" }); dest = "/login?denied=1"; }
      else if (!error && data.user) await journalLinkSignIn(data.user.id, data.user.email ?? "", "link");
    }
  } catch {
    dest = bad;
  }
  redirect(dest);
}

// A laboratory's own request that SUPABASE sends (part 1.8): a new-password link,
// and its «password changed» notice. On record first — the fixed text's key, never
// a link. null: not a laboratory (PTS's team — not a participant); false: refused
// — the lookup failed, too many lately, or no record could be made — and then
// nothing may be sent. Fails closed throughout.
type FixedKey = "password-reset" | "password-changed";
async function recordForLab(email: string, key: FixedKey, kind: string, maxPerHour?: number, userId?: string): Promise<string | null | false> {
  let lab;
  try { lab = await getLabByEmail(email); } catch { return false; }
  if (!lab) return recordForParticipant(email, key, kind, maxPerHour, userId);
  if (maxPerHour) {
    // durable (the record itself), unlike the per-instance limit in front of it
    const n = await recentCount(lab.id, kind, Date.now() - 60 * 60 * 1000).catch(() => Infinity);
    if (n >= maxPerHour) return false;
  }
  const tpl = SUPABASE_TEMPLATES.find((t) => t.key === key)!;
  return (await recordPending({ class: "triggered", kind, labId: lab.id, to: email, subject: tpl.subject, body: tpl.html }, fixedApproval(key))) ?? false;
}

// …and a participant's user of a legal entity (4.4): a message to a participant too, on
// record by its address and its entity — the throttle by the address, as it has no
// laboratory account. Only a login that can receive it (it has a sign-in account): one
// never invited has none, and nothing is sent; an inactive one is refused — no e-mail
// at all (4.4 review). null: not one; false: refused or not recorded — nothing may be sent.
async function recordForParticipant(email: string, key: FixedKey, kind: string, maxPerHour?: number, userId?: string): Promise<string | null | false> {
  let entityId: string | undefined;
  try {
    const u = userId ? await entityUserByAuth(userId, `auth:${userId}`) : null;
    if (u && u.email === email.trim().toLowerCase()) entityId = u.entityId;
    else {
      const f = await entityUserForLogin(email, `auth:${kind}`);
      if (!f || !f.linked) return null;
      if (f.state === "inactive") return false;
      entityId = f.entityId;
    }
  } catch { return false; }
  if (maxPerHour) {
    const n = await recentCountTo(email, kind, Date.now() - 60 * 60 * 1000).catch(() => Infinity);
    if (n >= maxPerHour) return false;
  }
  const tpl = SUPABASE_TEMPLATES.find((t) => t.key === key)!;
  return (await recordPending({ class: "triggered", kind, entityId, to: email, subject: tpl.subject, body: tpl.html }, fixedApproval(key))) ?? false;
}

// After a new password: a laboratory reviews its data (the step 4.4 builds on), a
// team member goes home — or to enrol 2FA first. A participant's user of a legal
// entity has accepted its invitation (invited → active) and goes to review, complete
// and confirm the data PTS entered (4.4, Реш. 145).
async function landingAfterPassword(email: string, from: string, userId: string, byLink: boolean): Promise<string> {
  const pu = await participantUserOf(userId, email, true);
  if (pu) {
    if (pu.state === "invited") {
      // accepted only by a session its invitation's (or a new password's) link made
      if (!byLink) { await (await createServerSupabase()).auth.signOut({ scope: "local" }).catch(() => null); return "/lab/login?invited=1"; }
      const accepted = await acceptEntityUserInvitation(userId, `participant:${pu.id}`).catch(() => null);
      if (!accepted) { await (await createServerSupabase()).auth.signOut({ scope: "local" }).catch(() => null); return "/lab/login?invited=1"; }
      await logAs({ kind: "lab", userId }, "entityuser.accepted", { subject: `entityuser:${pu.id}`, summary: "Invitation accepted — a password set" });
    }
    return "/lab/confirm";
  }
  const role = await resolveLoginRole(email, userId);
  if (role === "lab") return from === "invite" ? "/lab/profile?review=1" : "/lab";
  if (role === "internal") return REQUIRE_2FA ? "/account?enroll=1" : "/";
  // no role: not left signed in with nothing to do (as at the sign-in)
  await (await createServerSupabase()).auth.signOut({ scope: "local" }).catch(() => null);
  return "/login?denied=1";
}

// The «change it first» mark lives in app_metadata, which only the server's key may
// write — cleared here once a password of the person's own is set.
async function clearMustChange(userId: string): Promise<void> {
  const db = getDb();
  if (db) await db.auth.admin.updateUserById(userId, { app_metadata: { must_change_password: false } }).catch(() => null);
}

/** An account with an authenticator passes its code before its password changes
 *  (Supabase refuses otherwise — insufficient_aal): the code step of /auth/set-password. */
export async function verifyTotpForPasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "totp", message: "Въведете 6-цифрения код. · Enter the 6-digit code." };
  const supabase = await createServerSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { error: "totp", message: authErrorText(undefined) };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
  if (error) return { error: "totp", message: "Кодът не е верен. · The code is not right." };
  redirect(`/auth/set-password?from=${encodeURIComponent(String(formData.get("from") ?? ""))}`);
}

export async function setPasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await getSessionUser();
  if (!session) return { error: "session", message: "Връзката е изтекла — поискайте нова. · The link has expired — ask for a new one." };
  if (session.needsAal2) return { error: "totp", message: authErrorText("insufficient_aal") };
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("repeat") ?? ""), session.email);
  if (problem) return { error: problem, message: PASSWORD_ERRORS[problem] };
  // Supabase tells a laboratory its password changed: on record first (part 1.8)
  // how this session was made — read before the password changes (4.4 review)
  const byLink = await cameByEmailLink();
  const notice = await recordForLab(session.email, "password-changed", "password.changed", undefined, session.userId);
  if (notice === false) return { error: "supabase", message: "Не успяхме да запишем промяната — опитайте отново. · The change could not be recorded — try again." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (notice) await settle(notice, !error, error?.message);
  if (error) return { error: "supabase", message: authErrorText(error.code) };
  if (session.mustChangePassword) await clearMustChange(session.userId);
  await logActivity("auth.password_set", { summary: "Password set (invitation, reset or temporary password)" });
  redirect(await landingAfterPassword(session.email, String(formData.get("from") ?? ""), session.userId, byLink));
}

// Is this the current password? Checked on a throw-away client, so the person's own
// session (and its 2FA level) is untouched; the extra session it makes is ended at once.
async function currentPasswordIsRight(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !password) return false;
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (!error) await probe.auth.signOut({ scope: "local" }).catch(() => null);
  return !error;
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await getSessionUser();
  if (!session) return { error: "session", message: "Влезте отново. · Sign in again." };
  if (session.needsAal2) return { error: "totp", message: authErrorText("insufficient_aal") };
  // the current password first: a session left open is not enough to take the account
  if (!(await currentPasswordIsRight(session.email, String(formData.get("current") ?? "")))) {
    return { error: "current", message: authErrorText("invalid_credentials") };
  }
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("repeat") ?? ""), session.email);
  if (problem) return { error: problem, message: PASSWORD_ERRORS[problem] };
  // Supabase tells a laboratory its password changed: on record first (part 1.8)
  const notice = await recordForLab(session.email, "password-changed", "password.changed", undefined, session.userId);
  if (notice === false) return { error: "supabase", message: "Не успяхме да запишем промяната — опитайте отново. · The change could not be recorded — try again." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (notice) await settle(notice, !error, error?.message);
  if (error) return { error: "supabase", message: authErrorText(error.code) };
  if (session.mustChangePassword) await clearMustChange(session.userId);
  await logActivity("auth.password_changed", { summary: "Password changed by its holder" });
  return { message: "Паролата е сменена. · The password is changed." };
}

// «Forgot password»: one answer, whatever the address — the e-mail goes out AFTER the
// response (next/server after()), so not even the timing tells whether an account
// exists. A little rate limit per sender and per address (per server instance; a
// durable throttle comes with the journal's own table, 1.9). In the test
// environment only PTS's own mailboxes get a link (Supabase sends it itself, 1.2).
const WINDOW_MS = 15 * 60 * 1000;
const resetHits = new Map<string, number[]>();
function allowed(key: string, max: number): boolean {
  const now = Date.now();
  if (resetHits.size > 5000) {
    for (const [k, v] of resetHits) if (v.every((t) => now - t >= WINDOW_MS)) resetHits.delete(k); // expired only
  }
  const hits = (resetHits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= max) return false;
  hits.push(now);
  resetHits.set(key, hits);
  return true;
}

export async function requestPasswordResetAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const done: PasswordState = { sent: true };
  if (String(formData.get("website") ?? "")) return done; // the honeypot
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "Въведете имейл. · Enter an e-mail address." };
  const h = await headers();
  // the address as the platform gives it, counted in the database (the security sweep, SD-1: each
  // request opens the identity store and writes the journal — the count lived in one server's memory)
  const limit = await publicFormLimit("password_reset", requestAddress(h));
  if (limit === "address") return done; // this address's ceiling: the same answer as any address
  // everyone's ceiling: said — nothing about any address in it; never «sent» when nothing goes (R2S-4)
  if (limit === "all") return { message: "Твърде много заявки в момента — опитайте след малко. · Too many requests right now — try again in a while." };
  // a shared mailbox gets no link — and the same answer as any address (Реш. 139)
  if (!allowed(`to:${email}`, 3) || !mailAllowedHere(email) || isSharedMailbox(email)) return done;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origin = siteOrigin(h.get("host") ?? "", h.get("x-forwarded-proto") ?? "https");
  if (!url || !key) return done;
  after(async () => {
    // a laboratory's reset is a message to a participant (part 1.8): on record — the
    // fixed text's key, never a link — before Supabase sends it; no record, no e-mail
    // a laboratory's link: on record first, durably throttled, fail-closed
    const recordId = await recordForLab(email, "password-reset", "password.reset", 3);
    if (recordId === false) return;
    // a cookie-less client: the link carries a token hash (the template), not a PKCE code
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await client.auth.resetPasswordForEmail(email, origin ? { redirectTo: `${origin}${RESET_RETURN}` } : undefined).catch((e) => ({ error: e as Error }));
    if (recordId) await settle(recordId, !r.error, r.error?.message);
    await logActivity("auth.reset_requested", { summary: "Password reset requested" }).catch(() => null);
  });
  return done;
}
