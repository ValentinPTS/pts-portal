// Plan part 6.4 — submission (Zadanie §7; Реш. 111; D1): review → confirmations → receipt; the form
// closes at the results deadline in force on the round's clock; after it, only under PTS's unlock
// (who, when, why, until); every version kept, the next only; journalled without a value.
import { readFileSync } from "node:fs";
import { activeUnlock, submissionOpen, readUnlock, readConfirmations, submissionPayload, SUBMIT_PROBLEM_TEXT, type ResultUnlock } from "../src/lib/submission-model.ts";
import { readDraft, readCalDraft, fieldName, calField, genField, type ResultRow, type CalRow } from "../src/lib/results-model.ts";
import { addSubmission, listSubmissionsFor } from "../src/lib/submissions.ts";
import { testPeriodLimits } from "../src/lib/results-limits.ts";
import { sofiaToday } from "../src/lib/clock.ts";
import { codedSubmissionData, submissionIdentity } from "../src/lib/results-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// the deadline (Реш. 111): a day alone ends at its end, in Sofia; an hour is its hour; the round's clock
const at = (iso: string) => Date.parse(iso);
t("before the deadline: open; a day alone open to its end in Sofia (EET: 21:59 UTC the same day)", submissionOpen("2026-11-20", at("2026-11-20T21:59:00Z"), null).open && !submissionOpen("2026-11-20", at("2026-11-20T22:01:00Z"), null).open);
t("…an hour: to that hour, Sofia's", submissionOpen("2026-11-20T17:00", at("2026-11-20T14:59:00Z"), null).open && !submissionOpen("2026-11-20T17:00", at("2026-11-20T15:01:00Z"), null).open);
t("…no deadline set: open", submissionOpen(undefined, at("2030-01-01T00:00:00Z"), null).open);
const u: ResultUnlock = { id: "u1", participantId: "p1", code: "C1", until: "2026-11-25", reason: "техническа грешка при въвеждане", at: "2026-11-21T09:00:00Z", by: "coder@ptsbg.eu" };
t("after it: closed — only under PTS's unlock, its last day included (Реш. 111)", !submissionOpen("2026-11-20", at("2026-11-22T10:00:00Z"), null).open && submissionOpen("2026-11-20", at("2026-11-22T10:00:00Z"), u).open && submissionOpen("2026-11-20", at("2026-11-22T10:00:00Z"), u).late);
t("the unlock that holds: this participation's, until its day inclusive — never another's, never past its day", activeUnlock([u], "p1", "2026-11-25")?.id === "u1" && activeUnlock([u], "p1", "2026-11-26") === null && activeUnlock([u], "p2", "2026-11-22") === null);
t("…of two, the latest", activeUnlock([u, { ...u, id: "u2", until: "2026-11-30", at: "2026-11-23T09:00:00Z" }], "p1", "2026-11-24")?.id === "u2");
t("…at Sofia's midnight: 23:30 UTC on its last day is already the next day in Sofia — the unlock no longer holds", activeUnlock([u], "p1", sofiaToday(Date.parse("2026-11-25T21:30:00Z")))?.id === "u1" && activeUnlock([u], "p1", sofiaToday(Date.parse("2026-11-25T22:30:00Z"))) === null);
eq("…a real date only; at most 30 days ahead — never a way round the deadline for good (6.4 review)", [readUnlock({ until: "2026-02-31", reason: "грешка в съобщението" }, "2026-01-23").ok, readUnlock({ until: "2026-12-23", reason: "грешка в съобщението" }, "2026-11-23").ok, readUnlock({ until: "2026-12-24", reason: "грешка в съобщението" }, "2026-11-23").ok], [false, true, false]);
eq("an unlock needs its day (today or later) and its reason (5 characters at least)", [readUnlock({ until: "2026-11-24", reason: "грешка в съобщението" }, "2026-11-23").ok, readUnlock({ until: "2026-11-20", reason: "грешка в съобщението" }, "2026-11-23").ok, readUnlock({ until: "2026-11-24", reason: "аб" }, "2026-11-23").ok, readUnlock({ until: "24.11.2026", reason: "грешка в съобщението" }, "2026-11-23").ok], [true, false, false, false]);

