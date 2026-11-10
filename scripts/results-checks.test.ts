// Plan part 6.3 — the checks before submission (Zadanie §7, §12; rule 12; Реш. 88; К22; D1):
// completeness and format only — required fields, numbers, the plan's physical limits (neutrally),
// U ≠ 0, k with U, the dates in order and inside the scheme's (testing) or the lab's window
// (calibration), at least one point in scope. Never a word about a value.
import { readFileSync } from "node:fs";
import { checkTesting, checkCalibration, blocking, CHECK_TEXT, readDraft, readCalDraft, fieldName, calField, genField, type ResultRow, type CalRow } from "../src/lib/results-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const has = (list: { key: string; field: string; why: string }[], key: string, field: string, why: string) => list.some((p) => p.key === key && p.field === field && p.why === why);

const rows: ResultRow[] = [
  { key: "ch-1", index: 0, name: { bg: "Влажност", en: "Moisture" }, method: { bg: "EN 1097-5", en: "EN 1097-5" }, determinations: 2, uRequired: true, guardMin: 0, guardMax: 100 },
  { key: "ch-2", index: 1, name: { bg: "Плътност", en: "Density" }, method: { bg: "EN 1097-6", en: "EN 1097-6" }, determinations: 1, uRequired: false },
];
const draftOf = (v: Record<string, string>) => readDraft((n) => v[n], rows);
const ok = { [fieldName("d", "ch-1", 0)]: "5,1", [fieldName("d", "ch-1", 1)]: "5,3", [fieldName("mean", "ch-1")]: "5,2", [fieldName("U", "ch-1")]: "0,2", [fieldName("k", "ch-1")]: "2", [fieldName("d", "ch-2", 0)]: "2,61", [fieldName("mean", "ch-2")]: "2,61", [fieldName("k", "ch-2")]: "2", p_from: "2026-11-02", p_to: "2026-11-05" };
const limits = { from: "2026-11-01", to: "2026-11-20" };

t("a whole, well-formed testing form: nothing to say", checkTesting(draftOf(ok), rows, limits).length === 0, JSON.stringify(checkTesting(draftOf(ok), rows, limits)));
const empty = checkTesting(draftOf({}), rows, limits);
t("an empty one: the mean, U where the design requires it, the period's start — «not filled in» (blocking)", has(empty, "ch-1", "mean", "required") && has(empty, "ch-1", "U", "required") && has(empty, "ch-2", "mean", "required") && has(empty, "period", "from", "required") && blocking(empty).every((p) => p.why !== "nr-value"));
t("…a single determination not given: a NOTICE — N/R for that value — never a block (Реш. 19, 20; review)", has(empty, "ch-1", "d1", "nr-value") && empty.find((p) => p.field === "d1")?.level === "notice" && blocking(checkTesting(draftOf({ ...ok, [fieldName("d", "ch-1", 1)]: "" }), rows, limits)).length === 0);
// a characteristic declared not reported (N/R): nothing asked of it — at least one reported (review)
const oneNr = checkTesting(draftOf({ ...ok, [fieldName("nr", "ch-2")]: "on", [fieldName("mean", "ch-2")]: "" }), rows, limits);
t("a characteristic declared N/R: nothing asked of it; the others as ever", blocking(oneNr).length === 0, JSON.stringify(oneNr));
t("…every characteristic N/R: «at least one must be reported»", has(checkTesting(draftOf({ ...ok, [fieldName("nr", "ch-1")]: "on", [fieldName("nr", "ch-2")]: "on" }), rows, limits), "rows", "nr", "none-reported"));
t("…U optional where the design does not require it — not asked", !has(empty, "ch-2", "U", "required"));
const fmt = checkTesting(draftOf({ ...ok, [fieldName("mean", "ch-1")]: "abc", [fieldName("U", "ch-2")]: "1,2,3" }), rows, limits);
t("not a number: named — the mean, an optional U typed wrongly", has(fmt, "ch-1", "mean", "number") && has(fmt, "ch-2", "U", "number"));
const guard = checkTesting(draftOf({ ...ok, [fieldName("d", "ch-1", 1)]: "120", [fieldName("mean", "ch-1")]: "-1" }), rows, limits);
t("the plan's physical limits (3.6, 2.0's physical_min/max): outside — said neutrally, with the limits", has(guard, "ch-1", "d2", "guard") && has(guard, "ch-1", "mean", "guard") && guard.find((p) => p.why === "guard")?.limits?.max === 100);
t("…a characteristic without limits: never «outside»", !checkTesting(draftOf({ ...ok, [fieldName("mean", "ch-2")]: "99999" }), rows, limits).some((p) => p.why === "guard"));
t("U positive — 0 and a negative refused (review); k positive; k with U (К22)", has(checkTesting(draftOf({ ...ok, [fieldName("U", "ch-1")]: "0,00" }), rows, limits), "ch-1", "U", "positive") && has(checkTesting(draftOf({ ...ok, [fieldName("U", "ch-1")]: "-0,2" }), rows, limits), "ch-1", "U", "positive") && has(checkTesting(draftOf({ ...ok, [fieldName("k", "ch-1")]: "-2" }), rows, limits), "ch-1", "k", "k") && has(checkTesting(draftOf({ ...ok, [fieldName("U", "ch-2")]: "0,1", [fieldName("k", "ch-2")]: "" }), rows, limits), "ch-2", "k", "required"));
t("the test period: in order; inside the scheme's dates (from the dispatch to the results deadline in force)", has(checkTesting(draftOf({ ...ok, p_from: "2026-11-06", p_to: "2026-11-05" }), rows, limits), "period", "to", "order") && has(checkTesting(draftOf({ ...ok, p_from: "2026-10-30" }), rows, limits), "period", "from", "period") && has(checkTesting(draftOf({ ...ok, p_to: "2026-11-21" }), rows, limits), "period", "to", "period"));
t("…a scheme without those dates: the period only in order", checkTesting(draftOf({ ...ok, p_from: "2020-01-01" }), rows, {}).length === 0);
t("…one day: «до» may stay empty (the Results Sheet's «дата/период» — review)", checkTesting(draftOf({ ...ok, p_to: "" }), rows, limits).length === 0);
t("…a date that is not a date: said — «abc», «02.11.2026», «2026-02-31» (review)", ["abc", "02.11.2026", "2026-02-31"].every((d) => has(checkTesting(draftOf({ ...ok, p_from: d }), rows, limits), "period", "from", "date")));

