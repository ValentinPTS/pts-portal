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
// Round 9 (T2): this masking is the ROUND EXPORT's coded part only (lib/round-export.ts — names.view); the journal
// PAGE uses redactActivityForStaff below: an allow-list, no guessing.
export function maskActivityForExport(e: ActivityEvent): ActivityEvent {
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

// The ROUND EXPORT's coded part (lib/round-export.ts) — served to who sees names only — reads a timeline entry so:
// the waybill-looking runs masked. Round 9 (T2): the PAGES no longer mask — they hide (redactCaseEventForStaff below).
// Entries a lab's upload stamped before part 0.1 carry the lab's e-mail and the uploaded file's name (which often
// names the lab); both are masked. Entries typed by staff, and the app's own stamps, are kept.
export function maskCaseEventForExport(e: CaseEvent): CaseEvent {
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

// ── Round 9 (T2): the journal for who sees no names in the line's scheme — an allow-list ──────────────────────
// Ivaylo, 2026-11-13 (option b): no typed words of a participation to a codes-only role, whatever they look like.
// A line shows its words only when its action is listed here, with why; every other action — and any new one
// until it is placed here (scripts/security-sweep.test.ts «round 9» fails until it is) — shows its label, its code
// and its time, and says the words are for who sees names.
export const SUMMARY_SHOWN: Readonly<Record<string, string>> = {
  // ── words built from the record's own data: codes, dates, states, counts, the app's fixed words, PTS's people ──
  "application.approved": "the code and the free numbers", "application.rejected": "fixed words",
  "auth.2fa_reset": "whose — an e-mail, masked below — and counts", "auth.login": "how (a method)", "auth.logout": "fixed words",
  "auth.password_changed": "fixed words", "auth.password_set": "fixed words", "auth.reset_requested": "fixed words",
  "carrier.choice_cancelled": "the code — the reason is not in it", "carrier.chosen": "the code", "carrier.offer_added": "the code",
  "carrier.offer_removed": "the code", "carrier.offers_sent": "the code and a count",
  "case.voided": "the step's kind and day — the reason is not in it",
  "catalogue.next": "a count and the scheme's number",
  "certificate.checked": "the code and the report's R", "certificate.content_typed": "the code, R, a count, the languages",
  "certificate.numbered": "the code", "certificate.released": "the code, R, the languages", "certificate.updated": "the code",
  "chain.dispatched": "fixed words", "chain.handed_over": "the code", "chain.order": "a count", "chain.received": "the code",
  "chain.returned": "fixed words", "chain.stamped": "the stop, the code and how — the note is not in it",
  "cover.default": "fixed words", "provider.head": "fixed words",
  "declaration.recorded": "PTS's person and the day", "declaration.signed": "the code, the document, its edition",
  "delivery.dispatched": "the code, the day, «with a waybill» — never the waybill (older lines: cut below)",
  "delivery.problem": "the code — the laboratory's words are not in it", "delivery.problem_resolved": "the code — the note is not in it",
  "doc.acknowledged": "the code, the document, its edition", "doc.approved": "the document and its version",
  "doc.numbers_cited": "the document and the schemes' numbers it cites", "doc.ready": "the document", "doc.reopened": "the document",
  "doc.restored": "the document and its version", "doc.saved": "the document", "doc.sent": "the document, its edition, codes and counts",
  "doc.source": "a state", "doc.unsent": "the document and a code", "doc.upload_removed": "the document", "doc.uploaded": "the document",
  "entity.admin_changed": "states and counts", "entity.checked": "a state or a count", "entity.created": "fixed words",
  "entity.erased": "counts", "entity.state": "states and counts", "entity.updated": "the names of the fields changed",
  "entityuser.accepted": "fixed words", "entityuser.created": "a role", "entityuser.invited": "fixed words",
  "entityuser.state": "states", "entityuser.updated": "the names of the fields changed or a role",
  "file.downloaded": "what was opened (a document, an edition), PTS's person",
  "lab.added": "fixed words", "lab.invited": "fixed words", "lab.status": "a state",
  "lab.uploaded": "the slot (older lines carried the file name: cut below)",
  "lab_application.approved": "fixed words (older lines: an e-mail, masked below)", "lab_application.rejected": "fixed words",
  "lab_application.removed": "counts", "labdoc.removed": "the slot and the code",
  "laboratory.created": "fixed words", "laboratory.state": "states", "laboratory.updated": "the names of the fields changed",
  "mail.test": "fixed words", "message.failed": "the class, the kind, PTS's person, the transport's error (addresses masked)",
  "message.oneway": "the code or a count — the message is not in it", "message.sent": "the class, the kind, PTS's person",
  "names.viewed": "where, and counts", "notice.released": "fixed words", "notice.withheld": "fixed words",
  "notify.run": "counts and the job's own error",
  "participant.added": "the code and the free numbers", "participant.admitted": "the code",
  "participant.annulled": "the code and the state — the source is not in it", "participant.applied_online": "the code",
  "participant.frozen": "the version — the reason is not in it", "participant.refused": "the code, the state, the category — the reason is not in it",
  "participant.updated": "the code", "participant.withdrawn": "the code and the state — the source is not in it",
  "payment.marked": "the code", "payment.unmarked": "the code",
  "processing.designated": "PTS's people and the acts — the justification is not in it",
  "profile.confirmed": "a state", "profile.notice_resent": "a kind and a state", "profile.saved": "the names of the fields changed",
  "receipt.protocol": "the code and fit / not fit — the laboratory's words are not in it",
  "registration.approved": "a state", "registration.became_join": "fixed words", "registration.join_approved": "states",
  "registration.join_rejected": "fixed words — the reason is not in it", "registration.join_stuck": "the portal's own reason",
  "registration.rejected": "fixed words — the reason is not in it", "registration.submitted": "fixed words",
  "report.access": "the code and R — a hand opening's reason is not in it",
  "report.corrected": "R, the 2.0 version, ids, codes — the reason is not in it", "report.issued": "R, the 2.0 version, ids",
  "report.uxpt_confirmed": "the answer — the note is not in it",
  "results.auto_assigned": "numbers", "results.cleared": "the scheme's own points", "results.conflict": "fixed words",
  "results.corrected": "the code, the version, the field — the reason is not in it", "results.exported_2_0": "counts and codes",
  "results.imported_2_0": "the version and counts", "results.locked": "counts and codes",
  "results.review_note": "the code — the note is not in it", "results.saved": "numbers",
  "results.submitted": "the code and the version", "results.transfer_checked": "yes / no — the note is not in it",
  "results.unlocked": "the code and the day — the reason is not in it", "round.exported": "counts",
  "scheme.ack": "the document and a state", "scheme.applications": "a state", "scheme.archived": "the scheme's number",
  "scheme.characteristics": "a version", "scheme.coding": "counts", "scheme.created": "the number, kind, activity",
  "scheme.dates": "dates", "scheme.delivery_min_days": "numbers", "scheme.number": "the number, kind, activity",
  "scheme.reference_values": "a version and a count", "scheme.window": "a number",
  "testclock.set": "a time", "validation.criteria_recorded": "the edition, a day, the levels",
  "validation.replay_failed": "the portal's own reason", "validation.replay_imported": "numbers and counts",
  "validation.test_recorded": "the level, the scheme, a day, the result", "validation.test_voided": "the level, a day, the scheme",
  "website.published": "a version and a count",
  // ── texts PTS types about its own work, no participation in them — kept visible (Ivaylo's decision 2) ──
  "batch.created": "the batch's label and material (PTS's)", "batch.drawn": "the batch's label (PTS's) and counts",
  "batch.homogeneity": "the batch's label (PTS's) and counts", "batch.record": "the batch's record reference (PTS's)",
  "batch.updated": "the batch's label (PTS's)", "catalogue.wish": "the scheme's own subject and number",
  "change.authorised": "the change register's title (software)", "change.proposed": "the change register's title (software)",
  "change.rejected": "the change register's title and reason (software)",
  "declaration.voided": "PTS's person and the reason (PTS's own declaration)",
  "doc.edition": "the edition's reason and scope, an amendment's line (the scheme's documents)",
  "folder.created": "the folder's name (PTS's filing)", "folder.deleted": "the folder's name", "folder.renamed": "the folder's name",
  "holiday.added": "the day off's name", "holiday.removed": "the day off's name",
  "results.reopened": "the act's note (the scheme's processing)", "scheme.amendment": "the order of amendment: number, reason, dates",
  "scheme.commercial": "the scheme's prices and terms", "scheme.lists": "the scheme's lists", "scheme.meta": "the scheme's design data",
  "scheme.renamed": "the scheme's name", "scheme.stage": "the stage and its note", "scheme.state": "the act, the states and its note",
  "scheme.texts": "the scheme's document texts (M1)",
  "scheme_role.assigned": "PTS's person, the role, the Order's reference", "scheme_role.ended": "PTS's person and the role",
  "template.approved": "the reminder's text (PTS's)", "template.saved": "the reminder's text (PTS's)",
  "validation.criteria_voided": "the edition and the reason (PTS's own record)",
};
/** Typed by a person about one participation — never to who sees no names; and the old actions no line is written
 *  under any more, whose words are not known. Listed so the test can tell «placed» from «forgotten». */
export const SUMMARY_HIDDEN: Readonly<Record<string, string>> = {
  "case.updated": "a timeline step's reference, as typed",
  "deadline.extended": "an extension's order number and reason, as typed",
  "labdoc.uploaded": "an invoice's or a proforma's number, as typed",
  "case.removed": "an older action — its words not known", "certificate.issued": "an older action — its words not known",
  "scheme.deleted": "an older action — its words not known",
};
// the keys under which the app itself writes a string into before / after — states, dates, enums, codes, versions,
// ids (masked below); a string under any other key is typed (a reason, a note, a name, a number from outside): «•••»
const STRUCTURED_KEYS = new Set([
  "status", "state", "until", "day", "time", "at", "orderDate", "signedOn", "testedOn", "preparedOn", "version", "configVersion",
  "approvedVersion", "r", "langs", "scope", "scopeFrom", "source", "edition", "editionNo", "sha", "reportSha", "sha256", "digest",
  "check", "exportId", "importId", "id", "uxpt", "answer", "via", "kind", "kindGiven", "docKey", "lang", "docs", "shipment", "stop",
  "failed", "codes", "told", "nr", "outside", "role", "permanentRole", "reviewerBasis", "coincide", "fields", "vies", "notice",
  "decidedAs", "origin", "field", "key", "mime", "result", "levels", "criteriaEdition", "of", "on", "wish", "unlock", "activity",
  "dates", "roles", "counts", "code", "slot", "level",
]);
// …whose own keys are data, not names (a date's key, a role, a counter): their strings are structured too
const STRUCTURED_PARENTS = new Set(["dates", "roles", "counts", "uxpt"]);
const idsOnly = (v: string): string => (IDENTITY_REF.test(v) ? scrubRef(v)! : UUID.test(v) ? MASK : v.replace(EMAIL, "•••@•••"));
function structuredOnly(v: unknown, key = "", depth = 0): unknown {
  if (v === null || v === undefined || typeof v === "number" || typeof v === "boolean") return v;
  if (IDENTITY_KEYS.has(key)) return MASK;
  if (typeof v === "string") return STRUCTURED_KEYS.has(key) ? idsOnly(v) : MASK;
  if (depth > 6) return MASK;
  if (Array.isArray(v)) return v.map((x) => structuredOnly(x, key, depth + 1));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, structuredOnly(x, STRUCTURED_PARENTS.has(key) ? key : k, depth + 1)]));
  return MASK;
}
// lines written by earlier releases, in a listed action, that carried typed words: cut as before (known forms only)
const olderForms = (action: string, s: string): string =>
  action === "lab.uploaded" ? s.replace(/^(Lab upload: \S+)[\s\S]*$/, "$1")
  : action === "delivery.dispatched" ? s.replace(/(, (?:waybill|товарителница) )[\s\S]*$/, "$1•••")
  : s;
