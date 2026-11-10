// Registration and joining (plan part 9.1; Zadanie §8; Реш. 112, 152; К23). Pure.
//
// The public registration carries the three levels at once (Phase 4): the LEGAL ENTITY (its official
// e-mail, where the notices go — К23; its МОЛ; its language), its first LABORATORY (the name on the
// accreditation certificate, the delivery address) and the PERSON registering, who becomes the
// profile's ADMINISTRATOR. Each level is read by its own Phase 4 reader — one set of rules, whoever
// types the data.
//
// Every submission ends on the same page with the same words (a neutral answer): whether the entity,
// the e-mail or the ЕИК exist is never said. A registration whose ЕИК (or registration number) is an
// existing entity's becomes a request to JOIN that entity — never a second entity: approved by the
// entity's administrator, or by PTS as the fallback — when the entity has no active administrator, or
// on the entity's signed letter.

import { readEntity, ENTITY_PROBLEM_TEXT, normVat, type EntityProblem, type LegalEntity } from "./entities-model";
import { readLaboratory, LABORATORY_PROBLEM_TEXT, type Laboratory, type LaboratoryProblem } from "./laboratories-model";
import { readEntityUser, ENTITY_USER_PROBLEM_TEXT, type EntityUser, type EntityUserProblem } from "./entity-users-model";
import type { LabApplication } from "./types";

/** The EU's 27 — VIES answers for them; elsewhere a document is attached (as before). ISO 3166 codes:
 *  Greece is «GR» here (the entity's country) — VIES's «EL» is normVat's. */
export const EU_COUNTRIES: readonly { code: string; bg: string; en: string }[] = [
  { code: "AT", bg: "Австрия", en: "Austria" }, { code: "BE", bg: "Белгия", en: "Belgium" }, { code: "BG", bg: "България", en: "Bulgaria" },
  { code: "HR", bg: "Хърватия", en: "Croatia" }, { code: "CY", bg: "Кипър", en: "Cyprus" }, { code: "CZ", bg: "Чехия", en: "Czechia" },
  { code: "DK", bg: "Дания", en: "Denmark" }, { code: "EE", bg: "Естония", en: "Estonia" }, { code: "FI", bg: "Финландия", en: "Finland" },
  { code: "FR", bg: "Франция", en: "France" }, { code: "DE", bg: "Германия", en: "Germany" }, { code: "GR", bg: "Гърция", en: "Greece" },
  { code: "HU", bg: "Унгария", en: "Hungary" }, { code: "IE", bg: "Ирландия", en: "Ireland" }, { code: "IT", bg: "Италия", en: "Italy" },
  { code: "LV", bg: "Латвия", en: "Latvia" }, { code: "LT", bg: "Литва", en: "Lithuania" }, { code: "LU", bg: "Люксембург", en: "Luxembourg" },
  { code: "MT", bg: "Малта", en: "Malta" }, { code: "NL", bg: "Нидерландия", en: "Netherlands" }, { code: "PL", bg: "Полша", en: "Poland" },
  { code: "PT", bg: "Португалия", en: "Portugal" }, { code: "RO", bg: "Румъния", en: "Romania" }, { code: "SK", bg: "Словакия", en: "Slovakia" },
  { code: "SI", bg: "Словения", en: "Slovenia" }, { code: "ES", bg: "Испания", en: "Spain" }, { code: "SE", bg: "Швеция", en: "Sweden" },
];
/** Countries outside the EU a laboratory often registers from — any other by its two-letter code. */
export const NEAR_COUNTRIES: readonly { code: string; bg: string; en: string }[] = [
  { code: "RS", bg: "Сърбия", en: "Serbia" }, { code: "MK", bg: "Северна Македония", en: "North Macedonia" }, { code: "TR", bg: "Турция", en: "Türkiye" },
  { code: "AL", bg: "Албания", en: "Albania" }, { code: "BA", bg: "Босна и Херцеговина", en: "Bosnia and Herzegovina" }, { code: "ME", bg: "Черна гора", en: "Montenegro" },
  { code: "MD", bg: "Молдова", en: "Moldova" }, { code: "UA", bg: "Украйна", en: "Ukraine" }, { code: "GE", bg: "Грузия", en: "Georgia" },
  { code: "GB", bg: "Обединеното кралство", en: "United Kingdom" }, { code: "CH", bg: "Швейцария", en: "Switzerland" }, { code: "NO", bg: "Норвегия", en: "Norway" },
];
const EU = new Set(EU_COUNTRIES.map((c) => c.code));
export const isEu = (code: string) => EU.has(code.toUpperCase());

