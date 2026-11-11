// Plan part 8.2 — the closed-round import: the XLSX reader (the portal's own file and Excel's shared
// strings), the 2.0 input file read and checked (codes only — a name refused), the replay round made
// from it (testing and calibration), and THE ROUND TRIP: the replay's re-export (7.1) against the
// source file, cell by cell — no difference but the expected ones.
import { readFileSync } from "node:fs";
import { xlsx, type Sheet } from "../src/lib/xlsx.ts";
import { zip } from "../src/lib/zip.ts";
import { readXlsx, colIndex, unxml } from "../src/lib/xlsx-read.ts";
import { readReplay, replayDiff, CODE_RE } from "../src/lib/replay-model.ts";
import { importReplay, replaySource } from "../src/lib/replay-import.ts";
import { ANALYSIS_HEADERS } from "../src/lib/analysis-guide.ts";
import { analysisSheets } from "../src/lib/analysis-export.ts";
import { getScheme } from "../src/lib/store.ts";
import { listParticipants } from "../src/lib/participants.ts";
import { listSubmissions, listCorrections } from "../src/lib/submissions.ts";
import { lockInForce } from "../src/lib/submission-lock-model.ts";
import { SCHEME_FIELDS, codedScheme } from "../src/lib/round-export.ts";
import { replaySheets } from "./replay-fixture.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const H = ANALYSIS_HEADERS;

