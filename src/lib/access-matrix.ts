import {
  can, canAnywhere, schemesWhere, PERMANENT_ROLES, SCHEME_ROLES,
  type Capability, type PersonRoles, type PermanentRole, type SchemeRole,
} from "./role-model";

// The access matrix's decisions (plan part 2.4) — pure, so the role × capability
// matrix is tested as it is. The request side (who is asking, the gates) is
// lib/access.ts.

export interface Viewer {
  email: string | null;
  roles: PersonRoles;
  build: boolean; // login off, no persona: the single local builder — everything open
  auditor: boolean;
  lab: boolean;
}

export const NONE: PersonRoles = { permanent: [], schemes: {} };
const AUDITOR_RIGHTS: readonly Capability[] = ["codes.view", "results.read", "journal.read"];

export function authorize(v: Viewer, cap: Capability, schemeId?: string): boolean {
  if (v.lab) return false; // a laboratory has its own portal, never this matrix
  if (v.build) return true;
  if (v.auditor && AUDITOR_RIGHTS.includes(cap)) return true;
  return can(v.roles, cap, schemeId);
}

/** …somewhere: by a permanent role or a role in any scheme (the library, the
 *  laboratory accounts, the journal page filtered to one's schemes). */
export function authorizeAnywhere(v: Viewer, cap: Capability): boolean {
  if (v.lab) return false;
  if (v.build) return true;
  if (v.auditor && AUDITOR_RIGHTS.includes(cap)) return true;
  return canAnywhere(v.roles, cap);
}

/** The schemes in which this person may do this: all of them, or these. */
export function schemesFor(v: Viewer, cap: Capability): "all" | string[] {
  if (v.lab) return [];
  if (v.build || (v.auditor && AUDITOR_RIGHTS.includes(cap)) || can(v.roles, cap)) return "all";
  return schemesWhere(v.roles, cap);
}

/** May this person read the scheme's Order (Реш. 149, 2.6)? The staff it assigns
 *  roles to: its scheme roles (order.view), and the head who issues it. Of the three
 *  designated from it to process, review and approve (2.5), the processor and the
 *  approver hold a role of the scheme anyway; the reviewer may be the quality manager
 *  on the permanent role — who reads it while designated, and while still the quality
 *  manager. Never the auditor, a laboratory or the software administrator. */
export function seesOrder(v: Viewer, schemeId: string, designated: { schemeId: string; reviewer: string } | null): boolean {
  if (authorize(v, "order.view", schemeId)) return true;
  return quickNoOrder(v) ? false : !!designated && designated.schemeId === schemeId && designated.reviewer === v.email!.trim().toLowerCase();
}

/** Who cannot read an Order beyond their own roles' — known without asking for the
 *  scheme's designation: only a quality manager reviewing it can. */
export function quickNoOrder(v: Viewer): boolean {
  return !v.email || v.auditor || v.lab || !v.roles.permanent.includes("quality");
}

// ── development personas for the model's roles (login off, `next dev` only) ──
// /dev/persona?model=quality  ·  ?model=scheme_manager@26-01-T-1,quality — so every
// role's view can be checked without signing in (parts 1.4, 2.4, 2.9).
export const DEV_MODEL_COOKIE = "pts_dev_model";

export function parseModelPersona(v: string): PersonRoles | null {
  const out: PersonRoles = { permanent: [], schemes: {} };
  for (const part of v.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [role, scheme] = part.split("@");
    if (!scheme && (PERMANENT_ROLES as readonly string[]).includes(role)) out.permanent.push(role as PermanentRole);
    else if (scheme && /^[A-Za-z0-9._-]{1,64}$/.test(scheme) && (SCHEME_ROLES as readonly string[]).includes(role)) (out.schemes[scheme] ??= []).push(role as SchemeRole);
    else return null;
  }
  return out.permanent.length || Object.keys(out.schemes).length ? out : null;
}

