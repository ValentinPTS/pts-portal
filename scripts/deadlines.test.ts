// Plan part 3.4 — deadlines (Zadanie §9, §11; А10; Реш. 154; О6; Q14): a deadline's day,
// hour and zone (EET/EEST); a calibration laboratory's window in working days from its
// own receipt, the holiday calendar PTS keeps taken off; the individual extension with
// its order; overdue a state, never a block.
import { readFileSync } from "node:fs";
import { isDeadline, deadlineDay, deadlineTime, deadlineMs, sofiaZone, fmtSchemeDate, isPast, daysUntil } from "../src/lib/scheme-dates.ts";
import { isWorkingDay, addWorkingDays, workingDaysBetween, orthodoxEaster, officialHolidays, holidayProblem } from "../src/lib/holidays-model.ts";
import { resultsDeadline, chainWindow, deadlineState, checkExtension, extensionOf, extensionKey, laterOf, freezeWindow, resultsSubmittedAt, windowDays, DEFAULT_WINDOW_DAYS, EXTENSION_PROBLEM_TEXT, type Extension } from "../src/lib/deadlines-model.ts";
import { calendarOf, type HolidayEntry } from "../src/lib/holidays.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── a deadline: day, hour, zone (А10) ──────────────────────────────────────
t("a day is a deadline", isDeadline("2026-12-10"));
t("…and a day with its hour", isDeadline("2026-12-10T17:00") && isDeadline("2026-12-10T00:00") && isDeadline("2026-12-10T23:59"));
t("…not an hour 24 or minute 60, not a false day", !isDeadline("2026-12-10T24:00") && !isDeadline("2026-12-10T17:60") && !isDeadline("2026-02-30") && !isDeadline("10.12.2026"));
eq("its day and hour", [deadlineDay("2026-12-10T17:00"), deadlineTime("2026-12-10T17:00"), deadlineTime("2026-12-10")], ["2026-12-10", "17:00", null]);
eq("winter is EET, summer EEST", [sofiaZone("2026-12-10"), sofiaZone("2026-07-10")], ["EET", "EEST"]);
eq("17:00 in December is 15:00 UTC (EET, UTC+2)", new Date(deadlineMs("2026-12-10T17:00")!).toISOString(), "2026-12-10T15:00:00.000Z");
eq("17:00 in July is 14:00 UTC (EEST, UTC+3)", new Date(deadlineMs("2026-07-10T17:00")!).toISOString(), "2026-07-10T14:00:00.000Z");
eq("a day alone: until its very end, 23:59:59.999 in Bulgaria", new Date(deadlineMs("2026-12-10")!).toISOString(), "2026-12-10T21:59:59.999Z");
t("…an upload at 23:59:30 on the day is in time (review)", !isPast("2026-12-10", Date.parse("2026-12-10T21:59:30Z")));
eq("the zone of the very instant on a change day (review): 02:30 on 29.03 is EET, on 25.10 EEST", [fmtSchemeDate("2026-03-29T02:30"), fmtSchemeDate("2026-10-25T02:30")], ["29.03.2026, 02:30 EET", "25.10.2026, 02:30 EEST"]);
eq("the day the clocks go forward (29.03.2026): 12:00 is EEST", new Date(deadlineMs("2026-03-29T12:00")!).toISOString(), "2026-03-29T09:00:00.000Z");
eq("…the day they go back (25.10.2026): 12:00 is EET", new Date(deadlineMs("2026-10-25T12:00")!).toISOString(), "2026-10-25T10:00:00.000Z");
eq("shown with its hour and zone", fmtSchemeDate("2026-12-10T17:00"), "10.12.2026, 17:00 EET");
eq("…a summer one", fmtSchemeDate("2026-07-10T09:30"), "10.07.2026, 09:30 EEST");
eq("…a day alone as before", fmtSchemeDate("2026-12-10"), "10.12.2026");
t("past: a minute after, not a minute before", isPast("2026-12-10T17:00", Date.parse("2026-12-10T15:01:00Z")) && !isPast("2026-12-10T17:00", Date.parse("2026-12-10T14:59:00Z")));
t("a day alone is not past during that day", !isPast("2026-12-10", Date.parse("2026-12-10T21:00:00Z")) && isPast("2026-12-10", Date.parse("2026-12-10T22:00:00Z")));
eq("the reminder's day ignores the hour", daysUntil("2026-12-10T17:00", "2026-12-09"), 1);

