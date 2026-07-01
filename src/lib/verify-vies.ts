import type { VatStatus } from "./types";

// EU VIES VAT-number check. A best-effort external sanity check used during lab
// onboarding: is this VAT number registered in the EU VIES system, and to whom?
//
// SAFETY / ROBUSTNESS:
//  • Inputs are stripped to [A-Z0-9] and length-capped before they ever reach the
//    URL/body — no header/URL injection, no oversized payloads.
//  • Hard 6s timeout + try/catch → a slow or down VIES never blocks or crashes the
//    application submit; it just records "unavailable" for staff to retry.
//  • Called server-side only, from a rate-limited action, so it can't be used to
//    proxy-flood VIES from the browser.
// It is a sanity check, never the authorization — a manager still approves.

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

export interface ViesResult {
  status: VatStatus; // 'valid' | 'invalid' | 'unavailable'
  name?: string;     // registered name (when VIES returns it)
}

const clean = (s: string, max: number) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max);

// Split a VAT into its 2-letter country code + number. Uses the embedded prefix when
// present (e.g. "BG123..."), else the supplied ISO-2 country code as a fallback.
export function splitVat(vat: string, fallbackCc = ""): { cc: string; number: string } | null {
  const raw = clean(vat, 16);
  const fb = clean(fallbackCc, 2);
  let cc = "";
  let number = raw;
  if (/^[A-Z]{2}/.test(raw)) { cc = raw.slice(0, 2); number = raw.slice(2); }
  else cc = fb;
  if (cc.length !== 2 || number.length < 4) return null;
  return { cc, number };
}

export async function checkVies(vat: string, fallbackCc = ""): Promise<ViesResult> {
  const parts = splitVat(vat, fallbackCc);
  if (!parts) return { status: "unavailable" }; // couldn't parse → treat as unchecked
  try {
    const res = await fetch(VIES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ countryCode: parts.cc, vatNumber: parts.number }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { status: "unavailable" };
    const j = (await res.json()) as { valid?: boolean; name?: string; userError?: string };
    if (typeof j.valid !== "boolean") return { status: "unavailable" };
    const name = j.name && j.name !== "---" ? j.name : undefined;
    return { status: j.valid ? "valid" : "invalid", name };
  } catch {
    return { status: "unavailable" }; // timeout / network / VIES down → retry later
  }
}
