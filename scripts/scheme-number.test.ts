// Scheme numbers (plan parts 0.14 and 3.1): Cyrillic Т/С and Latin T/C spell one
// number (E4.a); the next number counts within the month and the activity (N15); the
// URL id keeps the activity letter; «today» is Bulgarian time. 3.1: the whole form
// PTS|ILC ГГ/ММ[-NA]-T|S|C-пореден, the archive's old forms accepted as written, and
// the kind, the activity and NA kept as fields (Реш. 102; А4, А8).
import { readFileSync } from "node:fs";
import {
  foldSchemeNumber, parseSchemeNumber, readSchemeNumber, sameSchemeNumber, schemeIdFromNumber, nextSchemeNumber, nextSeq,
  composeSchemeNumber, schemeMarkers, markersFor, statedByNumber, markerLabels, sofiaYearMonth,
} from "../src/lib/scheme-number.ts";
import { nextProject, dialogNumbering, schemeYear } from "../src/lib/folders.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── one number, two alphabets ─────────────────────────────────────────────
eq("fold: Cyrillic Т → T", foldSchemeNumber("PTS 26/03-Т-1"), "PTS 26/03-T-1");
eq("fold: Cyrillic С → C", foldSchemeNumber("PTS 26/03-С-1"), "PTS 26/03-C-1");
eq("fold: lower case and spaces", foldSchemeNumber("  pts  26/03-с-2 "), "PTS 26/03-C-2");
t("same: Т and T", sameSchemeNumber("PTS 26/03-Т-1", "PTS 26/03-T-1"));
t("same: С and C", sameSchemeNumber("PTS 25/06-С-1", "PTS 25/06-C-1"));
t("not same: T and C", !sameSchemeNumber("PTS 26/03-T-1", "PTS 26/03-C-1"));
t("not same: another sequence", !sameSchemeNumber("PTS 26/03-T-1", "PTS 26/03-T-2"));
t("not same: empty", !sameSchemeNumber("", ""));
t("fold leaves other Cyrillic letters alone", foldSchemeNumber("PTS 26/03-Б-1").includes("Б"));

// ── one number however it is typed (review of 0.14) ───────────────────────
const P = "PTS 26/03-T-1";
for (const v of ["PTS 26/03–T–1", "PTS 26/03—T—1", "PTS 26/03−T−1", "PTS 26/3-T-1", "PTS 26/03-T-01", "PTS26/03-T-1",
                 "PTS 26/03 - T - 1", "26/03-T-1", "РТС 26/03-Т-1", "РТЅ 26/03-T-1", "ПТС 26/03-Т-1", "pts 26/3–т–01"]) {
  t(`same: «${v}»`, sameSchemeNumber(v, P), foldSchemeNumber(v));
}
t("not same: a «SIM» round keeps its own number", !sameSchemeNumber("SIM 26/03-T-1", P));
t("not same: a suffix makes another number", !sameSchemeNumber("PTS 26/03-T-1-A", P));
t("not same: the month differs", !sameSchemeNumber("PTS 26/04-T-1", P));
eq("id: an en dash and a Cyrillic prefix", schemeIdFromNumber("РТС 26/3–Т–1"), "26-03-T-1");
const PT = { kind: "PTS", activity: "T", na: false } as const;
const PC = { kind: "PTS", activity: "C", na: false } as const;
eq("next counts a number typed with en dashes", nextSchemeNumber(["PTS 26/03–T–4"], PT, "2026", 3).number, "PTS 26/03-T-5");