// ── the reader ──
const own = readXlsx(xlsx([{ name: "Scheme_meta", rows: [["key", "value"], ["schema_version", "2.1"], ["n", 4.3], ["a & <b>", ""], [null, "B only"]] }, { name: "Указания", rows: [["а"]] }]));
t("the reader: the portal's own file — sheets by name, numbers, escaped text, gaps kept", own.length === 2 && own[0].name === "Scheme_meta" && own[0].rows[2][1] === 4.3 && own[0].rows[3][0] === "a & <b>" && own[0].rows[4][0] === null && own[0].rows[4][1] === "B only" && own[1].name === "Указания");
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const excel = zip([
  { name: "[Content_Types].xml", data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>` },
  { name: "xl/workbook.xml", data: `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId7"/></sheets></workbook>` },
  { name: "xl/_rels/workbook.xml.rels", data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet9.xml"/></Relationships>` },
  { name: "xl/sharedStrings.xml", data: `${XML}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>laboratory_code</t></si><si><r><t>12</t></r><r><t xml:space="preserve">6301</t></r><rPh><t>ignored</t></rPh></si><si><t>4,30</t></si></sst>` },
  { name: "xl/worksheets/sheet9.xml", data: `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3"><v>4.3</v></c><c r="E3" t="b"><v>1</v></c><c r="F3" t="str"><f>A3</f><v>126301</v></c><c r="G3" t="inlineStr"><is><t>&#1041;&amp;</t></is></c></row></sheetData></worksheet>` },
]);
const ex = readXlsx(excel)[0];
t("…Excel's: shared strings (a rich one joined, the phonetic guide left out), rows by their number, a cell by its column, booleans, a formula's cached value, an inline string with references", ex.name === "Results" && ex.rows[0][0] === "laboratory_code" && ex.rows[1].length === 0 && ex.rows[2][0] === "126301" && ex.rows[2][1] === null && ex.rows[2][2] === "4,30" && ex.rows[2][3] === 4.3 && ex.rows[2][4] === "TRUE" && ex.rows[2][5] === "126301" && ex.rows[2][6] === "Б&", JSON.stringify(ex.rows));
t("…not a ZIP, or no workbook: refused", (() => { try { readXlsx(new Uint8Array(Buffer.from("plain text"))); return false; } catch { return true; } })() && (() => { try { readXlsx(zip([{ name: "a.txt", data: "x" }])); return false; } catch { return true; } })());
const zipOf = (sst: string, sheet: string) => zip([
  { name: "xl/workbook.xml", data: `${XML}<workbook xmlns:r="r"><sheets><sheet name='S' sheetId='1' r:id='rId1'/></sheets></workbook>` },
  { name: "xl/_rels/workbook.xml.rels", data: `${XML}<Relationships><Relationship Id='rId1' Target='worksheets/sheet1.xml'/></Relationships>` },
  { name: "xl/sharedStrings.xml", data: `${XML}<sst>${sst}</sst>` },
  { name: "xl/worksheets/sheet1.xml", data: `${XML}<worksheet><sheetData>${sheet}</sheetData></worksheet>` },
]);
const selfClosing = readXlsx(zipOf("<si><t>A</t></si><si/><si><t>C</t></si>", `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"/><row r="3"><c r='A3' t='s'><v>2</v></c></row>`))[0];
t("review: a self-closing <si/> and <row/> never swallow the next; single-quoted attributes read", selfClosing.name === "S" && selfClosing.rows[0][0] === "A" && selfClosing.rows[0][1] === null && selfClosing.rows[0][2] === "C" && selfClosing.rows[2][0] === "C", JSON.stringify(selfClosing.rows));
// two central-directory entries over the same bytes: refused (a small file made large)
const one = zip([{ name: "xl/workbook.xml", data: "<workbook/>" }]);
const ob = Buffer.from(one), eo = ob.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), cdOff = ob.readUInt32LE(eo + 16), cdSize = ob.readUInt32LE(eo + 12);
const cd = ob.subarray(cdOff, cdOff + cdSize), cd2 = Buffer.from(cd); cd2.write("xl/workbook.xmm", 46, "utf8");
const eocd = Buffer.from(ob.subarray(eo)); eocd.writeUInt16LE(2, 8); eocd.writeUInt16LE(2, 10); eocd.writeUInt32LE(cdSize * 2, 12);
const overlapping = Buffer.concat([ob.subarray(0, cdOff), cd, cd2, eocd]);
t("review: entries that overlap, or a size not the one declared — refused", (() => { try { readXlsx(new Uint8Array(overlapping)); return false; } catch (e) { return /overlap/.test(String(e)); } })() && (() => { const b2 = Buffer.from(one); const e2 = b2.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const c2 = b2.readUInt32LE(e2 + 16); b2.writeUInt32LE(999, c2 + 24); try { readXlsx(new Uint8Array(b2)); return false; } catch (e) { return /size|large|broken/.test(String(e)); } })());
t("…columns and references", colIndex("A") === 0 && colIndex("Z") === 25 && colIndex("AA") === 26 && colIndex("AB") === 27 && unxml("&lt;&#x41;&#66;&quot;") === '<AB"');

// ── a coded 2.0 input file of a closed testing round (synthetic — scripts/replay-fixture.ts) ──
const sourceT: Sheet[] = replaySheets();
const chars = sourceT.find((x) => x.name === "Characteristics")!.rows.slice(1);
const fileT = xlsx(sourceT);
const readT = readReplay(readXlsx(fileT));
t("the file read: testing, the number, the characteristics, three participations by code, five results; what cannot be carried as it is, said", readT.ok && readT.round.type === "T" && readT.round.number === "PTS 26/03-T-1" && readT.round.characteristics.length === 2 && readT.round.participants.length === 3 && readT.round.results.length === 5 && readT.round.said.excluded.join() === "126302 / ch-1" && readT.round.said.nrNotes.join() === "126303 / ch-1", JSON.stringify(readT.ok ? readT.round.said : readT.problems));

const withSheet = (name: string, rows: (string | number)[][]) => sourceT.map((s) => (s.name === name ? { name, rows } : s));
const problems = (sheets: Sheet[]) => { const r = readReplay(readXlsx(xlsx(sheets))); return r.ok ? [] : r.problems.map((p) => `${p.where}: ${p.why}`); };
const nameIn = problems(withSheet("Participants", [[...H.Participants], ["Лаборатория Тест ЕООД", ""]]));
t("codes only — a laboratory's name in the code is refused, by its row, and never repeated back", nameIn.some((p) => /Participants row 2: the laboratory_code is not a code/.test(p)) && !nameIn.join().includes("Тест ЕООД"), nameIn.join(" | "));
t("…a column the contract does not have (a name could sit in it): refused", problems(withSheet("Participants", [[...H.Participants, "lab_name"], ["126301", "", "X"]])).some((p) => /Participants column C: a column the contract does not have/.test(p)));
t("…the code rule: digits, at most three letters — a one-word name is never a code (review)", CODE_RE.test("126301") && CODE_RE.test("L-01") && CODE_RE.test("LAB-07") && !CODE_RE.test("Лаб 1") && !CODE_RE.test("Lab One") && !CODE_RE.test("") && !CODE_RE.test("Geoprojekt") && !CODE_RE.test("BAS-IMSET") && !CODE_RE.test("Geoprojekt2"));
const R = (extra: (string | number)[]) => [...H.Results, ...extra];
t("review: a name has nowhere to come in — a column the contract does not have, a value under no header or past the header, another sheet, a meta key, a country, a reported text",
  problems(withSheet("Results", [R(["laboratory_name"]), ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "", "", "Лаб"]])).some((p) => /Results column M: a column the contract does not have/.test(p))
  && problems(withSheet("Participants", [[...H.Participants, "", "participates_in_ch-1"], ["126301", "", "Име ООД", "Да"]])).some((p) => /Participants row 2, column C: a value outside/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "", "", "Име ООД"]])).some((p) => /value outside the contract's columns/.test(p))
  && problems([...sourceT, { name: "Labs", rows: [["Име ООД"]] }]).some((p) => /sheet 8: a sheet the contract does not have/.test(p))
  && problems(withSheet("Scheme_meta", [[...H.Scheme_meta], ["schema_version", "2.1"], ["scheme_code", "PTS 26/03-T-1"], ["contact", "Име ООД"]])).some((p) => /a key the contract does not have/.test(p))
  && problems(withSheet("Participants", [[...H.Participants], ["126301", "Bulgaria Lab"]])).some((p) => /two-letter code/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "Лаб Х", ""]])).some((p) => /reported_\* cell is not a number/.test(p))
  && !problems(withSheet("Results", [R(["laboratory_name"]), ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "", "", "Секретна"]])).join().includes("Секретна"));
