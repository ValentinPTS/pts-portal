// Plan part 7.1 — the export to PTS_Analysis 2.0's input contract (schema_version 2.1, Реш. 148; D3):
// the template's eight sheets and columns, codes only; Results from the values in force with
// reported_* apart; calibration: a row per point, mean = the error; a file a strict reader opens.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisSheets, analysisGaps } from "../src/lib/analysis-export.ts";
import { readFileSync } from "node:fs";
import { ANALYSIS_GUIDE, ANALYSIS_HEADERS } from "../src/lib/analysis-guide.ts";
import { xlsx, xmlText, colName, sheetName } from "../src/lib/xlsx.ts";
import { submissionPayload } from "../src/lib/submission-model.ts";
import { readDraft, readCalDraft, fieldName, calField, genField, resultRows, calRows } from "../src/lib/results-model.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import type { Scheme } from "../src/lib/types.ts";
import type { Submission } from "../src/lib/submissions.ts";
import type { ResultCorrection } from "../src/lib/corrections-model.ts";
import type { SubmissionLock } from "../src/lib/submission-lock-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// the template's header rows, as read from PTS_Analysis_shablon_v2.1.xlsx (02.11.2026)
// every header row, as read from the template (02.11.2026) — copied here, compared whole (review)
eq("every header row is the template's, whole", ANALYSIS_HEADERS, {
  Scheme_meta: ["key", "value"],
  Characteristics: ["characteristic_id", "name", "name_en", "standard_full", "standard_full_en", "group", "group_en", "unit", "precision_digits", "significant_digits", "rounding_source", "specimens", "assigned_value_method", "xpt_from_reference", "u_xpt_from_reference", "sigma_pt_method", "sigma_pt_estimator", "sigma_pt_predefined", "sigma_pt_min", "sigma_pt_min_relative", "sigma_pt_max", "sigma_pt_max_relative", "homogeneity_mode", "homogeneity_justified_by", "sigma_homogeneity", "delta_factor", "scores", "min_participants", "physical_min", "physical_max", "justification"],
  Participants: ["laboratory_code", "country"],
  Results: ["laboratory_code", "characteristic_id", "determination_i", "determination_ii", "determination_iii", "mean", "u_k2", "status", "notes", "reported_determinations", "reported_mean", "reported_u_k2"],
  Homogeneity: ["series", "sample_code", "characteristic_id", "replicate_number", "value"],
  Calibration: ["characteristic_id", "nominal", "x_ref_before", "x_ref_after", "u_calibration", "u_other", "coverage_factor"],
  External_providers: ["name", "address", "services"],
});
t("«Указания»: the template's sheets and columns in order — the first, the last, every sheet named", ANALYSIS_GUIDE[0].join("|") === "лист|колона|какво се попълва" && ANALYSIS_GUIDE[54].join("|") === "Calibration|coverage_factor|Коефициент на покритие, обикновено 2." && ["Scheme_meta", "Characteristics", "Participants", "Results", "Homogeneity", "Calibration"].every((n) => ANALYSIS_GUIDE.some((r) => r[0] === n)));
eq("the headers are the template's — Characteristics' 31 columns, Results' 12", [ANALYSIS_HEADERS.Characteristics.length, ANALYSIS_HEADERS.Results.length, ANALYSIS_HEADERS.Characteristics[0], ANALYSIS_HEADERS.Characteristics[30], ANALYSIS_HEADERS.Results.join()], [31, 12, "characteristic_id", "justification", "laboratory_code,characteristic_id,determination_i,determination_ii,determination_iii,mean,u_k2,status,notes,reported_determinations,reported_mean,reported_u_k2"]);
t("«Указания»: the template's 55 rows, word for word", ANALYSIS_GUIDE.length === 55 && ANALYSIS_GUIDE[44][2] === "Буквеният вид на средната, ако точността на участника трябва да се запази, например 4,30.");