// the test period under an unlock: a lab let in late may have tested late — to the unlock's day
const sch = { dates: { dispatch: "2026-11-02", resultsDue: "2026-11-20" }, extensions: [], deliveries: {} } as unknown as Parameters<typeof testPeriodLimits>[0];
eq("the test period's limits: the dispatch to the deadline; under an unlock, to its last day; an unlock before the deadline never shortens it", [testPeriodLimits(sch, "p1", "C1"), testPeriodLimits(sch, "p1", "C1", u), testPeriodLimits(sch, "p1", "C1", { until: "2026-11-18" })], [{ from: "2026-11-02", to: "2026-11-20" }, { from: "2026-11-02", to: "2026-11-25" }, { from: "2026-11-02", to: "2026-11-20" }]);

// the confirmations
eq("confirmations: the results ours, as entered — required; a part subcontracted — which; calibration: the errors confirmed (D1)", [readConfirmations({}, "T"), readConfirmations({ truthful: true, subcontracted: true, subcontractedPart: "" }, "T"), readConfirmations({ truthful: true }, "C")].map((r) => (r.ok ? "ok" : r.problem)), ["truthful", "subcontract", "errors"]);
t("…given: as given", JSON.stringify(readConfirmations({ truthful: "on", subcontracted: "on", subcontractedPart: "Лос Анджелис — в партньорска лаборатория" }, "T")) === JSON.stringify({ ok: true, value: { truthful: true, subcontracted: true, subcontractedPart: "Лос Анджелис — в партньорска лаборатория" } }) && readConfirmations({ truthful: true, errorsConfirmed: true }, "C").ok);
t("every refusal has its words, both languages", Object.values(SUBMIT_PROBLEM_TEXT).every((x) => !!x.bg && !!x.en));

// the payload: the draft as typed, the values as numbers, N/R; calibration: the computed errors (D1)
const rows: ResultRow[] = [{ key: "ch-1", index: 0, name: { bg: "A", en: "A" }, method: { bg: "m", en: "m" }, determinations: 2, uRequired: false }, { key: "ch-2", index: 1, name: { bg: "B", en: "B" }, method: { bg: "m", en: "m" }, determinations: 1, uRequired: false }];
const d = readDraft((n) => ({ [fieldName("d", "ch-1", 0)]: "5,1", [fieldName("mean", "ch-1")]: "5,2", [fieldName("U", "ch-1")]: "0,2", [fieldName("k", "ch-1")]: "2", [fieldName("nr", "ch-2")]: "on" } as Record<string, string>)[n], rows);
const pay = submissionPayload("T", d, rows, [{ key: "ch-1", field: "d2", why: "nr-value", level: "notice" }], { truthful: true, subcontracted: false }, null) as { values: Record<string, Record<string, unknown>>; draft: unknown; notices: unknown[] };
t("the payload: the values as numbers; a determination not given — null (N/R for it); a characteristic N/R — so; the draft kept as typed; the notices said", JSON.stringify(pay.values["ch-1"]) === JSON.stringify({ d: [5.1, null], mean: 5.2, U: 0.2, k: 2 }) && JSON.stringify(pay.values["ch-2"]) === JSON.stringify({ nr: true }) && (pay.draft as { rows: Record<string, { mean: string }> }).rows["ch-1"].mean === "5,2" && pay.notices.length === 1);
const cRows: CalRow[] = [{ key: "pt-1", nominal: "20" }, { key: "pt-2", nominal: "40" }];
const cd = readCalDraft((n) => ({ [genField("labName")]: "Л", [calField("ref", "pt-1")]: "20,00", [calField("meas", "pt-1")]: "20,03", [calField("U", "pt-1")]: "0,02", [calField("na", "pt-2")]: "on" } as Record<string, string>)[n], cRows);
const cpay = submissionPayload("C", cd, cRows, [], { truthful: true, subcontracted: false, errorsConfirmed: true }, u) as { values: Record<string, Record<string, unknown>>; unlock?: { id: string; reason: string } };
// the round export's coded part (6.4 review): the 6.4 payload nests the draft — the lab's name, who filled it and the subcontracted part out
const cIdPay = submissionPayload("C", readCalDraft((n) => ({ [genField("labName")]: "Лаб ТАЙНА", [genField("signedBy")]: "Иван ТАЙНИ", [genField("manufacturer")]: "Fluke" } as Record<string, string>)[n], cRows), cRows, [], { truthful: true, subcontracted: true, subcontractedPart: "Сестринска лаб ТАЙНА", errorsConfirmed: true }, null);
const codedJson = JSON.stringify(codedSubmissionData(cIdPay));
t("the coded part: the typed laboratory, the person and the subcontracted part out — the rest kept; the identity part has them", !/ТАЙН/.test(codedJson) && /Fluke/.test(codedJson) && /"subcontracted":true/.test(codedJson) && JSON.stringify(submissionIdentity(cIdPay)) === JSON.stringify({ labName: "Лаб ТАЙНА", signedBy: "Иван ТАЙНИ", subcontractedPart: "Сестринска лаб ТАЙНА" }));
t("…calibration: the reference, the measured value AND the computed error stored (D1); N/A; the unlock named", JSON.stringify(cpay.values["pt-1"]) === JSON.stringify({ ref: 20, meas: 20.03, error: "0.03", U: 0.02, cmc: null }) && JSON.stringify(cpay.values["pt-2"]) === JSON.stringify({ na: true }) && cpay.unlock?.id === "u1" && cpay.unlock.reason === u.reason);

