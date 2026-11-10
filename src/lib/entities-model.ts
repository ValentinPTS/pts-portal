// The legal entity (plan part 4.1; Zadanie §8 «Юридическо лице»; А13). Pure.
//
// Three levels, not two (Zadanie): the LEGAL ENTITY — name, ЕИК, VAT number, address
// for correspondence, МОЛ (А13: it stays) — owns LABORATORIES (4.2), which have USERS
// (4.3). The price and the discount are computed at the level of the legal entity,
// not the laboratory (Реш. 153, 9.4).
//
// An entity is identity data: it lives in the identity store (migration 0031), opened
// only through lib/entities.ts, every opening on record — never in coded data.
//
// Checked before it is used: a Bulgarian ЕИК by its check digit; a VAT number in the
// EU by VIES — or, where VIES cannot say (outside the EU, the service down), a
// document attached; and PTS's own manual check, a tick with who and when. Its state:
// «чака проверка» until checked, «активно», «неактивно» (nothing deleted). Its
// language: the language of its documents and messages.

import { validateEik } from "./verify-eik";
import { emailKey, emailReads } from "./email-address";

export type EntityState = "pending" | "active" | "inactive";
export const ENTITY_STATES: readonly EntityState[] = ["pending", "active", "inactive"];
export type ViesStatus = "valid" | "invalid" | "unavailable";

export interface LegalEntity {
  id: string;
  name: string;
  /** ISO 3166 two letters — «BG» for a Bulgarian entity */
  country: string;
  /** a Bulgarian ЕИК (9 or 13 digits, check digit verified); elsewhere the registration number */
  eik: string;
  vat: string;
  correspondenceAddress: string;
  /** the official e-mail — where the notices to the organisation go (К23, 4.4); "" none yet */
  officialEmail: string;
  /** материално отговорно лице (А13) */
  mol: string;
  language: "bg" | "en";
  state: EntityState;
  /** VIES's answer — FOR the number it checked (a later number is not checked by it) */
  vies?: { status: ViesStatus; checkedAt: string; name?: string; vat: string; country: string };
  /** a document attached where VIES cannot say — the file's path in private storage */
  proofPath?: string;
  /** every document ever attached, the current one included — none is lost (4.1 review) */
  proofHistory?: { path: string; at: string; by: string }[];
  /** PTS's manual check — who and when, a note, and the numbers it was made for */
  manualCheck?: { by: string; at: string; note?: string; eik: string; vat: string; country: string; proofPath?: string };
  createdAt: string;
  createdBy: string;
  /** where it came from: entered by PTS from a PDF application (4.4), or the lab's own */
  origin: "pdf" | "portal";
  /** the laboratory's confirmation of its data (4.4, Реш. 145) — when, and which of its
   *  users; once. From that date the data is the laboratory's. */
  confirmedAt?: string;
  confirmedBy?: string;
  /** erased on request (4.7, Zadanie §10) — a profile with no participation; never
   *  changed after */
  erasedAt?: string;
  /** the request an erasure answered: its incoming number and date */
  eraseRequestNo?: string;
  eraseRequestDate?: string;
  /** a participation's copy names it (4.5) — then it is kept, never erased */
  hasParticipations?: boolean;
}

export const ENTITY_LIMITS = { name: 200, eik: 20, vat: 20, address: 300, mol: 120, note: 300 };
export type EntityProblem = "name" | "country" | "eik" | "eik-bg" | "vat" | "address" | "official-email" | "mol" | "language" | "duplicate";

/** A registration number's normal form — upper case, letters and digits only: «HRB
 *  12345», «hrb12345» and «HRB-12345» are one company (4.1 review). */
export const eikKey = (eik: string) => eik.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A VAT number's normal form, stored and sent to VIES alike: upper case, letters and
 *  digits, the country's prefix (Greece «EL», as VIES reads it) when none is typed;
 *  null when it does not read (4.1 review). */
export function normVat(vat: string, country: string): string | null {
  const raw = vat.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";
  const v = /^[A-Z]{2}/.test(raw) ? raw : `${country === "GR" ? "EL" : country}${raw}`;
  return /^[A-Z]{2}[A-Z0-9]{4,14}$/.test(v) ? v : null;
}

/** ISO 3166-1 alpha-2 — and «XK» (Kosovo), in use though user-assigned. A company is one country's:
 *  «EL» (VIES's Greece) is «GR», «UK» is «GB» — never one company twice under two codes (9.1 review). */
const ISO = new Set(("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ " +
  "OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW").split(" "));
const COUNTRY_ALIAS: Record<string, string> = { EL: "GR", UK: "GB" };
/** A country as typed: its ISO code, or null when it is not one. */
export function normCountry(v: string): string | null {
  const c = v.trim().toUpperCase();
  const k = COUNTRY_ALIAS[c] ?? c;
  return ISO.has(k) ? k : null;
}

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, " ").replace(/\s+/g, " ").trim();

export interface EntityInput { name: unknown; country: unknown; eik: unknown; vat: unknown; correspondenceAddress: unknown; officialEmail?: unknown; mol: unknown; language: unknown }

/** The official e-mail as typed: "" when none (PTS may not have it from the PDF — the
 *  laboratory completes it at its confirmation), else its normal form; null when it
 *  does not read. */
export function readOfficialEmail(v: unknown): string | null {
  const e = emailKey(clean(v));
  if (!e) return "";
  return emailReads(e) ? e : null;
}

