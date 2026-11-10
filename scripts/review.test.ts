// Plan part 6.7 — PTS's review after the deadline (Реш. 88; the spec's three checks; D1): a STAFF
// review of the values as submitted — the mean against the determinations, the reporting resolution,
// U against CMC; calibration: the points, the reference against the nominal, U's significant figures
// as typed, the environment. It blocks nothing; the findings go into an individual note.
import { readFileSync } from "node:fs";
import { sigFigs, reviewTesting, reviewPoint, reviewEnvironment, reviewVersion, noteInForce, readNote, FINDING_TEXT, NOTE_MAX, type ReviewNote } from "../src/lib/review-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const kinds = (fs: { kind: string; level: string; field: string }[]) => fs.map((f) => `${f.field}:${f.kind}:${f.level}`);

// significant figures, as typed
eq("U's significant figures as typed: leading zeros never; trailing after a separator yes; an integer's trailing zeros no", ["0,123", "0,12", "0,0012", "120", "1,20", "0,30", "5", "0.5"].map(sigFigs), [3, 2, 2, 2, 3, 2, 1, 1]);

// testing — the mean against the determinations
const near = reviewTesting("a", { d: ["5,1", "5,3"], mean: "5,2" }, 0.1);
t("the mean against the determinations: equal — shown for comparison (info), the determinations' mean exactly", near[0].kind === "mean-dets" && near[0].level === "info" && near[0].values.determinationsMean === "5.200" && near[0].values.tolerance === "0.05");
t("…half a step off (5,25 → 5,2): a rounding — not a finding", reviewTesting("a", { d: ["5,1", "5,4"], mean: "5,2" }, 0.1)[0].level === "info");
t("…more than half a step off (5,3 → declared 5,2): a finding", reviewTesting("a", { d: ["5,1", "5,5"], mean: "5,2" }, 0.1)[0].level === "finding");
t("…no step: half a unit of the declared mean's last digit (5,25 vs 5,2 — 0,05 ≤ 0,05; vs 5,20 — 0,05 > 0,005)", reviewTesting("a", { d: ["5,1", "5,4"], mean: "5,2" })[0].level === "info" && reviewTesting("a", { d: ["5,1", "5,4"], mean: "5,20" })[0].level === "finding");
t("…one determination, or none: nothing to compare; an N/R characteristic: nothing at all", !reviewTesting("a", { d: ["5,1", ""], mean: "5,1" }, 0.1).some((f) => f.kind === "mean-dets") && reviewTesting("a", { nr: true, mean: "5" }, 0.1).length === 0 && JSON.stringify(kinds(reviewTesting("a", undefined, 0.1))) === JSON.stringify([":missing:info"]));
// the review's cases (6.7 review)
t("a determination that reads as a number but not as a decimal («1e-301»): left out — never a crash of the page", (() => { try { const f = reviewTesting("a", { d: ["1e-301", "5,1", "5,3"], mean: "5,2" }, 0.1); return f[0].kind === "mean-dets" && f[0].values.determinations === "5,1 · 5,3"; } catch { return false; } })());
t("…the determinations' mean shown exactly where it can be, «≈» where it cannot (three of them) — the decision exact either way", reviewTesting("a", { d: ["5,4991", "5,5011"], mean: "5" })[0].values.determinationsMean === "5.50010" && reviewTesting("a", { d: ["5,4991", "5,5011"], mean: "5" })[0].level === "finding" && reviewTesting("a", { d: ["1", "1", "2"], mean: "1,3" })[0].values.determinationsMean.startsWith("≈"));
t("…a mean typed with an exponent keeps its typed resolution («1,2E2» — tens: ±5)", reviewTesting("a", { d: ["118", "124"], mean: "1,2E2" })[0].level === "info" && reviewTesting("a", { d: ["118", "124"], mean: "1,2E2" })[0].values.tolerance === "5");
t("…negatives: the mean and the resolution", reviewTesting("a", { d: ["-5,1", "-5,3"], mean: "-5,2" }, 0.1).every((f) => f.level === "info") && reviewTesting("a", { mean: "-5,25" }, 0.1).some((f) => f.kind === "resolution"));
// the resolution
eq("the resolution: the mean and each determination against the step — a value finer than it, or off it, a finding", kinds(reviewTesting("a", { d: ["5,12", "5,3"], mean: "5,21" }, 0.1)).filter((k) => k.includes("resolution")), ["mean:resolution:finding", "d1:resolution:finding"]);
t("…on the step (5,0 with step 0,5; 12 with step 2): nothing; no step set: said (info), not checked", reviewTesting("a", { d: ["5,0"], mean: "5,0" }, 0.5).every((f) => f.kind !== "resolution") && reviewTesting("a", { mean: "12" }, 2).every((f) => f.kind !== "resolution") && reviewTesting("a", { mean: "5,23" }).some((f) => f.kind === "no-step" && f.level === "info"));