// calibration (M2)
const cRows: CalRow[] = [{ key: "pt-1|up" , nominal: "20" }, { key: "pt-2|up", nominal: "40" }];
const calOk: Record<string, string> = { [genField("manufacturer")]: "Tecsis", [genField("model")]: "F1", [genField("serial")]: "123", [genField("dateFrom")]: "2026-11-03", [genField("dateTo")]: "2026-11-04", [genField("tempMin")]: "20,1", [genField("tempMax")]: "21,0", [genField("method")]: "Пряко сравнение", [genField("signedOn")]: "2026-11-04", [genField("signedBy")]: "И. И.", [calField("ref", "pt-1|up")]: "20,00", [calField("meas", "pt-1|up")]: "20,03", [calField("U", "pt-1|up")]: "0,02", [calField("na", "pt-2|up")]: "on" };
const win = [{ from: "2026-11-02", to: "2026-11-06" }];
const calOf = (v: Record<string, string>) => readCalDraft((n) => v[n], cRows);
t("a whole calibration form — a point declared N/A asks nothing; the lab's name and other conditions optional", checkCalibration(calOf(calOk), cRows, win).length === 0, JSON.stringify(checkCalibration(calOf(calOk), cRows, win)));
const cEmpty = checkCalibration(calOf({}), cRows, win);
t("an empty one: the general info's required fields, each point's readings — the lab's name and other conditions optional", has(cEmpty, "general", "manufacturer", "required") && has(cEmpty, "general", "signedBy", "required") && has(cEmpty, "pt-1|up", "ref", "required") && has(cEmpty, "pt-1|up", "meas", "required") && !has(cEmpty, "general", "labName", "required") && !has(cEmpty, "general", "otherConditions", "required"));
t("…a point without U: a NOTICE — it is not evaluated by Eₙ (docs/results-c) — never a block (review)", has(cEmpty, "pt-2|up", "U", "no-u") && cEmpty.find((p) => p.why === "no-u")?.level === "notice");
t("the temperatures numbers, min ≤ max («the minimum is above the maximum»); U positive; CMC a number when given", has(checkCalibration(calOf({ ...calOk, [genField("tempMax")]: "19" }), cRows, win), "general", "tempMax", "range") && has(checkCalibration(calOf({ ...calOk, [calField("U", "pt-1|up")]: "0" }), cRows, win), "pt-1|up", "U", "positive") && has(checkCalibration(calOf({ ...calOk, [calField("U", "pt-1|up")]: "-0,02" }), cRows, win), "pt-1|up", "U", "positive") && has(checkCalibration(calOf({ ...calOk, [calField("cmc", "pt-1|up")]: "x" }), cRows, win), "pt-1|up", "cmc", "number"));
t("the measurement dates: in order, inside the lab's window with the device (an extension included)", has(checkCalibration(calOf({ ...calOk, [genField("dateFrom")]: "2026-11-01" }), cRows, win), "general", "dateFrom", "window") && has(checkCalibration(calOf({ ...calOk, [genField("dateTo")]: "2026-11-07" }), cRows, win), "general", "dateFrom", "window") && has(checkCalibration(calOf({ ...calOk, [genField("dateFrom")]: "2026-11-05" }), cRows, win), "general", "dateTo", "order"));
// a chain visiting the lab twice: its measurements inside EITHER window (review)
const twice = [{ from: "2026-11-02", to: "2026-11-05" }, { from: "2026-12-01", to: "2026-12-04" }];
t("…a lab visited twice: measurements in the first visit's window stand once the second has come", checkCalibration(calOf({ ...calOk, [genField("dateFrom")]: "2026-11-03", [genField("dateTo")]: "2026-11-04" }), cRows, twice).length === 0 && has(checkCalibration(calOf({ ...calOk, [genField("dateFrom")]: "2026-11-04", [genField("dateTo")]: "2026-12-02" }), cRows, twice), "general", "dateFrom", "window"));
t("…dates that are not dates: said — the signing date too", has(checkCalibration(calOf({ ...calOk, [genField("signedOn")]: "04.11.2026" }), cRows, win), "general", "signedOn", "date"));
t("at least one point in scope — every point N/A is refused", has(checkCalibration(calOf({ ...calOk, [calField("na", "pt-1|up")]: "on" }), cRows, win), "points", "na", "none-in-scope"));