t("a result naming an unknown code or characteristic; the same twice; a status not known; a value not a number — each refused by its row",
  problems(withSheet("Results", [[...H.Results], ["999999", "ch-1", 1, "", "", 1, "", "reported", "", "", "", ""]])).some((p) => /not in Participants/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-9", 1, "", "", 1, "", "reported", "", "", "", ""]])).some((p) => /not in Characteristics/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "", ""], ["126301", "ch-1", 1, "", "", 1, "", "reported", "", "", "", ""]])).some((p) => /twice/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-1", 1, "", "", 1, "", "maybe", "", "", "", ""]])).some((p) => /is not reported, N\/R or excluded/.test(p))
  && problems(withSheet("Results", [[...H.Results], ["126301", "ch-1", "abc", "", "", 1, "", "reported", "", "", "", ""]])).some((p) => /determination_i is not a number/.test(p)));
t("review: the same homogeneity key twice, the same calibration row twice — refused, never folded into one", problems(withSheet("Homogeneity", [[...H.Homogeneity], ["H1", "", "ch-1", 1, 2.6], ["H1", "", "ch-1", 1, 2.7]])).some((p) => /twice/.test(p)));
t("the schema version, a missing sheet, a characteristic twice", problems(withSheet("Scheme_meta", [[...H.Scheme_meta], ["schema_version", "2.0"], ["scheme_code", "PTS 26/03-T-1"]])).some((p) => /schema_version is «2\.0»/.test(p)) && problems(sourceT.filter((s) => s.name !== "Results")).some((p) => /Results: the sheet is missing/.test(p)) && problems(withSheet("Characteristics", [[...H.Characteristics], chars[0], chars[0]])).some((p) => /«ch-1» twice/.test(p)));

