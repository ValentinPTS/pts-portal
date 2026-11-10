// Plan part 7.9 — the ILC comparison report: named as one; 2.0's, or uploaded by hand (an ILC only).
import { readFileSync } from "node:fs";
import { isIlc, reportWords, handReport, handAfterApproval, handProblem, issueReason, labReport, type ReportIssue } from "../src/lib/report-issue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq("…a scheme stored before 3.1 with an old ILC number («PTS 25/08-NA-1», А8) is one too; a PT's kind never read otherwise", [isIlc({ number: "PTS 25/08-NA-1" }), isIlc({ number: "PTS 25/08-NA-1", kind: "PTS" }), isIlc({ number: "PTS 26/11-T-2" })], [true, false, false]);
eq("an ILC is its kind; its report is the comparison report — never a PT's final report", [isIlc({ kind: "ILC" }), isIlc({ kind: "PTS" }), isIlc({}), reportWords({ kind: "ILC" }).name.bg, reportWords({ kind: "PTS" }).name.bg, reportWords({ kind: "ILC" }).of.en], [true, false, false, "Доклад от междулабораторното сравнение", "Окончателен доклад", "of the ILC comparison report"]);
const up = { path: "p/1", uploadedAt: "2026-12-01T10:00:00Z" };
eq("a hand report: an ILC's uploaded file in force — not an import, not the built one; never a PT's", [
  handReport({ kind: "ILC", uploads: { report: up }, docActive: { report: "uploaded" } }),
  handReport({ kind: "ILC", uploads: { report: { ...up, importId: "i1" } }, docActive: { report: "uploaded" } }),
  handReport({ kind: "ILC", uploads: { report: up }, docActive: { report: "built" } }),
  handReport({ kind: "ILC" }),
  handReport({ kind: "PTS", uploads: { report: up }, docActive: { report: "uploaded" } }),
], [true, false, false, false, false]);
eq("…uploaded after the approval (stage 16): not the report approved", [
  handAfterApproval({ uploads: { report: up }, lifecycle: { stages: { "16": { at: "2026-12-01T11:00:00Z" } } } }),
  handAfterApproval({ uploads: { report: up }, lifecycle: { stages: { "16": { at: "2026-12-01T09:00:00Z" } } } }),
  handAfterApproval({ uploads: { report: up } }),
  handAfterApproval({ uploads: { report: { path: "p" } }, lifecycle: { stages: { "16": { at: "2026-12-01T11:00:00Z" } } } }),
], [false, true, false, true]);
const lock = (id: string, at: string) => ({ id, kind: "lock" as const, at, roundAt: at, by: "m", entries: [] });
const base = { submissionLocks: [lock("L1", "2026-12-01T08:00:00Z")], uploads: { report: { ...up, sha256: "H1" } }, lifecycle: { stages: { "16": { at: "2026-12-01T11:00:00Z" } } }, analysisImports: [{ files: [{ sha256: "H2" }] }] };
eq("the hand report of THIS processing (review): after the lock in force, approved after it, no correction after the upload, uploaded before the approval, never 2.0's own file", [
  handProblem(base, null),
  handProblem({ ...base, submissionLocks: [] }, null),
  handProblem({ ...base, submissionLocks: [lock("L1", "2026-12-01T08:00:00Z"), { id: "R", kind: "reopen" as const, at: "2026-12-01T12:00:00Z", by: "m", note: "x" }, lock("L2", "2026-12-01T13:00:00Z")] }, null),
  handProblem(base, "2026-12-01T10:30:00Z"),
  handProblem(base, "2026-12-01T09:30:00Z"),
  handProblem({ ...base, lifecycle: { stages: { "16": { at: "2026-12-01T09:00:00Z" } } } }, null),
  handProblem(base, null, "H2"),
], [null, "hand-relocked", "hand-relocked", "hand-corrected", null, "after-approval", "is-2.0"]);
t("the edition's reason names it as the comparison report — never the PT's act, never ISO/IEC 17043; one uploaded by hand says it has no module version", /^Докладът от междулабораторното сравнение R1 — издаден с акта за издаване \(част 7\.4, 7\.9\); качен на ръка — без версия на модул\.$/.test(issueReason(1, "", "issue", "", "", true)) && /^Поправка R2 на доклада от междулабораторното сравнение \(част 7\.4, 7\.9\) .* качен на ръка/.test(issueReason(2, "", "correction", "грешка", "Таблица 2", true)) && !/17043/.test(issueReason(2, "", "correction", "грешка", "Таблица 2", true)) && /^Окончателният доклад R1 .*PTS_Analysis 2\.0\.3\.$/.test(issueReason(1, "2.0.3", "issue", "", "")));
const sw = { releases: [], configVersion: null, templates: [], gateTexts: "—", analysisVersions: [] };
const R1: ReportIssue = { id: "x", r: 1, kind: "issue", editionId: "e", editionNo: 1, at: "a", by: "m", day: "d", reason: "", scope: "", codes: [], analysisVersion: "", importId: "", reportSha: "S", transferCheckId: "", source: "uploaded", software: sw };
eq("the laboratory's label: R1 alone — no module version for a hand-uploaded report", labReport({ status: "report", reportIssues: [R1], reportAccess: { "126301": { at: "a", by: "m", via: "paid" } } }, "126301").label, "R1");

