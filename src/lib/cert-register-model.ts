// The certificate register's lookup (plan part 10.4; D20; Реш. 55, 56, 93, 115). Pure.
//
// The ptsbg.eu register asks the portal (A) or hands its visitor to the portal's page (B) for the
// certificates the portal issues — the codes never leave the portal. A lookup needs the number AND the
// code; the answer is only «valid» (with Реш. 56's data) or «invalid» — never which of the two was wrong,
// never the code itself, a score, Eₙ, an assigned value or an uncertainty; no list, no partial search
// (Реш. 55). Attempts are limited — 10 failed an hour from one address (the address kept only as a keyed
// hash, for that hour).

import type { Scheme } from "./types";
import { legacyIssued } from "./cert-model";
import { labCertificate } from "./cert-number";
import { sameCertNumber } from "./cert-number";
import { schemeMarkers, readSchemeNumber } from "./scheme-number";

export const MAX_FAILED_PER_HOUR = 10;
export const NUMBER_MAX = 60, CODE_MAX = 40;

export interface RegisterQuery { number: string; code: string }
/** The typed query — both parts required, within their limits; null when it is not a whole query. */
export function readQuery(input: { number?: unknown; code?: unknown }): RegisterQuery | null {
  // text only: an array or an object is not a number or a code (the security sweep, UP-3 — «["…"]» read as its one element)
  if (typeof input.number !== "string" || typeof input.code !== "string") return null;
  const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  const number = clean(input.number), code = clean(input.code);
  if (!number || !code || [...number].length > NUMBER_MAX || [...code].length > CODE_MAX) return null;
  return { number, code };
}

/** A code as its holder types it — the case and the spaces aside. */
const foldCode = (c: string) => c.replace(/\s+/g, "").toUpperCase();

export interface RegisterHit { scheme: Scheme; code: string; no: string; date: string; scope?: { bg: string; en: string }[] }
/** The certificate this number AND code name — released by a person (or a pre-7.4 issue), never a
 *  simulation round's; null for anything else (the caller says «invalid», whichever part was wrong). */
export function findCertificate(schemes: readonly Scheme[], q: RegisterQuery): RegisterHit | null {
  const want = foldCode(q.code);
  for (const s of schemes) {
    // never a draft, an archived scheme, a simulation round's (by its flag AND its number) or a replay (10.4 review)
    if (s.archivedAt || s.status === "draft" || readSchemeNumber(s.number)?.simulation || (s as { replay?: unknown }).replay) continue;
    for (const code of Object.keys(s.certificates ?? {})) {
      if (foldCode(code) !== want) continue;
      const c = labCertificate(s.certificates, code, legacyIssued(s));
      if (!c || c.simulation || !sameCertNumber(c.no, q.number)) continue;
      return { scheme: s, code, no: c.no, date: c.date, scope: c.content?.scope };
    }
  }
  return null;
}

/** Реш. 56's data of a valid certificate — never the code (Реш. 115), never a result. */
export interface RegisterAnswer {
  valid: true;
  laboratory: string;
  kind: { key: "PT" | "ILC"; bg: string; en: string };
  activity: { key: "T" | "S" | "C"; bg: string; en: string } | null;
  object: { bg: string; en: string };
  characteristics: { bg: string; en: string }[];
  number: string;
  date: string;
}
const ACTIVITY: Record<"T" | "S" | "C", { bg: string; en: string }> = { T: { bg: "изпитване", en: "testing" }, S: { bg: "вземане на проби", en: "sampling" }, C: { bg: "калибриране", en: "calibration" } };
export function answerOf(hit: RegisterHit, laboratory: string): RegisterAnswer {
  const s = hit.scheme;
  const m = schemeMarkers(s);
  const ilc = m.kind === "ILC";
  const chars = hit.scope?.length
    ? hit.scope.map((x) => ({ bg: x.bg, en: x.en }))
    : s.parameters.map((p) => ({ bg: p.characteristicBg ?? "", en: p.characteristicEn ?? "" }));
  return {
    valid: true,
    laboratory,
    kind: ilc ? { key: "ILC", bg: "междулабораторно сравнение", en: "interlaboratory comparison" } : { key: "PT", bg: "изпитване за пригодност", en: "proficiency testing" },
    activity: m.activity ? { key: m.activity, ...ACTIVITY[m.activity] } : null,
    object: { bg: s.objectBg ?? "", en: s.objectEn ?? "" },
    characteristics: chars,
    number: hit.no,
    date: hit.date,
  };
}

/** The hour a failed attempt counts in (UTC), e.g. «2026-11-11T10». */
export const hourOf = (ms: number) => new Date(ms).toISOString().slice(0, 13);
/** Limited: this address failed MAX_FAILED_PER_HOUR times this hour. */
export const limited = (failedThisHour: number) => failedThisHour >= MAX_FAILED_PER_HOUR;

export const REGISTER_TEXT = {
  invalid: { bg: "Невалиден — няма сертификат с този номер и код.", en: "Invalid — there is no certificate with this number and code." },
  incomplete: { bg: "Въведете номера и кода на сертификата.", en: "Type the certificate's number and code." },
  limited: { bg: "Твърде много неуспешни справки от този адрес — опитайте след час.", en: "Too many failed lookups from this address — try again in an hour." },
  // the ceiling reached is a code's for the day, or everyone's — said as such, never «this address» (round 2, R2U-6)
  limitedCode: { bg: "Справките за този код днес са спрени след много неуспешни опити — опитайте утре или се обърнете към PTS.", en: "Lookups for this code are stopped for today after many failed attempts — try again tomorrow or contact PTS." },
  // …or a certificate number's for the hour (round 3: it was said as everyone's)
  limitedNumber: { bg: "Справките за този номер са спрени за час след много неуспешни опити — опитайте по-късно или се обърнете към PTS.", en: "Lookups for this number are stopped for an hour after many failed attempts — try again later or contact PTS." },
  limitedAll: { bg: "Регистърът получава твърде много справки в момента — опитайте след малко.", en: "The register is receiving too many lookups right now — try again in a while." },
  failed: { bg: "Справката не може да се направи сега — опитайте след малко.", en: "The lookup cannot be made now — try again shortly." },
  valid: { bg: "Валиден", en: "Valid" },
};