// ── parsing ────────────────────────────────────────────────────────────────
eq("parse Latin", parseSchemeNumber("PTS 26/03-T-1"), { simulation: false, kind: "PTS", na: false, activity: "T", yy: "26", mm: "03", seq: 1 });
eq("parse Cyrillic С", parseSchemeNumber("PTS 25/06-С-12"), { simulation: false, kind: "PTS", na: false, activity: "C", yy: "25", mm: "06", seq: 12 });
eq("parse a one-digit month", parseSchemeNumber("PTS 26/3-T-2"), { simulation: false, kind: "PTS", na: false, activity: "T", yy: "26", mm: "03", seq: 2 });
eq("parse a simulation number", parseSchemeNumber("SIM 26/3–T–2"), { simulation: true, kind: null, na: false, activity: "T", yy: "26", mm: "03", seq: 2 });

// ── the simulation series (Реш. 130, part 1.2) ─────────────────────────────
eq("SIM folds like PTS", foldSchemeNumber("sim 26/3–т–01"), "SIM 26/03-T-1");
t("SIM is never the same number as PTS", !sameSchemeNumber("SIM 26/03-T-1", "PTS 26/03-T-1"));
t("two spellings of one SIM number are the same", sameSchemeNumber("SIM 26/03-Т-1", "SIM 26/3-T-1"));
eq("a SIM number keeps its series in the id", schemeIdFromNumber("SIM 26/03-T-1"), "SIM-26-03-T-1");
const mixed = ["PTS 26/03-T-1", "PTS 26/03-T-2", "SIM 26/03-T-1"];
eq("the active series ignores simulations", nextSchemeNumber(mixed, PT, "2026", 3).number, "PTS 26/03-T-3");
eq("a simulation never takes from the active series", nextSchemeNumber(mixed, { ...PT, simulation: true }, "2026", 3).number, "SIM 26/03-T-2");
eq("the first simulation of a month", nextSchemeNumber(["PTS 26/04-C-3"], { ...PC, simulation: true }, "2026", 4), { id: "SIM-26-04-C-1", number: "SIM 26/04-C-1" });
eq("parse junk", parseSchemeNumber("not a number"), null);
t("a «SIM-26/11-T-8» look-alike is read as a simulation", readSchemeNumber("SIM-26/11-T-8")?.simulation === true);
t("…and a Cyrillic «ЅІМ»", readSchemeNumber("ЅІМ 26/11-Т-8")?.simulation === true);

// ── the URL id keeps the letter ────────────────────────────────────────────
eq("id: Latin", schemeIdFromNumber("PTS 26/03-T-1"), "26-03-T-1");
eq("id: Cyrillic Т keeps its letter", schemeIdFromNumber("PTS 25/09-Т-1"), "25-09-T-1");
eq("id: Cyrillic С keeps its letter", schemeIdFromNumber("PTS 25/09-С-1"), "25-09-C-1");
t("id: the two spellings meet", schemeIdFromNumber("PTS 25/09-Т-1") === schemeIdFromNumber("PTS 25/09-T-1"));

// ── the next number: within the month AND the activity ────────────────────
const nums = ["PTS 26/03-T-1", "PTS 26/03-Т-2", "PTS 26/03-C-1", "PTS 26/02-T-5", "PTS 25/03-T-9"];
eq("next T in 26/03 counts the Cyrillic one", nextSchemeNumber(nums, PT, "2026", 3), { id: "26-03-T-3", number: "PTS 26/03-T-3" });
eq("next C in 26/03 counts only C", nextSchemeNumber(nums, PC, "2026", 3), { id: "26-03-C-2", number: "PTS 26/03-C-2" });
eq("a new month starts at 1", nextSchemeNumber(nums, PT, "2026", 4), { id: "26-04-T-1", number: "PTS 26/04-T-1" });
eq("another year does not count", nextSchemeNumber(["PTS 25/03-T-9"], PT, "2026", 3).number, "PTS 26/03-T-1");
eq("the month is two digits", nextSchemeNumber([], PC, "2026", 11).number, "PTS 26/11-C-1");
eq("nextProject passes through", nextProject(nums.map((number) => ({ number })), PT, "2026", 3).number, "PTS 26/03-T-3");
// the old rule treated MM as a counter: 26/03 existing → 26/04-T-1 — never again
t("the month is not a counter", nextSchemeNumber(["PTS 26/03-T-1"], PT, "2026", 3).number !== "PTS 26/04-T-1");

