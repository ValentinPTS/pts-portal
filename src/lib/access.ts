import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_ENABLED, REQUIRE_2FA } from "./auth";
import { getRoleContext, canManagePeople } from "./roles";
import { maySection, type SectionKey } from "./admin-nav";
import { dbMode } from "./supabase";
import { personRoles } from "./scheme-roles";
import { effectiveRoles, type Capability, type PersonRoles } from "./role-model";
import { authorize, authorizeAnywhere, parseModelPersona, seesOrder, quickNoOrder, NONE, DEV_MODEL_COOKIE, type Viewer } from "./access-matrix";
import { isRestrictedDoc, ORDER_DOC } from "./documents";
import { currentDesignation } from "./processing-roles";

export { authorize, authorizeAnywhere, schemesFor, parseModelPersona, seesOrder, DEV_MODEL_COOKIE, type Viewer } from "./access-matrix";

// The access matrix, ENFORCED (plan part 2.4) — the one place a page or an action
// asks «may this person do this, in this scheme?». The rights sit on the role
// (lib/role-model.ts, 2.1): a person has the rights of the roles they hold —
// permanent, or from the scheme's Order — and nothing else. So:
//   • who is behind a code: the scheme manager and the coding expert, in THEIR
//     scheme only (Реш. 93); the quality manager never (Реш. 114); the head only
//     with a role from the Order (D5);
//   • the statistics and the technical expert: codes and results (D18);
//   • the software administrator: the technical side only (П 7.4.1 т. 3).
// The earlier roles (manager / staff / auditor) no longer grant scheme work. One
// stays outside the model: the AUDITOR — read-only codes, results and the journal
// everywhere, for an assessor; never a name.
//
// The pure decisions (authorize, authorizeAnywhere, schemesFor) are
// lib/access-matrix.ts, tested as they are; this module reads the request.

async function devModel(): Promise<PersonRoles | null> {
  if (process.env.NODE_ENV !== "development" || AUTH_ENABLED) return null;
  try {
    const v = (await cookies()).get(DEV_MODEL_COOKIE)?.value;
    return v ? parseModelPersona(decodeURIComponent(v)) : null;
  } catch {
    return null; // outside a request
  }
}

/** Who is asking, as the role model sees them. Memoized per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const ctx = await getRoleContext();
  if (!ctx.authEnabled) {
    // the open build is a LOCAL thing: on a deployment, login off grants nothing
    // (a preview or a production with the setting missing — fail closed, as 1.11)
    if (dbMode().strict) return { email: null, roles: NONE, build: false, auditor: false, lab: false };
    const model = await devModel();
    if (model) return { email: null, roles: effectiveRoles(model), build: false, auditor: false, lab: false };
    if (ctx.persona && ctx.role !== "manager") return { email: null, roles: NONE, build: false, auditor: ctx.role === "auditor", lab: ctx.role === "lab" };
    return { email: null, roles: NONE, build: true, auditor: false, lab: false };
  }
  if (!ctx.email || !ctx.role) return { email: ctx.email, roles: NONE, build: false, auditor: false, lab: false };
  if (ctx.role === "lab") return { email: ctx.email, roles: NONE, build: false, auditor: false, lab: true };
  // the auditor stays outside the model: codes, results and the journal — never more,
  // whatever roles were given to that address
  if (ctx.role === "auditor") return { email: ctx.email, roles: NONE, build: false, auditor: true, lab: false };
  return { email: ctx.email, roles: await personRoles(ctx.email), build: false, auditor: false, lab: false };
});

/** May the person asking do this, in this scheme? */
export async function mayNow(cap: Capability, schemeId?: string): Promise<boolean> {
  return authorize(await getViewer(), cap, schemeId);
}

export async function mayAnywhereNow(cap: Capability): Promise<boolean> {
  return authorizeAnywhere(await getViewer(), cap);
}

// The gates. Signed in (a temporary password changed first, 1.5; 2FA where it is
// required), one of PTS's people, and the capability — or the request goes no further.
async function gate(ok: (v: Viewer) => boolean): Promise<void> {
  const ctx = await getRoleContext();
  if (ctx.authEnabled) {
    if (!ctx.email) redirect("/login");
    if (ctx.mustChangePassword) redirect("/auth/set-password?must=1");
    if (!ctx.role || ctx.role === "lab") redirect("/login?denied=1");
    if (REQUIRE_2FA && !ctx.aal2) redirect("/account?enroll=1");
  }
  if (!ok(await getViewer())) redirect("/login?denied=1");
}

export async function requireCap(cap: Capability, schemeId?: string): Promise<void> {
  return gate((v) => authorize(v, cap, schemeId));
}

/** …one of these, in this scheme (results: entered by the coding expert, processed by
 *  the statistics expert — one form, 2.4). */
export async function requireOneOf(caps: Capability[], schemeId: string): Promise<void> {
  return gate((v) => caps.some((c) => authorize(v, c, schemeId)));
}

export async function requireCapAnywhere(cap: Capability): Promise<void> {
  return gate((v) => authorizeAnywhere(v, cap));
}

/** May the person asking open this document of this scheme (asked once the scheme
 *  itself is open to them)? F 7.2.1-6 names who is behind each code: who sees names
 *  there (part 0.2). The Order: the staff it assigns roles to — the scheme's roles
 *  and the three designated for processing — and the head who issues it (Реш. 149).
 *  It never reaches a participant at all (lib/doc-release SENDABLE_DOCS). */
export async function mayViewDoc(docKey: string, schemeId: string): Promise<boolean> {
  if (isRestrictedDoc(docKey) && !(await mayNow("names.view", schemeId))) return false;
  if (docKey === ORDER_DOC) {
    const v = await getViewer();
    if (authorize(v, "order.view", schemeId)) return true;
    if (quickNoOrder(v)) return false; // nobody else but a quality manager designated to review
    try {
      return seesOrder(v, schemeId, await currentDesignation(schemeId));
    } catch {
      return false; // the designations unreadable: closed, not an error page
    }
  }
  return true;
}

export async function requireDocView(docKey: string, schemeId: string): Promise<void> {
  if (!(await mayViewDoc(docKey, schemeId))) redirect("/login?denied=1");
}

/** A section of the administrative panel (2.7): the rule the panel shows it by
 *  (lib/admin-nav.ts) — signed in first, as every gate. */
export async function requireSection(key: SectionKey): Promise<void> {
  const managesPeople = await canManagePeople(await getRoleContext());
  return gate((v) => maySection(key, v, managesPeople));
}