/** An entity's fields as typed — read and checked; `others` are the entities there
 *  are, to refuse a second entity with the same ЕИК (the same company twice). */
export function readEntity(input: EntityInput, others: readonly Pick<LegalEntity, "id" | "country" | "eik">[], self?: string):
  { ok: true; fields: Pick<LegalEntity, "name" | "country" | "eik" | "vat" | "correspondenceAddress" | "officialEmail" | "mol" | "language"> } | { ok: false; problem: EntityProblem } {
  const name = clean(input.name);
  if (!name || [...name].length > ENTITY_LIMITS.name) return { ok: false, problem: "name" };
  const country = normCountry(clean(input.country) || "BG");
  if (!country) return { ok: false, problem: "country" };
  let eik = clean(input.eik);
  // a number whose normal form is empty («---») is no number (9.1 review)
  if (!eik || [...eik].length > ENTITY_LIMITS.eik || !eikKey(eik)) return { ok: false, problem: "eik" };
  if (country === "BG") {
    const v = validateEik(eik);
    if (!v.ok) return { ok: false, problem: "eik-bg" };
    eik = v.normalized;
  }
  const vat = normVat(clean(input.vat), country);
  if (vat === null) return { ok: false, problem: "vat" };
  const correspondenceAddress = clean(input.correspondenceAddress);
  if (!correspondenceAddress || [...correspondenceAddress].length > ENTITY_LIMITS.address) return { ok: false, problem: "address" };
  const officialEmail = readOfficialEmail(input.officialEmail);
  if (officialEmail === null) return { ok: false, problem: "official-email" };
  const mol = clean(input.mol);
  if ([...mol].length > ENTITY_LIMITS.mol) return { ok: false, problem: "mol" };
  const language = clean(input.language) || "bg";
  if (language !== "bg" && language !== "en") return { ok: false, problem: "language" };
  if (others.some((o) => o.id !== self && o.country === country && eikKey(o.eik) === eikKey(eik))) return { ok: false, problem: "duplicate" };
  return { ok: true, fields: { name, country, eik, vat, correspondenceAddress, officialEmail, mol, language } };
}

export const ENTITY_PROBLEM_TEXT: Record<EntityProblem, { bg: string; en: string }> = {
  name: { bg: "наименованието е задължително, до 200 знака", en: "the name is required, 200 characters at most" },
  country: { bg: "държавата е код по ISO 3166 от две букви (BG, RO …)", en: "the country is an ISO 3166 two-letter code (BG, RO …)" },
  eik: { bg: "ЕИК / регистрационният номер е задължителен, до 20 знака", en: "the ЕИК / registration number is required, 20 characters at most" },
  "eik-bg": { bg: "ЕИК не е валиден (9 или 13 цифри, контролна цифра)", en: "the ЕИК is not valid (9 or 13 digits, check digit)" },
  vat: { bg: "номерът по ДДС не се разчита (напр. BG123456789)", en: "the VAT number does not read (e.g. BG123456789)" },
  address: { bg: "адресът за кореспонденция е задължителен, до 300 знака", en: "the address for correspondence is required, 300 characters at most" },
  "official-email": { bg: "официалният e-mail не се разчита", en: "the official e-mail does not read" },
  mol: { bg: "МОЛ е до 120 знака", en: "the МОЛ is 120 characters at most" },
  language: { bg: "езикът е български или английски", en: "the language is Bulgarian or English" },
  duplicate: { bg: "вече има юридическо лице с този ЕИК", en: "there is already a legal entity with this ЕИК" },
};

/** Is the entity checked — VIES valid FOR its VAT number as it is now, or a document
 *  attached; and PTS's tick, made for the numbers and the document as they are now? A
 *  check of another number counts for nothing (4.1 review). */
export function entityChecked(e: Pick<LegalEntity, "vies" | "proofPath" | "manualCheck" | "vat" | "country" | "eik">): { registry: boolean; manual: boolean } {
  const viesNow = e.vies?.status === "valid" && e.vies.vat === e.vat && e.vies.country === e.country;
  const registry = viesNow || !!e.proofPath;
  const m = e.manualCheck;
  const manual = !!m && registry && m.eik === e.eik && m.vat === e.vat && m.country === e.country && (m.proofPath ?? "") === (e.proofPath ?? "");
  return { registry, manual };
}

/** A state change PTS may make: active only while checked — the registry AND PTS's
 *  tick; inactive any time; nothing deleted. */
export function stateProblem(e: Pick<LegalEntity, "state" | "vies" | "proofPath" | "manualCheck" | "vat" | "country" | "eik">, to: EntityState): "same" | "unchecked" | null {
  if (e.state === to) return "same";
  if (to === "active") { const c = entityChecked(e); if (!c.registry || !c.manual) return "unchecked"; }
  return null;
}

export const STATE_LABEL: Record<EntityState, { bg: string; en: string }> = {
  pending: { bg: "чака проверка", en: "awaiting the check" },
  active: { bg: "активно", en: "active" },
  inactive: { bg: "неактивно", en: "inactive" },
};

/** What changed of the fields typed, for the journal — by name, never their values
 *  (identity); the state is journalled on its own, before and after (4.1 review). */
export function entityDiff(before: Partial<LegalEntity>, after: Partial<LegalEntity>): string[] {
  const keys: (keyof LegalEntity)[] = ["name", "country", "eik", "vat", "correspondenceAddress", "officialEmail", "mol", "language"];
  return keys.filter((k) => k in after && JSON.stringify(before[k] ?? "") !== JSON.stringify(after[k] ?? ""));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
