// Plan part 7.10 — the round export: the exchange with 2.0 and the issue, as tables (codes only; the words
// PTS's people typed only in identity/ — review) and the file each export handed out.
import { readFileSync } from "node:fs";
import { roundTables, codedScheme, identityScheme, ROUND_BUCKETS, ROUND_TABLES } from "../src/lib/round-export.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const sw = { releases: [{ title: "1.0", ref: "97fb1d3", deployedAt: "2026-11-09T00:00:00Z" }], configVersion: 2, templates: [{ docKey: "plan", no: 2, issuedOn: "2026-11-12" }], gateTexts: "6.8", analysisVersions: ["2.0.3"], reportSource: "2.0" as const };
const s = {
  id: "s1", number: "PTS 26/03-T-1", type: "T", status: "report", parameters: [],
  transferChecks: [{ id: "c1", at: "a", by: "stat@ptsbg.eu", exportId: "e1", importId: "i1", reportSha: "R1", same: false, note: "липсва 126304 — Лаборатория Х" }],
  uxptChecks: [{ id: "u1", at: "b", by: "m@ptsbg.eu", importId: "i1", reportSha: "R1", answer: "exceeded", note: "Плътност — u(x_pt) > 0,3σ" }],
  reportIssues: [{ id: "x1", r: 1, kind: "issue", editionId: "ed1", editionNo: 1, at: "c", by: "m@ptsbg.eu", day: "2026-12-01", reason: "", scope: "", codes: [], analysisVersion: "2.0.3", importId: "i1", reportSha: "R1", transferCheckId: "c1", uxpt: { id: "u1", answer: "exceeded" }, source: "2.0", software: sw },
    { id: "x2", r: 2, kind: "correction", editionId: "ed2", editionNo: 2, at: "d", by: "m@ptsbg.eu", day: "2026-12-02", reason: "Грешна единица", scope: "Таблица 3", codes: ["126302"], analysisVersion: "", importId: "", reportSha: "R2", transferCheckId: "", source: "uploaded", ilc: true, software: { ...sw, reportSource: "uploaded" as const } }],
  reportAccess: { "126302": { at: "e", by: "head@ptsbg.eu", via: "hand", reason: "Държавна институция Х", r: 1 }, "126301": { at: "c", by: "m@ptsbg.eu", via: "paid", r: 1 } },
  analysisExports: [{ id: "e1", at: "f", by: "stat@ptsbg.eu", preliminary: false, lockId: "L1", sha256: "X1", path: "data:application/x;base64,AAAA", codes: ["126301", "126302"], characteristics: ["dens"], results: 2, nr: 0 }],
} as unknown as Scheme;
const tables = Object.fromEntries(roundTables(s, (p) => p).map(([f, rows, cols]) => [f, { rows: rows as Record<string, unknown>[], cols }]));
const text = JSON.stringify(tables);
t("the transfer checks: the export, the import, the report's hash, same or not — never the note", tables["coded/transfer_checks.csv"]?.rows[0]?.same === "no" && tables["coded/transfer_checks.csv"].rows[0].reportSha === "R1" && !text.includes("липсва 126304"));
t("the u(x_pt) confirmations: the report's hash and the answer — never the words", tables["coded/uxpt_checks.csv"]?.rows[0]?.answer === "exceeded" && !text.includes("Плътност — u(x_pt)"));
const ri = tables["coded/report_issues.csv"]?.rows ?? [];
t("the R's: issue and correction, the source, the kind, the version, the check and the confirmation relied on, the codes a correction concerns — never its reason or scope", ri.length === 2 && ri[0].source === "2.0" && ri[0].uxptAnswer === "exceeded" && ri[0].transferCheckId === "c1" && ri[1].source === "uploaded" && ri[1].ilc === "yes" && ri[1].codes === "126302" && !text.includes("Грешна единица") && !text.includes("Таблица 3"));
const ra = tables["coded/report_access.csv"]?.rows ?? [];
t("how the report reached each code — paid or by hand, the R then; never the hand opening's reason nor who", ra.length === 2 && ra[0].code === "126301" && ra[1].via === "hand" && ra[1].r === 1 && !text.includes("Държавна институция") && !("by" in ra[0]));
const swr = tables["coded/software_record.csv"]?.rows ?? [];
t("the software record per R: the releases, the configuration, the templates, the gate texts, the 2.0 versions, the report's source", swr.length === 2 && /1\.0 \(97fb1d3\)/.test(String(swr[0].releases)) && swr[0].configVersion === 2 && /plan №2/.test(String(swr[0].templates)) && swr[1].reportSource === "uploaded");
const coded = JSON.stringify(codedScheme(s));
t("the coded scheme: the exports without where the file is kept (the file itself is in coded/files/analysis/exports/)", !coded.includes("data:application/x") && coded.includes("\"sha256\":\"X1\""));
t("review: the words typed with a check, a confirmation, an R (note, reason, scope) are NOT in the coded scheme — they may name a laboratory", !["липсва 126304", "Плътност — u(x_pt)", "Грешна единица", "Таблица 3", "Държавна институция"].some((x) => coded.includes(x)) && /"same":false/.test(coded) && /"answer":"exceeded"/.test(coded) && /"r":2/.test(coded));
const ident = JSON.stringify(identityScheme(s));
t("…identity/ keeps them whole", ["липсва 126304", "Плътност — u(x_pt)", "Грешна единица", "Таблица 3", "Държавна институция"].every((x) => ident.includes(x)));
t("the analysis exports' bucket is round data", ROUND_BUCKETS.includes("analysis-exports"));
t("review: every new table is listed with the schemes' files — the end-to-end check fails on one left out", ["coded/analysis_imports.csv", "coded/analysis_exports.csv", "coded/transfer_checks.csv", "coded/uxpt_checks.csv", "coded/report_issues.csv", "coded/report_access.csv", "coded/software_record.csv"].every((f) => ROUND_TABLES.schemes.includes(f)));
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/schemes/[id]/export/analysis/route.ts", import.meta.url), "utf8");
t("each handed-out file kept before the record (a file that cannot be kept — nothing handed out), taken back with the record; carried by the round export, checked against its hash", /manifest\.path = await keepExportFile\(id, manifest\.id, bytes\);/.test(route) && route.indexOf("keepExportFile(") < route.indexOf("analysisExports: [...(cur.analysisExports") && /could not be kept on record — so it is not handed out/.test(route) && /coded\/files\/analysis\/exports\/\$\{safe\(e\.id\)\}\.xlsx/.test(exp) && /altered: bytes && sha256\(bytes\) !== e\.sha256 \? "yes" : ""/.test(exp));

