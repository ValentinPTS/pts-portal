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
t("staff-typed entry unchanged", redactCaseEventForStaff(manual) === manual);
const cert = ce({ kind: "report_issued", ref: "PTS 26/07-T-1-48217" });
t("app stamp with a reference unchanged", redactCaseEventForStaff(cert) === cert);
const newUpload = ce({ recordedBy: LAB_RECORDER });
t("new lab stamp unchanged", redactCaseEventForStaff(newUpload) === newUpload);

console.log(`names-guard.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
