// The per-scheme lists (plan part 3.8; Zadanie §16–17; Реш. 108, 154; D18). Pure.
//
//   - the SHIPMENT DOCUMENTS — what travels with the objects of this scheme, as PTS
//     lists them (the waybill — Zadanie: «Обектът се изпраща с товарителница» — is
//     offered first among the quick choices, never added on its own; a safety
//     declaration, customs documents …). Dispatch (5.6) shows the list to the one who
//     sends, as a check;
//   - the RECEIPT-PROTOCOL CHECKLIST — what the participant checks on receipt, on the
//     online Ф 7.3.4-1 (5.6). A calibration scheme starts with the checks its own
//     Instruction names (Zadanie App. — the calibration Instruction, §18: visible
//     mechanical damage, functional fitness, lasting contamination, condensation,
//     other signs), stored when the scheme is made; a testing scheme starts empty —
//     PTS writes what applies;
//   - «ACCREDITATION REQUIRED» — a flag that WARNS, never refuses (Реш. 108:
//     accreditation is no condition of registration).
//
// Each item has a stable id (never reused), so what a participant ticked on a
// protocol stays tied to the check it answered when the list is reordered or edited.

export interface ListItem { id: string; bg: string; en: string }
export interface SchemeLists {
  shipmentDocs?: ListItem[];
  receiptChecks?: ListItem[];
  accreditationRequired?: boolean;
  /** the last item id given — an id is never given twice */
  seq?: number;
}

export const MAX_ITEMS = 30;
export const MAX_ITEM_TEXT = 200;

/** Quick choices offered in the editor — PTS picks; nothing is added on its own. */
export const SHIPMENT_SUGGESTIONS: { bg: string; en: string }[] = [
  { bg: "Товарителница", en: "Waybill" },
  { bg: "Инструкция за участниците", en: "Instructions for participants" },
  { bg: "Протокол за получаване на обект (Ф 7.3.4-1)", en: "Protocol for PT item receipt (F 7.3.4-1)" },
  { bg: "Декларация за безопасност", en: "Safety declaration" },
  { bg: "Митнически документи", en: "Customs documents" },
];

/** A calibration scheme's starting checklist — the checks its Instruction names (M1 §18). */
export const CALIBRATION_RECEIPT_CHECKS: { bg: string; en: string }[] = [
  { bg: "Няма видими механични повреди", en: "No visible mechanical damage" },
  { bg: "Обектът е функционално изправен", en: "The item is functionally fit" },
  { bg: "Няма трайно замърсяване", en: "No lasting contamination" },
  { bg: "Няма конденз", en: "No condensation" },
  { bg: "Няма други признаци, които могат да повлияят на годността за калибриране", en: "No other signs that could affect its fitness for calibration" },
];

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, " ").replace(/\s+/g, " ").trim();

export type ListProblem = "too-many" | "too-long" | "half";

/** The next id must stand above every id either list holds — whatever the counter
 *  says (an import, a hand fix): an id is never given twice (3.8 review). */
export function listSeq(l: SchemeLists | undefined): number {
  const ids = [...(l?.shipmentDocs ?? []), ...(l?.receiptChecks ?? [])].map((i) => Number(/^li-(\d+)$/.exec(i.id)?.[1] ?? 0));
  return Math.max(l?.seq ?? 0, 0, ...ids);
}

/** One list as posted: rows of (id, bg, en). A blank row is dropped; a row with only
 *  one language is refused (both are printed); a known id is kept, a new row gets the
 *  next «li-N»; a crafted duplicate id gets a new one. */
