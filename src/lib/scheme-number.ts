// Scheme numbers (plan parts 0.14 and 3.1; Zadanie §2; Реш. 102, 130; А4, А8).
//
//     PTS | ILC    ГГ/ММ    [-NA]    -T | S | C    -пореден
//
//   PTS — proficiency testing; ILC — an interlaboratory comparison that is not PT.
//   ГГ/ММ — the year and month the scheme starts.
//   NA — Not Accredited: the scheme is outside the scope of the accreditation (А4).
//   T, S, C — the activity: testing, sampling, calibration.
//   пореден — counts within the month and the activity (N15).
//
// The number carries information and the portal reads it — but keeps it in fields of
// their own (Реш. 102): the kind, the activity and the accreditation status
// (Scheme.kind / activity / accredited). What a number states, the number decides;
// what it does not state, PTS chooses (markersFor).
//
// The archive holds numbers of older forms, accepted as they are written and never
// "corrected" (Zadanie §2): PTS 25/08-NA-1 (an ILC from before the activity letter,
// А8), PTS 23/11-A and 23/2-A (A for automobiles, before NA), PTS 21/03-C1P / C2F /
// C3T (2021's own calibration numbering), PTS 22/08-1, PTS 23/01, PTS 20/10.
//
// PTS types the letters in either alphabet — Cyrillic Т/С/А/Р… or Latin — and any
// dash; both spell the same number (E4.a). A number is stored and printed exactly as
// typed; only comparisons, the next number and the URL id use the folded form.
// The simulation rounds of the test environment are numbered «SIM …» in a series of
// their own, never the active one (Реш. 130, part 1.2).
// Pure — no imports — so the dialog, the store and the tests can all use it.

export type SchemeKind = "PTS" | "ILC";
export type Activity = "T" | "S" | "C";
export const KINDS: readonly SchemeKind[] = ["PTS", "ILC"];
export const ACTIVITIES: readonly Activity[] = ["T", "S", "C"];
export const isKind = (v: unknown): v is SchemeKind => v === "PTS" || v === "ILC";
export const isActivity = (v: unknown): v is Activity => v === "T" || v === "S" || v === "C";

// Cyrillic look-alikes of the Latin letters a number uses: Т/С for the activity, А
// (NA, the old «A»), Р/Ѕ for a «PTS» typed in Cyrillic («РТЅ», «РТС»), І/М/Ѕ for «SIM»,
// І/С for «ILC». (After upper-casing.)
const LOOKALIKE: Record<string, string> = { "А": "A", "С": "C", "І": "I", "М": "M", "Р": "P", "Ѕ": "S", "Т": "T" };
// any dash PTS's keyboard or a copied document may bring: ‐ ‑ ‒ – — −
const DASHES = /[‐‑‒–—−]/g;