export type ShownActivityEvent = ActivityEvent & { summaryHidden?: true };
export function redactActivityForStaff(e: ActivityEvent): ShownActivityEvent {
  // a line about PTS's own people: as before (their e-mails are not secret)
  if (STAFF_ACTIONS.test(e.action)) return maskActivityForExport(e);
  // the actor's rules and the subject's id — as before
  const base = maskActivityForExport({ ...e, summary: "", before: undefined, after: undefined });
  const shown = Object.prototype.hasOwnProperty.call(SUMMARY_SHOWN, e.action);
  return {
    ...base,
    summary: shown ? olderForms(e.action, e.summary).replace(EMAIL, "•••@•••") : "",
    ...(shown ? {} : { summaryHidden: true as const }),
    before: structuredOnly(e.before),
    after: structuredOnly(e.after),
  };
}

// ── Round 9 (T2): who sees no names reads no typed words of a timeline step ────────────────────────────────────
// Ivaylo, 2026-11-13 (option b): no guessing which words are a waybill — for a viewer WITHOUT names.view in the
// scheme (the quality manager, the reviewer, the experts, the software administrator, the head, the auditor) a
// step's reference, note and reason for voiding are never shown, whatever they contain — but the app's own note on a
// step it stamped (AUTO_NOTE_KINDS); its kind, day, document, source and who recorded it are. `hidden` says which were there, so the page can say the words exist and who
// reads them. A laboratory's own e-mail as the recorder (stamps before part 0.1) stays «laboratory».
export type CaseEventText = "ref" | "note" | "voidReason";
export type ShownCaseEvent = CaseEvent & { hidden?: CaseEventText[] };
// The app's OWN note on a step it stamped itself (source «auto»), kept for who sees no names — only of these kinds,
// each read where it is written (lib/actions.ts; every form since 5ccf5d4): built only from the record's data, never
// from what a person typed. A new auto stamp of a listed kind fails scripts/security-sweep.test.ts «round 9» until its
// note is read for this list. Not listed: items_dispatched — PTS's dispatch note names the documents from the
// scheme's list (words PTS typed); a step recorded by PTS by hand («manual», the chain's stamps too) — never.
export const AUTO_NOTE_KINDS: Readonly<Record<string, string>> = {
  receipt_confirmed: "the laboratory's upload (fixed words), its online protocol (the time, fit / not fit, the packaging), the device's arrival (the time)",
  results_returned: "the laboratory's upload (fixed words), its online results (the version, «under PTS's unlock»)",
  other: "the device handed on by the laboratory (the time)",
};
export function redactCaseEventForStaff(e: CaseEvent): ShownCaseEvent {
  const appsOwn = e.source === "auto" && Object.prototype.hasOwnProperty.call(AUTO_NOTE_KINDS, e.kind);
  // (a step the app stamped itself: its reference is the app's too — «v1», «certificate» — kept out all the same (an
  // older upload stamp carried the file's name there) but never announced as typed words, round 9 review)
  const hidden = (["ref", "note", "voidReason"] as const).filter((k) => !!e[k] && !(appsOwn && (k === "note" || k === "ref")));
  const recordedBy = e.source === "auto" && e.recordedBy.includes("@") ? LAB_RECORDER : e.recordedBy;
  if (!hidden.length && !e.ref && recordedBy === e.recordedBy) return e;
  return { ...e, ref: undefined, ...(appsOwn ? {} : { note: undefined }), voidReason: undefined, recordedBy, ...(hidden.length ? { hidden: [...hidden] } : {}) };
}
