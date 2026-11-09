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
  return {
    ...e,
    actorEmail: e.actorRole === "lab" ? LAB_ACTOR : mask(e.actorEmail) ?? "",
    actorName: e.actorRole === "lab" ? LAB_ACTOR : mask(e.actorName),
    actorId: team ? e.actorId : undefined,
    summary,
  };
}
const TEAM_ROLES = new Set(["manager", "staff", "auditor", "internal", "system"]);

// What the laboratory itself stamps (its portal upload) is recorded as the
// laboratory, never its e-mail — the entry already carries the code (§4.2, N4).
export const LAB_RECORDER = "laboratory";

// What a non-manager may read of one timeline entry. Entries a lab's upload stamped
// before part 0.1 carry the lab's e-mail and the uploaded file's name (which often
// names the lab); both are masked on display. Entries typed by staff, and the
// app's own stamps, are shown as they are.
export function redactCaseEventForStaff(e: CaseEvent): CaseEvent {
  if (e.source !== "auto" || !e.recordedBy.includes("@")) return e;
  return { ...e, recordedBy: LAB_RECORDER, ref: undefined };
}
