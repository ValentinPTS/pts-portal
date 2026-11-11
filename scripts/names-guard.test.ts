// What staff and auditors may read of the journal and the case-file timeline
// (§4.2, finding N4). Lines written before part 0.1 can carry a laboratory's
// e-mail or the name of a file it uploaded; the redactors must mask both, and must
// leave everything else — staff e-mails, app stamps, staff-typed entries — alone.
import { LAB_ACTOR, LAB_RECORDER, redactActivityForStaff, redactCaseEventForStaff } from "../src/lib/redact.ts";
import type { ActivityEvent, CaseEvent } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const LAB_MAIL = "office@primer-lab.bg";
const FILE = "Protokol_Primer_Lab_OOD.pdf";
const ev = (p: Partial<ActivityEvent>): ActivityEvent => ({
  id: "1", at: "2026-11-02T10:00:00Z", actorEmail: "manager@ptsbg.eu", actorRole: "manager",
  action: "x", summary: "", ...p,
});

// 1. a lab acting through its portal: the actor e-mail goes, the code stays
const up = redactActivityForStaff(ev({ actorEmail: LAB_MAIL, actorRole: "lab", action: "lab.uploaded", targetCode: "267101", summary: `Lab upload: protocol (${FILE})` }));
t("lab actor masked", up.actorEmail === LAB_ACTOR, up.actorEmail);
t("uploaded file name stripped", up.summary === "Lab upload: protocol", up.summary);
t("code kept", up.targetCode === "267101");

const nested = redactActivityForStaff(ev({ actorEmail: LAB_MAIL, actorRole: "lab", action: "lab.uploaded", summary: "Lab upload: results (Primer Lab OOD (1).pdf)" }));
t("file name with brackets stripped", nested.summary === "Lab upload: results", nested.summary);

// 2. old lab-application lines carried the applicant's e-mail in the text
const app = redactActivityForStaff(ev({ action: "lab_application.approved", summary: `Lab application approved for ${LAB_MAIL}` }));
t("e-mail in summary masked", !app.summary.includes(LAB_MAIL) && app.summary.includes("•••@•••"), app.summary);
t("manager actor untouched", app.actorEmail === "manager@ptsbg.eu");

// 3. staff lines name staff by e-mail — not secret, kept
const staff = redactActivityForStaff(ev({ action: "staff.added", summary: "Staff ana@ptsbg.eu added as staff" }));
t("staff e-mail kept", staff.summary === "Staff ana@ptsbg.eu added as staff", staff.summary);
const role = redactActivityForStaff(ev({ action: "role.changed", summary: "Role of ana@ptsbg.eu: staff → auditor" }));
t("role-change e-mail kept", role.summary.includes("ana@ptsbg.eu"));

// 4. a line with nothing to hide comes back equal
const plain = ev({ action: "results.saved", summary: "Results saved for 3 characteristic(s)" });
t("plain line unchanged", JSON.stringify(redactActivityForStaff(plain)) === JSON.stringify(plain));

// 5. case-file timeline
const ce = (p: Partial<CaseEvent>): CaseEvent => ({
  id: "c", schemeId: "S1", code: "267101", kind: "receipt_confirmed", at: "2026-11-02",
  recordedBy: "", recordedAt: "2026-11-02T10:00:00Z", source: "auto", ...p,
});
const oldUpload = redactCaseEventForStaff(ce({ ref: FILE, recordedBy: LAB_MAIL, note: "uploaded by the laboratory (portal)" }));
t("old lab stamp: recorder masked", oldUpload.recordedBy === LAB_RECORDER, oldUpload.recordedBy);
t("old lab stamp: file name dropped", oldUpload.ref === undefined, String(oldUpload.ref));
t("old lab stamp: note kept", oldUpload.note === "uploaded by the laboratory (portal)");

const manual = ce({ source: "manual", ref: "Econt 1234567", recordedBy: "ana@ptsbg.eu", kind: "items_dispatched" });
// a staff-typed dispatch's reference is its waybill — masked too (the security sweep, round 2, R2S-3)
t("a staff-typed dispatch: its waybill masked, the rest kept", redactCaseEventForStaff(manual).ref === undefined && redactCaseEventForStaff(manual).recordedBy === "ana@ptsbg.eu");
const typedNote = ce({ source: "manual", ref: "Протокол 12", recordedBy: "ana@ptsbg.eu", kind: "other" });
t("staff-typed entry of another kind unchanged", redactCaseEventForStaff(typedNote) === typedNote);
const cert = ce({ kind: "report_issued", ref: "PTS 26/07-T-1-48217" });
t("app stamp with a reference unchanged", redactCaseEventForStaff(cert) === cert);
const newUpload = ce({ recordedBy: LAB_RECORDER });
t("new lab stamp unchanged", redactCaseEventForStaff(newUpload) === newUpload);

