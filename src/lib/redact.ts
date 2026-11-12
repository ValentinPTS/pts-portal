import type { ActivityEvent, CaseEvent } from "./types";

// What staff and auditors may read of the journal and the case-file timeline
// (§4.2, finding N4). Pure, no I/O — the pages, the audit pack and the tests share it.

// A laboratory account acts under its participant code (targetCode), never its
// e-mail: an e-mail next to a code is the name↔code link (§4.2, finding N4).
export const LAB_ACTOR = "laboratory";

// Journal lines about staff accounts name staff by e-mail, which is not secret.
// Every other line must not carry an e-mail at all.
const STAFF_ACTIONS = /^(staff\.|role\.)/;
// (bounded as an address is — 64 before the «@», 253 after: unbounded, a long line with no «@» took seconds
// on every reading of the journal; round 5, R5SA-7)
const EMAIL = /[^\s@<>()"'“”„,;:]{1,64}@[^\s@<>()"'“”„,;:]{1,253}\.[a-z]{2,24}/gi;

// What a non-manager may read of one journal line (§4.2, N4). Lines written before
// part 0.1 can still carry a laboratory's e-mail — as the actor or in the text — or
// the name of a file the lab uploaded; both are masked on display. The log itself
// is never changed: it stays append-only.
export function redactActivityForStaff(e: ActivityEvent): ActivityEvent {
  let summary = e.summary;
  // old form «Lab upload: <slot> (<file name>)» — the file name may itself hold
  // brackets, so the line is rebuilt from the slot rather than trimmed
  if (e.action === "lab.uploaded") summary = summary.replace(/^(Lab upload: \S+)[\s\S]*$/, "$1");
  if (!STAFF_ACTIONS.test(e.action)) summary = summary.replace(EMAIL, "•••@•••");
  // Part 1.9: an actor outside PTS's own roles (a laboratory, an account the portal
  // did not recognise) is never shown by address; and a laboratory's account id —
  // the same in every scheme — never sits next to its per-scheme codes.
  const team = TEAM_ROLES.has(e.actorRole);
  const mask = (v: string | undefined) => (v && !team && new RegExp(EMAIL.source, "i").test(v) ? "•••@•••" : v);
  // the security sweep (SA-1, SC-1): an organisation's, a laboratory's or a user's id is the same
  // in every scheme — next to a code it links that code to the others, and /organizations to a
  // name; a courier's waybill leads to the laboratory's address (SC-3). Never shown here, in the
  // line's subject, its before/after or its text — lines about PTS's own people excepted.
  const staffLine = STAFF_ACTIONS.test(e.action);
  if (!staffLine) summary = maskWaybills(summary)
    // an older line typed by hand: «Timeline: items_dispatched for <code> (<waybill>)» (round 2, R2S-3)
    .replace(/^(Timeline: (?:items_dispatched|receipt_confirmed) for \S+) \([^)]*\)/, "$1 (•••)");
  // an older DISPATCH line: its waybill was the line's last words, commas and all (R3S-4) — that line only
  if (!staffLine && e.action === "delivery.dispatched") summary = summary.replace(/(, (?:waybill|товарителница) )[\s\S]*$/, "$1•••");
  return {
    ...e,
    actorEmail: e.actorRole === "lab" ? LAB_ACTOR : mask(e.actorEmail) ?? "",
    actorName: e.actorRole === "lab" ? LAB_ACTOR : mask(e.actorName),
    actorId: team ? e.actorId : undefined,
    summary,
    subject: staffLine ? e.subject : scrubRef(e.subject),
    before: staffLine ? e.before : scrubIdentity(e.before),
    after: staffLine ? e.after : scrubIdentity(e.after),
  };
}
const TEAM_ROLES = new Set(["manager", "staff", "auditor", "internal", "system"]);