// the words: neutral — never about a value (rule 12, Реш. 88)
t("every check has its words, both languages — none about a value being high, low or unusual", Object.values(CHECK_TEXT).every((x) => !!x.bg && !!x.en) && !Object.values(CHECK_TEXT).some((x) => /висок|нисък|необичайн|съмнител|high|low|unusual|suspicious|outlier/i.test(`${x.bg} ${x.en}`)));
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
t("the forms run the same checks on «Провери» — and, once run, as they are typed", /checkTesting\(readDraft\(\(n\) => values\[n\], asRows\), asRows, period \?\? \{\}\)/.test(src("components/ResultsForm.tsx")) && /checkCalibration\(readCalDraft\(\(n\) => values\[n\], asRows\), asRows, windows \?\? \[\]\)/.test(src("components/CalibrationResultsForm.tsx")));
const pg = src("app/lab/p/[id]/results/page.tsx");
const lim = src("lib/results-limits.ts"), act = src("lib/actions.ts");
t("…the page gives them (one helper, the submission's too — 6.4): from the participation's FIRST SHIPMENT (else the planned dispatch) to the results deadline in force; EVERY window of the lab; the holiday calendar not read — no upper limit, never an empty calendar's (review)", /shipped \?\? s\.dates\?\.dispatch/.test(lim) && /resultsDeadline\(s, code\)\.at/.test(lim) && /mine\.map\(/.test(lim) && /try \{ off = await holidaySet\(\); \} catch \{ off = null; \}/.test(lim) && !/holidaySet\(\)\.catch\(\(\) => new Set/.test(lim) && /testPeriodLimits\(s, v\.participantId, p\.code, gate\.late \? unlock : null\)/.test(pg) && /calibrationWindows\(s, p\.code\)/.test(pg) && /testPeriodLimits\(scheme, pid, part\.code, lateBy\)/.test(act) && /calibrationWindows\(scheme, part\.code\)/.test(act));

console.log(`results-checks.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
