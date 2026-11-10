// Plan part 6.6 — «Заключи подаването» (Реш. 21; the assignment §7): the start of processing is
// the technical end of the submission; the lock records, per participation in the final round, the
// version taken or none (N/R); «Върни» reopens; the next lock records again.
import { readFileSync } from "node:fs";
import { lockEntries, lockInForce, takenVersion, lockCounts, isNR, lockWord, lockEntryOf, resultsOutsideForm, type SubmissionLock } from "../src/lib/submission-lock-model.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import { ACTS } from "../src/lib/lifecycle-model.ts";
import { roundTables } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// what a lock records
const parts = [{ id: "pa", code: "126301" }, { id: "pb", code: "126302" }, { id: "pc", code: "126303" }];
const versions = [{ participantId: "pa", version: 1 }, { participantId: "pa", version: 3 }, { participantId: "pa", version: 2 }, { participantId: "pc", version: 1 }, { participantId: "px", version: 4 }];
const entries = lockEntries(parts, versions);
eq("the lock: each participation on the list — its LATEST version; none submitted — N/R (null); one not on the list never", entries, [{ participantId: "pa", code: "126301", version: 3 }, { participantId: "pb", code: "126302", version: null }, { participantId: "pc", code: "126303", version: 1 }]);
eq("…counted", lockCounts(entries), { taken: 2, outside: 0, nr: 1 });
// results that came another way — the Results Sheet uploaded or e-mailed and recorded (before Gate B): NOT N/R (6.6 review)
const withSheet = lockEntries(parts, versions, new Set(["pb"]));
t("results received outside the form: not N/R — «outside»; one with an online version stays its version", withSheet[1].version === null && withSheet[1].via === "outside" && !isNR(withSheet[1]) && lockEntries(parts, versions, new Set(["pa"]))[0].via === undefined && JSON.stringify(lockCounts(withSheet)) === JSON.stringify({ taken: 2, outside: 1, nr: 0 }));
t("…what counts as outside: the sheet uploaded, or «results returned» recorded — the scheme's own count", resultsOutsideForm({ X: { results: {} } }, { code: "X" }) && resultsOutsideForm(undefined, { code: "Y", status: "submitted" }) && resultsOutsideForm(undefined, { code: "Y", status: "scored" }) && !resultsOutsideForm({ X: {} }, { code: "X", status: "received" }));
t("…one word for the pages: the version, «outside», «nr», or nothing", lockWord(lockEntryOf(lockEntries(parts, versions, new Set(["pb"])) && { id: "x", kind: "lock", at: "", roundAt: "", by: "", entries: withSheet }, "pb")) === "outside" && lockWord(withSheet[0]) === "3" && lockWord(entries[1]) === "nr" && lockWord(undefined) === "");

// the lock in force
const L1: SubmissionLock = { id: "l1", kind: "lock", at: "2026-11-21T09:00:00Z", roundAt: "2026-11-21T09:00:00Z", by: "m@ptsbg.eu", entries };
const R1: SubmissionLock = { id: "r1", kind: "reopen", at: "2026-11-22T09:00:00Z", by: "m@ptsbg.eu", note: "забравен участник" };
const L2: SubmissionLock = { ...L1, id: "l2", at: "2026-11-23T09:00:00Z", entries: lockEntries(parts, [...versions, { participantId: "pb", version: 1 }]) };
t("the lock in force: none; the lock; reopened — none; locked again — the new one", lockInForce(undefined) === null && lockInForce([L1])?.id === "l1" && lockInForce([L1, R1]) === null && lockInForce([L1, R1, L2])?.id === "l2");
t("…what it took: a version; N/R (null); not on the list (undefined)", takenVersion(L1, "pa") === 3 && takenVersion(L1, "pb") === null && takenVersion(L1, "zz") === undefined && takenVersion(null, "pa") === undefined && takenVersion(L2, "pb") === 1);
t("the act's name says it: «Заключи подаването и започни обработката» — one act, the technical end IS the start of processing", ACTS.process.bg === "Заключи подаването и започни обработката" && ACTS.process.en === "Lock the submission and start processing" && ACTS.process.from.join() === "running" && ACTS.process.to === "processing");

// the round export: by code, N/R said, the reopening with its note
const rt = roundTables({ submissionLocks: [L1, R1] } as unknown as Scheme, (pid) => ({ pa: "126301", pb: "126302", pc: "126303" } as Record<string, string>)[pid] ?? "—").find(([f]) => f === "coded/submission_locks.csv");
t("the round export: coded/submission_locks.csv — a row per participation per lock (the version, or N/R) and one per reopening — its note (a person's words) not in the table", !!rt && rt[1].length === 4 && JSON.stringify(rt[1][1]).includes('"code":"126302","version":"","via":"","nr":"yes"') && JSON.stringify(rt[1][3]).includes('"kind":"reopen"') && !JSON.stringify(rt[1]).includes("забравен участник"));

