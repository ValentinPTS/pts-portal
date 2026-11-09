import { foldSchemeNumber, sameSchemeNumber } from "./scheme-number";

// Certificate numbers (plan part 0.15; PTS, 02.11.2026, condition 1). The number is
// the one the ptsbg.eu register holds — the portal never makes one up — in PTS's
// format (К7): the scheme number, «-», five digits, e.g. «PTS 26/01-T-1-48217».
// Cyrillic Т/С and Latin T/C count alike (0.14). Pure, for the action, the lab side
// and the tests.

export type CertNumberProblem = "format" | "scheme" | "taken";

// any dash PTS's keyboard or a copied document may bring
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;
/** «<scheme number>-NNNNN» → the scheme number and the five digits. */
function certParts(n: string): { scheme: string; digits: string } | null {
  const m = String(n ?? "").trim().replace(DASHES, "-").match(/^(.+?)\s*-\s*(\d{5})$/);
  return m ? { scheme: m[1], digits: m[2] } : null;
}

/** One certificate number, either alphabet, any spacing — the scheme number compared
 *  as a scheme number («PTS 26/1-T-01» is «PTS 26/01-T-1», 3.1), then the digits. */
export function sameCertNumber(a: string, b: string): boolean {
  if (!String(a ?? "").trim()) return false;
  const pa = certParts(a), pb = certParts(b);
  if (pa && pb) return pa.digits === pb.digits && sameSchemeNumber(pa.scheme, pb.scheme);
  return foldSchemeNumber(a) === foldSchemeNumber(b);
}

/** The number to store for what PTS typed: always the scheme's own number as it is
 *  printed, «-», and the five digits — however the prefix was typed («pts 26/01-т-1»,
 *  an en dash, no «PTS») — so the certificate prints one spelling. Or why it cannot
 *  be: not «…-NNNNN», another scheme's prefix, or another participant has it. */
export function certNumberFor(
  typed: string,
  schemeNumber: string,
  others: string[],
): { no: string } | { problem: CertNumberProblem } {
  // as typed: the register's own «-» before the five digits (К7)
  const m = typed.trim().match(/^(.+)-(\d{5})$/);
  if (!m) return { problem: "format" };
  if (!sameSchemeNumber(m[1], schemeNumber)) return { problem: "scheme" };
  const no = `${schemeNumber}-${m[2]}`;
  if (others.some((o) => sameCertNumber(o, no))) return { problem: "taken" };
  return { no };
}

/** Why a typed number cannot be this scheme's certificate number — or null. */
export function certNumberProblem(typed: string, schemeNumber: string, others: string[]): CertNumberProblem | null {
  const r = certNumberFor(typed, schemeNumber, others);
  return "problem" in r ? r.problem : null;
}

type Certs = Record<string, { no: string; date: string; registeredBy?: string; registeredAt?: string; simulation?: boolean }> | undefined;

/** The certificate a laboratory may have: only one whose number PTS confirmed is in
 *  the ptsbg.eu register — or a simulation round's, which prints «not a certificate»
 *  (1.2). A number the portal made up before 0.15 is not one — the public lookup
 *  would call it invalid. */
export function labCertificate(certs: Certs, code: string) {
  const c = certs && Object.prototype.hasOwnProperty.call(certs, code) ? certs[code] : undefined;
  return c?.registeredAt || c?.simulation ? c : undefined;
}