// ── made into a replay round (no database: the local build takes it) ──
const imp = await importReplay({ bytes: fileT, by: "admin@ptsbg.eu" });
t("imported: a SIM number, never the active series (Реш. 130)", imp.ok && /^SIM /.test(imp.number), imp.ok ? imp.number : JSON.stringify(imp));
const S = imp.ok ? (await getScheme(imp.schemeId))! : null;
const parts = S ? await listParticipants(S.id) : [];
t("…the replay on record: the original number, the file's hash, the counts, what was said; in processing, the submission locked — an act on record", !!S && S.replay?.of === "PTS 26/03-T-1" && /^[0-9a-f]{64}$/.test(S.replay.fileSha256) && S.replay.counts.participants === 3 && S.replay.counts.nr === 1 && S.status === "processing" && !!lockInForce(S.submissionLocks) && /Възпроизвеждане — внесен приключил кръг PTS 26\/03-T-1/.test(S.lifecycle?.acts?.at(-1)?.note ?? ""));
t("…the participations by code only — nobody behind them", parts.map((p) => p.code).sort().join() === "126301,126302,126303" && parts.every((p) => !p.labName && !p.email));
t("…the characteristics with their ids and 2.0 fields", S?.parameters.map((p) => p.id).join() === "ch-1,ch-2" && S?.parameters[0].engine?.sigma_pt_min === "0.01" && S?.parameters[0].determinations === 2 && S?.parameters[0].guardMax === 4);
const subs = S ? await listSubmissions(S.id) : [];
t("…each participation's results as one submitted version, the reported text kept («2,62» stays «2,62»)", subs.length === 3 && subs.every((x) => x.version === 1) && JSON.stringify(subs.find((x) => x.participantId === parts.find((p) => p.code === "126301")?.id)?.data).includes('"mean":"2,62"'));
t("…the source file kept — the same bytes", !!S && Buffer.from((await replaySource(S.replay!.sourcePath))!).equals(Buffer.from(fileT)));

// ── THE ROUND TRIP ──
const reexport = S ? analysisSheets(S, parts, subs, await listCorrections(S.id), S.submissionLocks).sheets : [];
const diffs = S ? replayDiff(readXlsx(fileT), readXlsx(xlsx(reexport)), S.replay!) : [];
const unexpected = diffs.filter((d) => !d.expected);
t("THE ROUND TRIP: the replay's re-export matches the source file cell by cell — no unexpected difference", unexpected.length === 0, JSON.stringify(unexpected.slice(0, 8)));
t("…the expected ones named: the SIM number, the report date, the design date, «excluded», the portal's own N/R note", ["scheme_code", "report_date", "design_approved"].every((k) => diffs.some((d) => d.sheet === "Scheme_meta" && d.column.startsWith(k) && d.expected)) && diffs.some((d) => d.column === "126302 / ch-1 · status" && d.expected) && diffs.some((d) => d.column === "126303 / ch-1 · notes" && d.expected), JSON.stringify(diffs.filter((d) => d.expected).map((d) => d.column)));
const altered = (f: (r: (string | number | null | undefined)[]) => (string | number | null | undefined)[]) => S ? replayDiff(readXlsx(fileT), readXlsx(xlsx(reexport.map((sh) => (sh.name === "Results" ? { ...sh, rows: sh.rows.map((r) => (r[0] === "126301" && r[1] === "ch-1" ? f(r) : r)) } : sh)))), S.replay!) : [];
t("…and a changed value is found", altered((r) => [...r.slice(0, 5), 2.65, ...r.slice(6)]).some((d) => !d.expected && d.column === "126301 / ch-1 · mean"));
t("review: a reported text changed — «2,62» to «2.62» — is a difference, never «the same number»", altered((r) => [...r.slice(0, 10), "2.62", ...r.slice(11)]).some((d) => !d.expected && d.column === "126301 / ch-1 · reported_mean"));
t("review: a row twice on the portal's side is said, never folded", S ? replayDiff(readXlsx(fileT), readXlsx(xlsx(reexport.map((sh) => (sh.name === "Homogeneity" ? { ...sh, rows: [...sh.rows, sh.rows[1]] } : sh)))), S.replay!).some((d) => !d.expected && /\(twice\)/.test(d.column)) : false);

