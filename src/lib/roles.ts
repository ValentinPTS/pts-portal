import { cache } from "react";
import { redirect } from "next/navigation";
import { AUTH_ENABLED, REQUIRE_2FA, getSessionUser, isOwnerEmail } from "./auth";
import { getStaffByEmail } from "./staff";
import { getLabByEmail } from "./labs";
import type { StaffRole } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Role resolution (Phase RT1). THE single place the app asks "what is this user
// allowed to do?". Effective roles, highest → lowest authority:
//   • manager  — can reveal real names behind codes, manage users, issue reports
//   • staff    — full work, by code only
//   • auditor  — read-only, by code only
//   • lab      — own participations only (separate account type; see labs.ts)
//
// While login is OFF (AUTH_ENABLED !== "true") the whole app is open for building,
// so the single local user acts as a MANAGER — mirroring requireOwner() being a
// no-op in auth.ts. The guards below become real the moment auth is switched on.
// OWNER_EMAILS founders are ALWAYS managers, so they can never be locked out.
// ─────────────────────────────────────────────────────────────────────────────

export type EffectiveRole = StaffRole | "lab";

export interface RoleContext {
  role: EffectiveRole | null;
  email: string | null;
  aal2: boolean; // 2FA satisfied this session
  authEnabled: boolean;
}

// Memoized per request (React cache): the layout, page guards and the name-guard
// in the print route share one resolution round-trip.
export const getRoleContext = cache(async (): Promise<RoleContext> => {
  if (!AUTH_ENABLED) return { role: "manager", email: null, aal2: true, authEnabled: false };

  const session = await getSessionUser();
  if (!session?.email) return { role: null, email: null, aal2: false, authEnabled: true };
  const email = session.email;

  // 1) Founders (OWNER_EMAILS) — always managers, can never be locked out.
  if (isOwnerEmail(email)) return { role: "manager", email, aal2: session.aal2, authEnabled: true };
  // 2) Internal staff users (manager / staff / auditor), active only.
  const staff = await getStaffByEmail(email);
  if (staff && staff.status === "active") return { role: staff.role, email, aal2: session.aal2, authEnabled: true };
  // 3) Laboratory accounts.
  const lab = await getLabByEmail(email);
  if (lab && lab.status === "active") return { role: "lab", email, aal2: session.aal2, authEnabled: true };
  // 4) Signed in but unrecognised — no role.
  return { role: null, email, aal2: session.aal2, authEnabled: true };
});

export async function getCurrentRole(): Promise<EffectiveRole | null> {
  return (await getRoleContext()).role;
}

// Only a manager may reveal the real name behind a participant code (§4.2). Staff
// and auditors work purely by code. Pure (no I/O) so renderers can call it.
export function canRevealNames(role: EffectiveRole | null): boolean {
  return role === "manager";
}

export async function canRevealNamesNow(): Promise<boolean> {
  return canRevealNames(await getCurrentRole());
}

// Gate for manager-only pages/actions (Users & roles, name reveal, report issuing).
// No-op while auth is off; redirects (never returns) on failure when on.
export async function requireManager(): Promise<void> {
  if (!AUTH_ENABLED) return;
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.role !== "manager") redirect("/login?denied=1");
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}

// Gate for READING the provider work area — manager, staff or auditor. Labs use
// /lab and are bounced. (Auditors may read everything; writes are blocked by
// requireWriter below.)
export async function requireStaff(): Promise<void> {
  if (!AUTH_ENABLED) return;
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (!ctx.role || ctx.role === "lab") redirect("/login?denied=1");
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}

// Gate for WRITE actions — manager or staff only. Auditors are strictly read-only
// (bounced here), labs use /lab. This is THE boundary that keeps an auditor from
// changing anything, enforced inside each write Server Action (the proxy alone is
// not sufficient — see the Next "proxy" docs). No-op while auth is off.
export async function requireWriter(): Promise<void> {
  if (!AUTH_ENABLED) return;
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.role !== "manager" && ctx.role !== "staff") redirect("/login?denied=1");
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}