// the wiring
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function lifecycleActAction"), act.indexOf("// ── The two announcements"));
t("the act: before it — the final list, the results received outside the form, a deadline still running (then a note required); who may end N/R looked up (2.3); a read that fails — nothing recorded", /lockParts = \(await listParticipants\(schemeId\)\)\.filter\(\(p\) => inFinalRound\(scheme, p\)\);/.test(fn) && /lockOutside = new Set\(lockParts\.filter\(\(p\) => resultsOutsideForm\(scheme\.labUploads, p\)\)/.test(fn) && /nrLabOf = maybeNr\.length \? await labIdsFor\(schemeId, maybeNr, by\) : nrLabOf;\n\s+\} catch \{\n\s+return \{ error: NOT_REACHED \};/.test(fn) && /if \(stillOpen\.length && \[\.\.\.note\]\.length < MIN_NOTE\) return \{ error:/.test(fn));
t("…what the lock TAKES is read AFTER the status has changed (a version landing meanwhile is taken or refused, never lost); recorded only if the scheme is still in processing", fn.indexOf("versions = await listSubmissions(schemeId)") > fn.indexOf("await updateSchemeWith(schemeId, (cur) => {\n    // re-checked inside the lock") && /await updateSchemeWith\(schemeId, \(cur\) => \{ if \(cur\.status !== "processing"\) return \{\}; stored = true; return \{ submissionLocks: \[\.\.\.\(cur\.submissionLocks \?\? \[\]\), lock\] \}; \}\);/.test(fn));
t("…«Върни» from a LOCKED processing: a reopening with its note; those N/R told it is open again; a processing never locked — nothing to reopen", /const lock: SubmissionLock \| null = act === "back" && from === "processing" && lockInForce\(cur\.submissionLocks\) \? \{ id: randomUUID\(\), kind: "reopen", at, by, note \} : null;/.test(fn) && /notifyResultsReopened\(/.test(fn));
t("…journalled — the counts and the codes N/R or outside, never a value; each N/R told, by code", /logActivity\("results\.locked"/.test(fn) && /after: \{ taken: n\.taken, outside: entries\.filter\(\(e\) => e\.via\)\.map\(\(e\) => e\.code\), nr: nr\.map\(\(e\) => e\.code\) \}/.test(fn) && /for \(const e of nr\) await notifyResultsLockedNR\(nrLabOf\.get\(e\.code\), schemeId, scheme\.number, e\.code, e\.participantId\);/.test(fn) && /logActivity\("results\.reopened"/.test(fn));
const notice = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
const nf = notice.slice(notice.indexOf("export async function notifyResultsLockedNR"));
t("the notice: N/R said to the participation itself (Реш. 22, 91), held for a person — linking to where the lock is said", /kind: "results\.locked"/.test(nf) && /участието ви е N\/R/.test(nf) && /audience: "lab"/.test(nf) && /href: `\/lab\/p\/\$\{encodeURIComponent\(participantId\)\}\/results`/.test(nf));
t("…and when it opens again", /export async function notifyResultsReopened/.test(notice));
const sub = act.slice(act.indexOf("export async function submitResultsAction"), act.indexOf("export async function unlockResultsAction"));
t("the submission reads the scheme's state again right before it records — the lock may have come meanwhile", /const fresh = await getScheme\(sid\)\.catch\(\(\) => null\);\n\s+if \(!fresh \|\| !\(fresh\.type === "T" \? fresh\.status === "running" : fresh\.status === "open" \|\| fresh\.status === "running"\)\) return \{ error: "state" \};/.test(sub) && sub.indexOf("const fresh = await getScheme(sid)") < sub.indexOf("sub = await addSubmission("));
const sql = readFileSync(new URL("../supabase/migrations/0044_submissions_scheme_open.sql", import.meta.url), "utf8");
t("0044: the database refuses a version once the scheme takes no results — its state read under a share lock; the version guard kept", /select s\.status, s\.type into st, ty from public\.schemes s where s\.id = new\.scheme_id for share;/.test(sql) && /if st is null or not \(st = 'running' or \(ty = 'C' and st = 'open'\)\) then/.test(sql) && /raise exception 'submissions is a record/.test(sql) && /if new\.version <> coalesce\(latest, 0\) \+ 1 then/.test(sql) && /'0044_submissions_scheme_open'/.test(sql) && MIGRATIONS.includes("0044_submissions_scheme_open"));
// after the lock nothing comes in: the form, the submission and the unlock all need the scheme taking results
t("after it nothing comes in: the draft and the submission need the scheme in progress; the unlock too (6.4)", /const formOpen = scheme\.type === "T" \? scheme\.status === "running" : scheme\.status === "open" \|\| scheme\.status === "running";/.test(act) && /const takes = !!scheme && \(scheme\.type === "T" \? scheme\.status === "running" : scheme\.status === "open" \|\| scheme\.status === "running"\);/.test(act));
const page = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
t("the scheme's page: what the lock will record — by the act's own rules (outside the form; a deadline still running) — said in the act's warning and its confirmation, by code; «Върни» says the form reopens", /lockPreview = lockEntries\(goingOn, versionsNow, new Set\(goingOn\.filter\(\(p\) => resultsOutsideForm\(s\.labUploads, p\)\)/.test(page) && /lockStillOpen = lockPreview\.filter\(isNR\)/.test(page) && /a === "back" && s\.status === "processing" \?/.test(page) && /a === "process" \? `\$\{lockSay\} \$\{CONFIRM\[a\]/.test(page) && /a === "process" \? \[lockSay,/.test(page));
const lab = readFileSync(new URL("../src/app/lab/p/[id]/results/page.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/app/schemes/[id]/participants/[code]/page.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
t("the lab: «locked — processing has started»; its version processed, outside the form, or N/R — and closed all the same with no lock (before 6.6); its overview says N/R too; PTS's page the same, no unlock offered after it", /data-results-locked=\{word\}/.test(lab) && /const lockNote = afterStart \?/.test(lab) && /data-results-box-nr/.test(overview) && /data-staff-lock=\{w\}/.test(staff) && /\{canEnterResults && \(s\.type === "T" \? s\.status === "running" : s\.status === "open" \|\| s\.status === "running"\) && \(/.test(staff));
const i18n = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("journal labels; the scheme field placed in the round export (coded)", /"act\.results\.locked"/.test(i18n) && /"act\.results\.reopened"/.test(i18n) && /submissionLocks: "coded",/.test(exp));

console.log(`submission-lock.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
