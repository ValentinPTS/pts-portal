// One clock (plan part 1.3, Реш. 132): business time comes from the round's clock,
// which the TEST environment can move to any date; the real portal never moves it.
// The reminder is driven here by moving the clock — the first of the four the plan
// names. A late result (6.4), an extension (3.x) and a reissued report (7.4) read the
// same clock when they are built.
import { schemeNowMs, schemeNowIso, sofiaToday, clockOffsetMs, clockMoved, sofiaNowWallShifted, MAX_CLOCK_SHIFT_MS } from "../src/lib/clock.ts";
import { addCaseEvent } from "../src/lib/case-events.ts";
import { raiseDueReminders } from "../src/lib/notify-reminders.ts";
import { updateSchemeWith, getScheme } from "../src/lib/store.ts";
import { addParticipant } from "../src/lib/participants.ts";
import { stampProblem, returnProblem, chainNewestMs } from "../src/lib/chain.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const REAL = Date.parse("2026-11-02T08:00:00Z");
const TEST = { PTS_ENVIRONMENT: "test" };
const moved = { testClock: { offsetMs: Date.parse("2027-03-14T08:00:00Z") - REAL, setAt: "2026-11-02T08:00:00Z", setBy: "t" } };

// ── the clock itself ──────────────────────────────────────────────────────
t("no clock → the real time", schemeNowMs({}, REAL, TEST) === REAL && schemeNowMs(undefined, REAL) === REAL);
t("test environment: the moved clock", schemeNowMs(moved, REAL, TEST) === Date.parse("2027-03-14T08:00:00Z"));
t("the real portal ignores a stored clock", schemeNowMs(moved, REAL, {}) === REAL && clockOffsetMs(moved, {}) === 0 && !clockMoved(moved, {}));
t("a broken offset is ignored", schemeNowMs({ testClock: { offsetMs: NaN, setAt: "", setBy: "" } }, REAL, TEST) === REAL);
t("the moved clock runs on", schemeNowMs(moved, REAL + 60_000, TEST) - schemeNowMs(moved, REAL, TEST) === 60_000);
t("ISO form", schemeNowIso(moved, REAL, TEST) === "2027-03-14T08:00:00.000Z");
t("the offset handed to a page: the moved one in test", clockOffsetMs(moved, TEST) === moved.testClock.offsetMs && clockMoved(moved, TEST));
t("…none for an unmoved round", clockOffsetMs({}, TEST) === 0 && !clockMoved({}, TEST));
t("a form's default on a shifted clock: a datetime-local value, a year on", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sofiaNowWallShifted(0))
  && Number(sofiaNowWallShifted(366 * 86_400_000).slice(0, 4)) === Number(sofiaNowWallShifted(0).slice(0, 4)) + 1);
t("a shift is bounded to about five years", MAX_CLOCK_SHIFT_MS > 4 * 365 * 86_400_000 && MAX_CLOCK_SHIFT_MS < 6 * 366 * 86_400_000);
t("a past date is allowed", schemeNowMs({ testClock: { ...moved.testClock, offsetMs: Date.parse("2025-01-10T09:00:00Z") - REAL } }, REAL, TEST) === Date.parse("2025-01-10T09:00:00Z"));
// Bulgaria's day, not the UTC one
t("Sofia day: 1 Nov 22:30 UTC is already 2 Nov (EET)", sofiaToday(Date.parse("2026-11-01T22:30:00Z")) === "2026-11-02");
t("Sofia day: 1 Jul 21:30 UTC is already 2 Jul (EEST)", sofiaToday(Date.parse("2026-07-01T21:30:00Z")) === "2026-07-02");
t("Sofia day: 2 Nov 21:59 UTC is still 2 Nov", sofiaToday(Date.parse("2026-11-02T21:59:00Z")) === "2026-11-02");

// the chain's «not in the future» on a round's clock moved into the past
const chain = { stops: [{ id: "a", kind: "lab" as const, code: "1" }], dispatchedAt: "2025-01-09T08:00:00Z" };
t("a moved-back round: a stamp at today's real time is «in the future»",
  stampProblem(chain as never, "a", "received", REAL, schemeNowMs({ testClock: { ...moved.testClock, offsetMs: Date.parse("2025-01-10T09:00:00Z") - REAL } }, REAL, TEST)) === "future");