// ── a closed calibration round ──
const sourceC: Sheet[] = [
  { name: "Scheme_meta", rows: [[...H.Scheme_meta], ["schema_version", "2.1"], ["scheme_code", "PTS 25/10-C-1"], ["object_title", "Динамометър"], ["object_title_en", "Force transducer"], ["design_approved", ""], ["report_date", ""], ["period", ""]] },
  { name: "Characteristics", rows: [[...H.Characteristics],
    ...["pt-1|tension", "pt-2|tension", "pt-1|compression", "pt-2|compression"].map((id) => { const [p, d] = id.split("|"); const nom = p === "pt-1" ? "20" : "40"; const dEn = d === "tension" ? "Tension" : "Compression", dBg = d === "tension" ? "Опън" : "Натиск"; const row: Record<string, string | number> = { characteristic_id: id, name: `Сила ${nom} kN · ${dBg}`, name_en: `Force ${nom} kN · ${dEn}`, standard_full: "БДС EN ISO 376", standard_full_en: "EN ISO 376", unit: "kN", specimens: 1, assigned_value_method: "calibration" }; return H.Characteristics.map((h) => row[h] ?? ""); })] },
  { name: "Participants", rows: [[...H.Participants, ...["pt-1|tension", "pt-2|tension", "pt-1|compression", "pt-2|compression"].map((id) => `participates_in_${id}`)], ["L01", "", "Да", "Да", "Да", "Да"], ["L02", "", "Да", "Да", "Да", "Да"]] },
  { name: "Results", rows: [[...H.Results], ["L01", "pt-1|tension", "", "", "", 0.03, 0.02, "reported", "", "", "0,03", "0,02"], ["L02", "pt-2|compression", "", "", "", -0.01, 0.03, "reported", "", "", "-0,01", "0,03"]] },
  { name: "Homogeneity", rows: [[...H.Homogeneity]] },
  { name: "Calibration", rows: [[...H.Calibration], ["pt-1|tension", 20, 20.001, 20.002, 0.004, 0.001, 2], ["pt-2|tension", 40, "", "", "", "", ""], ["pt-1|compression", 20, "", "", "", "", ""], ["pt-2|compression", 40, "", "", "", "", ""]] },
  { name: "External_providers", rows: [[...H.External_providers]] },
];
const fileC = xlsx(sourceC);
const impC = await importReplay({ bytes: fileC, by: "admin@ptsbg.eu" });
const C = impC.ok ? (await getScheme(impC.schemeId))! : null;
t("calibration: the points with their ids, the directions, the nominal values; the reference values", !!C && C.type === "C" && C.calibration?.pointIds?.join() === "pt-1,pt-2" && C.calibration.points.join() === "20,40" && C.calibration.directionsEn.join() === "Tension,Compression" && C.referenceValues?.versions[0].rows["pt-1|tension"]?.xBefore === 20.001, JSON.stringify(C?.calibration));
const partsC = C ? await listParticipants(C.id) : [];
const reC = C ? analysisSheets(C, partsC, await listSubmissions(C.id), await listCorrections(C.id), C.submissionLocks).sheets : [];
const diffC = C ? replayDiff(readXlsx(fileC), readXlsx(xlsx(reC)), C.replay!) : [];
// a calibration participation the file has no row for is N/R in the portal's export — expected
t("…THE ROUND TRIP for calibration: no unexpected difference", diffC.filter((d) => !d.expected).length === 0, JSON.stringify(diffC.filter((d) => !d.expected).slice(0, 8)));
const subC = C ? (await listSubmissions(C.id)).find((x) => x.participantId === partsC.find((p) => p.code === "L01")?.id) : undefined;
t("review: calibration's error kept exactly as reported — «0,03» never becomes «0.03»", JSON.stringify(subC?.data).includes('"error":"0,03"'));