// ── a testing scheme: characteristics 0 and 1 run; A applied for both, B for 0 only ──
const s: Scheme = { ...pavingBlocks, status: "processing", parameters: pavingBlocks.parameters.map((p, i) => ({ ...p, id: `ch-${i + 1}`, unit: i === 0 ? "mm" : p.unit, guardMin: i === 0 ? 0 : undefined, guardMax: i === 0 ? 100 : undefined, determinations: 2, engine: i === 0 ? { assigned_value_method: "consensus", sigma_pt_min: "0,05", scores: "z, zeta", homogeneity_justified_by: "1,2", min_participants: "6" } : undefined, sigmaMin: i === 1 ? 0.07 : i === 0 ? 0.05 : undefined })) } as Scheme;
s.batches = [{ id: "b1", label: "Партида 1", homogeneity: [{ series: "H1", sampleCode: "1260301", characteristic: 0, characteristicName: "x", characteristicId: "ch-1", replicate: 1, value: 5.11 }, { series: "H1", sampleCode: "1260301", characteristic: 3, characteristicName: "y", characteristicId: "ch-4", replicate: 1, value: 9.9 }, { series: "H1", sampleCode: "1260302", characteristic: null, characteristicName: "z", replicate: 1, value: 1 }] }] as unknown as Scheme["batches"];
s.externalProviders = [{ id: "e1", name: "Партньор ЕООД", address: "София", servicesBg: "Вземане на проби", servicesEn: "Sampling" }] as unknown as Scheme["externalProviders"];
s.lifecycle = { acts: [{ act: "announce2", from: "running", to: "running", at: "2026-11-01T09:00:00Z", by: "m@ptsbg.eu", day: "2026-11-01", final: { runs: [0, 1], dropped: [2, 3, 4, 5], participants: ["pA", "pB", "pC"] } }] } as unknown as Scheme["lifecycle"];
const parts = [{ id: "pA", code: "126301", selections: { "0": 1, "1": 1 } }, { id: "pB", code: "126302", selections: { "0": 1 } }, { id: "pC", code: "126303", selections: { "0": 1, "1": 1 }, status: "submitted" }];
const rowsA = resultRows(s, parts[0]);
const typedA: Record<string, string> = { [fieldName("d", "ch-1", 0)]: "51,0", [fieldName("d", "ch-1", 1)]: "5,2", [fieldName("mean", "ch-1")]: "5,1", [fieldName("U", "ch-1")]: "0,3", [fieldName("k", "ch-1")]: "3", [fieldName("nr", "ch-2")]: "on" };
const sub = (o: Partial<Submission>): Submission => ({ id: "s", participantId: "pA", schemeId: "S", version: 1, data: {}, submittedAt: "2026-11-20T10:00:00Z", submittedBy: "lab:x", ...o });
const subs = [sub({ id: "a1", data: submissionPayload("T", readDraft((n) => typedA[n], rowsA), rowsA, [], { truthful: true, subcontracted: false }, null) })];
const corr: ResultCorrection[] = [{ id: "c1", participantId: "pA", schemeId: "S", version: 1, key: "ch-1", field: "d1", reported: "51,0", used: "5,10", reason: "запетая", at: "2026-11-21T09:00:00Z", by: "c@ptsbg.eu" }];
const out = analysisSheets(s, parts, subs, corr, undefined);
const sheet = (n: string) => out.sheets.find((x) => x.name === n)!.rows;
eq("eight sheets, in the template's order", out.sheets.map((x) => x.name), ["Scheme_meta", "Characteristics", "Participants", "Results", "Homogeneity", "Calibration", "External_providers", "Указания"]);
t("Scheme_meta: key–value, the schema version 2.1, the scheme's code", sheet("Scheme_meta")[1].join() === "schema_version,2.1" && sheet("Scheme_meta")[2].join() === `scheme_code,${s.number}`);
const ch = sheet("Characteristics");
t("Characteristics: the characteristics that RUN (two), by their lasting ids; the guard limits as physical limits; the 2.0 fields as entered — a number as a number", ch.length === 3 && ch[1][0] === "ch-1" && ch[2][0] === "ch-2" && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("physical_max")] === 100 && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("assigned_value_method")] === "consensus" && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("sigma_pt_min")] === 0.05 && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("scores")] === "z, zeta" && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("specimens")] === 2);
eq("Participants: the code; participates_in_<id> Да / Не by the final selections", sheet("Participants"), [["laboratory_code", "country", "participates_in_ch-1", "participates_in_ch-2"], ["126301", "", "Да", "Да"], ["126302", "", "Да", "Не"], ["126303", "", "Да", "Да"]]);
t("…a LIST field stays text («1,2» in homogeneity_justified_by — never 1.2); a numeric one a number (min_participants 6); σpt,min from the statistical project when the 2.0 field is empty (0,07)", ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("homogeneity_justified_by")] === "1,2" && ch[1][ANALYSIS_HEADERS.Characteristics.indexOf("min_participants")] === 6 && ch[2][ANALYSIS_HEADERS.Characteristics.indexOf("sigma_pt_min")] === 0.07);
eq("Homogeneity: only the characteristics in the file — one dropped from the final list, or removed, left out (counted)", [sheet("Homogeneity").slice(1), out.counts.homogeneityDropped], [[["H1", "1260301", "ch-1", 1, 5.11]], 2]);
eq("External_providers: name, address, services", sheet("External_providers"), [["name", "address", "services"], ["Партньор ЕООД", "София", "Вземане на проби"]]);
const g = analysisGaps(s, [...parts, { code: "Z003" }]);
eq("the gaps said on the page: a provisional reference (refused); σpt,min differing between the project and the 2.0 field; homogeneity left out", [g.provisional, g.sigmaMismatch, g.homogeneityDropped], [["Z003"], [], 2]);
t("…σpt,min differing: named", analysisGaps({ ...s, parameters: s.parameters.map((p, i) => (i === 0 ? { ...p, sigmaMin: 0.08 } : p)) } as Scheme, parts).sigmaMismatch.join() === "ch-1");
const res = sheet("Results");
const ra = res.find((r) => r[0] === "126301" && r[1] === "ch-1")!;
eq("Results: the used values (d1 corrected 51,0 → 5,10); U at k = 3 with no used U — empty, said in notes (D3); reported_* as typed (text)", [ra[2], ra[3], ra[5], ra[6], ra[7], String(ra[8]).includes("k = 3"), ra[9], ra[10], ra[11]], [5.1, 5.2, 5.1, "", "reported", true, "51,0; 5,2", "5,1", "0,3"]);
t("…a characteristic N/R: status N/R; one not applied for: no row; none submitted: N/R rows; results by a sheet («outside»): no rows — named", res.some((r) => r[0] === "126301" && r[1] === "ch-2" && r[7] === "N/R") && !res.some((r) => r[0] === "126302" && r[1] === "ch-2") && res.some((r) => r[0] === "126302" && r[1] === "ch-1" && r[7] === "N/R") && !res.some((r) => r[0] === "126303") && JSON.stringify(out.counts.outside) === JSON.stringify(["126303"]));
// D3's main path: a used U at k = 2 recorded — u_k2 the used one, no note; a withdrawn correction not used
const withU = analysisSheets(s, parts, subs, [...corr, { id: "c2", participantId: "pA", schemeId: "S", version: 1, key: "ch-1", field: "U", reported: "0,3", used: "0,2", reason: "k = 3 → k = 2", at: "2026-11-21T09:01:00Z", by: "c@ptsbg.eu" }, { id: "c3", participantId: "pA", schemeId: "S", version: 1, key: "ch-1", field: "d1", reported: "51,0", used: null, reason: "оттеглено", at: "2026-11-21T09:02:00Z", by: "c@ptsbg.eu" }], undefined).sheets.find((x) => x.name === "Results")!.rows.find((r) => r[0] === "126301" && r[1] === "ch-1")!;
eq("D3: the used U at k = 2 recorded → u_k2 = 0,2, no note; d1's correction withdrawn → the reported 51,0 used again", [withU[6], withU[8], withU[2]], [0.2, "", 51]);
// the lock's version, not the latest
const lock: SubmissionLock[] = [{ id: "l", kind: "lock", at: "2026-11-21T08:00:00Z", roundAt: "2026-11-21T08:00:00Z", by: "m@ptsbg.eu", entries: [{ participantId: "pA", code: "126301", version: 1 }, { participantId: "pB", code: "126302", version: null }] }];
const subs2 = [...subs, sub({ id: "a2", version: 2, data: submissionPayload("T", readDraft((n) => ({ ...typedA, [fieldName("mean", "ch-1")]: "9,9" } as Record<string, string>)[n], rowsA), rowsA, [], { truthful: true, subcontracted: false }, null) })];
const locked = analysisSheets(s, parts, subs2, corr, lock).sheets.find((x) => x.name === "Results")!.rows;
t("after the lock: the version it took (mean 5,1 — not v2's 9,9); B N/R at the lock", locked.find((r) => r[0] === "126301" && r[1] === "ch-1")![5] === 5.1 && /заключването/.test(String(locked.find((r) => r[0] === "126302")![8])));