// ── 3.1: the whole form — PTS|ILC ГГ/ММ[-NA]-T|S|C-пореден (Zadanie §2) ─────
const R = (n: string) => readSchemeNumber(n);
eq("ILC with NA", R("ILC 26/10-NA-T-1"), { form: "current", simulation: false, yy: "26", mm: "10", kind: "ILC", na: true, accredited: false, activity: "T", seq: 1 });
eq("PTS in scope", R("PTS 26/06-C-1"), { form: "current", simulation: false, yy: "26", mm: "06", kind: "PTS", na: false, accredited: true, activity: "C", seq: 1 });
eq("sampling S", R("PTS 26/03-S-2")?.activity, "S");
t("NA combines with every activity (А4)", ["T", "S", "C"].every((a) => R(`PTS 26/03-NA-${a}-1`)?.na === true && R(`PTS 26/03-NA-${a}-1`)?.activity === a));
t("ILC typed in Cyrillic look-alikes «ІLС» folds", sameSchemeNumber("ІLС 26/10-NА-Т-1", "ILC 26/10-NA-T-1"));
t("an en dash before NA", sameSchemeNumber("ILC 26/10–NA–T–2", "ILC 26/10-NA-T-2"));
t("ILC and PTS are two numbers", !sameSchemeNumber("ILC 26/10-NA-T-1", "PTS 26/10-NA-T-1"));
t("NA makes another number", !sameSchemeNumber("PTS 26/10-NA-T-1", "PTS 26/10-T-1"));
eq("id: ILC keeps its prefix", schemeIdFromNumber("ILC 26/10-NA-T-1"), "ILC-26-10-NA-T-1");
eq("id: PTS with NA", schemeIdFromNumber("PTS 26/10-NA-C-1"), "26-10-NA-C-1");
eq("fold: ILC canonical", foldSchemeNumber(" ilc 26/9 - na - т - 03 "), "ILC 26/09-NA-T-3");
eq("the seven current schemes of А4 all read", ["ILC 26/10-NA-T-2", "ILC 26/10-NA-T-1", "PTS 26/06-T-1", "PTS 26/06-C-1", "PTS 26/05-T-1", "PTS 26/03-T-3", "PTS 26/03-T-2"].map((n) => R(n)?.form), Array(7).fill("current"));
t("A4: the two ILCs are NA, the five PTS in scope", R("ILC 26/10-NA-T-2")?.accredited === false && ["PTS 26/06-T-1", "PTS 26/06-C-1", "PTS 26/05-T-1", "PTS 26/03-T-3", "PTS 26/03-T-2"].every((n) => R(n)?.accredited === true));
t("month 13 is not a number", R("PTS 26/13-T-1") === null);
t("month 0 is not a number", R("PTS 26/00-T-1") === null);
t("sequence 0 is not a number", R("PTS 26/03-T-0") === null);
t("another activity letter is not a number", R("PTS 26/03-X-1") === null);
t("free text is not a number", R("Проба") === null && R("") === null);

// the composed number
eq("compose ILC NA", composeSchemeNumber({ kind: "ILC", activity: "T", na: true }, "26", "10", 3), "ILC 26/10-NA-T-3");
eq("compose SIM keeps NA and drops the kind", composeSchemeNumber({ kind: "ILC", activity: "T", na: true, simulation: true }, "26", "10", 1), "SIM 26/10-NA-T-1");
t("every composed number reads back as itself", (["PTS", "ILC"] as const).every((k) => (["T", "S", "C"] as const).every((a) => [true, false].every((na) => {
  const n = composeSchemeNumber({ kind: k, activity: a, na }, "26", "11", 4);
  const r = R(n);
  return r?.form === "current" && r.kind === k && r.activity === a && r.na === na && r.seq === 4 && foldSchemeNumber(n) === n;
}))));

