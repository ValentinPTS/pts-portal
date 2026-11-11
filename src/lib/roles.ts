import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_ENABLED, REQUIRE_2FA, getSessionUser, isOwnerEmail } from "./auth";
import { getStaffByEmail } from "./staff";
import { getLabByEmail } from "./labs";
import { getDb } from "./supabase";
import { isTestEnvironment } from "./environment";
import { mayManagePeople, onDeployment } from "./people-manager";
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
  persona: boolean; // a development persona is acting (see devPersona)
  mustChangePassword?: boolean; // a temporary password must be changed first (1.5)
}

// Development personas (plan part 1.4). While login is OFF and only under
// `next dev`, a `pts_dev_role` cookie makes the single local user act as staff,
// auditor or a laboratory instead of manager, so name-hiding, the page guards and the
// laboratory's own screens can be checked without signing in. Set it through
// /dev/persona. Ignored in production builds and whenever auth is on.
export const DEV_ROLE_COOKIE = "pts_dev_role";
// a laboratory persona also names WHICH laboratory (part 1.4) — by its id, resolved
// on the server exactly like a signed-in laboratory, so it sees only its own data
export const DEV_LAB_COOKIE = "pts_dev_lab";
// …or WHICH participant's user of a legal entity (4.4) — by its id, in memory only
export const DEV_PARTICIPANT_COOKIE = "pts_dev_participant";
const DEV_ROLES: readonly EffectiveRole[] = ["manager", "staff", "auditor", "lab"];

const devOnly = () => process.env.NODE_ENV === "development" && !AUTH_ENABLED;

async function devPersona(): Promise<EffectiveRole | null> {
  if (!devOnly()) return null;
  try {
    const v = (await cookies()).get(DEV_ROLE_COOKIE)?.value;
    return DEV_ROLES.includes(v as EffectiveRole) ? (v as EffectiveRole) : null;
  } catch {
    return null; // outside a request (build, scripts) — no persona
  }
}

/** Is a laboratory persona acting? Then the laboratory session is the persona's or
 *  none — never a leftover real sign-in on localhost. */
export async function devLabPersonaActive(): Promise<boolean> {
  return devOnly() && (await devPersona()) === "lab";
}

/** The laboratory a development persona acts as — null on the real portal, when
 *  login is on, or when the persona is not a laboratory. Only with no database or
 *  in the test environment: a local server on the REAL database never acts as one
 *  of its real laboratories. */