// ── a calibration scheme: a row per point; mean = the error, u_k2 = U; N/A ──
const cs = { ...forceCalibration, calibration: { ...forceCalibration.calibration!, pointIds: forceCalibration.calibration!.points.map((_, i) => `pt-${i + 1}`) } } as Scheme;
const cRows = calRows(cs.calibration!);
const k0 = cRows[0].key, k1 = cRows[1].key;
const cTyped: Record<string, string> = { [genField("labName")]: "ТАЙНА ЛАБ", [calField("ref", k0)]: "20,00", [calField("meas", k0)]: "20,03", [calField("U", k0)]: "0,02", [calField("na", k1)]: "on" };
const cOut = analysisSheets(cs, [{ id: "pA", code: "C1" }], [sub({ data: submissionPayload("C", readCalDraft((n) => cTyped[n], cRows), cRows, [], { truthful: true, subcontracted: false, errorsConfirmed: true }, null) })], [], undefined);
const cch = cOut.sheets.find((x) => x.name === "Characteristics")!.rows, cres = cOut.sheets.find((x) => x.name === "Results")!.rows;
t("calibration: one Characteristics row per point × direction, assigned_value_method «calibration» (D3)", cch.length - 1 === cRows.length && cch[1][0] === k0 && cch[1][ANALYSIS_HEADERS.Characteristics.indexOf("assigned_value_method")] === "calibration");
const c0 = cres.find((r) => r[1] === k0)!;
eq("…Results: mean = the lab's error, u_k2 = its U; reported_mean = the error as computed and confirmed; the readings not here (they stay in the portal)", [c0[5], c0[6], c0[7], c0[10], c0[11], c0[2]], [0.03, 0.02, "reported", "0.03", "0,02", ""]);
t("…a point declared N/A: status N/R with its note; the Calibration sheet a row per point", /неприложима/.test(String(cres.find((r) => r[1] === k1)![8])) && cOut.sheets.find((x) => x.name === "Calibration")!.rows.length - 1 === cRows.length);
t("codes only — nothing the laboratory typed as its name reaches the file", !JSON.stringify(cOut.sheets).includes("ТАЙНА"));
const cRef = { ...cs, referenceValues: { versions: [{ at: "2026-11-01T09:00:00Z", by: "m@ptsbg.eu", rows: { [k0]: { xBefore: 0.01, xAfter: 0.02, uCal: 0.005, k: 2 } } }] } } as unknown as Scheme;
const cal = analysisSheets(cRef, [{ id: "pA", code: "C1" }], [], [], undefined).sheets;
eq("…the Calibration sheet: the point, its nominal (a number), the reference values (5.7); Participants: Да for every point", [cal.find((x) => x.name === "Calibration")!.rows[1], cal.find((x) => x.name === "Participants")!.rows[1].slice(0, 4)], [[k0, 20, 0.01, 0.02, 0.005, "", 2], ["C1", "", "Да", "Да"]]);