// the sequence counts within the month and the activity — PTS and ILC, NA or not
const oct = ["ILC 26/10-NA-T-1", "ILC 26/10-NA-T-2", "PTS 26/10-C-1", "PTS 26/10-NA-S-1"];
eq("next T in 26/10 counts the ILCs", nextSchemeNumber(oct, PT, "2026", 10).number, "PTS 26/10-T-3");
eq("next ILC T in 26/10", nextSchemeNumber(oct, { kind: "ILC", activity: "T", na: true }, "2026", 10).number, "ILC 26/10-NA-T-3");
eq("S counts on its own", nextSeq(oct, "S", "2026", 10), 2);
eq("C counts on its own", nextSeq(oct, "C", "2026", 10), 2);
t("an old form never counts", nextSeq(["PTS 26/10-1", "PTS 26/10"], "T", "2026", 10) === 1);
eq("the dialog's numbering: testing offers T and S", dialogNumbering(oct.map((number) => ({ number })), "T", "2026", 10, false), { yy: "26", mm: "10", simulation: false, next: { T: 3, S: 2 } });
eq("…calibration only C", dialogNumbering(oct.map((number) => ({ number })), "C", "2026", 10, true), { yy: "26", mm: "10", simulation: true, next: { C: 1 } });

// ── 3.1: the archive's old forms, accepted as written (Zadanie §2) ─────────
const OLD = ["PTS 25/08-NA-1", "PTS 23/11-A", "PTS 23/2-A", "PTS 21/03-C1P", "PTS 21/03-C2F", "PTS 21/03-C3T", "PTS 22/08-1", "PTS 23/01", "PTS 20/10"];
eq("every old form of the archive reads, as old", OLD.map((n) => R(n)?.form), Array(OLD.length).fill("old"));
eq("PTS 25/08-NA-1: an ILC, NA, no activity letter (А8)", R("PTS 25/08-NA-1"), { form: "old", simulation: false, yy: "25", mm: "08", kind: "ILC", na: true, accredited: false, activity: null, seq: 1, mark: "NA-1" });
eq("PTS 23/2-A: the A of automobiles, nothing stated", R("PTS 23/2-A"), { form: "old", simulation: false, yy: "23", mm: "02", kind: null, na: false, accredited: null, activity: null, seq: null, mark: "A" });
eq("PTS 21/03-C2F: 2021's calibration", R("PTS 21/03-C2F")?.activity, "C");
eq("PTS 22/08-1: a sequence, no letter", [R("PTS 22/08-1")?.seq, R("PTS 22/08-1")?.activity], [1, null]);
eq("PTS 20/10: nothing but the month", [R("PTS 20/10")?.mm, R("PTS 20/10")?.mark, R("PTS 20/10")?.kind], ["10", "", null]);
t("an old form is never «corrected»: kept apart from today's", !sameSchemeNumber("PTS 22/08-1", "PTS 22/08-T-1"));
t("two spellings of an old form meet: Cyrillic А, «23/2» and «23/02»", sameSchemeNumber("РТС 23/02–А", "PTS 23/2-A"));
t("…C1P with a Cyrillic С and Р", sameSchemeNumber("PTS 21/03-С1Р", "PTS 21/03-C1P"));
t("…but C1P is not C2F", !sameSchemeNumber("PTS 21/03-C1P", "PTS 21/03-C2F"));
eq("ids of the old forms", OLD.map(schemeIdFromNumber), ["25-08-NA-1", "23-11-A", "23-02-A", "21-03-C1P", "21-03-C2F", "21-03-C3T", "22-08-1", "23-01", "20-10"]);
eq("the year of an old form", ["PTS 23/2-A", "PTS 20/10", "PTS 23/01"].map((number) => schemeYear({ number })), ["2023", "2020", "2023"]);
t("an old form needs its «PTS»", R("23/01") === null && R("22/08-1") === null);
t("an old form is not a SIM", R("SIM 23/01") === null);
t("an unknown old-looking form is not accepted", R("PTS 23/11-B") === null && R("PTS 21/03-C12") === null);
t("parseSchemeNumber is today's form only", parseSchemeNumber("PTS 22/08-1") === null && parseSchemeNumber("PTS 25/08-NA-1") === null);
// 3.1 review: the old forms are the archive's — up to 2025, never a mistyped 2026 number
t("a 2026 number without its activity letter is not an archive one", ["PTS 26/11-1", "PTS 26/11", "PTS 26/11-A", "PTS 26/03-C1P", "PTS 26/11-NA-1"].every((n) => R(n) === null));
t("…2025's are", ["PTS 25/11-1", "PTS 25/08-NA-1", "PTS 25/01"].every((n) => R(n)?.form === "old"));

