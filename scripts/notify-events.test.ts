// The notices the app raises. These assertions pin the two things that are easy
// to break by editing wording: the §4.2 rule (a code travels, a name never does)
// and the "no account → no orphan notice" guard.
import {
  notifyApplicationReceived, notifyApplicationApproved, notifyApplicationRejected,
  notifyReceiptConfirmed, notifyResultsReturned, notifyReportIssued,
} from "../src/lib/notify-events.ts";
import { listForProvider, listForLab } from "../src/lib/notifications.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const LAB = "LAB-A";
const NAME = "Изпитвателна лаборатория Пример ООД"; // must never appear anywhere
const NUM = "PTS 26/07-T-1";
const CODE = "267101";

await notifyApplicationReceived("S1", NUM);
await notifyApplicationApproved(LAB, "S1", NUM, CODE);
await notifyReceiptConfirmed("S1", NUM, CODE);
await notifyResultsReturned("S1", NUM, CODE);
await notifyReportIssued(LAB, "S1", NUM, CODE);

// a rejected applicant with NO lab account: nothing to show, so nothing recorded
await notifyApplicationRejected(undefined, "S1", NUM);
await notifyApplicationApproved(undefined, "S1", NUM, CODE);
await notifyReportIssued(undefined, "S1", NUM, CODE);

const prov = await listForProvider(50);
const lab = await listForLab(LAB, 50);
const all = [...prov, ...lab];

t("the provider is told about the заявка and both returned files", prov.length === 3, `got ${prov.length}`);
t("the lab is told its code and its certificate", lab.length === 2, `got ${lab.length}`);
t("no notice is raised for an applicant with no account", all.length === 5, `got ${all.length}`);

t("every notice carries both languages", all.every((n) => n.bg.trim().length > 0 && n.en.trim().length > 0));
t("no notice ever carries a laboratory name",
  all.every((n) => !n.bg.includes(NAME) && !n.en.includes(NAME)));
t("every notice quotes the scheme number", all.every((n) => n.bg.includes(NUM) && n.en.includes(NUM)));
t("every notice links somewhere", all.every((n) => !!n.href));

const approved = lab.find((n) => n.kind === "application.approved")!;
t("approval tells the lab the code for THIS scheme",
  !!approved && approved.bg.includes(CODE) && approved.en.includes(CODE) && approved.code === CODE);
t("approval is addressed to that one lab", approved.audience === "lab" && approved.labId === LAB);

const received = prov.find((n) => n.kind === "application.received")!;
t("a new заявка names no one — the owner opens the list to see who",
  !!received && !received.code && received.href === "/schemes/S1/applications");

const returned = prov.filter((n) => n.kind === "receipt.confirmed" || n.kind === "results.returned");
t("both lab-file notices identify the participation by code only",
  returned.length === 2 && returned.every((n) => n.code === CODE && n.bg.includes(CODE)));

console.log(`notify-events.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
