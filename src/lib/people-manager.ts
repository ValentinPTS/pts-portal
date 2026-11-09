import { getStaffByEmail } from "./staff";
import { isProviderHead, providerHeadEmails, isFounder } from "./provider-people";

// Who manages PTS's own people (plan part 2.2, Реш. 141) — kept apart from roles.ts
// so it needs no request and is tested as it is.
//
// The head of the PT provider does, as the role model has it (2.1): named in
// PROVIDER_HEAD_EMAILS, and not the software administrator (effectiveRoles). So that
// PTS is never locked out of its own people — a head named with no account, made
// software administrator, deactivated, or only a shared address named — the founders
// keep it while NO head can act. The 2FA reset and the release authorisation do not
// fall back: they fail closed (1.6, 1.11).

type Env = Record<string, string | undefined>;
export type Who = { authEnabled: boolean; persona: boolean; role: string | null; email: string | null };

/** A deployment (Vercel, or a run marked strict) — where login off grants NOTHING:
 *  the open mode is only the developer's own computer (1.11, 2.4). The same test as
 *  lib/supabase.ts ON_DEPLOYMENT. */
export function onDeployment(env: Env = process.env): boolean {
  return !!env.VERCEL || !!env.VERCEL_ENV || env.PTS_STRICT_DB === "1";
}

/** The head as the role model sees them: named, and not the software administrator. */
export async function isEffectiveHead(email: string | null | undefined, env: Env = process.env): Promise<boolean> {
  if (!email || !isProviderHead(email, env)) return false;
  return (await getStaffByEmail(email.trim().toLowerCase()))?.permanentRole !== "software_admin";
}

/** Can any head act at all — an effective head with an account (a founder, or an
 *  active team member)? */
export async function someHeadCanAct(env: Env = process.env): Promise<boolean> {
  for (const h of providerHeadEmails(env)) {
    if (!(await isEffectiveHead(h, env))) continue;
    if (isFounder(h, env) || (await getStaffByEmail(h))?.status === "active") return true;
  }
  return false;
}

export async function mayManagePeople(c: Who, env: Env = process.env): Promise<boolean> {
  // login off: the manager persona — on the developer's computer only
  if (!c.authEnabled) return !onDeployment(env) && (!c.persona || c.role === "manager");
  if (!c.email || !c.role || c.role === "lab") return false;
  if (await isEffectiveHead(c.email, env)) return true;
  return isFounder(c.email, env) && !(await someHeadCanAct(env));
}