// the versions: the next only — the database's guard (0042), memory the same
const P = "00000000-0000-4000-8000-0000000000e1";
await addSubmission({ id: "s1", participantId: P, schemeId: "S", version: 1, data: {}, submittedBy: "lab:x" });
let refused = false;
try { await addSubmission({ id: "s3", participantId: P, schemeId: "S", version: 3, data: {}, submittedBy: "lab:x" }); } catch { refused = true; }
await addSubmission({ id: "s2", participantId: P, schemeId: "S", version: 2, data: {}, submittedBy: "lab:x" });
t("versions: the next only — a skipped number refused; every version kept, in order", refused && (await listSubmissionsFor(P, "S")).map((x) => x.version).join() === "1,2");

// the wiring
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function submitResultsAction"), act.indexOf("export async function unlockResultsAction"));
const un = act.slice(act.indexOf("export async function unlockResultsAction"));
t("submit: the participation's own; the deadline on the round's clock, past it only under an unlock; the REVIEWED draft (its revision); the checks again; the confirmations", /const mine = await ownGoingOn\(sid, pid\);/.test(fn) && /const gate = submissionOpen\(resultsDeadline\(scheme, part\.code\)\.at, nowMs, unlock\);\n\s+if \(!gate\.open\) return \{ error: "closed" \};/.test(fn) && /if \(!stored \|\| stored\.rev !== base\) return \{ error: "stale" \};/.test(fn) && /if \(blocking\(problems\)\.length\) return \{ error: "checks"/.test(fn) && /checkTesting\(draft, rows, testPeriodLimits\(scheme, pid, part\.code, lateBy\)\)/.test(fn) && /readConfirmations\(c, scheme\.type\)/.test(fn));
t("…the unlock named only when it let the version in — when late (6.4 review)", /const lateBy = gate\.late \? unlock : null;/.test(fn) && /submissionPayload\("T", draft, rows, problems, conf\.value, lateBy\)/.test(fn) && /submissionPayload\("C", draft, rows, problems, conf\.value, lateBy\)/.test(fn) && !/conf\.value, unlock\)/.test(fn));
t("…a retry with the review's id: that receipt, never a second version; the id used as the version's", /const same = already\.find\(\(x\) => x\.id === nonce\);\n\s+if \(same\) return \{ ok: true, receipt: receiptOf\(same\) \};/.test(fn) && /id: nonce \?\? randomUUID\(\)/.test(fn));
t("…once recorded, never «not recorded»: each step after it on its own, the journal first; the receipt always (6.4 review)", /const step = async \(what: string, f: \(\) => Promise<unknown>\) => \{ try \{ await f\(\); \} catch/.test(fn) && fn.indexOf('step("the journal"') < fn.indexOf('step("the case file"') && fn.indexOf('step("the case file"') < fn.indexOf('step("PTS\'s notice"') && /return \{ ok: true, receipt: receiptOf\(\{ \.\.\.sub, roundAt \}\) \};\n\}/.test(fn));
t("…recorded as the next version, whole or not at all; then the case file, PTS told; journalled with its version — never a value", /addSubmission\(\{ id: nonce \?\? randomUUID\(\), participantId: pid, schemeId: sid, version,/.test(fn) && /kind: "results_returned"/.test(fn) && /notifyResultsReturned\(sid, scheme\.number, part\.code, \{ version \}\)/.test(fn) && /log\("results\.submitted"/.test(fn) && !/after: \{[^}]*values/.test(fn));
t("the unlock: who enters the results in the scheme; the day and the reason read; recorded in the lock; journalled; the lab told", /await requireCap\("results\.enter", schemeId\);/.test(un) && /readUnlock\(/.test(un) && /resultUnlocks: \[\.\.\.\(s\.resultUnlocks \?\? \[\]\), entry\]/.test(un) && /logActivity\("results\.unlocked"/.test(un) && /notifyResultsUnlocked\(/.test(un));
t("the unlock only when it means something: the form still taking results (the scheme, the participation), the deadline passed; a second press not a second unlock (decided in the lock)", /if \(!scheme \|\| !isStarted\(scheme\) \|\| !takes\) redirect\(back\("unlock=state"\)\);/.test(un) && /if \(!canLabUploadNow\(part!\.status\)\) redirect\(back\("unlock=state"\)\);/.test(un) && /if \(!submissionOpen\(resultsDeadline\(scheme!, code\)\.at, nowMs, null\)\.late\) redirect\(back\("unlock=early"\)\);/.test(un) && /covered = true; return \{\};/.test(un) && /if \(covered\) redirect\(back\("unlock=already"\)\);/.test(un));
const panel = readFileSync(new URL("../src/components/SubmitPanel.tsx", import.meta.url), "utf8");
t("the panel: what was reviewed is what goes — saved again at «Подай»; changed: the review and the confirmations again; a lost answer «unknown», never «NOT recorded»; the same id on a retry; a new version from the receipt (6.4 review)", /const now = await flush\(\);/.test(panel) && /if \(now !== rev\) \{/.test(panel) && /setC\(\(x\) => \(\{ \.\.\.x, truthful: false, errorsConfirmed: false \}\)\);/.test(panel) && /catch \{ setStage\("review"\); setError\(L\(SUBMIT_PROBLEM_TEXT\.unknown\.bg/.test(panel) && /submitResultsAction\(schemeId, participantId, rev, c, nonce\)/.test(panel) && /data-submit-again/.test(panel));
const pages = readFileSync(new URL("../src/app/lab/p/[id]/results/page.tsx", import.meta.url), "utf8") + readFileSync(new URL("../src/app/schemes/[id]/participants/[code]/page.tsx", import.meta.url), "utf8");
t("a read that failed is said on both pages — never «nothing submitted»; the deadline shown to the lab (6.4 review)", /data-versions-unread/.test(pages) && /data-staff-submissions-unread/.test(pages) && /data-results-deadline=\{due\.at\}/.test(pages));
t("the draft too: closed at the deadline — the form takes no change, but under an unlock", /submissionOpen\(resultsDeadline\(scheme, part\.code\)\.at, nowD, activeUnlock\(scheme\.resultUnlocks, pid, sofiaToday\(nowD\)\)\)\.open\) return \{ error: "state" \};/.test(act));

console.log(`submission.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