export function readList(rows: { id: string; bg: string; en: string }[], known: readonly ListItem[] | undefined, seq: number, posted = rows.length):
  { ok: true; items: ListItem[]; seq: number } | { ok: false; problem: ListProblem; row?: number; text?: string } {
  // more rows posted than a list holds: refused, never cut short in silence (3.8 review)
  if (posted > MAX_ITEMS) return { ok: false, problem: "too-many" };
  const knownIds = new Set((known ?? []).map((i) => i.id));
  const used = new Set<string>();
  let next = seq;
  const items: ListItem[] = [];
  for (let k = 0; k < rows.length; k++) {
    const bg = clean(rows[k].bg), en = clean(rows[k].en);
    if (!bg && !en) continue;
    // the row's own words travel with the refusal — after it the form shows what was
    // saved, and «row 2» alone would point at nothing (3.8 review)
    const text = Array.from(bg || en).slice(0, 40).join("");
    if (!bg || !en) return { ok: false, problem: "half", row: k + 1, text };
    if ([...bg].length > MAX_ITEM_TEXT || [...en].length > MAX_ITEM_TEXT) return { ok: false, problem: "too-long", row: k + 1, text };
    const id0 = clean(rows[k].id);
    let id: string;
    if (id0 && knownIds.has(id0) && !used.has(id0)) id = id0;
    else { next += 1; id = `li-${next}`; }
    used.add(id);
    items.push({ id, bg, en });
  }
  if (items.length > MAX_ITEMS) return { ok: false, problem: "too-many" };
  return { ok: true, items, seq: next };
}

export const LIST_PROBLEM_TEXT: Record<ListProblem, { bg: string; en: string }> = {
  "too-many": { bg: `списъкът е до ${MAX_ITEMS} реда`, en: `a list has ${MAX_ITEMS} rows at most` },
  "too-long": { bg: `ред е до ${MAX_ITEM_TEXT} знака`, en: `a row is ${MAX_ITEM_TEXT} characters at most` },
  half: { bg: "всеки ред е на български и на английски", en: "each row is in Bulgarian and in English" },
};

/** The lists a new scheme starts with: a calibration one, its Instruction's checks. */
export function startingLists(type: "T" | "S" | "C"): SchemeLists | undefined {
  if (type !== "C") return undefined;
  const receiptChecks = CALIBRATION_RECEIPT_CHECKS.map((c, i) => ({ id: `li-${i + 1}`, ...c }));
  return { receiptChecks, seq: receiptChecks.length };
}

/** The lists in force: a calibration scheme that never saved its lists has its
 *  Instruction's checks (the schemes made before 3.8 included). */
export const listsOf = (s: { type: "T" | "S" | "C"; lists?: SchemeLists }): SchemeLists => s.lists ?? startingLists(s.type) ?? {};

/** What changed, for the journal — each row by its id: added, removed, reworded (both
 *  wordings, both languages), moved (3.8 review). */
export function listsDiff(before: SchemeLists, after: SchemeLists): string[] {
  const out: string[] = [];
  const one = (label: string, b: ListItem[] = [], a: ListItem[] = []) => {
    const was = new Map(b.map((i) => [i.id, i]));
    const now = new Map(a.map((i) => [i.id, i]));
    const words = (i: ListItem) => `«${i.bg}» / «${i.en}»`;
    const parts: string[] = [];
    for (const i of a) { const w = was.get(i.id); if (!w) parts.push(`added ${i.id} ${words(i)}`); else if (w.bg !== i.bg || w.en !== i.en) parts.push(`reworded ${i.id} ${words(w)} → ${words(i)}`); }
    for (const i of b) if (!now.has(i.id)) parts.push(`removed ${i.id} ${words(i)}`);
    const order = (l: ListItem[]) => l.filter((i) => was.has(i.id) && now.has(i.id)).map((i) => i.id).join(",");
    if (order(b) !== order(a)) parts.push(`order ${a.map((i) => i.id).join(", ")}`);
    if (parts.length) out.push(`${label}: ${parts.join("; ")}`);
  };
  one("shipment documents", before.shipmentDocs, after.shipmentDocs);
  one("receipt checks", before.receiptChecks, after.receiptChecks);
  if (!!before.accreditationRequired !== !!after.accreditationRequired) out.push(`accreditation required: ${after.accreditationRequired ? "yes (warns only)" : "no"}`);
  return out;
}

/** Реш. 108: the warning when the scheme asks for accreditation and the applicant
 *  states none — a warning to PTS, never a refusal. */
// what people type for «none» counts as none (3.8 review)
const NONE = /^(?:[\s\p{P}\p{S}]*|няма|не|без|липсва|n\/?a|none|no|nil|-+)$/iu;
export const accreditationWarning = (lists: SchemeLists, accreditation: string | undefined) => !!lists.accreditationRequired && NONE.test(String(accreditation ?? "").trim());