// ── used ≠ reported: the correction, never merged (review) ──
const sourceU: Sheet[] = sourceT.map((sh) => sh.name !== "Results" ? sh : { ...sh, rows: [sh.rows[0],
  ["126301", "ch-1", 2.61, 2.63, "", 2.6, 0.04, "reported", "", "2,61; 2,63", "2,62", "0,06"],
  ["126303", "ch-2", 0.45, 0.47, 0.49, 0.47, 0.05, "reported", "", "", "", ""]] });
const impU = await importReplay({ bytes: xlsx(sourceU), by: "admin@ptsbg.eu" });
const U = impU.ok ? (await getScheme(impU.schemeId))! : null;
const corrU = U ? await listCorrections(U.id) : [];
t("review: a used value that differs from the reported one goes in as the round's correction — the reported text stays", corrU.length === 2 && corrU.some((c) => c.field === "mean" && c.reported === "2,62" && c.used === "2.6") && corrU.some((c) => c.field === "U" && c.reported === "0,06" && c.used === "0.04"), JSON.stringify(corrU.map((c) => [c.field, c.reported, c.used])));
const partsU = U ? await listParticipants(U.id) : [];
const diffU = U ? replayDiff(readXlsx(xlsx(sourceU)), readXlsx(xlsx(analysisSheets(U, partsU, await listSubmissions(U.id), corrU, U.submissionLocks).sheets)), U.replay!) : [];
t("…and the round trip still matches; a file with the reported texts left empty: only expected differences", diffU.filter((d) => !d.expected).length === 0 && diffU.some((d) => d.column === "126303 / ch-2 · reported_mean" && d.expected), JSON.stringify(diffU.filter((d) => !d.expected).slice(0, 6)));