// ── working days and the calendar ──────────────────────────────────────────
const none = new Set<string>();
t("Monday to Friday", isWorkingDay("2026-11-06", none) && !isWorkingDay("2026-11-07", none) && !isWorkingDay("2026-11-08", none));
t("…less a day off", !isWorkingDay("2026-12-24", new Set(["2026-12-24"])));
eq("3 working days from a Thursday: Mon (the receipt day does not count)", addWorkingDays("2026-11-05", 3, none), "2026-11-10");
eq("…from a Friday: Wednesday", addWorkingDays("2026-11-06", 3, none), "2026-11-11");
eq("…over Christmas 2026", addWorkingDays("2026-12-22", 3, new Set(officialHolidays(2026).map((h) => h.day))), "2026-12-30");
eq("working days between", [workingDaysBetween("2026-11-05", "2026-11-10", none), workingDaysBetween("2026-11-10", "2026-11-05", none)], [3, -3]);
eq("Orthodox Easter 2026, 2027, 2028", [orthodoxEaster(2026), orthodoxEaster(2027), orthodoxEaster(2028)], ["2026-04-12", "2027-05-02", "2028-04-16"]);
const h26 = officialHolidays(2026).map((h) => h.day);
t("2026: the fixed holidays and the four Easter days", ["2026-01-01", "2026-03-03", "2026-05-01", "2026-05-06", "2026-05-24", "2026-09-06", "2026-09-22", "2026-12-24", "2026-12-25", "2026-12-26", "2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13"].every((d) => h26.includes(d)));
t("2026: the day off in place of a weekend holiday (24.05 Sun → 25.05; 06.09 Sun → 07.09; 26.12 Sat → 28.12)", ["2026-05-25", "2026-09-07", "2026-12-28"].every((d) => h26.includes(d)));
const h27 = officialHolidays(2027);
t("2027: 1 May is also Holy Saturday — one entry, both names", h27.filter((h) => h.day === "2027-05-01").length === 1 && /Ден на труда; Велика събота/.test(h27.find((h) => h.day === "2027-05-01")!.name));
t("2027: the day in place of 1 May skips Easter Monday (03.05) → 04.05", h27.some((h) => h.day === "2027-05-04" && /вместо Ден на труда/.test(h.name)) && h27.some((h) => h.day === "2027-05-03" && /Великден/.test(h.name)));
t("2027: Christmas on the weekend → 27 and 28.12 off", ["2027-12-27", "2027-12-28"].every((d) => h27.some((h) => h.day === d)));
t("the Easter days give no day in place", !h27.some((h) => /вместо Великден|вместо Велика събота/.test(h.name)));
eq("a day the calendar may hold", [holidayProblem("2026-12-31", "Обявен"), holidayProblem("2026-02-30", "x"), holidayProblem("2026-12-31", " "), holidayProblem("2026-12-31", "я".repeat(121))], [null, "day", "name", "name"]);
const E = (day: string, action: "add" | "remove", at: string, name = "Ден"): HolidayEntry => ({ id: at, day, name, action, recordedBy: "h@ptsbg.eu", recordedAt: at });
eq("the calendar is each day's latest entry", calendarOf([E("2026-12-31", "add", "1"), E("2026-12-31", "remove", "2"), E("2026-11-02", "add", "3")]).map((h) => h.day), ["2026-11-02"]);
eq("…added again after a removal", calendarOf([E("2026-12-31", "add", "1"), E("2026-12-31", "remove", "2"), E("2026-12-31", "add", "3", "Отново")]).map((h) => h.name), ["Отново"]);