// an identity's reference: «entity:<id>», «entityuser:<id>», «lab:<id>»… — its kind kept, its id not
const IDENTITY_REF = /^(entity|entityuser|lab|laboratory|user|auth|registration):\s*\S/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// keys that hold who: an account, an organisation, a laboratory, a person, a courier's waybill
const IDENTITY_KEYS = new Set(["by", "entity", "entityId", "lab", "labId", "laboratory", "laboratoryId", "user", "userId", "entityUserId", "authUserId", "admin", "email", "waybill", "accountsLeft", "documentsLeft"]);
// a waybill typed with spaces («62 123 456 789») is masked whole, to the next «,», «;», «)» or the end;
// «товарителница» too («\b» is ASCII-only in a JS pattern — it never matched; round 3, R3S-4)
// A courier's reference after its word — «товарителница», «пратка», «тов. №», «waybill», «AWB», «tracking»,
// a courier's name — masked; only the reference, never the words after it (round 5, R5SA-6). Between the word
// and the reference, up to a few short words and signs («номер», «с», «No:», «(», «„», «=» — round 6, R6S-2:
// «товарителница номер 62 555 444 333» went through). A reference: a first token with a digit in it, then the
// next ones that start with a digit. Bounded and unambiguous — no run the engine can backtrack into.
const WAYBILL_TEXT = /(^|[^\p{L}\p{N}_])(waybills?|way-bills?|awb|tracking|товарителниц\p{L}*|пратк\p{L}*|тов\.|speedy|спиди|econt|еконт|dhl|ups|fedex|tnt|dpd|gls|европът|box\s?now|sameday|leo\s?express)((?:[\s:№#.,=„“”"'(\[\-–—]|(?:номер|номерът|с|е|no|nr|num|number|is|ad|ад|express)(?=[\s:№#.,=„“”"'(\[\-–—])){0,24})(?=[\p{L}\p{N}](?:[\p{L}\p{N}\-–—/]|\.(?=\p{N}))*\p{N})[\p{L}\p{N}](?:[\p{L}\p{N}\-–—/]|\.(?=\p{N}))*(?:(?:\s+|\s*,\s*|\s+(?:и|and)\s+)\p{N}(?:[\p{N}\-–—/]|\.(?=\p{N}))*)*/giu;
// (a dot only between digits — «62.555.444.333»; a sentence's own full stop stays)
// …a word any parcel goes by («куриер», «колет», «parcel», «проследяване») — only before a reference of six
// digits or more (a «куриер 2 дни» is no waybill — round 7, R7S-5)
const PARCEL_TEXT = /(^|[^\p{L}\p{N}_])(куриер\p{L}*|courier|колет\p{L}*|parcel|shipment|проследяван\p{L}*)((?:[\s:№#.,=„“”"'(\[\-–—]|(?:номер|номерът|с|е|no|nr|num|number|is|ref)(?=[\s:№#.,=„“”"'(\[\-–—])){0,24})(?=(?:\p{N}[\s.\-–—/]?){6})\p{N}(?:[\s.\-–—/]?\p{N})*/giu;
// …and any run of ten digits or more (spaces — a non-breaking one too —, dots and dashes inside), with or
// without its word: that is what a waybill looks like (round 6, R6S-2; round 7, R7S-5)
const LONG_NUMBER = /(^|[^\p{N}])(\p{N}(?:[ \u00A0\u202F.\-–—]?\p{N}){9,})(?![\p{N}])/gu;
// What a codes-only reader needs and is never a waybill however long its digits run: a date and its hour, a
// standard's number («EN 1097-2 1097-3», «ISO/IEC 17043:2023») — held aside while the mask runs (R7S-5)
// (bounded on both sides — «OPEN 625554443331» held «EN 62555» and let the rest through; a decimal with a dot
// held whole — «10.123456789» was masked; round 7 review, RV7-4)
const KEEP = /(?<![\p{N}])\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?![\p{N}])|(?<![\p{N}.])\d{1,2}\.\d{1,2}\.\d{4}(?:[ \u00A0]+\d{1,2}:\d{2})?(?![\p{N}])|(?<![\p{L}\p{N}])(?:EN|ISO|IEC|БДС|BDS|ASTM|DIN|ГОСТ)(?![\p{L}])(?:[\s/]+(?:EN|ISO|IEC)(?![\p{L}]))*[\s\u00A0]*\d{2,5}(?:-\d{1,2}){0,2}(?::\d{4})?(?![\p{N}\-])(?:[\s\u00A0]*[,;]?[\s\u00A0]+(?:и\s+)?\d{2,5}(?:-\d{1,2}){1,2}(?![\p{N}\-]))*/gu;
// …and, against the long-run pass only, measurements: a run of short decimals with no digit group after it (round 8
// review, RV8-1: held before the courier's word was read, «товарителница 62.555 444 333» went through whole)
const SHORT_DECIMALS = /(?<![\p{N}.,])\p{N}{1,4}[.,]\p{N}{1,3}(?:[\s\u00A0]+\p{N}{1,4}[.,]\p{N}{1,3})*(?![\p{N}.,])(?![\s\u00A0]*\p{N})/gu;
// …and a long decimal («0,123456789») the same way — after the courier word was read, never before it (round 8 final
// check: «AWB 1234.567890» was held as a decimal and went through)
const LONG_DECIMAL = /(?<![\p{N}.,])\p{N}{1,6}[.,]\p{N}{4,9}(?![\p{N}.,])/gu;
// …and, of a long run: an amount («1 234 567 890,00 лв.» — a decimal's long fraction up to nine digits is held by
// KEEP; a longer one reads as a number), or participation
// codes side by side («26111716 26111750», «T-17 26111716» — eight digits each)
function keepRun(before: string, run: string, after: string): boolean {
  // (an amount by its cents «,00» or its currency — never a «,» before another long run: two waybills «…333,…334»
  // read as a decimal and both went through — round 8, R8S-3)
  // (…and written in thousands — «1 234 567 890» — «62555444333,5» is no amount, round 8 final check)
  const groups = run.split(/[^\p{N}]+/u).filter(Boolean);
  const thousands = groups.length > 1 && groups[0].length <= 3 && groups.slice(1).every((g) => g.length === 3);
  if (thousands && (/^[,.]\d{1,2}(?!\p{N})/u.test(after) || /^[\s\u00A0]*(?:лв|bgn|eur|€|евро)/iu.test(after))) return true;
  // participation codes: eight digits each — or a scheme's number's last digits right before one («T-17 26111716»)
  if (groups.length > 1 && groups.every((g) => g.length === 8)) return true;
  return groups.length >= 2 && groups[0].length <= 3 && /[\p{L}]-$/u.test(before) && groups.slice(1).every((g) => g.length === 8);
}
function maskWaybills(v: string): string {
  const held: string[] = [];
  const put = (m: string) => `\uE000${held.push(m) - 1}\uE001`;
  const hold = v.replace(/[\uE000\uE001]/g, "").replace(KEEP, put);
  return hold
    // («пратка 26111716» — a participation's code after the word, kept as after «колет»; R8S-3)
    .replace(WAYBILL_TEXT, (m: string, pre: string, word: string, mid: string) => (/^пратк/iu.test(word) && /^\p{N}{8}$/u.test(m.slice(pre.length + word.length + mid.length)) ? m : `${pre}${word} \u2022\u2022\u2022`))
    // (a lone eight-digit reference after such a word is a participation's code — «колет 26111716»)
    .replace(PARCEL_TEXT, (m: string, pre: string, word: string, mid: string) => (/^\p{N}{8}$/u.test(m.slice(pre.length + word.length + mid.length)) ? m : `${pre}${word} \u2022\u2022\u2022`))
    .replace(LONG_DECIMAL, put)
    .replace(SHORT_DECIMALS, put)
    .replace(LONG_NUMBER, (m: string, pre: string, run: string, at: number, all: string) => (keepRun(all.slice(0, at + pre.length), run, all.slice(at + m.length)) ? m : `${pre}\u2022\u2022\u2022`))
    .replace(/\uE000(\d+)\uE001/g, (_: string, i: string) => held[Number(i)] ?? "");
}
const MASK = "•••";
function scrubRef(v: string | undefined): string | undefined {
  if (!v) return v;
  const m = v.match(/^([a-z]+):/i);
  return m && IDENTITY_REF.test(v) ? `${m[1]}:${MASK}` : v;
}
export function scrubIdentity(v: unknown, depth = 0): unknown {
  if (typeof v === "string") {
    if (IDENTITY_REF.test(v)) return scrubRef(v);
    if (UUID.test(v)) return MASK;
    return maskWaybills(v.replace(EMAIL, "•••@•••"));
  }
  if (Array.isArray(v)) return depth > 6 ? MASK : v.map((x) => scrubIdentity(x, depth + 1));
  if (v && typeof v === "object") {
    if (depth > 6) return MASK;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, IDENTITY_KEYS.has(k) && x !== null && x !== undefined ? MASK : scrubIdentity(x, depth + 1)]));
  }
  return v;
}

// What the laboratory itself stamps (its portal upload) is recorded as the
// laboratory, never its e-mail — the entry already carries the code (§4.2, N4).
export const LAB_RECORDER = "laboratory";

// What a non-manager may read of one timeline entry. Entries a lab's upload stamped
// before part 0.1 carry the lab's e-mail and the uploaded file's name (which often
// names the lab); both are masked on display. Entries typed by staff, and the
// app's own stamps, are shown as they are.
export function redactCaseEventForStaff(e: CaseEvent): CaseEvent {
  // a dispatch's or a receipt's reference is the courier's waybill — its tracking page shows
  // where the object went (the security sweep, SC-3): never to who does not see names
  // …typed by hand too: a calibration scheme's dispatch is recorded only so (round 2, R2S-3)
  // …and «documents sent» too: its reference is a courier's as often as not (round 5, R4U-4 / Q7)
  const waybill = (e.kind === "items_dispatched" || e.kind === "receipt_confirmed" || e.kind === "docs_sent") && !!e.ref;
  if (waybill) e = { ...e, ref: undefined };
  // …and a waybill written into any step's reference or note, whatever its kind (round 4, R4S-7, R4U-4:
  // «получено с куриер, товарителница 62 555 444 333» reached the quality manager, the auditor, the expert)
  // …and its cancellation's reason (round 5, R5SA-5)
  const scrub = (v: string | undefined) => (v ? maskWaybills(v) : v);
  const ref = scrub(e.ref), note = scrub(e.note), voidReason = scrub(e.voidReason);
  if (ref !== e.ref || note !== e.note || voidReason !== e.voidReason) e = { ...e, ref, note, voidReason };
  if (e.source !== "auto" || !e.recordedBy.includes("@")) return e;
  return { ...e, recordedBy: LAB_RECORDER, ref: undefined };
}