// ── where it is allowed, and the wiring ──
const imp2 = readFileSync(new URL("../src/lib/replay-import.ts", import.meta.url), "utf8");
t("the real portal never takes a replay — the test environment, or the local build with no database", /export const replayAllowedHere = \(\) => isTestEnvironment\(\) \|\| !getDb\(\);/.test(imp2) && /if \(!replayAllowedHere\(\)\) return \{ ok: false, problem: "environment" \};/.test(imp2));
t("…nothing made unless the whole file reads; a half-made round KEPT and marked failed (review: never out of sight); a round not made leaves no source file", imp2.indexOf("readReplay(sheets)") < imp2.indexOf("addScheme(scheme)") && /replay: \{ \.\.\.cur\.replay!, failed: why\.slice\(0, 300\) \}/.test(imp2) && !/archivedAt/.test(imp2) && /await dropSource\(sourcePath\); return \{ ok: false, problem: "failed"/.test(imp2));
const crit = readFileSync(new URL("../src/lib/validation-criteria.ts", import.meta.url), "utf8");
t("review: the bucket made by 8.1 is taught the XLSX type before a source file goes in", /await ensureValidationBucket\(db\);/.test(imp2) && /db\.storage\.updateBucket\(VALIDATION_BUCKET/.test(crit) && /VALIDATION_MIMES = \[\.\.\.Object\.keys\(CRITERIA_EXT\), "application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"\]/.test(crit));
const act = readFileSync(new URL("../src/lib/validation-actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function importReplayAction"));
t("the action: system.technical; the environment again; journalled with the number, the counts, the hash — never a value; a half-made round journalled too (review)", /await requireCapAnywhere\("system\.technical"\);/.test(fn) && /if \(!replayAllowedHere\(\)\) return \{ problem: "environment" \};/.test(fn) && /logActivity\("validation\.replay_imported"/.test(fn) && /logActivity\("validation\.replay_failed"/.test(fn));
t("the round export: the replay's field placed; its source path never in coded/", SCHEME_FIELDS.replay === "split" && !!S && !JSON.stringify(codedScheme(S)).includes(S.replay!.sourcePath.slice(0, 40)) && JSON.stringify(codedScheme(S)).includes("PTS 26/03-T-1"));

// the security sweep (SI-7): a 567-byte workbook with a cell «ZZZZZZZZ1» (or a row number past a sheet's
// bounds) filled arrays until the process ran out of memory — now refused at once
{
  const enc = (x: string) => new TextEncoder().encode(x);
  const book = (sheet: string) => zip([
    { name: "xl/workbook.xml", data: enc(`<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>`) },
    { name: "xl/worksheets/s.xml", data: enc(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`) },
  ], new Date());
  const refused = (sheet: string) => { const t0 = Date.now(); try { readXlsx(book(sheet)); return false; } catch (e) { return /beyond a sheet's bounds/.test(String((e as Error).message)) && Date.now() - t0 < 2000; } };
  t("a column past a sheet's bounds — refused at once", refused(`<row r="1"><c r="ZZZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row>`));
  t("a row past a sheet's bounds — refused at once", refused(`<row r="99999999"><c r="A99999999" t="inlineStr"><is><t>x</t></is></c></row>`));
  // round 2 (R2S-7): within the bounds, many far cells — refused, never hundreds of MB
  const far = Array.from({ length: 3000 }, (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}" t="inlineStr"><is><t>x</t></is></c></row>`).join("");
  t("3 000 rows with a cell at XFD — refused at once (a cell budget)", (() => { const t0 = Date.now(); try { readXlsx(book(far)); return false; } catch (e) { return /too many cells/.test(String((e as Error).message)) && Date.now() - t0 < 2000; } })());
  t("the last cell of a sheet is still read", readXlsx(book(`<row r="3"><c r="XFD3" t="inlineStr"><is><t>z</t></is></c></row>`))[0].rows[2][16383] === "z");
  // round 3 (R3S-5): one part listed as many sheets — the budget was per sheet; now one per workbook,
  // each part read once, and a bound on the sheets
  const many = (k: number, sheet: string, distinct = false) => zip([
    { name: "xl/workbook.xml", data: enc(`<workbook><sheets>${Array.from({ length: k }, (_, i) => `<sheet name="S${i}" r:id="rId${distinct ? i : 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships>${Array.from({ length: distinct ? k : 1 }, (_, i) => `<Relationship Id="rId${distinct ? i : 1}" Target="worksheets/s${distinct ? i : ""}.xml"/>`).join("")}</Relationships>`) },
    ...Array.from({ length: distinct ? k : 1 }, (_, i) => ({ name: `xl/worksheets/s${distinct ? i : ""}.xml`, data: enc(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`) })),
  ], new Date());
  const why = (b: Uint8Array) => { try { readXlsx(b); return "read"; } catch (e) { return String((e as Error).message); } };
  const wide = Array.from({ length: 100 }, (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}"><v>1</v></c></row>`).join("");
  t("round 3 — one sheet's part listed twice: refused", /listed twice/.test(why(many(50, wide))));
  t("round 3 — the cell budget is the workbook's: 2 × 1.6 M slots in two sheets refused", /too many cells/.test(why(many(2, wide, true))));
  t("round 3 — more than 255 sheets: refused", /more sheets/.test(why(many(256, `<row r="1"><c r="A1"><v>1</v></c></row>`, true))));
  t("round 3 — two ordinary sheets still read", why(many(2, `<row r="1"><c r="A1"><v>1</v></c></row>`, true)) === "read");
  // round 4 (R4S-6): an opener never closed — found by one forward scan, refused at once (it took 14 s)
  for (const [label, sheet] of [["rows", "<row>".repeat(160_000)], ["cells", `<row r="1">${"<c>".repeat(160_000)}</row>`], ["text", `<row r="1"><c r="A1" t="inlineStr"><is>${"<t>".repeat(160_000)}</is></c></row>`]] as const) {
    const t0 = Date.now();
    const r = why(book(sheet));
    t(`round 4 — ${label} never closed: refused at once`, /broken part/.test(r) && Date.now() - t0 < 1500, `${r} ${Date.now() - t0} ms`);
  }
  t("round 4 — a reference past Unicode is no crash", why(book(`<row r="1"><c r="A1" t="inlineStr"><is><t>&#x110000;</t></is></c></row>`)) === "read");
}

console.log(`replay.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
