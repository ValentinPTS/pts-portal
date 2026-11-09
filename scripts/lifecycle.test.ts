// Plan part 3.2 — the lifecycle (Zadanie §3, §11; О9 / Реш. 129, 111, 140, 147):
// the 19 stages, the states and the acts that move a scheme between them, the ticks
// by their role, «не се състои», the end of a calibration scheme as an event; and the
// pages and actions that follow the model.
import { readFileSync } from "node:fs";
import {
  STAGES, STATES, ACTS, ACT_KEYS, BACK_TO, actProblem, actTarget, tickProblem, untickProblem, stageViews, calibrationEnd,
  designApproved, stateIndex, isTickStage, ACT_PROBLEM_TEXT, TICK_PROBLEM_TEXT, tickerLabel, currentSecondAnnouncement, chainCovers, type Lifecycle, type LifecycleAct,
} from "../src/lib/lifecycle-model.ts";
import type { Scheme, SchemeStatus } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

type S = Pick<Scheme, "status" | "type" | "chain" | "uploads"> & { lifecycle?: Lifecycle };
const sch = (status: SchemeStatus, over: Partial<S> = {}): S => ({ status, type: "T", ...over });
const ticks = (...nos: number[]): Lifecycle => ({ stages: Object.fromEntries(nos.map((n) => [String(n), { at: "2026-11-05T10:00:00Z", by: "a@ptsbg.eu", day: "2026-11-05" }])) });
const upload = { report: { path: "x", name: "r.pdf", mime: "application/pdf", size: 1, uploadedAt: "", uploadedBy: "" } } as unknown as Scheme["uploads"];

// ── the 19 stages (Zadanie §3) ─────────────────────────────────────────────
eq("19 stages, 1 to 19 in order", STAGES.map((s) => s.no), Array.from({ length: 19 }, (_, i) => i + 1));
eq("Zadanie §3: 7–13 and 17–18 go through the portal", STAGES.filter((s) => s.inPortal).map((s) => s.no), [7, 8, 9, 10, 11, 12, 13, 17, 18]);
t("the plan's internal stages 1, 2, 4, 6, 14, 15, 16 are ticked by their role", [1, 2, 4, 6, 14, 15, 16].every(isTickStage));
t("…and 19 is the act that closes the records", STAGES[18].way && "act" in STAGES[18].way && STAGES[18].way.act === "close");
t("the acts: 7 open, 8 the first announcement, 17 the report", ([[7, "open"], [8, "announce"], [17, "report"]] as const).every(([n, a]) => { const w = STAGES[n - 1].way; return "act" in w && w.act === a; }));
t("the processing acts by the designated people (2.5, Реш. 140)", ([[14, "processor"], [15, "reviewer"], [16, "approver"]] as const).every(([n, who]) => { const w = STAGES[n - 1].way; return "tick" in w && "designated" in w.tick && w.tick.designated === who; }));
t("every stage sits in a known state", STAGES.every((s) => STATES.includes(s.state)));
t("the stages run forward through the states", STAGES.every((s, i) => i === 0 || stateIndex(s.state) >= stateIndex(STAGES[i - 1].state)));
t("calibration reads some stages its own way (§11)", [5, 6, 9, 10, 11, 12].every((n) => !!STAGES[n - 1].cal));
t("every ticker has words", STAGES.every((s) => !("tick" in s.way) || !/^[a-z.]+$/.test(tickerLabel(s.way.tick, "bg"))));