/** What the form sends — every value as typed. */
export interface RegistrationInput {
  name: unknown; country: unknown; eik: unknown; vat: unknown; correspondenceAddress: unknown; officialEmail: unknown; mol: unknown; language: unknown;
  labName: unknown; deliveryAddress: unknown; accreditationNo: unknown; accreditationBody: unknown;
  personName: unknown; email: unknown; position: unknown; phone: unknown;
}

export interface Registration {
  entity: Pick<LegalEntity, "name" | "country" | "eik" | "vat" | "correspondenceAddress" | "officialEmail" | "mol" | "language">;
  laboratory: Pick<Laboratory, "name" | "deliveryAddress" | "mobileOffice" | "accreditationNo" | "accreditationBody">;
  person: Pick<EntityUser, "email" | "name" | "position" | "phone">;
}

/** A problem, named by its level: «entity.eik-bg», «laboratory.address», «person.email»,
 *  «entity.official-email-required» — the form says it beside nothing else. */
export type RegistrationProblem = `entity.${EntityProblem}` | "entity.official-email-required" | `laboratory.${LaboratoryProblem}` | `person.${EntityUserProblem}`;

/** The registration as typed — each level by its own Phase 4 reader. A second entity with the same ЕИК
 *  is not refused here: it is a request to join (the caller asks the identity store). */
export function readRegistration(input: RegistrationInput): { ok: true; value: Registration } | { ok: false; problem: RegistrationProblem } {
  // the country chosen — never the PTS form's default (a post without the script, 9.1 review)
  if (!String(input.country ?? "").trim()) return { ok: false, problem: "entity.country" };
  const e = readEntity({ name: input.name, country: input.country, eik: input.eik, vat: input.vat, correspondenceAddress: input.correspondenceAddress, officialEmail: input.officialEmail, mol: input.mol, language: input.language }, []);
  if (!e.ok) return { ok: false, problem: `entity.${e.problem}` };
  // the notices to the organisation go to its official e-mail (К23) — a registration names one
  if (!e.fields.officialEmail) return { ok: false, problem: "entity.official-email-required" };
  const l = readLaboratory({ name: input.labName, deliveryAddress: input.deliveryAddress, mobileOffice: false, accreditationNo: input.accreditationNo, accreditationBody: input.accreditationBody });
  if (!l.ok) return { ok: false, problem: `laboratory.${l.problem}` };
  const p = readEntityUser({ email: input.email, name: input.personName, position: input.position, phone: input.phone, role: "admin", twoFactorRequired: false });
  if (!p.ok) return { ok: false, problem: `person.${p.problem}` };
  const { email, name, position, phone } = p.fields;
  return { ok: true, value: { entity: e.fields, laboratory: l.fields, person: { email, name, position, phone } } };
}

export function registrationProblemText(code: string): { bg: string; en: string } | null {
  const [level, ...rest] = code.split(".");
  const k = rest.join(".");
  if (code === "entity.official-email-required") return { bg: "официалният e-mail на организацията е задължителен — там отиват уведомленията", en: "the organisation's official e-mail is required — the notices go there" };
  const table: Record<string, Record<string, { bg: string; en: string }>> = { entity: ENTITY_PROBLEM_TEXT, laboratory: LABORATORY_PROBLEM_TEXT, person: ENTITY_USER_PROBLEM_TEXT };
  const t = table[level]?.[k];
  if (!t) return null;
  const where = { entity: { bg: "Организацията", en: "The organisation" }, laboratory: { bg: "Лабораторията", en: "The laboratory" }, person: { bg: "Вие", en: "You" } }[level as "entity" | "laboratory" | "person"];
  return { bg: `${where.bg}: ${t.bg}`, en: `${where.en}: ${t.en}` };
}

/** A stored registration, read back as the form typed it — so its approval reads it by the same rules. */
export function inputOf(a: LabApplication): RegistrationInput {
  return {
    name: a.orgName, country: a.country, eik: a.eik, vat: a.vat, correspondenceAddress: a.address, officialEmail: a.officialEmail ?? "", mol: a.mol ?? "", language: a.language ?? "bg",
    labName: a.labName ?? "", deliveryAddress: a.deliveryAddress ?? "", accreditationNo: a.accreditationNo, accreditationBody: a.accreditationBody,
    personName: a.contactPerson, email: a.email, position: a.position ?? "", phone: a.phone,
  };
}