// ── 3.1: the fields (Реш. 102) ─────────────────────────────────────────────
// what the number states, the number decides; the rest PTS chooses
eq("current: all three from the number", markersFor("ILC 26/10-NA-T-1", "T", { kind: "PTS", activity: "S", accredited: true }), { ok: true, kind: "ILC", activity: "T", accredited: false });
eq("SIM: the kind is chosen", markersFor("SIM 26/10-NA-T-1", "T", { kind: "ILC" }), { ok: true, kind: "ILC", activity: "T", accredited: false });
eq("old 25/08-NA-1: the activity is chosen", markersFor("PTS 25/08-NA-1", "T", { kind: "PTS", activity: "T", accredited: true }), { ok: true, kind: "ILC", activity: "T", accredited: false });
eq("old 23/01: everything chosen", markersFor("PTS 23/01", "T", { kind: "PTS", activity: "S", accredited: true }), { ok: true, kind: "PTS", activity: "S", accredited: true });
eq("old 23/01: a choice may be «not stated»", markersFor("PTS 23/01", "T", { kind: null, activity: null, accredited: null }), { ok: true, kind: undefined, activity: undefined, accredited: undefined });
eq("a calibration scheme is C whatever is chosen", markersFor("PTS 23/01", "C", { activity: "T" }), { ok: true, kind: undefined, activity: "C", accredited: undefined });
eq("a C number on a testing scheme is refused", markersFor("PTS 26/03-C-1", "T", {}), { ok: false, problem: "activity" });
eq("a T number on a calibration scheme is refused", markersFor("PTS 26/03-T-1", "C", {}), { ok: false, problem: "activity" });
eq("an S number on a calibration scheme is refused", markersFor("PTS 26/03-S-1", "C", {}), { ok: false, problem: "activity" });
eq("2021's C1P on a testing scheme is refused", markersFor("PTS 21/03-C1P", "T", {}), { ok: false, problem: "activity" });
eq("stated by a current number", statedByNumber("PTS 26/03-T-1", "T"), { kind: true, activity: true, accredited: true });
eq("stated by a SIM number", statedByNumber("SIM 26/03-T-1", "T"), { kind: false, activity: true, accredited: true });
eq("stated by 23/01 on a calibration scheme", statedByNumber("PTS 23/01", "C"), { kind: false, activity: true, accredited: false });
// a scheme from before 3.1 reads its markers from the number; kept fields win
eq("before 3.1: read from the number", schemeMarkers({ number: "ILC 26/10-NA-T-1", type: "T" }), { kind: "ILC", activity: "T", accredited: false });
eq("kept fields win", schemeMarkers({ number: "PTS 23/01", type: "T", kind: "PTS", activity: "S", accredited: true }), { kind: "PTS", activity: "S", accredited: true });
eq("nothing says: null", schemeMarkers({ number: "PTS 23/01", type: "T" }), { kind: null, activity: null, accredited: null });
eq("labels", markerLabels({ kind: "ILC", activity: "S", accredited: false }, "bg"), { kind: "Междулабораторно сравнение (ILC)", activity: "Вземане на проби (S)", accredited: "Извън обхвата на акредитацията (NA)" });
eq("labels: not stated", markerLabels({ kind: null, activity: null, accredited: null }, "en").kind, "not stated");