// ── the acts: from where, to where ─────────────────────────────────────────
eq("every act has its words", ACT_KEYS.map((k) => !!ACTS[k].bg && !!ACTS[k].en), ACT_KEYS.map(() => true));
eq("draft → open", actTarget(sch("draft"), "open"), "open");
eq("open → running (first announcement)", actTarget(sch("open"), "announce"), "running");
eq("open → not held (О9)", actTarget(sch("open"), "not_held"), "not_held");
eq("the second announcement leaves the state", actTarget(sch("running"), "announce2"), "running");
eq("running → processing", actTarget(sch("running"), "process"), "processing");
eq("processing → report", actTarget(sch("processing"), "report"), "report");
eq("report → closed", actTarget(sch("report"), "close"), "closed");
eq("back: one step", (["open", "running", "processing", "closed", "not_held"] as SchemeStatus[]).map((s) => actTarget(sch(s), "back")), ["draft", "open", "running", "report", "open"]);
t("a report issued is never taken back", !("report" in BACK_TO) && actProblem(sch("report"), "back", "причина") === "state");
// out of order
for (const [state, act] of [["draft", "announce"], ["open", "process"], ["running", "report"], ["processing", "close"], ["draft", "back"], ["closed", "open"], ["not_held", "announce"], ["report", "process"]] as const) {
  eq(`${act} refused in ${state}`, actProblem(sch(state), act, "причина"), "state");
}
eq("not held: a reason is required", actProblem(sch("open"), "not_held", "abc"), "note");
eq("…given: allowed", actProblem(sch("open"), "not_held", "Не се събра минимумът"), null);
eq("back: a reason is required", actProblem(sch("running"), "back", ""), "note");
eq("a note over 1000 characters", actProblem(sch("open"), "announce", "я".repeat(1001)), "too-long");
eq("…1000 «я» are 1000 characters", actProblem(sch("open"), "announce", "я".repeat(1000)), null);
eq("the second announcement once", actProblem(sch("running", { lifecycle: { acts: [{ act: "announce2", from: "running", to: "running", at: "", by: "", day: "" }] } }), "announce2", ""), "twice");
eq("the report: PTS's file first", actProblem(sch("processing", { lifecycle: ticks(14, 15, 16) }), "report", ""), "no-report");
eq("the report: approved first (stage 16)", actProblem(sch("processing", { uploads: upload, lifecycle: ticks(14, 15) }), "report", ""), "not-approved");
eq("the report: file and approval → allowed", actProblem(sch("processing", { uploads: upload, lifecycle: ticks(14, 15, 16) }), "report", ""), null);
t("every act problem has words", Object.values(ACT_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en) && Object.values(TICK_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── calibration: the end is an event (§11) ─────────────────────────────────
const stop = (kind: "lab" | "ref", sentAt?: string, code?: string) => ({ id: Math.random().toString(36), kind, code, receivedAt: sentAt ? "2026-10-01T08:00:00Z" : undefined, sentAt });
const chainOf = (...stops: ReturnType<typeof stop>[]) => ({ stops }) as Scheme["chain"];
eq("the closing reference calibration ends it", calibrationEnd(chainOf(stop("ref", "2026-09-01T10:00:00Z"), stop("lab", "2026-10-01T10:00:00Z", "1"), stop("ref", "2026-10-20T10:00:00Z"))), "2026-10-20T10:00:00Z");
eq("…not yet handed on: no end", calibrationEnd(chainOf(stop("lab", "2026-10-01T10:00:00Z", "1"), stop("ref"))), null);
eq("…a chain ending at a laboratory has no end event", calibrationEnd(chainOf(stop("ref", "2026-09-01T10:00:00Z"), stop("lab", "2026-10-01T10:00:00Z", "1"))), null);
eq("…no laboratory, no end", calibrationEnd(chainOf(stop("ref", "2026-09-01T10:00:00Z"))), null);
eq("…no chain, no end", calibrationEnd(undefined), null);
eq("calibration: processing waits for the event", actProblem(sch("running", { type: "C", chain: chainOf(stop("lab", "2026-10-01T10:00:00Z", "1"), stop("ref")) }), "process", ""), "calibration-end");
eq("…after it, processing starts", actProblem(sch("running", { type: "C", chain: chainOf(stop("lab", "2026-10-01T10:00:00Z", "1"), stop("ref", "2026-10-20T10:00:00Z")) }), "process", ""), null);
eq("testing: no event needed", actProblem(sch("running"), "process", ""), null);

// ── the ticks ──────────────────────────────────────────────────────────────
eq("a preparation stage ticked in draft", tickProblem(sch("draft"), 4), null);
eq("…or late, in any later state", tickProblem(sch("report"), 2), null);
eq("a processing act before processing", tickProblem(sch("running"), 14), "state");
eq("coding before the first announcement", tickProblem(sch("open"), 9), "state");
eq("the review before the processing (Реш. 140)", tickProblem(sch("processing"), 15), "order");
eq("the approval before the review", tickProblem(sch("processing", { lifecycle: ticks(14) }), 16), "order");
eq("…in order: allowed", tickProblem(sch("processing", { lifecycle: ticks(14, 15) }), 16), null);
eq("an act stage is not ticked", tickProblem(sch("open"), 8), "stage");
eq("a record stage is not ticked", tickProblem(sch("running"), 12), "stage");
eq("not held: the preparation stages still", tickProblem(sch("not_held"), 4), null);
eq("not held: nothing after stage 8", tickProblem(sch("not_held"), 9), "state");
eq("a long note", tickProblem(sch("draft"), 1, "я".repeat(1001)), "too-long");
eq("withdraw: not ticked", untickProblem(sch("draft"), 1), "not-ticked");
eq("withdraw the processing under the review", untickProblem(sch("processing", { lifecycle: ticks(14, 15) }), 14), "order");
eq("withdraw the review under the approval", untickProblem(sch("processing", { lifecycle: ticks(14, 15, 16) }), 15), "order");
eq("withdraw the approval once the report is issued", untickProblem(sch("report", { lifecycle: ticks(14, 15, 16) }), 16), "order");
eq("withdraw the approval before it", untickProblem(sch("processing", { lifecycle: ticks(14, 15, 16) }), 16), null);
eq("design_approved is stage 4's day", designApproved({ lifecycle: ticks(4) }), "2026-11-05");
eq("…none yet", designApproved({}), null);

// ── how the stages read ────────────────────────────────────────────────────
const facts = { participants: 3, withResults: 2, lastResultAt: "2026-10-10T10:00:00Z" };
const v = (s: S) => stageViews(s, facts, "bg");
t("a draft: the preparation stages are current", v(sch("draft")).filter((x) => x.current).map((x) => x.no).join() === "1,2,3,4,5,6");
const before32 = v(sch("running"));
t("a scheme from before 3.2: stages 7 and 8 done, «who and when not on record»", !!before32[6].done && !!before32[7].done && /не е записано/.test(before32[6].detail ?? ""));
const withActs = v(sch("running", { lifecycle: { acts: [{ act: "open", from: "draft", to: "open", at: "2026-10-01T09:00:00Z", by: "m@ptsbg.eu", day: "2026-10-01" }, { act: "announce", from: "open", to: "running", at: "2026-10-05T09:00:00Z", by: "m@ptsbg.eu", day: "2026-10-05" }] } }));
eq("…with acts: who and when", [withActs[6].done?.by, withActs[7].done?.day], ["m@ptsbg.eu", "2026-10-05"]);
t("results: 2 of 3 — not done, said", !before32[11].done && /2 от 3/.test(before32[11].detail ?? ""));
t("results: 3 of 3 — done", !!stageViews(sch("running"), { participants: 3, withResults: 3, lastResultAt: "2026-10-10T10:00:00Z" }, "bg")[11].done);
const cal = stageViews(sch("running", { type: "C", chain: chainOf(stop("lab", "2026-10-01T10:00:00Z", "1"), stop("ref")) }), { participants: 1, withResults: 1 }, "bg");
t("calibration: results in but the closing calibration to come — not done", !cal[11].done && /предстои/.test(cal[11].detail ?? "") && /повторно референтно/i.test(cal[11].title));
const nh = v(sch("not_held", { lifecycle: { acts: [{ act: "not_held", from: "open", to: "not_held", at: "", by: "m", day: "2026-10-05", note: "Малко участници" }] } }));
t("not held: stage 8 done with the reason, 9–19 skipped, none current", !!nh[7].done && nh[7].done?.note === "Малко участници" && nh.slice(8).every((x) => x.skipped) && nh.every((x) => !x.current));
t("closed: stage 19 done (from before 3.2)", !!v(sch("closed"))[18].done);
t("stepped back from closed: stage 19 not done", !v(sch("report", { lifecycle: { acts: [{ act: "close", from: "report", to: "closed", at: "", by: "", day: "" }, { act: "back", from: "closed", to: "report", at: "", by: "", day: "", note: "xxxxx" }] } }))[18].done);
t("feedback: from the portal's record", !!stageViews(sch("report"), { participants: 1, withResults: 1, feedbackSentAt: "2026-11-01T10:00:00Z" }, "bg")[17].done);

// ── review of 3.2 ──────────────────────────────────────────────────────────
const A = (act: LifecycleAct["act"], from: SchemeStatus, to: SchemeStatus, at: string): LifecycleAct => ({ act, from, to, at, by: "m", day: at.slice(0, 10) });
const run1 = [A("open", "draft", "open", "2026-10-01T09:00:00Z"), A("announce", "open", "running", "2026-10-02T09:00:00Z"), A("announce2", "running", "running", "2026-10-03T09:00:00Z")];
const backAgain = [...run1, A("back", "running", "open", "2026-10-04T09:00:00Z"), A("announce", "open", "running", "2026-10-05T09:00:00Z")];
eq("after a step back and a new first announcement, the second may be made again", actProblem(sch("running", { lifecycle: { acts: backAgain } }), "announce2", ""), null);
t("…the old one is not this run's", !currentSecondAnnouncement({ lifecycle: { acts: backAgain } }) && !!currentSecondAnnouncement({ lifecycle: { acts: run1 } }));
t("…a scheme announced before 3.2 (no first announcement on record): its second once", !!currentSecondAnnouncement({ lifecycle: { acts: [A("announce2", "running", "running", "2026-10-03T09:00:00Z")] } }));
const nhAfter = stageViews(sch("not_held", { lifecycle: { acts: [...run1, A("back", "running", "open", "2026-10-04T09:00:00Z"), A("not_held", "open", "not_held", "2026-10-05T09:00:00Z")] } }), facts, "bg");
t("not held after a step back: stage 8 says not held, not the old second announcement", /Не се състои/.test(nhAfter[7].detail ?? "") && !/Второ/.test(nhAfter[7].detail ?? ""));
const openAfter = stageViews(sch("open", { lifecycle: { acts: [...run1, A("back", "running", "open", "2026-10-04T09:00:00Z")] } }), facts, "bg");
t("open after a step back: stage 8 not done, no second announcement shown", !openAfter[7].done && !/Второ/.test(openAfter[7].detail ?? ""));
t("not held: stage 7 (the invitation) did happen", !!stageViews(sch("not_held"), facts, "bg")[6].done);
eq("stage 4's approval is not withdrawn once processing started", untickProblem(sch("processing", { lifecycle: ticks(4) }), 4), "settled");
eq("…before, it may be", untickProblem(sch("running", { lifecycle: ticks(4) }), 4), null);
const fullChain = chainOf(stop("ref", "2026-09-01T10:00:00Z"), stop("lab", "2026-10-01T10:00:00Z", "A"), stop("ref", "2026-10-20T10:00:00Z"));
eq("calibration: every participant through the chain", actProblem(sch("running", { type: "C", chain: fullChain }), "process", "", ["A", "B"]), "chain-incomplete");
eq("…all of them: processing starts", actProblem(sch("running", { type: "C", chain: fullChain }), "process", "", ["A"]), null);
t("chainCovers: a stop not yet handed on does not count", !chainCovers(chainOf(stop("lab", undefined, "A")), ["A"]) && chainCovers(fullChain, ["A"]));

// ── the pages and actions follow the model ─────────────────────────────────
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const act = actions.slice(actions.indexOf("export async function lifecycleActAction"), actions.indexOf("export async function stageTickAction"));
const tick = actions.slice(actions.indexOf("export async function stageTickAction"));
t("acts: the scheme manager's, in the scheme", /await requireCap\("scheme\.edit", schemeId\);/.test(act));
t("acts: re-checked inside the lock", /await updateSchemeWith\(schemeId, \(cur\) => \{[\s\S]{0,200}refused = actProblem\(cur, act, note, codes\);/.test(act));
t("acts: a scheme gone from the lock is refused, not «done»", /let refused: ActProblem \| null = "gone";/.test(act));
t("acts: the report issued is the file uploaded NOW (latest edition only if the same and servable)", /if \(!\(latest && sameAs\(frozen, latest\) && \(await servable\(latest\)\)\)\)/.test(act));
t("acts: the lookups happen before the report's edition is kept", act.indexOf("labIdsFor(") < act.indexOf("issueEdition("));
t("acts: who to tell looked up BEFORE the state is recorded (2.3)", act.indexOf("labIdsFor(") < act.indexOf("await updateSchemeWith(") && act.indexOf("labIdsFor(") > 0);
t("acts: every act journalled with before/after", /logActivity\("scheme\.state", \{\s*schemeId, subject: `scheme:\$\{schemeId\}`, before: \{ status: from \}, after: \{ status: to \}/.test(act));
t("acts: not held tells each participation; the report too", /if \(act === "not_held"\) await notifySchemeNotHeld\(labOf\.get\(p\.code\)/.test(act) && /if \(act === "report"\) await notifyReportPublished\(labOf\.get\(p\.code\)/.test(act));
t("acts: the report kept as an edition at the act", /if \(act === "report"\) \{/.test(act) && /issueEdition\(\{ scheme, docKey: "report", frozen, by, reason \}\)/.test(act));
t("ticks: by the stage's role — a capability, or the designated person", /await requireCap\(ticker\.cap, schemeId\);/.test(tick) && /designation\[ticker\.designated\] === me/.test(tick));
t("ticks: each processing act its own capability", /await requireCap\(ticker\.designated === "processor" \? "results\.process" : ticker\.designated === "reviewer" \? "review" : "approve", schemeId\);/.test(tick));
t("ticks: a designation that no longer holds ticks nothing", /if \(st\.problems\.length\) return \{ error: TICK_REFUSAL\.stale \};/.test(tick));
t("ticks: never one's own processing or review without the designation's allowance", /refused = TICK_REFUSAL\.self;/.test(tick) && /designation!\.coincide\.includes\(c\)/.test(tick));
t("ticks: results recorded by PTS count for stage 4", /p\.status === "submitted" \|\| p\.status === "scored"/.test(tick));
t("ticks: the rules re-checked inside the lock", /const p = done \? tickProblem\(cur, def\.no, note\) : untickProblem\(cur, def\.no\);/.test(tick));
t("ticks: design approved after a result says so", /def\.no === 4 && results \? \{ afterResults: true \}/.test(tick));
t("ticks: journalled", /logActivity\("scheme\.stage", \{/.test(tick));
const create = actions.slice(actions.indexOf("export async function createProjectAction"), actions.indexOf("export async function renameSchemeAction"));
t("a scheme made from a sample starts open — and that opening is an act on record", /if \(scheme\.status === "open"\) \{\s*const at = new Date\(\)\.toISOString\(\);\s*scheme\.lifecycle = \{ acts: \[\{ act: "open", from: "draft", to: "open"/.test(create) && /logActivity\("scheme\.state", \{ schemeId: id[^\n]*created from a sample/.test(create));
const edit = actions.slice(actions.indexOf("export async function updateSchemeAction"));
t("the edit page: a move only from the state the form was opened in", /const statusFrom = str\("statusFrom", ""\);/.test(edit) && /wantStatus !== statusFrom && current\.status === statusFrom/.test(edit)
  && /name="statusFrom" value=\{init\.status\}/.test(readFileSync(new URL("../src/components/SchemeEditor.tsx", import.meta.url), "utf8")));
t("the edit page: only draft ↔ open, every move an act on record", /const wantStatus: "draft" \| "open" \| null = statusRaw === "open" \|\| statusRaw === "draft" \? statusRaw : null;/.test(edit) && /\(current\.status === "draft" \|\| current\.status === "open"\)/.test(edit) && /logActivity\("scheme\.state", \{\s*schemeId: id/.test(edit));
const labUp = actions.slice(actions.indexOf("export async function labUploadDocAction"));
t("a laboratory's results: none from processing on (Реш. 111); nothing in a scheme not held or closed", /const lockedNow = \(x: string\) => x === "not_held" \|\| x === "closed" \|\| \(slot === "results" && \(x === "processing" \|\| x === "report"\)\);/.test(labUp) && /if \(lockedNow\(st\)\) redirect/.test(labUp));
t("…re-checked inside the lock: an upload in flight when processing starts is not recorded", /late = lockedNow\(s\.status\);\s*if \(late\) return \{\};/.test(labUp));
t("the proforma: not held re-checked inside the lock", /notHeldNow = slot === "proforma" && \(s\.status === "not_held" \|\| invoiceProblem\(s, participant\) !== null\);/.test(actions));
t("the chain: fixed once processing starts; the laboratory stamps only while it travels", /if \(!chainOpen\(scheme\.status\)\) return \{ error:/.test(actions) && (actions.match(/if \(!chainOpen\(mine\.scheme\.status\)\) return \{ error: "closed" \};/g) ?? []).length === 2);
t("not held: nothing invoiced", /if \(slot === "proforma" && scheme\.status === "not_held"\) return \{ error:/.test(actions));
const reminders = readFileSync(new URL("../src/lib/notify-reminders.ts", import.meta.url), "utf8");
t("reminders: only an open or running round", /if \(s\.status !== "open" && s\.status !== "running"\) continue;/.test(reminders));
const editions = readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8");
t("the stages are not a document's content (fingerprint)", /"uploads", "lifecycle",/.test(editions));
const exportSrc = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the round export carries the lifecycle (coded)", /lifecycle: "coded"/.test(exportSrc));
const lab = readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8");
t("the laboratory: a scheme not held is over", /const isOver = \(st: string\) => st === "closed" \|\| st === "not_held";/.test(lab));
const folders = readFileSync(new URL("../src/lib/folders.ts", import.meta.url), "utf8");
t("the explorer: a scheme not held is finished", /st === "closed" \|\| st === "not_held" \? "finished"/.test(folders));
const visibility = readFileSync(new URL("../src/lib/visibility.ts", import.meta.url), "utf8");
t("Реш. 147 unchanged: only a draft is unstarted (a scheme not held was open)", /return s\.status !== "draft";/.test(visibility));
const page = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
t("the scheme page shows the stages", /<SchemeLifecycle schemeId=\{id\}/.test(page) && /const acts: ActButton\[\] = !canAct \? \[\]/.test(page));

console.log(`lifecycle.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
