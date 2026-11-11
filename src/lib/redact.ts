import type { ActivityEvent, CaseEvent } from "./types";

// What staff and auditors may read of the journal and the case-file timeline
// (§4.2, finding N4). Pure, no I/O — the pages, the audit pack and the tests share it.

// A laboratory account acts under its participant code (targetCode), never its
// e-mail: an e-mail next to a code is the name↔code link (§4.2, finding N4).
export const LAB_ACTOR = "laboratory";

// Journal lines about staff accounts name staff by e-mail, which is not secret.
// Every other line must not carry an e-mail at all.
const STAFF_ACTIONS = /^(staff\.|role\.)/;
const EMAIL = /[^\s@<>()"'“”„,;:]+@[^\s@<>()"'“”„,;:]+\.[a-z]{2,}/gi;

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
  if (!staffLine) summary = summary.replace(WAYBILL_TEXT, "$1$2 •••")
    // an older line typed by hand: «Timeline: items_dispatched for <code> (<waybill>)» (round 2, R2S-3)
    .replace(/^(Timeline: (?:items_dispatched|receipt_confirmed) for \S+) \([^)]*\)/, "$1 (•••)")
    // an older dispatch line: its waybill was the line's last words, commas and all (R3S-4)
    .replace(/(, (?:waybill|товарителница) )[\s\S]*$/, "$1•••");
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
// …and with no space after the word, or a sign between («waybill:621…», «Waybill-621…», «товарителница№621…»),
// the plural, «AWB» (round 4, R4S-7); the word alone, with nothing after it, is left
const WAYBILL_TEXT = /(^|[^\p{L}\p{N}_])(waybills?|awb|товарителниц\p{L}*)[\s:№#.\-–—]*(?=[^\s,;)])[^,;)]+/giu;
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
    return v.replace(EMAIL, "•••@•••").replace(WAYBILL_TEXT, `$1$2 ${MASK}`);
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
  const waybill = (e.kind === "items_dispatched" || e.kind === "receipt_confirmed") && !!e.ref;
  if (waybill) e = { ...e, ref: undefined };
  // …and a waybill written into any step's reference or note, whatever its kind (round 4, R4S-7, R4U-4:
  // «получено с куриер, товарителница 62 555 444 333» reached the quality manager, the auditor, the expert)
  const scrub = (v: string | undefined) => (v ? v.replace(WAYBILL_TEXT, `$1$2 ${MASK}`) : v);
  const ref = scrub(e.ref), note = scrub(e.note);
  if (ref !== e.ref || note !== e.note) e = { ...e, ref, note };
  if (e.source !== "auto" || !e.recordedBy.includes("@")) return e;
  return { ...e, recordedBy: LAB_RECORDER, ref: undefined };
}