const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fnOf = (name: string) => { const a = act.indexOf(`export async function ${name}`); return act.slice(a, act.indexOf("\n}\n", a)); };
const life = fnOf("lifecycleActAction");
t("the act: an ILC's hand report — no transfer check, no u(x_pt); the hand rules (the lock, the approval, the corrections, 2.0's files) before, with the file's hash, and in the lock; the R says «uploaded» and the kind; a PT's path unchanged", /const ilcHand = act === "report" && handReport\(scheme\);/.test(life) && /const hp = handProblem\(scheme, lastCorrectionAt\(issueCorr\)\);/.test(life) && /const hp = handProblem\(scheme, lastCorrectionAt\(issueCorr\), handSha\); if \(hp\) return/.test(life) && /if \(act === "report" && !ilcHand\) \{/.test(life) && /transferCheckId: "", source: "uploaded", ilc: true, software: \{ \.\.\.software, reportSource: "uploaded" \}/.test(life) && /const hp = handProblem\(cur, lastCorrectionAt\(issueCorr\), r1\.issue\.reportSha\);\s*if \(hp\) \{ issueRefused = hp; return \{\}; \}/.test(life) && /cur\.uploads\?\.report\?\.path !== scheme\.uploads\?\.report\?\.path/.test(life) && /source: "2\.0", ilc: isIlc\(scheme\)/.test(life) && /source: r1\.issue\.source, sha: r1\.issue\.reportSha/.test(life));
const corr = fnOf("issueReportCorrectionAction");
t("a correction: an ILC's hand report — another file (its hash), no check nor u(x_pt); the same file refused", /const hand = handReport\(s\);/.test(corr) && /if \(hand && fileSha === issueInForce\(s\.reportIssues\)!\.reportSha\) redirect\(back\("ri=same-file"\)\);/.test(corr) && /importId: "", reportSha: fileSha, transferCheckId: "", source: "uploaded" as const/.test(corr) && /f\.sha256 === fileSha\)\)\) redirect\(back\("ri=is-2\.0"\)\);/.test(corr));
const upl = fnOf("uploadSchemeDocAction"), src = fnOf("setDocSourceAction"), save = fnOf("updateSchemeAction");
t("no report slips in under a review or an approval — an upload or a switch, refused in the lock (7.2's rule, review); the report's hash recorded", /if \(reportUnderApproval\(s, docKey\)\) \{ underApproval = true; return \{\}; \}/.test(upl) && /sha256: sha256\(bytes\)/.test(upl) && /if \(reportUnderApproval\(cur, docKey\)\) \{ refused = REPORT_UNDER_APPROVAL; return \{\}; \}/.test(src) && /docKey === "report" && cur\.reportIssues\?\.length/.test(src) && /const reportUnderApproval = \(s: Pick<Scheme, "status" \| "lifecycle">, docKey: string\) =>\s*docKey === "report" && s\.status === "processing" && \(!!s\.lifecycle\?\.stages\?\.\["15"\] \|\| !!s\.lifecycle\?\.stages\?\.\["16"\]\);/.test(act));
t("from processing on, a PT stays a PT and an ILC an ILC — the number nor the select changes the kind (review)", /const kindLocked = \["processing", "report", "closed"\]\.includes\(current\.status\) \|\| !!current\.reportIssues\?\.length;/.test(save) && /schemeMarkers\(\{ number, type: current\.type, \.\.\.markers \}\)\.kind !== schemeMarkers\(\{ number: current\.number, type: current\.type, \.\.\.kept \}\)\.kind/.test(save));
const cert = readFileSync(new URL("../src/lib/docs/certificate.ts", import.meta.url), "utf8");
t("an ILC's certificate never says «изпитване за пригодност» nor «окончателния доклад» (review)", /const ilc = isIlc\(s\);/.test(cert) && /ilc \? L\("participated in the interlaboratory comparison", "участва в междулабораторното сравнение"\)/.test(cert) && /По доклада от междулабораторното сравнение R/.test(cert));
const notices = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
const labP = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/components/ReportIssueCard.tsx", import.meta.url), "utf8");
t("named as the comparison report — in the notices, on the laboratory's pages, on PTS's card", /ilc \? "Докладът от междулабораторното сравнение" : "Окончателният доклад"/.test(notices) && /const words = reportWords\(s\);/.test(labP) && /card\(L\(words\.name\.bg, words\.name\.en\)/.test(labP) && /Издаване на доклада от междулабораторното сравнение/.test(card) && /data-ready-report="hand"/.test(card));

console.log(`ilc-report.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