// calibration — a point
const pf = reviewPoint("p", "20", { ref: "20,15", meas: "20,2", U: "0,123", cmc: "0,2" }, "0,1");
eq("calibration: the reference beyond the tolerance (0,15 > 0,1); U with three figures; U below the declared CMC — three findings", kinds(pf), ["ref:ref-nominal:finding", "U:u-sigfigs:finding", "U:u-cmc:finding"]);
t("…the deviation exactly, always shown — within the tolerance or with none set: info", pf[0].values.deviation === "0.15" && reviewPoint("p", "20", { ref: "20,05", U: "0,2" }, "0,1")[0].level === "info" && reviewPoint("p", "20", { ref: "19,7", U: "0,2" })[0].values.deviation === "-0.3" && reviewPoint("p", "20", { ref: "19,7", U: "0,2" })[0].level === "info");
t("…U = CMC or above, two figures: nothing; a point N/A — listed as declared (info), nothing checked", reviewPoint("p", "20", { ref: "20", U: "0,2", cmc: "0,2" }).every((f) => f.kind === "ref-nominal") && JSON.stringify(kinds(reviewPoint("p", "20", { na: true, U: "0,123" }))) === JSON.stringify(["na:na:info"]));
// the environment
t("the temperature: reported 19,5–21 against 20–25 — a finding; inside — info; the scheme declaring none — shown, nothing found", reviewEnvironment({ tempMin: "19,5", tempMax: "21" }, { tempMin: "20", tempMax: "25" })[0].level === "finding" && reviewEnvironment({ tempMin: "20,5", tempMax: "24" }, { tempMin: "20", tempMax: "25" })[0].level === "info" && reviewEnvironment({ tempMin: "10", tempMax: "40" }, {})[0].level === "info" && reviewEnvironment({}, { tempMin: "20" }).length === 0);

// a whole version — as 6.4 stores it (the draft nested)
const tVer = { v: 1, kind: "T", draft: { rows: { "ch-1": { d: ["5,1", "5,5"], mean: "5,2", U: "0,2", k: "2" }, "ch-2": { nr: true, d: [], mean: "", U: "", k: "" }, "ch-old": { d: [], mean: "9", U: "", k: "" } } } };
eq("a testing version: each characteristic's checks; a value for one no longer in the scheme — said", kinds(reviewVersion(tVer, "T", [{ key: "ch-1", step: 0.1 }, { key: "ch-2", step: 0.1 }])), ["mean:mean-dets:finding", ":orphan:info"]);
const cVer = { v: 1, kind: "C", draft: { general: { tempMin: "18", tempMax: "22" }, points: { "pt-1": { ref: "20,15", meas: "20,2", U: "0,123", cmc: "", na: false }, "pt-2": { ref: "", meas: "", U: "", cmc: "", na: true } } } };
t("a reversed range saved before the editor refused one: read the right way round", reviewEnvironment({ tempMin: "21", tempMax: "22" }, { tempMin: "25", tempMax: "20" })[0].level === "info");
t("an orphan: what the draft holds for it shown", reviewVersion(tVer, "T", [{ key: "ch-1", step: 0.1 }, { key: "ch-2", step: 0.1 }]).find((f) => f.kind === "orphan")?.values.held === "mean: 9");
t("…a point of the scheme with no value in the version: said (info), nothing checked", JSON.stringify(kinds(reviewPoint("p", "20", undefined))) === JSON.stringify([":missing:info"]));
eq("a calibration version: the points, then the environment", kinds(reviewVersion(cVer, "C", [{ key: "pt-1", nominal: "20" }, { key: "pt-2", nominal: "40" }], { refTolerance: "0,1", tempMin: "20", tempMax: "25" })), ["ref:ref-nominal:finding", "U:u-sigfigs:finding", "na:na:info", "temp:env:finding"]);
t("every finding has its words, both languages", Object.values(FINDING_TEXT).every((x) => !!x.bg && !!x.en));