// ── 3.1: the actions, the store and the export follow the parser ───────────
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const create = actions.slice(actions.indexOf("export async function createProjectAction"), actions.indexOf("export async function renameSchemeAction"));
const edit = actions.slice(actions.indexOf("export async function updateSchemeAction"));
t("create: an unread number is refused", /const reading = readSchemeNumber\(number\);\s*if \(!reading\) redirect\(`\$\{folderView\(type, folderId\)\}\?badNumber=/.test(create));
t("create: the activity must be the folder's", /markersFor\(number, type, reading\.form === "old" \? \{\} : \{ kind, activity, accredited: !na \}\)/.test(create) && /numberActivity=/.test(create));
t("create: an old form never takes the dialog's defaults as a choice", /reading\.form === "old" \? \{\}/.test(create));
t("create: the markers are kept as fields", /if \(markers\.kind\) scheme\.kind = markers\.kind;/.test(create) && /scheme\.accredited = markers\.accredited/.test(create));
t("create: the journal names the markers", /logActivity\("scheme\.created", \{\s*schemeId: id, after: \{ number, kind: scheme\.kind/.test(create));
t("edit: an unread number is not saved", /const numberUnread = numberChange && !numberLocked && !numberTaken && !simRefused && !readSchemeNumber\(newNumber\);/.test(edit) && /err=badNumber/.test(edit));
t("edit: the markers follow the number actually saved, inside the lock", /const m = markersFor\(number, current\.type, chosenMarkers\);/.test(edit));
t("edit: a change of number or markers is journalled", /logActivity\("scheme\.number", \{/.test(edit));
t("edit: …as they read — storing what the number already states is not a change", /if \(b && a && \(b\.number !== a\.number \|\| reads\(b\) !== reads\(a\)\)\)/.test(edit));
t("edit: with certificates even a change of spelling is locked", /const numberLocked = spellingChange && hasCerts\(existing\);/.test(edit) && /\(spellingChange && hasCerts\(current\)\) \? current\.number : newNumber/.test(edit));
const legacy = actions.slice(actions.indexOf("export async function createSchemeAction"), actions.indexOf("export async function updateSchemeAction"));
t("the old /schemes/new path creates nothing", !/addScheme|blankScheme/.test(legacy) && /redirect\(folderView/.test(legacy));
const newPage = readFileSync(new URL("../src/app/schemes/new/page.tsx", import.meta.url), "utf8");
t("…and its page leads to the dialog", /redirect\("\/files\/testing"\)/.test(newPage) && /requireCap\("scheme\.create"\)/.test(newPage));
const editions = readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8");
t("the fingerprint hashes the markers as they read", /markers: schemeMarkers\(scheme\)/.test(editions) && /!MARKER_FIELDS\.has\(k\)/.test(editions));
const exportSrc = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the round export carries the three fields (coded)", /kind: "coded", activity: "coded", accredited: "coded"/.test(exportSrc));
const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
t("the store's year reads through the parser", /function yearOf\(number: string\): string \{\s*const r = readSchemeNumber\(number\);/.test(store));

// ── «today» is Bulgarian time ─────────────────────────────────────────────
eq("Sofia: 31.12 22:30 UTC is already 1 January", sofiaYearMonth(Date.parse("2026-12-31T22:30:00Z")), { year: "2027", month: 1 });
eq("Sofia: 31.10 20:59 UTC (EET) is still October", sofiaYearMonth(Date.parse("2026-10-31T20:59:00Z")), { year: "2026", month: 10 });
eq("Sofia: 31.03 21:30 UTC (EEST) is already April", sofiaYearMonth(Date.parse("2026-03-31T21:30:00Z")), { year: "2026", month: 4 });

console.log(`scheme-number.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
