// A legal entity's users (plan part 4.3; Zadanie §8 «Потребител», §6; Реш. 112; К5).
// Pure.
//
// A user is a person with a login e-mail, a name, a position — free text, information
// only, no rights (Реш. 112: «Роля в организацията» … «не дава права»), «ръководител на
// лабораторията» among the usual ones — an optional phone, and one of two roles: the
// profile's ADMINISTRATOR or a USER. Every user may submit results (the receipt records
// which account did). Every user sees all the entity's laboratories (К5). Two-factor
// sign-in is the user's to turn on, or the administrator's to require.
//
// Identity data, in the identity store (migration 0033); never deleted — «неактивен» is
// the end; an entity keeps at least one active administrator. The sign-in itself is
// made at the invitation (4.4): until then a user is «поканен».

export type EntityUserRole = "admin" | "user";
export type EntityUserState = "invited" | "active" | "inactive";
export interface EntityUser {
  id: string;
  entityId: string;
  email: string;
  name: string;
  /** free text, information only — never a right (Реш. 112) */
  position: string;
  phone: string;
  role: EntityUserRole;
  /** two-factor sign-in required for this user */
  twoFactorRequired: boolean;
  /** a recipient of the laboratories' notices by e-mail (4.6, N28) — each person */
  receivesNotices: boolean;
  state: EntityUserState;
  /** the sign-in account, once the invitation is accepted (4.4) */
  authUserId?: string;
  /** memory only — the sign-in accounts a changed login left behind (0037 keeps them in the database) */
  pastAuthUserIds?: string[];
  createdAt: string;
  createdBy: string;
}

export const USER_LIMITS = { name: 120, position: 120, phone: 40, email: 254 };
export const POSITION_SUGGESTIONS = [
  { bg: "Ръководител на лабораторията", en: "Head of the laboratory" },
  { bg: "Отговорник по качеството", en: "Quality manager" },
  { bg: "Изпитател", en: "Test operator" },
  { bg: "Метролог", en: "Metrologist" },
];
export type EntityUserProblem = "email" | "name" | "position" | "phone" | "role" | "taken" | "staff" | "lab-account" | "last-admin" | "entity";

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, " ").replace(/\s+/g, " ").trim();
import { emailKey, emailReads } from "./email-address";
export { emailKey };

export function readEntityUser(input: { email: unknown; name: unknown; position: unknown; phone: unknown; role: unknown; twoFactorRequired: unknown; receivesNotices?: unknown }):
  { ok: true; fields: Pick<EntityUser, "email" | "name" | "position" | "phone" | "role" | "twoFactorRequired" | "receivesNotices"> } | { ok: false; problem: EntityUserProblem } {
  const email = emailKey(clean(input.email));
  if (!emailReads(email)) return { ok: false, problem: "email" };
  const name = clean(input.name);
  if (!name || [...name].length > USER_LIMITS.name) return { ok: false, problem: "name" };
  const position = clean(input.position);
  if ([...position].length > USER_LIMITS.position) return { ok: false, problem: "position" };
  const phone = clean(input.phone);
  if ([...phone].length > USER_LIMITS.phone || (phone && !/^[+()0-9 .\-/]{5,40}$/.test(phone))) return { ok: false, problem: "phone" };
  const role = clean(input.role) || "user";
  if (role !== "admin" && role !== "user") return { ok: false, problem: "role" };
  const yes = (v: unknown) => v === true || v === "on" || v === "1" || v === "true";
  // receives the notices: yes unless said otherwise (a form's unticked box is said)
  return { ok: true, fields: { email, name, position, phone, role, twoFactorRequired: yes(input.twoFactorRequired), receivesNotices: input.receivesNotices === undefined ? true : yes(input.receivesNotices) } };
}

/** Would this change leave the entity without an active administrator? */
export function leavesNoAdmin(users: readonly Pick<EntityUser, "id" | "role" | "state">[], change: { id: string; role?: EntityUserRole; state?: EntityUserState }): boolean {
  const after = users.map((u) => (u.id === change.id ? { ...u, ...(change.role ? { role: change.role } : {}), ...(change.state ? { state: change.state } : {}) } : u));
  const hadAdmin = users.some((u) => u.role === "admin" && u.state !== "inactive");
  return hadAdmin && !after.some((u) => u.role === "admin" && u.state !== "inactive");
}

export const ENTITY_USER_PROBLEM_TEXT: Record<EntityUserProblem, { bg: string; en: string }> = {
  email: { bg: "e-mail адресът за вход не се разчита", en: "the login e-mail does not read" },
  name: { bg: "името е задължително, до 120 знака", en: "the name is required, 120 characters at most" },
  position: { bg: "длъжността е до 120 знака", en: "the position is 120 characters at most" },
  phone: { bg: "телефонът не се разчита", en: "the phone does not read" },
  role: { bg: "ролята е администратор на профила или потребител", en: "the role is profile administrator or user" },
  taken: { bg: "този e-mail вече е вход на друг потребител", en: "this e-mail is already another user's login" },
  staff: { bg: "този e-mail е на служител на PTS — участникът има свой вход", en: "this e-mail is a PTS staff member's — a participant has a login of its own" },
  "lab-account": { bg: "този e-mail е вход на лабораторен акаунт от досегашния портал", en: "this e-mail is the login of a laboratory account of the earlier portal" },
  "last-admin": { bg: "юридическото лице остава поне с един активен администратор на профила — първо назначете друг", en: "the legal entity keeps at least one active profile administrator — make another one first" },
  entity: { bg: "юридическото лице не е намерено или е неактивно", en: "the legal entity is not found or is inactive" },
};

export const ROLE_LABEL: Record<EntityUserRole, { bg: string; en: string }> = {
  admin: { bg: "администратор на профила", en: "profile administrator" },
  user: { bg: "потребител", en: "user" },
};
export const USER_STATE_LABEL: Record<EntityUserState, { bg: string; en: string }> = {
  invited: { bg: "поканен", en: "invited" },
  active: { bg: "активен", en: "active" },
  inactive: { bg: "неактивен", en: "inactive" },
};

/** What changed, for the journal — by name, never the values (identity). */
export function entityUserDiff(before: Partial<EntityUser>, after: Partial<EntityUser>): string[] {
  const keys: (keyof EntityUser)[] = ["email", "name", "position", "phone", "role", "twoFactorRequired", "receivesNotices"];
  return keys.filter((k) => k in after && JSON.stringify(before[k] ?? "") !== JSON.stringify(after[k] ?? ""));
}