// ── a participant's deadlines ──────────────────────────────────────────────
const ext = (over: Partial<Extension>): Extension => ({ id: "x", code: "261101", key: "resultsDue", until: "2026-12-20T12:00", orderNo: "7", orderDate: "2026-12-01", reason: "Закъснял куриер", day: "2026-12-01", at: "", by: "h", ...over });
const S = { dates: { resultsDue: "2026-12-10T17:00" }, extensions: [] as Extension[] };
eq("the scheme's results deadline", resultsDeadline(S, "261101").at, "2026-12-10T17:00");
eq("…its own extension instead", resultsDeadline({ ...S, extensions: [ext({})] }, "261101").at, "2026-12-20T12:00");
eq("…another participant's is not its", resultsDeadline({ ...S, extensions: [ext({ code: "261102" })] }, "261101").at, "2026-12-10T17:00");
eq("…the latest extension wins", extensionOf({ extensions: [ext({}), ext({ id: "y", until: "2026-12-22" })] }, "261101", "resultsDue")?.until, "2026-12-22");
// review: the deadline in force is the LATER of the extension and the scheme's
eq("an amendment moving everyone later is not undone by an earlier extension", resultsDeadline({ dates: { resultsDue: "2026-12-25" }, extensions: [ext({})] }, "261101"), { at: "2026-12-25" });
eq("…a later extension is in force, named", resultsDeadline({ dates: { resultsDue: "2026-12-10" }, extensions: [ext({})] }, "261101").ext?.orderNo, "7");
eq("…an extension with no scheme date yet", resultsDeadline({ dates: {}, extensions: [ext({})] }, "261101").at, "2026-12-20T12:00");
eq("laterOf", [laterOf("2026-12-10T17:00", "2026-12-10"), laterOf(undefined, "2026-12-10"), laterOf("x", undefined)], ["2026-12-10", "2026-12-10", undefined]);
eq("the key read once, cleaned (review)", [extensionKey("chain "), extensionKey("\u200Bchain"), extensionKey("dispatch")], ["chain", "chain", null]);
eq("the window: the scheme's days, else 3 (the Instruction, Q14)", [windowDays({ chain: { stops: [], windowWorkDays: 5 } }), windowDays({}), DEFAULT_WINDOW_DAYS], [5, 3, 3]);
const stop = { id: "s1", code: "261101", receivedAt: "2026-12-22T09:00:00Z", sentAt: undefined };
const off = new Set(officialHolidays(2026).map((h) => h.day));
eq("a calibration window from the receipt, over Christmas", chainWindow({ chain: { stops: [], windowWorkDays: 3 } }, stop, off), { received: "2026-12-22", due: "2026-12-30", ext: undefined, days: 3 });
eq("…received in the late evening UTC is the next Sofia day", chainWindow({ chain: { stops: [], windowWorkDays: 1 } }, { ...stop, receivedAt: "2026-11-05T22:30:00Z" }, none)?.received, "2026-11-06");
eq("…its extension instead", chainWindow({ chain: { stops: [] }, extensions: [ext({ key: "chain", stopId: "s1", until: "2027-01-08" })] }, stop, off)?.due, "2027-01-08");
eq("…an extension is its own stop's — the laboratory's second stop is not moved by it (review)", chainWindow({ chain: { stops: [], windowWorkDays: 3 } as never, extensions: [ext({ key: "chain", stopId: "s1", until: "2027-01-08" })] }, { ...stop, id: "s2" }, off)?.due, "2026-12-30");
eq("…an extension earlier than the counted window does not shorten it", chainWindow({ chain: { stops: [], windowWorkDays: 3 } as never, extensions: [ext({ key: "chain", stopId: "s1", until: "2026-12-23" })] }, stop, off)?.due, "2026-12-30");
const handed = freezeWindow({ chain: { stops: [], windowWorkDays: 3 } }, [{ id: "s1", kind: "lab", code: "261101", receivedAt: "2026-12-22T09:00:00Z", sentAt: "2026-12-29T09:00:00Z" }], "s1", off);
eq("handed on, its window is kept (review)", handed[0].windowDue, "2026-12-30");
eq("…a later change to the calendar does not rewrite it", chainWindow({ chain: { stops: [], windowWorkDays: 3 } }, handed[0], new Set())?.due, "2026-12-30");
const sup = { labUploads: { "261101": { results: { path: "p", name: "n", mime: "application/pdf", size: 1, uploadedAt: "2026-12-12T10:00:00Z", uploadedBy: "lab:x", roundAt: "2026-12-12T10:00:00Z" } } }, supersededFiles: [{ where: "labupload:261101:results", file: { path: "p0", name: "n0", mime: "application/pdf", size: 1, uploadedAt: "2026-12-09T10:00:00Z", uploadedBy: "lab:x" }, at: "", reason: "replaced", by: "" }] } as unknown as Scheme;
eq("submitted: the FIRST file, a replaced one included (review)", resultsSubmittedAt(sup, "261101", "submitted"), "2026-12-09T10:00:00Z");
eq("…on the round's clock when it was recorded so", resultsSubmittedAt({ labUploads: { "261101": { results: { ...sup.labUploads!["261101"]!.results!, roundAt: "2027-01-01T00:00:00Z" } } } } as unknown as Scheme, "261101", "submitted"), "2027-01-01T00:00:00Z");
eq("…recorded by PTS from e-mail: done, at an unknown hour", resultsSubmittedAt({} as Scheme, "261101", "scored"), new Date(0).toISOString());
eq("…none before the receipt", chainWindow({ chain: { stops: [] } }, { code: "261101" }, off), null);
const now = Date.parse("2026-12-11T10:00:00Z");
eq("overdue: not done, passed — a state", deadlineState("2026-12-10T17:00", undefined, now), "overdue");
eq("open: not yet", deadlineState("2026-12-12", undefined, now), "open");
eq("done in time", deadlineState("2026-12-10T17:00", "2026-12-10T14:00:00Z", now), "done");
eq("late: done after it", deadlineState("2026-12-10T17:00", "2026-12-10T16:00:00Z", now), "late");
eq("no deadline", [deadlineState(undefined, undefined, now), deadlineState(undefined, "x", now)], ["none", "done"]);