// the security sweep (SA-1, SC-1, SC-3): an organisation's, a laboratory's or a user's id is the same in
// every scheme — next to a code it links the codes, and /organizations names it; a waybill leads to the
// laboratory's address. Never shown to who sees no names — in the subject, before/after, or the text.
{
  const UID = "7b81e94d-0bbf-4008-a67c-f454b4bfbdaf", ENT = "529fa393-1111-4222-8333-944455556666";
  const applied = redactActivityForStaff(ev({ actorRole: "lab", actorEmail: "laboratory", actorId: UID, action: "participant.applied_online", schemeId: "26-11-C-3", targetCode: "2611317", after: { by: `entityuser:${UID}`, participations: 1 } }));
  t("an account id in after.by — masked", JSON.stringify(applied.after) === JSON.stringify({ by: "•••", participations: 1 }) && applied.actorId === undefined && applied.targetCode === "2611317", JSON.stringify(applied.after));
  const made = redactActivityForStaff(ev({ action: "entityuser.created", subject: `entityuser:${UID}`, after: { entity: ENT, role: "admin" } }));
  t("an entity's and a user's id — masked, their kind and the role kept", made.subject === "entityuser:•••" && JSON.stringify(made.after) === JSON.stringify({ entity: "•••", role: "admin" }), `${made.subject} ${JSON.stringify(made.after)}`);
  const approved = redactActivityForStaff(ev({ action: "registration.approved", subject: `entity:${ENT}`, after: { notice: "sent" } }));
  t("a registration's line: the entity's id masked", approved.subject === "entity:•••" && JSON.stringify(approved.after) === JSON.stringify({ notice: "sent" }));
  const admin = redactActivityForStaff(ev({ action: "entity.admin_changed", subject: `entity:${ENT}`, after: { admin: `entityuser:${UID}`, list: [UID, `lab:${ENT}`], nested: { who: `laboratory:${ENT}`, mail: "a@b.bg" } } }));
  t("…nested, in lists, by kind or as a bare id — masked", !JSON.stringify(admin.after).includes(UID) && !JSON.stringify(admin.after).includes(ENT) && !JSON.stringify(admin.after).includes("a@b.bg"), JSON.stringify(admin.after));
  const sent = redactActivityForStaff(ev({ action: "delivery.dispatched", schemeId: "S", targetCode: "26111677", subject: "shipment:sh-1", summary: "The object for 26111677 — 2026-11-11, waybill W2-52234", after: { kind: "dispatch", day: "2026-11-11", waybill: "W2-52234", docs: [] } }));
  t("a waybill — masked in the text and in after; the shipment's own id kept", !sent.summary.includes("W2-52234") && /waybill •••/.test(sent.summary) && (sent.after as Record<string, unknown>).waybill === "•••" && sent.subject === "shipment:sh-1", `${sent.summary} ${JSON.stringify(sent.after)}`);
  // round 3 (R3S-4): a waybill typed with spaces or a comma, and the Bulgarian word — masked whole
  for (const wb of ["62 123 456 789", "JD0146 0000 1234 5678", "1234,5678"]) {
    const old = redactActivityForStaff(ev({ action: "delivery.dispatched", schemeId: "S", targetCode: "26111677", summary: `The object for 26111677 — 2026-11-11, waybill ${wb}`, after: { kind: "dispatch", waybill: wb } }));
    t(`round 3 — an older line's waybill «${wb}» masked whole`, !/\d{3}/.test(old.summary.replace("26111677", "").replace("2026-11-11", "")), old.summary);
  }
  const bg = redactActivityForStaff(ev({ action: "case.updated", schemeId: "S", summary: "Изпратено с товарителница 62 123 456 789 днес" }));
  t("round 3 — «товарителница» masked too", !bg.summary.includes("456"), bg.summary);
  const staff = redactActivityForStaff(ev({ action: "staff.updated", subject: `user:${UID}`, after: { by: "head@ptsbg.eu" } }));
  t("a line about PTS's own people — as it is", staff.subject === `user:${UID}` && JSON.stringify(staff.after) === JSON.stringify({ by: "head@ptsbg.eu" }));
  const plain = redactActivityForStaff(ev({ action: "lifecycle.act", schemeId: "S", before: { status: "open" }, after: { status: "running" } }));
  t("a line with no one in it — as it is", JSON.stringify(plain.before) === JSON.stringify({ status: "open" }) && JSON.stringify(plain.after) === JSON.stringify({ status: "running" }));
  const disp = redactCaseEventForStaff(ce({ kind: "items_dispatched", source: "auto", ref: "W2-52234", recordedBy: "build" }));
  const rec = redactCaseEventForStaff(ce({ kind: "receipt_confirmed", source: "auto", ref: "W2-52234", recordedBy: LAB_RECORDER }));
  const typed = redactCaseEventForStaff(ce({ kind: "note", source: "manual", ref: "R-1", recordedBy: "manager@ptsbg.eu" }));
  t("the timeline: a dispatch's and a receipt's waybill — not to who sees no names; a typed entry's reference kept", disp.ref === undefined && rec.ref === undefined && disp.recordedBy === "build" && typed.ref === "R-1", JSON.stringify([disp, rec, typed]));
}

console.log(`names-guard.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
