// Plan part 5.2 — the two announcements (Zadanie «Двете обявявания»; Реш. 24, 65, 66,
// 129): the first — it runs (every participation in the round told; the count against
// the minimum on record) or it is not held (nothing invoiced); the second — which
// characteristics run and so the final list, each participation told from what it
// applied for; proformas only after it, to a participation on the list.
import { readFileSync } from "node:fs";
import { countsPerCharacteristic, defaultRuns, splitFor, finalListOf, finalSelectionsOf, currentFinalList, invoiceProblem, inFinalRound, MIN_PER_CHARACTERISTIC, ANNOUNCEMENT_PROBLEM_TEXT } from "../src/lib/announcement-model.ts";
import { selectionsOf } from "../src/lib/application-model.ts";
import type { Lifecycle } from "../src/lib/lifecycle-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the model ──
const out = { state: "refused" as const, at: "a", by: "m", category: "late", reason: "след срока" };
const parts = [
  { id: "p1", selections: { "0": 2, "1": 1 } },
  { id: "p2", selections: { "0": 1 } },
  { id: "p3", selections: { "1": 3, "2": 1 } },
  { id: "p4", selections: { "2": 4 }, standing: out },          // refused: counts for nothing
  { id: "p5", characteristics: [0, 2] },                         // older: one of each of its characteristics
];
eq("the participations per characteristic — by those in the round, a laboratory's two counting two", countsPerCharacteristic(parts, 3), [4, 4, 2]);
eq("Реш. 66: a characteristic runs, by default, at five participations", [MIN_PER_CHARACTERISTIC, defaultRuns([4, 5, 9]), defaultRuns([4, 4, 2], 4)], [5, [1, 2], [0, 1]]);
eq("an online calibration application's «cal» count names no characteristic: it reads as one of each (review)", [selectionsOf({ selections: { cal: 2 } }, 2), selectionsOf({ selections: { cal: 2, "1": 3 } }, 2)], [{ "0": 1, "1": 1 }, { "1": 3 }]);
t("…so it is counted, and on the final list when one runs", countsPerCharacteristic([{ id: "c", selections: { cal: 2 } }], 2).join() === "1,1" && finalListOf([{ id: "c", selections: { cal: 2 } }], [1], 2).participants.join() === "c");
eq("one participation under the runs: its own that run, its own that drop", [splitFor(parts[0], [0], 3), splitFor(parts[2], [0], 3), splitFor(parts[4], [2], 3)], [{ runs: [0], dropped: [1] }, { runs: [], dropped: [1, 2] }, { runs: [2], dropped: [0] }]);
const fl = finalListOf(parts, [0, 9, 0], 3);
eq("the final list: every participation in the round with one that runs — never the refused, nor one whose all drop", fl, { runs: [0], dropped: [1, 2], participants: ["p1", "p2", "p5"] });
eq("…its selections under the list: those that run only", finalSelectionsOf(parts[0], fl, 3), { "0": 2 });
t("every problem has its words", Object.values(ANNOUNCEMENT_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── the current list, and invoicing ──
const A = (act: string, extra: object = {}) => ({ act, from: "open", to: "running", at: "x", by: "m", day: "2026-11-06", ...extra }) as unknown as NonNullable<Lifecycle["acts"]>[number];
const first = A("announce");
const second = A("announce2", { from: "running", final: { runs: [0], dropped: [1], participants: ["p1"] } });
const sch = (status: string, acts: NonNullable<Lifecycle["acts"]>) => ({ status, lifecycle: { acts } });
t("before the second announcement: no final list — no proforma (Реш. 65)", currentFinalList(sch("running", [first])) === undefined && invoiceProblem(sch("running", [first]), { id: "p1" }) === "before-second");
t("after it: the list — a proforma to one on it; never to one off it, nor to one out of the round", JSON.stringify(currentFinalList(sch("running", [first, second]))) === JSON.stringify({ participants: ["p1"], runs: [0] }) && invoiceProblem(sch("running", [first, second]), { id: "p1" }) === null && invoiceProblem(sch("running", [first, second]), { id: "p2" }) === "not-final" && invoiceProblem(sch("running", [first, second]), { id: "p1", standing: out }) === "not-final");
t("stepped back to open, or a new first announcement: the list undone until the next second", currentFinalList(sch("open", [first, second])) === undefined && currentFinalList(sch("running", [first, second, A("back", { from: "running", to: "open" }), A("announce")])) === undefined);
t("…and it stays through processing and the report", currentFinalList(sch("processing", [first, second])) !== undefined && currentFinalList(sch("report", [first, second])) !== undefined);
t("a second announcement made before 5.2 kept no list: everyone in the round may be invoiced", invoiceProblem(sch("running", [first, A("announce2", { from: "running" })]), { id: "p9" }) === null);
t("going on in the round: before the list, everyone in it; after, those on it — never one out of the round (review)", inFinalRound(sch("running", [first]), { id: "p2" }) && inFinalRound(sch("running", [first, second]), { id: "p1" }) && !inFinalRound(sch("running", [first, second]), { id: "p2" }) && !inFinalRound(sch("running", [first]), { id: "p1", standing: out }) && inFinalRound(sch("running", [first, A("announce2", { from: "running" })]), { id: "p9" }));
t("a scheme not held invoices nothing", invoiceProblem(sch("not_held", [A("not_held", { to: "not_held" })]), { id: "p1" }) === "before-second");

// ── the actions ──
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const la = actions.slice(actions.indexOf("export async function lifecycleActAction"), actions.indexOf("// ── The two announcements (plan part 5.2"));
t("the first announcement tells every participation in the round, by its code", /const tells = act === "announce" \|\| act === "not_held" \|\| act === "report";/.test(la) && /if \(act === "announce"\) await notifySchemeAnnounced\(labOf\.get\(p\.code\), schemeId, scheme\.number, p\.code\);/.test(la) && /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);/.test(la));
t("…and keeps the count in the round against the minimum — below it, it runs by PTS's decision, on record", /count: \{ inRound: inRoundNow, min: cur\.minParticipants \}/.test(la) && /BELOW the minimum — runs by decision/.test(la));
t("the second announcement only through its form — the plain act refuses it", /if \(act === "announce2"\) return \{ error: ANNOUNCE_REFUSAL\["use-form"\] \};/.test(la));
const sa = actions.slice(actions.indexOf("export async function secondAnnouncementAction"));
const saBody = sa.slice(0, sa.indexOf("\n}\n"));
t("the second: the scheme manager's act, re-checked inside the lock; at least one characteristic runs", /await requireCap\("scheme\.edit", schemeId\);/.test(saBody.slice(0, 300)) && /refused = actProblem\(cur, "announce2", note\);/.test(saBody) && /if \(n && !runs\.length\) return \{ error: ANNOUNCE_REFUSAL\.runs \};/.test(saBody));
t("…who is on the list and who to tell found BEFORE it is recorded (2.3); those in the round only", saBody.indexOf("labIdsFor(schemeId, parts, by)") > 0 && saBody.indexOf("labIdsFor(schemeId, parts, by)") < saBody.indexOf("await updateSchemeWith") && /parts = \(await listParticipants\(schemeId\)\)\.filter\(inRound\);/.test(saBody) && /catch \{\n\s*return \{ error: NOT_REACHED \};/.test(saBody));
t("…the list kept with its act; an empty list refused", /const entry: LifecycleAct = \{ act: "announce2", from: cur\.status, to: cur\.status, at, by, day, \.\.\.\(note \? \{ note \} : \{\}\), final \};/.test(saBody) && /if \(!listed\.participants\.length\) return \{ error: ANNOUNCE_REFUSAL\["final-list"\] \};/.test(saBody));
t("…each participation told INDIVIDUALLY, from what it applied for (Реш. 65)", /const own = n \? splitFor\(p, final\.runs, n\) : \{ runs: \[\], dropped: \[\] \};/.test(saBody) && /await notifyFinalList\(labOf\.get\(p\.code\), schemeId, scheme\.number, p\.code, onList\.has\(p\.id\), own\.runs\.map\(label\), own\.dropped\.map\(label\), waiting\.includes\(p\.id\)\);/.test(saBody));
t("…on record by numbers and characteristics — never a name", /summary: `\$\{ACTS\.announce2\.en\}: \$\{final\.participants\.length\} of \$\{parts\.length\} participation\(s\) on the final list/.test(saBody));
const up = actions.slice(actions.indexOf("export async function uploadLabDocAction"));
t("a proforma or an invoice only after the second announcement, to a participation on its list — re-checked inside the lock (5.8: both documents)", /const invoiceNo = invoiceProblem\(scheme, participant\);/.test(up) && /notHeldNow = s\.status === "not_held" \|\| invoiceProblem\(s, participant\) !== null/.test(up) && /if \(scheme\.status === "not_held"\) return/.test(up));
const ne = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
t("the notices: by code, held for «Изпрати»; the second's words from its own characteristics, or that it goes no further and nothing is invoiced", /kind: "scheme\.announced"/.test(ne) && /kind: "scheme\.final_list"/.test(ne) && /нищо не се фактурира/.test(ne) && /nothing is invoiced/.test(ne));

t("the final list announced: no new application; what was applied for per characteristic unchanged — a step back undoes it", /if \(scheme && currentFinalList\(scheme\)\) redirect\(`\/schemes\/\$\{schemeId\}\/participants\?err=list-final`\);/.test(actions) && /if \(!cur \|\| !sameSelections\(selectionsOf\(cur, nChar\), sel\.selections\)\) redirect\(`\$\{back\}\?err=list-final`\);/.test(actions));
const pp = readFileSync(new URL("../src/app/schemes/[id]/participants/page.tsx", import.meta.url), "utf8");
t("the participants page: on the list or not; the objects for what runs; the add form gives way after the list", /data-final=\{listed \? "1" : "0"\}/.test(pp) && /objects=\{onList\(p\) \? objectsNeeded\(selNow\(p\), s\.type\) : 0\}/.test(pp) && /\{reveal && !finalList && \(<>/.test(pp) && /data-list-final/.test(pp));
const sp = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
t("the scheme page: the form while running and not yet announced; no plain «announce2» button; the below-minimum warning", /\{canAct && s\.status === "running" && !announced2 && \(/.test(sp) && /\.filter\(\(a\) => a !== "announce2"\)/.test(sp) && /warn: a === "announce" && belowMin \?/.test(sp) && /const announced2 = !!currentSecondAnnouncement\(s\);/.test(sp));

t("the list keeps the characteristics' stable ids too; re-checked inside the lock — a change meanwhile refused (review)", /runIds: listed\.runs\.map\(idOf\)/.test(saBody) && /if \(paramsSignature\(cur\.parameters\) !== sig\) \{ changed = true; return \{\}; \}/.test(saBody) && /if \(changed\) return \{ error: ANNOUNCE_REFUSAL\.changed \};/.test(saBody));
t("…an application entered while it was made: said and on record (review)", /const late = \(await listParticipants\(schemeId\)\.catch\(\(\) => \[\]\)\)\.filter\(\(p\) => inRound\(p\) && !parts\.some\(\(q\) => q\.id === p\.id\)\);/.test(sa) && /return late\.length \? \{ ok: true, late: late\.length \} : \{ ok: true \};/.test(sa));
t("while the list stands: no reorder or removal of characteristics — refused before the save and inside its lock (review)", /if \(paramsRestructured && currentFinalList\(existing\)\) redirect\(`\/schemes\/\$\{id\}\/edit\?err=list-final`\);/.test(actions) && /if \(paramsRestructured && currentFinalList\(current\)\) \{ listFinalLate = true; return \{\}; \}/.test(actions) && /if \(listFinalLate\) redirect\(`\/schemes\/\$\{id\}\/edit\?err=list-final`\);/.test(actions));
const ap = actions.slice(actions.indexOf("export async function approveApplicationAction"));
t("…no application approved after it — refused, and re-checked in the claim's lock (review)", /if \(scheme && currentFinalList\(scheme\)\) redirect\(`\/schemes\/\$\{schemeId\}\/applications\?err=list-final`\);/.test(ap.slice(0, 2500)) && /if \(currentFinalList\(cur\)\) \{ listFinal = true; return \{\}; \}/.test(ap.slice(0, 2500)));
t("one off the list goes on no further: no reminder, no upload, not counted in the stages nor in a calibration's processing (review)", /filter\(\(p\) => inFinalRound\(s, p\) && stillOwesResults\(p\)\)/.test(readFileSync(new URL("../src/lib/notify-reminders.ts", import.meta.url), "utf8")) && /if \(!inFinalRound\(scheme!, mine!\)\) redirect\(`\$\{back\}\?e=locked`\);/.test(actions) && /filter\(\(p\) => inFinalRound\(scheme, p\)\)\.map\(\(p\) => p\.code\)/.test(actions) && /participants: goingOn\.length, withResults,/.test(sp));
t("the round export keeps the final list and the count with their acts", /\["coded\/lifecycle_acts\.csv", \(lc\.acts \?\? \[\]\)\.map\(\(a\) => \(\{ \.\.\.a \}\)\), \["act", "from", "to", "day", "at", "by", "note", "count", "final"\]\]/.test(readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8")));

console.log(`announcements.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
