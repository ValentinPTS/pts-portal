// Plan part 7.5 — what the laboratory sees of its report after the issue (Реш. 68, 135; D3, D7).
import { readFileSync } from "node:fs";
import { labReportCard } from "../src/lib/lab-report-model.ts";
import type { ReportIssue } from "../src/lib/report-issue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const sw = { releases: [], configVersion: 1, templates: [], gateTexts: "6.8", analysisVersions: ["2.0.3"] };
const issue = (r: number, version: string): ReportIssue => ({ id: `x${r}`, r, kind: r === 1 ? "issue" : "correction", editionId: `ed${r}`, editionNo: r, at: `2026-12-0${r}T10:00:00Z`, by: "m", day: `2026-12-0${r}`, reason: "", scope: "", codes: [], analysisVersion: version, importId: `i${r}`, reportSha: `R${r}`, transferCheckId: `c${r}`, software: sw });
const R1 = issue(1, "2.0.3"), R2 = issue(2, "2.0.4");
const paid = (at: string) => ({ "126301": { at, by: "m", via: "paid" as const } });

eq("not issued: nothing", labReportCard({ status: "processing", reportIssues: [R1] }, "126301").state, "none");
eq("issued, not reached (D7): awaiting its payment — nothing to open", labReportCard({ status: "report", reportIssues: [R1] }, "126301"), { state: "awaiting", current: null, earlier: [], firstOpened: null, nr: false });
eq("reached at R1: R1 with its version and day; not opened yet", labReportCard({ status: "report", reportIssues: [R1], reportAccess: paid(R1.at) }, "126301", { openings: [] }), { state: "reached", current: { r: 1, version: "2.0.3", day: "2026-12-01", editionId: "ed1", correction: false }, earlier: [], firstOpened: null, nr: false });
const c2 = labReportCard({ status: "closed", reportIssues: [R1, R2], reportAccess: paid(R1.at) }, "126301", { openings: [{ editionId: "ed1", at: "2026-12-01T11:00:00Z" }, { editionId: "ed2", at: "2026-12-02T12:00:00Z" }, { editionId: "ed2", at: "2026-12-02T11:00:00Z" }] });
t("after a correction: R2 in force, said as a correction; R1 received earlier, replaced; the first opening of R2", c2.current?.r === 2 && c2.current.correction && c2.current.version === "2.0.4" && JSON.stringify(c2.earlier) === JSON.stringify([{ r: 1, day: "2026-12-01" }]) && c2.firstOpened === "2026-12-02T11:00:00Z");
const late = labReportCard({ status: "report", reportIssues: [R1, R2], reportAccess: paid("2026-12-03T00:00:00Z") }, "126301");
t("reached only after R2 (paid late): R2 in force, a correction, no «replaces» — R1 never received", late.current?.r === 2 && late.current.correction && late.earlier.length === 0);
eq("the R in force when it was reached, as recorded in the lock, decides — not the times (review)", labReportCard({ status: "report", reportIssues: [R1, R2], reportAccess: { "126301": { at: "2026-12-01T12:00:00Z", by: "m", via: "paid", r: 2 } } }, "126301").earlier, []);
eq("…paid before the act — reached at R1 (r recorded)", labReportCard({ status: "report", reportIssues: [R1, R2], reportAccess: { "126301": { at: R1.at, by: "m", via: "paid", r: 1 } } }, "126301").earlier, [{ r: 1, day: "2026-12-01" }]);
eq("a participation that left the round: never «awaiting» — nothing can open it", [labReportCard({ status: "report", reportIssues: [R1] }, "126301", { inFinal: false }).state, labReportCard({ status: "closed", reportIssues: [R1] }, "126301").state], ["none", "awaiting"]);
eq("a scheme issued before 7.4, N/R: its file, said N/R", [labReportCard({ status: "report", uploads: { report: {} } }, "126301", { nr: true }).state, labReportCard({ status: "report", uploads: { report: {} } }, "126301", { nr: true }).nr], ["legacy", true]);
eq("N/R at the lock: said beside the report", labReportCard({ status: "report", reportIssues: [R1], reportAccess: paid(R1.at) }, "126301", { nr: true }).nr, true);
eq("a scheme issued before 7.4 (no R on record): its file, as 3.2 served it", labReportCard({ status: "report", uploads: { report: {} } }, "126301").state, "legacy");

const page = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
t("the card on the participation's page: from the model; the first opening from its own code's journal lines; no score on screen (Реш. 135, D3)", /labReportCard\(s, p\.code, \{ nr: lockNR, inFinal, openings \}\)/.test(page) && /limit: 1, ascending: true, strict: true/.test(page) && /data-lab-report-opened="unread"/.test(page) && /dayTime\(repCard\.firstOpened\)/.test(page) && /const inFinal = inFinalRound\(s, p\);/.test(page) && /data-lab-report=\{repCard\.state\}/.test(page) && /targetCodes: \[p\.code\]/.test(page) && /PTS_Analysis 2\.0 — порталът не ги изчислява/.test(page));
t("the D7 sentence only while the report may still be awaited by it; the legacy file never said to be 2.0's", /const d7Line = inFinal && s\.status !== "not_held" && \(!reported \? true : repCard\.state === "awaiting"\);/.test(page) && /repCard\.state === "legacy" && !repCard\.nr && <span data-lab-report-scores[^>]*>\{L\("Оценките ви са в доклада — порталът не ги изчислява/.test(page));
t("…a replaced R is listed without a link; a correction in fixed words", /data-lab-report-earlier/.test(page) && /Поправка \$\{rLabel\(repCard\.current\.r\)\}/.test(page) && !/\.scope\b/.test(page.slice(page.indexOf("data-lab-report="))));

console.log(`lab-report.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