// ── the file: a strict reader opens it ──
eq("the writer's parts: XML text escaped and cleaned; columns AA after Z; a sheet's name as Excel takes it", [xmlText("a&b<c>\"d\u0007"), colName(0), colName(25), colName(26), colName(30), sheetName("a/b:c"), sheetName("x".repeat(40)).length], ["a&amp;b&lt;c&gt;&quot;d", "A", "Z", "AA", "AE", "a b c", 31]);
const dir = mkdtempSync(join(tmpdir(), "analysis-")), file = join(dir, "t.xlsx");
writeFileSync(file, xlsx(out.sheets, new Date("2026-11-10T03:00:00Z")));
const py = `import sys, zipfile, xml.dom.minidom
z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip()
for n in z.namelist(): xml.dom.minidom.parseString(z.read(n))
core = z.read("docProps/core.xml").decode()
try:
    import openpyxl; wb = openpyxl.load_workbook(sys.argv[1]); names = wb.sheetnames; head = [c.value for c in next(wb["Results"].iter_rows())]; rep = [r for r in wb["Results"].iter_rows(values_only=True) if r[0] == "126301" and r[1] == "ch-1"][0]
except ImportError:
    names, head, rep = None, None, None
print(repr((bad, 'xmlns:dc="' in core, names, head, rep[10] if rep else None)))`;
const res2 = execFileSync("python3", ["-c", py, file], { encoding: "utf8" }).trim();
t("the XLSX: every CRC right (zipfile.testzip), every part well-formed XML, dc declared in core.xml (the template's fault)", res2.startsWith("(None, True,"), res2);
t("…openpyxl reads it: the eight sheets, Results' header, reported_mean kept as text «5,1»", !res2.includes("None, None") ? res2.includes("'Указания'") && res2.includes("'reported_u_k2'") && res2.endsWith("'5,1')") : true, res2);