// granting one
const run = { status: "running", type: "C" } as Pick<Scheme, "status" | "type">;
const good = { key: "resultsDue", until: "2026-12-20T12:00", orderNo: "7", orderDate: "2026-12-01", reason: "Закъснял куриер" };
const p = (over: Record<string, unknown>, s = run, cur: string | undefined = "2026-12-10T17:00") => { const r = checkExtension(s, { ...good, ...over }, cur); return r.ok ? null : r.problem; };
eq("a whole extension", p({}), null);
eq("not earlier than the deadline in force", p({ until: "2026-12-10T16:00" }), "not-later");
eq("…nor the same", p({ until: "2026-12-10T17:00" }), "not-later");
eq("no order number", p({ orderNo: "" }), "order-no");
eq("no order date", p({ orderDate: "2026-13-01" }), "order-date");
eq("no reason", p({ reason: "абв" }), "reason");
eq("a new deadline that is not one", p({ until: "20.12.2026" }), "until");
eq("the chain window only in calibration", p({ key: "chain" }, { status: "running", type: "T" }), "key");
eq("an unknown deadline", p({ key: "dispatch" }), "key");
eq("only in an open or running scheme", [p({}, { status: "processing", type: "C" }), p({}, { status: "draft", type: "C" }), p({}, { status: "open", type: "C" })], ["state", "state", null]);
eq("no deadline in force yet: any real one", p({}, run, undefined), null);
t("every problem has its words", Object.values(EXTENSION_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── the actions, pages, reminders and the migration keep the rules ─────────
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const actions = read("../src/lib/actions.ts");
const grant = actions.slice(actions.indexOf("export async function grantExtensionAction"), actions.indexOf("export async function setHolidayAction"));
t("an extension is the head's order, in the scheme", /await requireCap\("order\.manage", schemeId\);/.test(grant));
t("…for a real participation, by code", /if \(!\(await listParticipants\(schemeId\)\)\.some\(\(p\) => p\.code === code\)\)/.test(grant));
t("…who it is looked up before it is recorded (2.3)", grant.indexOf("labToTell(") > 0 && grant.indexOf("labToTell(") < grant.indexOf("await updateSchemeWith("));
t("…re-checked inside the lock against the deadline then in force", /before = current\(cur\);\s*const again = checkExtension\(cur, input, before\);/.test(grant));
t("…the key cleaned once for every check (review)", /const key = extensionKey\(input\.key\);/.test(grant) && /input = \{ \.\.\.input, key \};/.test(grant));
t("…a window's extension names its stop", /const stopId = key === "chain" \? stopOf\(cur\)\?\.id : undefined;/.test(grant));
t("…journalled by code and the laboratory told", /logActivity\("deadline\.extended", \{\s*schemeId, targetCode: code/.test(grant) && /notifyDeadlineExtended\(tell\.labId/.test(grant));
const win = actions.slice(actions.indexOf("export async function setChainWindowAction"), actions.indexOf("export async function grantExtensionAction"));
t("the window: set while the scheme is prepared — then by extension", /if \(needsAmendment\(scheme\)\) return \{ error:/.test(win) && /await requireCap\("dispatch", schemeId\);/.test(win));
const hol = actions.slice(actions.indexOf("export async function setHolidayAction"));
t("the calendar: the head's; each change an entry, journalled", (hol.match(/await requireCapAnywhere\("order\.manage"\);/g) ?? []).length === 2 && /recordHoliday\(/.test(hol) && /logActivity\(add \? "holiday\.added" : "holiday\.removed"/.test(hol));
t("the working dates take a day and its hour", /if \(!isDeadline\(v\)\) return \{ error:/.test(actions));
const reminders = read("../src/lib/notify-reminders.ts");
t("reminders: each by the deadline in force for it", /const rd = resultsDeadline\(s, p\.code\);\s*if \(!rd\.at \|\| daysUntil\(rd\.at, todayIso\) !== 1\) continue;/.test(reminders));
t("…an extension its own stamp, the scheme's one for all the rest", /if \(rd\.ext\) groups\.push\(\{ stamp: `resultsDue@\$\{p\.code\}:\$\{rd\.at\}`/.test(reminders) && /groups\.unshift\(\{ stamp: reminderKey\("resultsDue", s\.dates\.resultsDue\), at: s\.dates\.resultsDue, owing: common \}\)/.test(reminders));
t("the working dates: the amendment rule re-checked inside the lock (review)", /await updateSchemeWith\(schemeId, \(cur\) => \{ if \(changesSet\(cur\)\) \{ late = true; return \{\}; \} return \{ dates \}; \}\);/.test(actions));
t("the hand-over freezes the window — the laboratory's and PTS's (review)", (actions.match(/freezeWindow\(/g) ?? []).length === 2);
t("a laboratory's upload carries the round's clock", /roundAt: schemeNowIso\(scheme!\)/.test(actions));
t("the official holidays: a day the calendar decided about is not proposed again (review)", /const have = new Set\(\(await listHolidayEntries\(\)\)\.map\(\(h\) => h\.day\)\);/.test(actions) && /const decided = new Set\(entries\.map\(\(h\) => h\.day\)\);/.test(read("../src/app/holidays/page.tsx")));
const sql = read("../supabase/migrations/0030_holidays.sql");
t("0030: a record — no change, no removal, no truncation", /if tg_op <> 'INSERT' then\s*raise exception/.test(sql) && /before insert or update or delete on public\.holiday_entries/.test(sql) && /before truncate on public\.holiday_entries/.test(sql) && /revoke update, delete, truncate on public\.holiday_entries from service_role/.test(sql));
t("0030: closed to the API, marked applied, expected by the build gate", /enable row level security/.test(sql) && /revoke all on public\.holiday_entries from anon, authenticated/.test(sql) && sql.includes("('0030_holidays')") && read("../src/lib/migrations-list.ts").includes('"0030_holidays"'));
t("not round data: the calendar is every round's", /holiday_entries: "PTS's holiday calendar/.test(read("../src/lib/round-export.ts")));
const card = read("../src/components/DeviceChainCard.tsx");
t("the laboratory's chain card: its own window, overdue said, nothing blocked", /data-chain-window/.test(card) && /Срокът е изтекъл — свържете се с PTS\. Порталът не блокира нищо\./.test(card));
const lab = read("../src/app/lab/page.tsx");
t("the laboratory's page: its own results deadline — its extension, else the scheme's", /const rd = resultsDeadline\(scheme, p\.code\);/.test(lab));
const casePage = read("../src/app/schemes/[id]/participants/[code]/page.tsx");
t("the case file: the deadlines with their state; the form for the head while open or running", /data-deadlines/.test(casePage) && /const canExtend = \(await mayNow\("order\.manage", id\)\) && \(s\.status === "open" \|\| s\.status === "running"\);/.test(casePage));
t("overdue blocks nothing: no refusal reads a deadline", !/isPast\(|deadlineState\(/.test(actions));
// …but the results form: it closes at the deadline in force (Реш. 111, part 6.4) — only through
// submissionOpen, and only the results' own actions (the draft, the submission, the unlock)
const gated = [...actions.matchAll(/submissionOpen\(/g)].map((m) => actions.lastIndexOf("export async function", m.index)).map((i) => /export async function (\w+)/.exec(actions.slice(i))?.[1]);
t("…the results form alone closes at it (Реш. 111): the draft, the submission, the unlock", [...new Set(gated)].sort().join() === "saveResultDraftAction,submitResultsAction,unlockResultsAction", [...new Set(gated)].join());

console.log(`deadlines.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