// the note
const notes: ReviewNote[] = [
  { id: "1", participantId: "p1", code: "126301", text: "U с три значещи цифри — в доклада като забележка", at: "2026-11-21T09:00:00Z", by: "s@ptsbg.eu" },
  { id: "2", participantId: "p2", code: "126302", text: "x", at: "2026-11-21T09:01:00Z", by: "s@ptsbg.eu" },
  { id: "3", participantId: "p2", code: "126302", text: "", at: "2026-11-21T09:02:00Z", by: "s@ptsbg.eu" },
];
t("the note in force: the latest; an empty one withdraws it", noteInForce(notes, "p1")?.id === "1" && noteInForce(notes, "p2") === null && noteInForce(undefined, "p1") === null);
t("…read: text only, control characters out (line breaks kept, a CRLF one), at most 2000 characters — never cut inside one", readNote("  ред 1\r\nред 2\u0007  ") === "ред 1\nред 2" && readNote("я".repeat(3000)).length === NOTE_MAX && Array.from(readNote("😀".repeat(2500))).length === NOTE_MAX && !/[\uD800-\uDBFF]$/.test(readNote("a" + "😀".repeat(2500))) && readNote({ x: 1 }) === "");

// the wiring
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function recordReviewNoteAction"), act.indexOf("\n}\n", act.indexOf("export async function recordReviewNoteAction")));
t("the note: the coding or the statistics expert; while the scheme is in progress or in processing; appended in the scheme's lock; the same again — nothing new; journalled WITHOUT its text", /await requireOneOf\(\["results\.enter", "results\.process"\], schemeId\);/.test(fn) && /scheme\.status === "running" \|\| scheme\.status === "processing"/.test(fn) && /return \{ reviewNotes: \[\.\.\.\(cur\.reviewNotes \?\? \[\]\), entry\] \};/.test(fn) && /same = true; return \{\};/.test(fn) && /logActivity\("results\.review_note"/.test(fn) && /after: \{ withdrawn: !text \}/.test(fn) && !/after: \{[^}]*text:/.test(fn));
const page = readFileSync(new URL("../src/app/schemes/[id]/review/page.tsx", import.meta.url), "utf8");
t("…on the final list only; the scheme's state checked again inside the lock (the report may have come meanwhile)", /if \(!part \|\| !inFinalRound\(scheme!, part\)\) redirect\(back\("note=state"\)\);/.test(fn) && /if \(!\(cur\.status === "running" \|\| cur\.status === "processing" \|\| \(cur\.type === "C" && cur\.status === "open"\)\)\) \{ moved = true; return \{\}; \}/.test(fn));
t("the page: staff only — who reads, enters or processes the results; each on the final list by code; the lock's version, else the latest; the note written by who may", /await requireStaff\(\);/.test(page) && /await requireOneOf\(\["results\.read", "results\.enter", "results\.process"\], id\);/.test(page) && /inFinalRound\(s, p\)/.test(page) && /const e = lockEntryOf\(lock, p\.id\);/.test(page) && /reviewVersion\(v\.data, s\.type, rows, s\.calibration\)/.test(page) && /\{canWrite && \(/.test(page) && !/names\.view|withIdentities|labName/.test(page) && /activeCorrections\(corrected\.filter\(\(c\) => c\.participantId === p\.id\), v\.version\)\.size/.test(page));
const editor = readFileSync(new URL("../src/components/SchemeEditor.tsx", import.meta.url), "utf8");
t("the calibration design: the tolerance and the temperature range edited and saved — a number as typed («±» allowed); one that does not read, or a range the wrong way round: refused, named, the saved one kept (6.7 review)", /name="cal_refTolerance"/.test(editor) && /name="cal_tempMin"/.test(editor) && /name="cal_tempMax"/.test(editor) && /refTolerance: reviewNumber\("cal_refTolerance", c\.refTolerance, "tolerance"\)/.test(act) && /if \(readValue\(v\) === null\) \{ reviewRefused\.push\(label\); return fb; \}/.test(act) && /if \(typeof lo === "number" && typeof hi === "number" && lo > hi\) \{ reviewRefused\.push\("tempRange"\);/.test(act) && /const revQ = reviewRefused\.length \?/.test(act));
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
const scheme = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
const lab = readFileSync(new URL("../src/app/lab/p/[id]/results/page.tsx", import.meta.url), "utf8") + readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
t("the notes in the round export: coded, in scheme.json only; the scheme's page links to the review for who may see it; the lab's pages never read it (Реш. 88)", /reviewNotes: "coded",/.test(exp) && /data-review-link/.test(scheme) && /const mayReview = /.test(scheme) && /\(s\.type === "C" && s\.status === "open"\)\) && \(/.test(scheme) && !/review-model|reviewNotes|reviewVersion/.test(lab));

console.log(`review.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