// the device is back no earlier than the last handover (a clock moved back)
const done = { dispatchedAt: "2026-11-01T08:00:00Z", stops: [{ id: "a", kind: "lab" as const, code: "1", receivedAt: "2026-11-01T09:00:00Z", sentAt: "2026-11-02T07:00:00Z" }] };
t("return before the last handover → refused", returnProblem(done as never, Date.parse("2026-11-02T06:00:00Z")) === "before-handover");
t("return after it → fine", returnProblem(done as never, Date.parse("2026-11-02T07:30:00Z")) === null);
t("return without a time → as before", returnProblem(done as never) === null);
t("the chain's newest time", chainNewestMs(done as never) === Date.parse("2026-11-02T07:00:00Z") && chainNewestMs(undefined) === 0);

// a case-file step with no date takes Bulgaria's day, not the UTC one
const ev = await addCaseEvent({ schemeId: "26-01-T-1", code: "999999", kind: "other", source: "auto" });
t("a case-file step's default day is Bulgaria's", ev.at === sofiaToday(Date.now()), ev.at);

// ── the reminder, driven by moving the clock (in memory) ──────────────────
process.env.PTS_ENVIRONMENT = "test";
const S = "26-01-T-1";
await updateSchemeWith(S, () => ({ status: "running", dates: { resultsDue: "2027-03-15" }, remindedAt: {} }));
const p = await addParticipant({ schemeId: S, labName: "Clock lab", labId: "LAB-CLOCK" }, "test");
t("fixture: a participant who still owes results", !!p.code);

let r = await raiseDueReminders(REAL);
t("real time (2 Nov 2026): nothing is due", r.remindersRaised === 0, JSON.stringify(r));

await updateSchemeWith(S, () => moved);
r = await raiseDueReminders(REAL);
t("clock moved to 14 Mar 2027, the day before the deadline: the reminder is raised", r.remindersRaised === 1 && r.schemesReminded.includes("PTS 26/01-T-1"), JSON.stringify(r));
r = await raiseDueReminders(REAL);
t("…and only once", r.remindersRaised === 0, JSON.stringify(r));
const stamps = Object.values((await getScheme(S))?.remindedAt ?? {}).map((v) => Date.parse(String(v)));
t("the round was stamped «reminded» on the REAL clock, not the moved one", stamps.length === 1 && Math.abs(stamps[0] - Date.now()) < 60_000, JSON.stringify(stamps));

// the real portal never follows a stored clock
await updateSchemeWith(S, () => ({ remindedAt: {} }));
delete process.env.PTS_ENVIRONMENT;
r = await raiseDueReminders(REAL);
t("the real portal: the same stored clock moves nothing", r.remindersRaised === 0, JSON.stringify(r));

// ── wired where the decisions are made ────────────────────────────────────
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const stampLines = actions.split("\n").filter((l) => l.includes("stampProblem(s.chain"));
t("chain stamps decide «future» on the round's clock", stampLines.length === 3 && stampLines.every((l) => l.includes("schemeNowMs(s)")), stampLines.join("\n"));
t("no chain decision on Date.now() any more", stampLines.every((l) => !l.includes("Date.now()")));
t("a moved clock may never go back before the chain, and clears the reminder stamps", /chainNewestMs\(scheme\.chain\)/.test(actions) && /remindedAt: \{\}/.test(actions));
t("the reminders can be run by hand in the test environment only", /export async function runRemindersNowAction[\s\S]{0,160}if \(!isTestEnvironment\(\)\) return \{ error: "not-test" \}/.test(actions));
t("a lab's chain record stamps are real time", (actions.match(/\{ by: "lab", recordedAt: new Date\(\)\.toISOString\(\) \}/g) ?? []).length === 2);
t("the clock can be moved only in the test environment", /export async function setTestClockAction[\s\S]{0,400}if \(!isTestEnvironment\(\)\) return \{ error: "not-test" \}/.test(actions));
const cron = readFileSync(new URL("../src/app/api/cron/notify/route.ts", import.meta.url), "utf8");
t("the cron reads Bulgaria's day, not UTC's", cron.includes("sofiaToday(Date.now())") && !cron.includes("toISOString().slice(0, 10)"));

console.log(`clock.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