export async function devPersonaLabId(): Promise<string | null> {
  if (!(await devLabPersonaActive())) return null;
  if (getDb() && !isTestEnvironment()) return null;
  try {
    return (await cookies()).get(DEV_LAB_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

/** The participant's user a development persona acts as (4.4) — in memory only, with
 *  no database at all. */
export async function devPersonaParticipantId(): Promise<string | null> {
  if (!(await devLabPersonaActive())) return null;
  if (getDb()) return null; // memory only — never a database's user, not even the test one (4.4 review)
  try {
    return (await cookies()).get(DEV_PARTICIPANT_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

// Memoized per request (React cache): the layout, page guards and the name-guard
// in the print route share one resolution round-trip.
export const getRoleContext = cache(async (): Promise<RoleContext> => {
  if (!AUTH_ENABLED) {
    const persona = await devPersona();
    return { role: persona ?? "manager", email: null, aal2: true, authEnabled: false, persona: persona !== null };
  }

  const session = await getSessionUser();
  if (!session?.email) return { role: null, email: null, aal2: false, authEnabled: true, persona: false };
  const email = session.email;

  // 1) Founders (OWNER_EMAILS) — always managers, can never be locked out.
  if (isOwnerEmail(email)) return { role: "manager", email, aal2: session.aal2, authEnabled: true, persona: false, mustChangePassword: session.mustChangePassword };
  // 2) Internal staff users (manager / staff / auditor), active only.
  const staff = await getStaffByEmail(email);
  if (staff && staff.status === "active") return { role: staff.role, email, aal2: session.aal2, authEnabled: true, persona: false, mustChangePassword: session.mustChangePassword };
  // 3) Laboratory accounts.
  const lab = await getLabByEmail(email);
  if (lab && lab.status === "active") return { role: "lab", email, aal2: session.aal2, authEnabled: true, persona: false, mustChangePassword: session.mustChangePassword };
  // 4) Signed in but unrecognised — no role.
  return { role: null, email, aal2: session.aal2, authEnabled: true, persona: false };
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

// While auth is off the guards are open — except that a development persona's
// role is enforced, so a staff persona is refused exactly where staff would be.
async function personaGate(allowed: readonly EffectiveRole[]): Promise<void> {
  // login off on a deployment (a preview, or production with the setting missing):
  // nothing opens — the open mode is the developer's own computer (1.11, 2.4)
  if (onDeployment()) redirect("/login?denied=1");
  const ctx = await getRoleContext();
  if (ctx.persona && !allowed.includes(ctx.role as EffectiveRole)) redirect(ctx.role === "lab" ? "/login?denied=1" : "/denied");
}

// Gate for manager-only pages/actions (Users & roles, name reveal, report issuing).
// While auth is off: open on the developer's computer only, closed on a deployment;
// redirects (never returns) on failure when on.
export async function requireManager(): Promise<void> {
  if (!AUTH_ENABLED) return personaGate(["manager"]);
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.mustChangePassword) redirect("/auth/set-password?must=1"); // a temporary password first (1.5)
  if (ctx.role !== "manager") redirect(ctx.role && ctx.role !== "lab" ? "/denied" : "/login?denied=1"); // UR-1
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}

// PTS's own people — who they are, their permanent roles and, from the Order, their
// roles in each scheme — are managed by the head of the PT provider (part 2.2, Реш.
// 141; the `people.manage` right of the role model, 2.1); the founders only while no
// head can act (lib/people-manager.ts). While login is off: the manager persona.
export async function canManagePeople(ctx?: RoleContext): Promise<boolean> {
  return mayManagePeople(ctx ?? (await getRoleContext()));
}

export async function requirePeopleManager(): Promise<void> {
  if (!AUTH_ENABLED) return personaGate(["manager"]);
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.mustChangePassword) redirect("/auth/set-password?must=1"); // a temporary password first (1.5)
  if (!(await canManagePeople(ctx))) redirect(ctx.role && ctx.role !== "lab" ? "/denied" : "/login?denied=1"); // UR-1
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}

// Gate for READING the provider work area — manager, staff or auditor. Labs use
// /lab and are bounced. (Auditors may read everything; writes are blocked by
// requireWriter below.)
export async function requireStaff(): Promise<void> {
  if (!AUTH_ENABLED) return personaGate(["manager", "staff", "auditor"]);
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.mustChangePassword) redirect("/auth/set-password?must=1"); // a temporary password first (1.5)
  if (!ctx.role || ctx.role === "lab") redirect("/login?denied=1");
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}

// Gate for WRITE actions — manager or staff only. Auditors are strictly read-only
// (bounced here), labs use /lab. This is THE boundary that keeps an auditor from
// changing anything, enforced inside each write Server Action (the proxy alone is
// not sufficient — see the Next "proxy" docs). While auth is off: open locally only.
export async function requireWriter(): Promise<void> {
  if (!AUTH_ENABLED) return personaGate(["manager", "staff"]);
  const ctx = await getRoleContext();
  if (!ctx.email) redirect("/login");
  if (ctx.mustChangePassword) redirect("/auth/set-password?must=1"); // a temporary password first (1.5)
  if (ctx.role !== "manager" && ctx.role !== "staff") redirect(ctx.role && ctx.role !== "lab" ? "/denied" : "/login?denied=1"); // UR-1
  if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
}
