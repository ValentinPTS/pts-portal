// Plan part 8.5 — level 3, the dry run: the scenarios, what the round's own records show for each (the
// mail — none failed, none outside the test mailboxes; the clock moved; a reminder; an unlock; an
// extension; a corrected report; the round exported); the round (a simulation round, never a replay); the
// result — a scenario ticked that never happened is never a pass; and the wiring.
import { readFileSync } from "node:fs";
import { scenarioHappened, testMailbox, isDryRunRound, SCENARIOS, type ScenarioRecords } from "../src/lib/dry-run-model.ts";
import { testResult, readTestForm, itemsFor, mustFor, type TestItem } from "../src/lib/validation-test-model.ts";
import { levelState, testableRound } from "../src/lib/validation-level.ts";
import { blankScheme } from "../src/lib/new-scheme.ts";
import { addScheme, getScheme } from "../src/lib/store.ts";
import { notify } from "../src/lib/notifications.ts";
import { appendActivity } from "../src/lib/activity-store.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// ── the scenarios, by the records ──
const none: ScenarioRecords = { mail: { sent: 0, pending: 0, failedAddresses: 0 }, clockMoves: 0, reminders: 0, unlocks: 0, extensions: 0, corrections: 0, exports: 0, refs: {}, latestAt: null };
const all: ScenarioRecords = { mail: { sent: 4, pending: 0, failedAddresses: 0 }, clockMoves: 1, reminders: 1, unlocks: 1, extensions: 1, corrections: 1, exports: 1, refs: {}, latestAt: "2027-03-05T10:00:00Z" };
t("nothing on record: no scenario happened; everything: every one", SCENARIOS.every((sc) => !scenarioHappened(none)[sc]) && SCENARIOS.every((sc) => scenarioHappened(all)[sc]));
t("review: the mail — delivered, none still pending, no address whose latest message failed", !scenarioHappened({ ...all, mail: { sent: 4, pending: 1, failedAddresses: 0 } }).mail && !scenarioHappened({ ...all, mail: { sent: 4, pending: 0, failedAddresses: 1 } }).mail && !scenarioHappened({ ...all, mail: { sent: 0, pending: 0, failedAddresses: 0 } }).mail);
t("review: the deadlines — the clock moved forward on record AND a deadline passed on it (an unlock)", !scenarioHappened({ ...all, clockMoves: 0 }).deadlines && !scenarioHappened({ ...all, unlocks: 0 }).deadlines && scenarioHappened(all).deadlines);
t("…the test mailboxes are PTS's own, wherever the dry run runs", testMailbox("ivanova@ptsbg.eu") && !testMailbox("lab@example.com") && !testMailbox("a@ptsbg.eu,b@example.com"));
const TEST = { PTS_ENVIRONMENT: "test" };
t("the round: a simulation round (SIM) in the test environment, never a replay (review: the environment too)", isDryRunRound({ number: "SIM 26/11-T-2" }, TEST) && !isDryRunRound({ number: "SIM 26/11-T-2", replay: {} }, TEST) && !isDryRunRound({ number: "PTS 26/11-T-2" }, TEST) && !isDryRunRound({ number: "SIM 26/11-T-2" }, {}));

// ── the result ──
const ticked = (r: Partial<Record<string, "mismatch">> = {}): TestItem[] => SCENARIOS.map((key) => ({ key, result: r[key] ?? "match", note: r[key] ? "не се случи" : "" }));
const ev = (happened: ScenarioRecords) => ({ unexpected: null, scenarios: { records: happened, happened: scenarioHappened(happened) } });
t("every scenario ticked AND on record: passes", testResult(ticked(), ev(all), "pts-t", 3) === "pass");
t("a scenario ticked that never happened: fails — never the tick alone", testResult(ticked(), ev({ ...all, extensions: 0 }), "pts-t", 3) === "fail" && testResult(ticked(), ev(none), "pts-t", 3) === "fail");
t("…a scenario «не съвпада»: fails; no record read at all: fails", testResult(ticked({ reminder: "mismatch" }), ev(all), "pts-t", 3) === "fail" && testResult(ticked(), { unexpected: null }, "pts-t", 3) === "fail");
t("level 3's items are the scenarios — all must match", itemsFor(3, "pts-t").join() === SCENARIOS.join() && mustFor(3, "calibration").join() === SCENARIOS.join() && itemsFor(1, "pts-t").includes("xpt"));
const form = readTestForm("pts-t", { testedOn: "2027-03-09", scope: "", conclusion: "Пробно изпълнение", item: () => ({ result: "match", note: "" }) }, "2027-03-10", "2026-01-01", 3);
t("the form at level 3 asks the scenarios", form.ok && form.items.map((i) => i.key).join() === SCENARIOS.join());