const big = xlsx([{ name: "x", rows: [["я".repeat(40000)]] }], new Date("2026-11-10T03:00:00Z"), undefined, "PRELIMINARY — test");
const fb = join(dir, "b.xlsx"); writeFileSync(fb, big);
const bigOut = execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); c=z.read('docProps/core.xml').decode(); s=z.read('xl/worksheets/sheet1.xml').decode(); print(('PRELIMINARY' in c), s.count('я'))", fb], { encoding: "utf8" }).trim();
t("the file says PRELIMINARY inside it too (its title), not only in its name; a cell longer than Excel holds (32 767) is cut, never «repaired»", bigOut === "True 32767", bigOut);
const route = readFileSync(new URL("../src/app/schemes/[id]/export/analysis/route.ts", import.meta.url), "utf8");
t("the route: the statistics or the coding expert; a provisional reference refused (409); the file built BEFORE the journal line; no line — no file (503); PRELIMINARY in the title before the lock", /await requireOneOf\(\["results\.process", "results\.enter"\], id\);/.test(route) && /if \(gaps\.provisional\.length\) return new Response\(/.test(route) && route.indexOf("bytes = xlsx(") < route.indexOf("const logged = await logActivity(") && /if \(!logged\) return new Response\("The file is ready, but its journal entry could not be written/.test(route) && /PRELIMINARY — \$\{s\.number\}/.test(route));

console.log(`analysis-export.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