/** Trimmed, spaces collapsed, upper-cased, Cyrillic look-alikes and dashes folded. */
function normalise(number: string): string {
  return String(number ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/[АСІМРЅТ]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(DASHES, "-");
}

// «PTS» as typed — Latin, Cyrillic Р-Т-С / П-Т-С (after the fold: PTC / ПTC) — or none
const PTS_SPELLINGS = "PTS|PTC|ПTC|ПTS";
const CURRENT = new RegExp(`^(?:(SIM|ILC|${PTS_SPELLINGS})[ -]*)?(\\d{2}) ?/ ?(\\d{1,2}) ?(?:- ?(NA) ?)?- ?([TSC]) ?- ?(\\d+)$`);
// the archive's forms: always with «PTS», and only of the years before today's rule
// (every current scheme of А4 is a 2026 one; the archive's latest old form is 25/08)
export const LAST_OLD_YEAR = 25;
const OLD = new RegExp(`^(?:${PTS_SPELLINGS})[ -]*(\\d{2}) ?/ ?(\\d{1,2})(?: ?- ?(\\d+|NA ?- ?\\d+|A|C\\d[A-Z]))?$`);

/** What a number says. `form` "current": today's rule; "old": one of the archive's
 *  forms. Each marker is what the NUMBER states — null where it says nothing (an old
 *  form; the kind of a «SIM» number). */
export interface SchemeNumberReading {
  form: "current" | "old";
  /** a simulation round's «SIM» number (Реш. 130) */
  simulation: boolean;
  yy: string;
  /** two digits */
  mm: string;
  kind: SchemeKind | null;
  /** the number carries «NA» */
  na: boolean;
  /** within the accredited scope (no NA), outside it (NA), or not stated */
  accredited: boolean | null;
  activity: Activity | null;
  seq: number | null;
  /** an old form: what follows ГГ/ММ, folded — "", "1", "NA-1", "A", "C1P" */
  mark?: string;
}

const month = (m: string) => { const n = parseInt(m, 10); return n >= 1 && n <= 12 ? String(n).padStart(2, "0") : null; };

/** The reading of a number of today's form or of one of the archive's — or null when
 *  it is neither. */
export function readSchemeNumber(number: string): SchemeNumberReading | null {
  const f = normalise(number);
  const c = f.match(CURRENT);
  if (c) {
    const mm = month(c[3]);
    const seq = parseInt(c[6], 10);
    if (!mm || !(seq >= 1)) return null;
    const simulation = c[1] === "SIM";
    const na = c[4] === "NA";
    return {
      form: "current", simulation, yy: c[2], mm,
      kind: simulation ? null : c[1] === "ILC" ? "ILC" : "PTS",
      na, accredited: !na, activity: c[5] as Activity, seq,
    };
  }
  const o = f.match(OLD);
  // the old forms are the archive's: up to 2025, when today's rule took over — a 2026
  // number without its activity letter is a mistyped number, not an archive one
  if (o && parseInt(o[1], 10) <= LAST_OLD_YEAR) {
    const mm = month(o[2]);
    if (!mm) return null;
    const raw = (o[3] ?? "").replace(/ /g, "");
    const naSeq = raw.match(/^NA-(\d+)$/);
    const seq = /^\d+$/.test(raw) ? parseInt(raw, 10) : naSeq ? parseInt(naSeq[1], 10) : null;
    if (seq !== null && !(seq >= 1)) return null;
    const mark = /^\d+$/.test(raw) ? String(seq) : naSeq ? `NA-${seq}` : raw;
    return {
      form: "old", simulation: false, yy: o[1], mm,
      // «приключилите ILC носят номер от вида PTS 25/08-NA-1» (А8)
      kind: naSeq ? "ILC" : null,
      na: !!naSeq, accredited: naSeq ? false : null,
      // 2021's calibration numbering (Zadanie §2)
      activity: /^C\d[A-Z]$/.test(raw) ? "C" : null,
      seq, mark,
    };
  }
  return null;
}

/** Today's form only: the parts every one of them has. */
export interface SchemeNumberParts {
  simulation: boolean;
  kind: SchemeKind | null;
  na: boolean;
  activity: Activity;
  yy: string;
  mm: string;
  seq: number;
}

/** A number of today's form, or null (an old form, or not a number). */
export function parseSchemeNumber(number: string): SchemeNumberParts | null {
  const r = readSchemeNumber(number);
  if (!r || r.form !== "current") return null;
  return { simulation: r.simulation, kind: r.kind, na: r.na, activity: r.activity as Activity, yy: r.yy, mm: r.mm, seq: r.seq as number };
}

/** The comparison form. Today's form becomes «PTS|ILC|SIM YY/MM[-NA]-X-N» — Т/С and
 *  T/C, any dash, «26/3» and «26/03», «T-01» and «T-1», with or without spaces, alike;
 *  an old form «PTS YY/MM[-mark]». Anything else is only trimmed, its spaces
 *  collapsed, upper-cased, and its look-alikes and dashes folded. */
export function foldSchemeNumber(number: string): string {
  const r = readSchemeNumber(number);
  if (!r) return normalise(number);
  if (r.form === "old") return `PTS ${r.yy}/${r.mm}${r.mark ? `-${r.mark}` : ""}`;
  return `${r.simulation ? "SIM" : r.kind} ${r.yy}/${r.mm}${r.na ? "-NA" : ""}-${r.activity}-${r.seq}`;
}

/** Two spellings of one number — «PTS 26/03-Т-1» and «PTS 26/03-T-1» — are equal. */
export function sameSchemeNumber(a: string, b: string): boolean {
  return !!String(a ?? "").trim() && foldSchemeNumber(a) === foldSchemeNumber(b);
}

/** The URL id from a number: «PTS 25/09-Т-1» → «25-09-T-1» (the letter is kept),
 *  «ILC 26/10-NA-T-1» → «ILC-26-10-NA-T-1», «SIM 26/03-T-1» → «SIM-26-03-T-1». */
export function schemeIdFromNumber(number: string): string {
  return foldSchemeNumber(number)
    .replace(/^PTS\s*/, "")
    .replace(/^(SIM|ILC)\s*/, "$1-") // an ILC and a simulation keep their prefix in the address
    .replace(/\s+/g, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Today's year and month in Bulgaria — the month a new number counts in. */
export function sofiaYearMonth(nowMs: number = Date.now()): { year: string; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: parseInt(get("month"), 10) };
}

/** What a new number is made of. */
export interface NumberSpec { kind: SchemeKind; activity: Activity; na: boolean; simulation?: boolean }

/** «ILC 26/10-NA-T-1»: the number of `spec` with this year, month and sequence. A
 *  simulation is «SIM …» — its kind is kept as a field, not in the number. */
export function composeSchemeNumber(spec: NumberSpec, yy: string, mm: string, seq: number): string {
  return `${spec.simulation ? "SIM" : spec.kind} ${yy}/${mm}${spec.na ? "-NA" : ""}-${spec.activity}-${seq}`;
}

/** The next sequence for an activity in a month: it counts within YY/MM and the
 *  activity — PTS and ILC, with or without NA, alike — whichever alphabet the existing
 *  numbers were typed in (N15; Zadanie §2: «брои се в рамките на същия месец и
 *  същата дейност»). Simulations count among themselves only (Реш. 130). */
export function nextSeq(numbers: string[], activity: Activity, year: string, month: number, simulation = false): number {
  const yy = year.slice(-2);
  const mm = String(month).padStart(2, "0");
  let max = 0;
  for (const n of numbers) {
    const p = parseSchemeNumber(n);
    if (p && p.simulation === simulation && p.yy === yy && p.mm === mm && p.activity === activity) max = Math.max(max, p.seq);
  }
  return max + 1;
}

/** The next number of `spec` in a month, and its URL id. */
export function nextSchemeNumber(numbers: string[], spec: NumberSpec, year: string, month: number): { id: string; number: string } {
  const number = composeSchemeNumber(spec, year.slice(-2), String(month).padStart(2, "0"), nextSeq(numbers, spec.activity, year, month, !!spec.simulation));
  return { id: schemeIdFromNumber(number), number };
}

// ── the fields (Реш. 102) ─────────────────────────────────────────────────────

/** A scheme's kind, activity and accreditation status — null where nothing says. */
export interface SchemeMarkers { kind: SchemeKind | null; activity: Activity | null; accredited: boolean | null }

interface Marked { number: string; type: "T" | "C"; kind?: SchemeKind; activity?: Activity; accredited?: boolean }

/** The scheme's markers: the fields it keeps; for a scheme from before 3.1, what its
 *  number states; null where neither says. A calibration scheme's workflow states its
 *  activity. */
export function schemeMarkers(s: Marked): SchemeMarkers {
  const r = readSchemeNumber(s.number);
  return {
    kind: s.kind ?? r?.kind ?? null,
    activity: s.activity ?? r?.activity ?? (s.type === "C" ? "C" : null),
    accredited: s.accredited ?? r?.accredited ?? null,
  };
}

/** The fields to keep for a scheme of `type` with this number: what the number
 *  states, the number decides; the rest is PTS's choice (`chosen`; null clears it).
 *  "activity": the number's (or the chosen) activity is not this workflow's — a
 *  calibration scheme is C, a testing one T or S. */
export function markersFor(
  number: string,
  type: "T" | "C",
  chosen: { kind?: SchemeKind | null; activity?: Activity | null; accredited?: boolean | null },
): { ok: true; kind?: SchemeKind; activity?: Activity; accredited?: boolean } | { ok: false; problem: "activity" } {
  const r = readSchemeNumber(number);
  const activity = r?.activity ?? (type === "C" ? "C" : chosen.activity ?? null);
  if (activity && (activity === "C") !== (type === "C")) return { ok: false, problem: "activity" };
  return {
    ok: true,
    kind: r?.kind ?? chosen.kind ?? undefined,
    activity: activity ?? undefined,
    accredited: r?.accredited ?? chosen.accredited ?? undefined,
  };
}

/** Which markers the number states — those the edit page shows as the number's, not
 *  as a choice. */
export function statedByNumber(number: string, type: "T" | "C"): { kind: boolean; activity: boolean; accredited: boolean } {
  const r = readSchemeNumber(number);
  return { kind: r?.kind != null, activity: r?.activity != null || type === "C", accredited: r?.accredited != null };
}

/** How the markers read, for staff screens. */
export function markerLabels(m: SchemeMarkers, lang: "bg" | "en"): { kind: string; activity: string; accredited: string } {
  const bg = lang === "bg";
  const none = bg ? "не е посочено" : "not stated";
  return {
    kind: m.kind === "PTS" ? (bg ? "Изпитване за пригодност (PTS)" : "Proficiency testing (PTS)")
      : m.kind === "ILC" ? (bg ? "Междулабораторно сравнение (ILC)" : "Interlaboratory comparison (ILC)") : none,
    activity: m.activity === "T" ? (bg ? "Изпитване (T)" : "Testing (T)")
      : m.activity === "S" ? (bg ? "Вземане на проби (S)" : "Sampling (S)")
      : m.activity === "C" ? (bg ? "Калибриране (C)" : "Calibration (C)") : none,
    accredited: m.accredited === true ? (bg ? "В обхвата на акредитацията" : "Within the accredited scope")
      : m.accredited === false ? (bg ? "Извън обхвата на акредитацията (NA)" : "Outside the accredited scope (NA)") : none,
  };
}