// ── a round's own records → the scenarios ──
const S = blankScheme({ id: "SIM-27-03-T-9", number: "SIM 27/03-T-9", type: "T", titleEn: "Dry run", titleBg: "Пробно", objectEn: "", objectBg: "", distribution: "simultaneous", minParticipants: 1 });
S.status = "running";
S.testClock = { offsetMs: 3 * 86_400_000, setAt: "2027-03-01T10:00:00Z", setBy: "q@ptsbg.eu" };
S.extensions = [{ id: "x1" } as never];
S.resultUnlocks = [{ id: "u1", participantId: "p", code: "126301", until: "2027-03-20", reason: "закъснял — пробно", at: "2027-03-02T10:00:00Z", by: "q@ptsbg.eu" }];
await addScheme(S);
// a reminder held (never released) — no proof (review)
await notify({ kind: "results.due", audience: "lab", labId: "lab-x", schemeId: S.id, code: "126301", bg: "Напомняне", en: "Reminder" });
await appendActivity({ action: "testclock.set", actorEmail: "q@ptsbg.eu", actorRole: "manager", schemeId: S.id, summary: "Test clock moved to 2027-03-20T10:00 (Bulgarian time)" });
await appendActivity({ action: "round.exported", actorEmail: "q@ptsbg.eu", actorRole: "manager", schemeId: S.id, subject: "export:coded", summary: "The round exported — the coded part only; 40 files" });
const sc0 = (await getScheme(S.id))!;
const st0 = await levelState(sc0);
t("review: a held reminder and a coded-only export prove nothing; the journalled clock move with an unlock proves the deadlines", !st0.auto.scenarios!.happened.reminder && !st0.auto.scenarios!.happened.export && st0.auto.scenarios!.happened.deadlines && st0.auto.scenarios!.happened.late && st0.auto.scenarios!.happened.extension, JSON.stringify(st0.auto.scenarios));
await appendActivity({ action: "round.exported", actorEmail: "q@ptsbg.eu", actorRole: "manager", schemeId: S.id, subject: "export:all", summary: "The round exported — both parts (coded and identity); 52 files" });
const sc = (await getScheme(S.id))!;
const st = await levelState(sc);
t("the dry run's state, read from the round: level 3, PT testing; the clock, the unlock, the extension, the WHOLE export happened — each traceable; no mail, no released reminder, no R2", st.level === 3 && st.kind === "pts-t" && !!st.auto.scenarios && ["deadlines", "late", "extension", "export"].every((k) => st.auto.scenarios!.happened[k as keyof typeof st.auto.scenarios.happened]) && !st.auto.scenarios.happened.mail && !st.auto.scenarios.happened.reminder && !st.auto.scenarios.happened.reissued && /^journal:/.test(st.auto.scenarios.records.refs.export ?? "") && /^unlock:u1$/.test(st.auto.scenarios.records.refs.late ?? ""), JSON.stringify(st.auto.scenarios));
t("review: the test never dated before the latest record it rests on", st.earliest === new Date(st.auto.scenarios!.records.latestAt!).toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" }));
const samp = await levelState({ ...sc, activity: "S", kind: "ILC" });
t("review: sampling — an ILC's too — is not a dry run's kind", samp.kind === "sampling" && samp.missing.includes("kind"));
t("…testable: a simulation round (in the local build with no database, any round not a replay)", testableRound(sc) && testableRound({ ...sc, number: "PTS 27/03-T-9" }) && !testableRound({ ...sc, replay: { failed: "x" } as never }));

// ── the wiring ──
const act = readFileSync(new URL("../src/lib/validation-actions.ts", import.meta.url), "utf8");
const rec = act.slice(act.indexOf("export async function recordTestAction"), act.indexOf("export async function voidTestAction"));
t("the action: a replay or a dry run's round; the reference round for level 1 only; the level passed to the form and the rule", /if \(!s \|\| !testableRound\(s\)\)/.test(rec) && /if \(level === 1 && !isReference\(sc\.replay\?\.of\)\)/.test(rec) && /st\.earliest, level\)/.test(rec) && /testResult\(v\.items, st\.auto, st\.kind, level\)/.test(rec));
const m47 = readFileSync(new URL("../supabase/migrations/0047_validation_levels.sql", import.meta.url), "utf8");
t("the database (0047): level 3 with PT testing, calibration or ILC; its pass without a file comparison", /\(level = 3 and kind in \('pts-t', 'calibration', 'ilc'\)\)/.test(m47) && /\(level >= 3 or \(auto->>'unexpected'\) = '0'\)/.test(m47));

const m48 = readFileSync(new URL("../supabase/migrations/0048_validation_dry_run.sql", import.meta.url), "utf8");
t("…and (0048) a dry run's pass never with a scenario not on record or not «match»; a missing value never a pass (coalesce — review)", /result = 'fail' or level <> 3 or coalesce\(/.test(m48) && SCENARIOS.every((sc) => m48.includes(`"${sc}": true`) && m48.includes(`{"key": "${sc}", "result": "match"}`)) && (m48.match(/coalesce\(/g) ?? []).length >= 5 && /drop constraint if exists validation_tests_pass/.test(m48) && /insert into public\.app_migrations \(name\) values \('0048_validation_dry_run'\)/.test(m48));

console.log(`level3.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
