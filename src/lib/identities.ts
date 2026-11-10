import { cookies } from "next/headers";
import { getRoleContext, DEV_ROLE_COOKIE } from "./roles";
import { mayNow, DEV_MODEL_COOKIE } from "./access";
import { withIdentities, withoutIdentity } from "./participants";
import type { CodedParticipant, Participant } from "./types";

// Opening the identity store for a person at PTS (plan parts 2.3, 2.4). The role is
// checked here, by the role model: only the scheme manager and the coding expert of
// THIS scheme see who is behind its codes (Реш. 93) — anyone else gets the codes with
// the identity left out, and nothing is opened. Every opening is recorded by
// the store (identity.openings); the page journals what it showed (names.viewed, 1.9).

/** Who is acting, for the record: the signed-in address, or the build persona. */
export async function actorNow(): Promise<string> {
  const ctx = await getRoleContext();
  return ctx.email ?? (ctx.authEnabled ? "unknown" : "build");
}

/** Who is acting, as a key that tells two people apart (7.7: a SECOND person checks): the login's
 *  e-mail; in development without a login, the persona — never one «build» for every persona. */
export async function actorKeyNow(): Promise<string> {
  const ctx = await getRoleContext();
  if (ctx.email) return ctx.email.toLowerCase();
  if (ctx.authEnabled) return "unknown";
  // the personas exist in development only — as the role model honours them (review)
  if (process.env.NODE_ENV !== "development") return "build";
  const jar = await cookies();
  return `build:${jar.get(DEV_ROLE_COOKIE)?.value ?? ""}:${jar.get(DEV_MODEL_COOKIE)?.value ?? ""}`;
}

/** These participations with their names — for a viewer who may see them. */
export async function namesFor(schemeId: string, coded: CodedParticipant[], purpose: "names.view" | "dispatch" | "export" = "names.view"): Promise<Participant[]> {
  if (!(await mayNow("names.view", schemeId))) return coded.map(withoutIdentity);
  const ctx = await getRoleContext();
  return withIdentities(coded, schemeId, { actor: ctx.email ?? (ctx.authEnabled ? "unknown" : "build"), purpose });
}
