// The accreditation mark on the documents (plan part 3.9; Реш. 102; PAKET т. 264). Pure.
//
// The status follows the number (PTS: «NA означава извън обхвата на акредитацията»;
// the field PTS chose where the number does not state it — lib/scheme-number):
//   - IN SCOPE — the ILAC-MRA and SNAS marks with «Рег. № 752/T-008», and the report's
//     «operated under accreditation» sentence; calibration included;
//   - NA — no mark, no accreditation claim, and an explicit sentence that the scheme
//     is outside the scope of the accreditation;
//   - NOT STATED (an old archive number such as «PTS 23/11-A», nothing chosen) — no
//     mark and no claim either way: a mark printed on a scheme not proven in scope is
//     a misuse of the mark. The editor says so until PTS chooses;
//   - an ILC is outside the accreditation BY DEFINITION (Zadanie: «Провежда се извън
//     обхвата на акредитацията») — NA whatever its number says (3.9 review);
//   - a SIMULATION round («SIM …», the test environment) carries no mark (review);
//   - in scope with no registration number — no mark: «Рег. №» with nothing after it
//     is no mark (review).
// The number decides what it states, the stored choice the rest — the same order as
// markersFor and the editor (review).

import { esc, pick } from "./doc-css";
import { readSchemeNumber, type SchemeKind, type Activity } from "./scheme-number";
import { replaceBlocks } from "./fill-mark";
import type { Lang } from "./types";

export type MarkState = "mark" | "na" | "unset" | "sim";
interface Marked { number: string; type: "T" | "C"; kind?: SchemeKind; activity?: Activity; accredited?: boolean; regNo: string }

export function markState(s: Omit<Marked, "regNo"> & { regNo?: string }): MarkState {
  const r = readSchemeNumber(s.number);
  if (r?.simulation) return "sim";
  const kind = r?.kind ?? s.kind ?? null;
  const accredited = r?.accredited ?? s.accredited ?? null;
  if (kind === "ILC" || accredited === false) return "na";
  if (accredited !== true) return "unset";
  return s.regNo !== undefined && !s.regNo.trim() ? "unset" : "mark";
}

/** The explicit sentence on an NA scheme's documents — a text for PTS to approve. */
export const NA_SENTENCE = {
  en: "This scheme is outside the scope of PTS Bulgaria's accreditation (NA).",
  bg: "Схемата е извън обхвата на акредитацията на PTS Bulgaria (NA).",
};

/** The marks block of a cover or a certificate: the ILAC-MRA and SNAS marks with the
 *  registration number in scope; the NA sentence outside it; nothing when not stated.
 *  `regnoClass` keeps each document's own styling of the number. */
export function marksHtml(s: Marked, lang: Lang, regnoClass?: string): string {
  const st = markState(s);
  if (st === "mark") {
    return `<div class="marks" data-accreditation="mark">
      <img class="ilac" src="/brand/ilac-mra.jpg" alt="ilac-MRA">
      <div class="snasbox"><img src="/brand/snas.png" alt="SNAS"><div${regnoClass ? ` class="${regnoClass}"` : ""}>${esc(pick(lang, "Reg. No.", "Рег. №"))} ${esc(s.regNo)}</div></div>
    </div>`;
  }
  if (st === "na") {
    return `<div class="marks" data-accreditation="na">
      <div class="nabox" style="border:1px solid var(--ink);padding:6px 12px;font-family:var(--sans);font-size:9.5pt;max-width:120mm;text-align:center;">${esc(pick(lang, NA_SENTENCE.en, NA_SENTENCE.bg))}</div>
    </div>`;
  }
  return "";
}

/** The report's sentence on the accreditation (its §5): under accreditation in scope,
 *  the NA sentence outside it, nothing when not stated. Escaped. */
export function accreditationSentence(s: Marked, lang: Lang): string {
  const st = markState(s);
  if (st === "mark") return esc(pick(lang, `The scheme is operated under accreditation by SNAS (ILAC-MRA), Reg. No. ${s.regNo}.`, `Схемата се провежда при акредитация от SNAS (ILAC-MRA), Рег. № ${s.regNo}.`));
  if (st === "na") return esc(pick(lang, NA_SENTENCE.en, NA_SENTENCE.bg));
  return "";
}

// ── a saved body (3.9 review) ──────────────────────────────────────────────
// A document edited in the Word-like editor is saved whole — its cover with the marks
// it had then. Printing it puts the marks and the sentence of the status NOW: a body
// saved in scope never prints the mark once the scheme is NA, and the other way round.
const reEsc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SENTENCES: RegExp[] = [
  /The scheme is operated under accreditation by SNAS \(ILAC-MRA\), Reg\. No\. [^<]*?\./g,
  /Схемата се провежда при акредитация от SNAS \(ILAC-MRA\), Рег\. № [^<]*?\./g,
  ...[NA_SENTENCE.en, NA_SENTENCE.bg, "This scheme is outside the scope of PTS Bulgaria's accreditation (NA). Its documents carry no accreditation mark.", "Схемата е извън обхвата на акредитацията на PTS Bulgaria (NA). Документите ѝ не носят знак за акредитация."]
    .sort((a, b) => b.length - a.length)
    .flatMap((x) => [new RegExp(reEsc(x), "g"), new RegExp(reEsc(esc(x)), "g")]),
];
export function refreshAccreditation(html: string, s: Marked, lang: Lang): string {
  if (!html) return html;
  let out = replaceBlocks(html, /<div\b[^>]*\bclass="marks"[^>]*>/, "div", (old) => marksHtml(s, lang, /class="regno"/.test(old) ? "regno" : undefined));
  const now = accreditationSentence(s, lang);
  for (const re of SENTENCES) out = out.replace(re, () => now);
  return out;
}