t("review: a record write that threw — the file dropped only when the record is not there; the take-back failed — the file stays", /\} catch \{\s*\/\/[^\n]*\n\s*const cur = await getScheme\(id\)\.catch\(\(\) => undefined\);\s*if \(cur && !\(cur\.analysisExports \?\? \[\]\)\.some\(\(x\) => x\.id === manifest\.id\)\) await dropExportFile\(manifest\.path\);/.test(route) && /if \(takenBack && manifest\.path\) await dropExportFile/.test(route) && /if \(!recorded\) await dropExportFile\(manifest\.path\);/.test(route));
t("review: the kept files read through the export's own reader — a storage error stops the export, only «not found» is missing; a few at a time; 2.0's returned files too", /storageBytes\(ANALYSIS_EXPORT_BUCKET, e\.path\)/.test(exp) && /sent\.slice\(i, i \+ 5\)/.test(exp) && /const got = await storageBytes\(SCHEME_DOC_BUCKET, f\.path\);/.test(exp) && !/\.catch\(\(\) => null\)/.test(exp));
const store = readFileSync(new URL("../src/lib/analysis-export-store.ts", import.meta.url), "utf8");
const sys = readFileSync(new URL("../src/lib/system-check.ts", import.meta.url), "utf8");
t("review: the bucket made public by hand — refused; watched by the system check; checked once per instance; a removal that fails is logged", /if \(bucket\?\.public\) throw new Error/.test(store) && /bucketReady \?\?=/.test(store) && /if \(error\) console\.error\(`\[analysis export\] a file not handed out could not be removed/.test(store) && /DECLARATION_BUCKET, ENTITY_PROOF_BUCKET, ANALYSIS_EXPORT_BUCKET\]/.test(sys));

console.log(`round-export-phase7.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
