// Plan part 7.2 — import from PTS_Analysis 2.0 (Реш. 68, 135): the issued documents as files,
// stamped with the module's version, never recomputed or changed; the BG report the scheme's report.
import { readFileSync } from "node:fs";
import { readVersion, checkImport, importInForce, servedName, IMPORT_PROBLEM_TEXT, IMPORT_LABEL, IMPORT_KINDS, MAX_IMPORT_BYTES, MAX_CHARTS, type AnalysisImport } from "../src/lib/analysis-import-model.ts";
import { sameAs } from "../src/lib/editions.ts";
import { codedScheme } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq("the module's version as 2.0 prints it — anything else refused", ["2.0", "2.0.3", " 2.1.0-rc1 ", "v2", "2", "2.0.3; drop", "", null].map(readVersion), ["2.0", "2.0.3", "2.1.0-rc1", null, null, null, null, null]);
const f = (kind: string, mime = "application/pdf", size = 1000, real = true) => ({ kind: kind as never, mime, size, real });
eq("the files: the BG report required; each kind its types, checked by the bytes; nothing empty; 15 MB in all", [
  checkImport("2.0.3", [f("report-bg"), f("report-en"), f("chart", "image/png")]).ok,
  (checkImport("", [f("report-bg")]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-en")]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg", "image/png")]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg", "application/pdf", 1000, false)]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg"), f("chart", "application/pdf", 0)]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg", "application/pdf", MAX_IMPORT_BYTES), f("chart", "image/png", 10)]) as { problem?: string }).problem,
], [true, "version", "report", "type", "type", "empty", "size"]);
eq("…adding to an import already made: no BG report needed (but some file); one of each document; up to 50 charts (review)", [
  checkImport("2.0.4", [f("chart", "image/png")], { adding: true }).ok,
  (checkImport("2.0.4", [], { adding: true }) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg"), f("report-bg")]) as { problem?: string }).problem,
  (checkImport("2.0.3", [f("report-bg"), ...Array.from({ length: MAX_CHARTS + 1 }, () => f("chart", "image/png", 10))]) as { problem?: string }).problem,
], [true, "report", "count", "count"]);
eq("a file served or issued under its kind and place — never the name it came with (often a laboratory's, §4.2)", [servedName("report-bg", 1, "application/pdf", "2.0.3"), servedName("chart", 3, "image/png")], ["report-bg-2.0.3-1.pdf", "chart-3.png"]);
const bytes = new TextEncoder().encode("%PDF-same");
const ed = { source: "uploaded", sha: { file: "" }, file: { analysisVersion: "2.0.3" } } as never;
const sha = (await import("../src/lib/editions.ts")).sha256(bytes);
(ed as { sha: { file: string } }).sha.file = sha;
t("the same bytes under a NEW module version: a new edition — the version an issued report carries (Реш. 68; review)", sameAs({ source: "uploaded", file: { analysisVersion: "2.0.3" }, bytes } as never, ed) && !sameAs({ source: "uploaded", file: { analysisVersion: "2.0.4" }, bytes } as never, ed));
t("every refusal and every kind has its words, both languages", Object.values(IMPORT_PROBLEM_TEXT).every((x) => !!x.bg && !!x.en) && IMPORT_KINDS.every((k) => !!IMPORT_LABEL[k].bg && !!IMPORT_LABEL[k].en));
const imp = (id: string, version: string): AnalysisImport => ({ id, at: "2026-11-21T09:00:00Z", by: "stat@ptsbg.eu", version, files: [{ kind: "report-bg", name: "Доклад ЛАБОРАТОРИЯ ТАЙНА.pdf", mime: "application/pdf", size: 10, sha256: "ab".repeat(32), path: "S/analysis/x/1-report-bg.pdf" }] });
t("the import in force: the latest — nothing replaced", importInForce([imp("a", "2.0.2"), imp("b", "2.0.3")])?.version === "2.0.3" && importInForce(undefined) === null);
const coded = JSON.stringify(codedScheme({ analysisImports: [imp("a", "2.0.3")] } as unknown as Scheme));
t("the round export's coded part: the version, each file's kind, size and hash — never its name, storage path or who brought it (§4.2)", coded.includes("2.0.3") && coded.includes("abab") && !coded.includes("ТАЙНА") && !coded.includes("S/analysis") && !coded.includes("stat@ptsbg.eu"));

// the wiring
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fn = act.slice(act.indexOf("export async function importAnalysisAction"), act.indexOf("\n}\n", act.indexOf("export async function importAnalysisAction")));
t("the action: the statistics expert or the scheme manager; while in processing and NOT yet reviewed or approved (Реш. 140), or for a correction once the report is issued (7.4) — both checked again in the lock; each file checked by its bytes; its SHA-256 kept", /await requireOneOf\(\["results\.process", "scheme\.edit"\], schemeId\);/.test(fn) && /const correcting = \(sc: Scheme\) => sc\.status === "report" && !!sc\.reportIssues\?\.length;/.test(fn) && /const reviewed = \(sc: Scheme\) => sc\.status === "processing" && \(/.test(fn) && /if \(!scheme \|\| \(scheme\.status !== "processing" && !correcting\(scheme\)\)\) redirect\(back\("imp=state"\)\)/.test(fn) && /if \(reviewed\(scheme!\)\) redirect\(back\("imp=approved"\)\);/.test(fn) && /if \(cur\.status !== "processing" && !correcting\(cur\)\) \{ outcome = "moved"; return \{\}; \}/.test(fn) && /if \(reviewed\(cur\)\) \{ outcome = "approved"; return \{\}; \}/.test(fn) && /real: magicMatches\(bytes, o\.file\.type\)/.test(fn) && /sha256: sha256\(r\.bytes\)/.test(fn));
t("…recorded (appended — nothing replaced); the BG report the scheme's report file under a neutral name, stamped with the version and the import (Реш. 68); what it replaces kept (0.9); an addition leaves the report as it is", /analysisImports: \[\.\.\.\(cur\.analysisImports \?\? \[\]\), entry\]/.test(fn) && /name: servedName\("report-bg", bgAt \+ 1, bg\.mime, version\)/.test(fn) && /analysisVersion: version, importId: id/.test(fn) && /\.\.\.supersede\(cur, "upload:report", cur\.uploads\?\.report, "replaced", by\)/.test(fn) && /\.\.\.\(report \? \{ uploads:/.test(fn));
t("…not recorded (a storage failure, the scheme moved on, a write that failed): what reached storage removed again, the answer true — never «imported»", /if \(!ok\) \{ await cleanUp\(\); redirect\(back\("imp=failed"\)\); \}/.test(fn) && /if \(outcome !== "recorded"\) \{ await cleanUp\(\);/.test(fn) && /\} catch \{ outcome = "gone"; \}/.test(fn));
t("…journalled by kind and count — never a file name", /logActivity\("results\.imported_2_0"/.test(fn) && !/summary: [^\n]*\.name/.test(fn) && /after: \{ version, counts, adding: !report \}/.test(fn));
const route = readFileSync(new URL("../src/app/schemes/[id]/analysis-import/[importId]/[n]/route.ts", import.meta.url), "utf8");
t("the files: served to who reads, enters or processes the results or edits the scheme — by the import and its place, as they came, under a neutral name; each opening journalled", /await requireStaff\(\);/.test(route) && /await requireOneOf\(\["results\.read", "results\.enter", "results\.process", "scheme\.edit"\], id\);/.test(route) && /name: servedName\(f\.kind, Number\(n\), f\.mime, imp!\.version\)/.test(route) && /logActivity\("file\.downloaded"/.test(route));
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/AnalysisImportPanel.tsx", import.meta.url), "utf8"), form = readFileSync(new URL("../src/components/AnalysisImportForm.tsx", import.meta.url), "utf8");
t("the round export carries every imported file as it came (coded/files/analysis/), its version and hash in analysis_imports.csv; the version in editions.csv (review)", /coded\/files\/analysis\/\$\{imp\.id\}\/\$\{i \+ 1\}-\$\{f\.kind\}/.test(exp) && /addCoded\("coded\/analysis_imports\.csv"/.test(exp) && /analysisVersion: e\.file\?\.analysisVersion/.test(exp));
t("the panel: every import's files reachable; no encType on a server action's form; a set above 15 MB stopped in the browser with the action's own words", /imports\.slice\(0, -1\)\.reverse\(\)\.map\(\(x\) => <li key=\{x\.id\} data-import-earlier-item/.test(panel) && !/encType/.test(panel + form) && /if \(total\(e\.currentTarget\) > max\) \{ e\.preventDefault\(\);/.test(form));

console.log(`analysis-import.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