/** VIES's answer at the registration, kept FOR the number it checked — only a valid one for the entity's
 *  number as it is now (4.1: a check of another number counts for nothing). */
export function viesOf(a: Pick<LabApplication, "vat" | "vatStatus" | "vatName" | "createdAt">, entity: Pick<LegalEntity, "vat" | "country">): LegalEntity["vies"] | undefined {
  if (a.vatStatus !== "valid" || !entity.vat || normVat(a.vat, entity.country) !== entity.vat) return undefined;
  return { status: "valid", checkedAt: a.createdAt, vat: entity.vat, country: entity.country, ...(a.vatName ? { name: a.vatName } : {}) };
}

/** Who may decide a request to join — the entity's ACTIVE administrator, for its own entity only. */
export function adminJoinProblem(decider: Pick<EntityUser, "role" | "state" | "entityId">, a: Pick<LabApplication, "kind" | "status" | "entityId">): "not-admin" | "other-entity" | "decided" | null {
  if (decider.role !== "admin" || decider.state !== "active") return "not-admin";
  if (a.kind !== "join" || a.entityId !== decider.entityId) return "other-entity";
  if (a.status !== "pending") return "decided";
  return null;
}

/** PTS decides a join only as the fallback, and ALWAYS on the entity's signed letter (PLAN §9.1) — with an
 *  active administrator or without: a stranger who typed a public ЕИК is never let in on a click (9.1
 *  review), and a profile with no administrator makes the one let in its administrator. */
export function ptsJoinProblem(o: { letter: boolean }): "letter" | null {
  return o.letter ? null : "letter";
}

/** PTS appoints another ACTIVE user of the entity its administrator; with `demote`, the administrators
 *  before become users. Promoted first, demoted after — the entity is never without an active
 *  administrator on the way (0033). */
export function appointPlan(users: readonly Pick<EntityUser, "id" | "role" | "state" | "entityId">[], targetId: string, demote: boolean):
  { ok: true; promoted: boolean; changes: { id: string; role: "admin" | "user" }[] } | { ok: false; problem: "not-found" | "not-active" | "already" } {
  const t = users.find((u) => u.id === targetId);
  if (!t) return { ok: false, problem: "not-found" };
  if (t.state !== "active") return { ok: false, problem: "not-active" };
  const before = demote ? users.filter((u) => u.id !== t.id && u.entityId === t.entityId && u.role === "admin" && u.state !== "inactive") : [];
  // an administrator already: only what is left to do — the ones before made users (a demotion that
  // failed the first time, 9.1 review); nothing left — said
  if (t.role === "admin") return before.length ? { ok: true, promoted: false, changes: before.map((u) => ({ id: u.id, role: "user" as const })) } : { ok: false, problem: "already" };
  return { ok: true, promoted: true, changes: [{ id: t.id, role: "admin" }, ...before.map((u) => ({ id: u.id, role: "user" as const }))] };
}

export const APPOINT_PROBLEM_TEXT: Record<"not-found" | "not-active" | "already", { bg: string; en: string }> = {
  "not-found": { bg: "потребителят не е намерен", en: "the user is not found" },
  "not-active": { bg: "администратор става само активен потребител — поканеният първо приема поканата", en: "only an active user becomes the administrator — an invited one first accepts the invitation" },
  already: { bg: "този потребител вече е администратор на профила", en: "this user is already the profile's administrator" },
};

/** The kinds of notice to the official e-mail made in 9.1 — PTS sends one again where it did not go. */
export const OFFICIAL_NOTICE_KINDS_91 = ["profile.created", "profile.user_joined", "profile.admin_changed"] as const;
export const OFFICIAL_NOTICE_LABEL: Record<(typeof OFFICIAL_NOTICE_KINDS_91)[number], { bg: string; en: string }> = {
  "profile.created": { bg: "създаден профил", en: "a profile made" },
  "profile.user_joined": { bg: "нов потребител", en: "a new user" },
  "profile.admin_changed": { bg: "нов администратор", en: "a new administrator" },
};

/** The kinds of registration as PTS reads them. */
export const KIND_LABEL: Record<NonNullable<LabApplication["kind"]>, { bg: string; en: string }> = {
  account: { bg: "заявка за акаунт (досегашната)", en: "account request (the earlier one)" },
  entity: { bg: "регистрация на организация", en: "registration of an organisation" },
  join: { bg: "заявка за присъединяване", en: "request to join" },
};
