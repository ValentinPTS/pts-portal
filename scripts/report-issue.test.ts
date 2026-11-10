// Plan part 7.4 — the issue act, R1/R2…, who received which, D7's access, the software record.
import { readFileSync } from "node:fs";
import { transferProblem, correctionProblem, readCorrection, accessAtIssue, receivedIssues, reaches, readHandOpen, inScope, recipients, rOfNotice, softwareRecord, issueReason, rLabel, issueInForce, labReport, ISSUE_PROBLEM_TEXT, type ReportIssue } from "../src/lib/report-issue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the issue's conditions ─────────────────────────────────────────────────
const check = (same: boolean) => ({ id: "c1", at: "a", by: "b", exportId: "e1", importId: "i1", reportSha: "R1", same, note: same ? "" : "липсва 126304" });
eq("the issue: 2.0's report (said first — a report by hand, whatever the export), its transfer check in force «the same» — else refused, each with its words", [
  transferProblem({ state: "ok", check: check(true) }),
  transferProblem({ state: "ok", check: check(false) }),
  transferProblem({ state: "none", check: null }),
  transferProblem({ state: "no-report", check: null }),
  transferProblem({ state: "preliminary", check: null }),
  transferProblem({ state: "relocked", check: null }),
  transferProblem({ state: "corrected", check: null }),
  transferProblem({ state: "no-export", check: null }),
  transferProblem(null),
  transferProblem({ state: "no-export", check: null }, false),
  transferProblem({ state: "ok", check: check(true) }, false),
], [null, "check-differs", "no-check", "not-2.0", "check-old", "check-old", "check-old", "no-export", "unread", "not-2.0", "not-2.0"]);
t("every refusal has its words, both languages", Object.values(ISSUE_PROBLEM_TEXT).every((x) => !!x.bg && !!x.en));

// ── R1, R2… ─────────────────────────────────────────────────────────────────
const sw = { releases: [], configVersion: 1, templates: [], gateTexts: "6.8", analysisVersions: ["2.0.3"] };
const issue = (r: number, o: Partial<ReportIssue> = {}): ReportIssue => ({ id: `x${r}`, r, kind: r === 1 ? "issue" : "correction", editionId: `ed${r}`, editionNo: r + 1, at: `2026-12-0${r}T10:00:00Z`, by: "m@ptsbg.eu", day: `2026-12-0${r}`, reason: "", scope: "", codes: [], analysisVersion: "2.0.3", importId: `i${r}`, reportSha: `R${r}`, transferCheckId: `c${r}`, software: sw, ...o });
eq("R labels; the R in force is the latest", [rLabel(1), rLabel(2), issueInForce([issue(1), issue(2)])?.r, issueInForce([]), issueInForce(undefined)], ["R1", "R2", 2, null, null]);
eq("a correction: R1 on record, another file, its check «the same»", [
  correctionProblem([], { state: "ok", check: check(true), reportSha: "R9" }),
  correctionProblem([issue(1)], { state: "ok", check: check(true), reportSha: "R1" }),
  correctionProblem([issue(1)], { state: "ok", check: check(true), reportSha: "R9" }),
  correctionProblem([issue(1)], { state: "none", check: null, reportSha: "R9" }),
  correctionProblem([issue(1)], { state: "no-report", check: null }),
], ["not-issued", "same-file", null, "no-check", "not-2.0"]);
eq("…its reason and what changed, in words; the codes — participations in the scheme (none: all)", [
  readCorrection({ reason: "грешна единица", scope: "Таблица 3, kg/m³", codes: "126301, 126302" }, ["126301", "126302", "126303"]),
  readCorrection({ reason: "грешна единица", scope: "Таблица 3", codes: "" }, ["126301"]),
  readCorrection({ reason: "абв", scope: "Таблица 3", codes: "" }, []),
  readCorrection({ reason: "грешна единица", scope: "т.3", codes: "" }, []),
  readCorrection({ reason: "грешна единица", scope: "Таблица 3", codes: "126399" }, ["126301"]),
  readCorrection({ reason: "я".repeat(401), scope: "Таблица 3", codes: "" }, []),
  readCorrection({ reason: "грешна единица", scope: "я".repeat(401), codes: "" }, []),
].map((r) => (r.ok ? r.codes.join("|") || "all" : r.problem)), ["126301|126302", "all", "reason", "scope", "codes", "too-long", "too-long"]);
t("…the longest correction still fits the edition's reason (1000)", [...issueReason(9, "2.0.10-rc1", "correction", "я".repeat(400), "я".repeat(400))].length <= 1000);
t("the edition's reason: R1 named with the act and the version; a correction identified as amended, with the reason and what changed", /Окончателният доклад R1 — издаден с акта/.test(issueReason(1, "2.0.3", "issue", "", "")) && /PTS_Analysis 2\.0\.3/.test(issueReason(1, "2.0.3", "issue", "", "")) && /^Поправка R2 на окончателния доклад .*§7\.4\.3\) — грешна единица\. Поправено: Таблица 3\. PTS_Analysis 2\.0\.4\.$/.test(issueReason(2, "2.0.4", "correction", "грешна единица", "Таблица 3")));

// ── D7: the report reaches a participation marked paid, or opened by hand ───
eq("at the act: those marked paid then — never twice", accessAtIssue({ "126301": "2026-11-01T00:00:00Z", "126303": "2026-11-02T00:00:00Z" }, ["126301", "126302", "126303"], { "126303": { at: "z", by: "m", via: "hand", reason: "държавна институция" } }, "2026-12-01T10:00:00Z", "m@ptsbg.eu"), { "126301": { at: "2026-12-01T10:00:00Z", by: "m@ptsbg.eu", via: "paid" } });
t("reaches: only what is on record", reaches({ "126301": { at: "a", by: "b", via: "paid" } }, "126301") && !reaches({}, "126301") && !reaches(undefined, "126301"));
eq("a hand opening needs its reason", [readHandOpen({ reason: "Държавна институция — по договор" }).ok, readHandOpen({ reason: "аб" }).ok], [true, false]);

// ── who received which ──────────────────────────────────────────────────────
const R1 = issue(1), R2 = issue(2, { codes: ["126302"] }), R3 = issue(3, { codes: [] });
t("in scope: an issue — all; a correction — its codes, or all", inScope(R1, "126301") && !inScope(R2, "126301") && inScope(R2, "126302") && inScope(R3, "126301"));
eq("the R a notice names, from its own words — a certificate's names none", [rOfNotice("Окончателният доклад (R1) за схема 26/03-T-1 е издаден."), rOfNotice("Издадена е поправка R2 на окончателния доклад"), rOfNotice("Сертификатът ви за схема 26/03-T-1 е издаден")], [1, 2, null]);
const rows = recipients({
  codes: ["126301", "126302", "126303"],
  access: { "126301": { at: R1.at, by: "m", via: "paid" }, "126302": { at: "2026-12-01T12:00:00Z", by: "m", via: "hand", reason: "държавна" } },
  issues: [R1, R2, R3],
  openings: [{ code: "126301", editionId: "ed1", at: "2026-12-01T11:00:00Z" }, { code: "126302", editionId: "ed2", at: "2026-12-02T11:00:00Z" }, { code: "126301", editionId: "other", at: "2026-12-02T11:00:00Z" }, { code: "126301", editionId: "ed1", at: "2026-12-01T10:30:00Z" }],
  notices: [{ code: "126301", bg: "Окончателният доклад (R1) за схема X е издаден.", at: R1.at }, { code: "126301", bg: "Издадена е поправка R3 на окончателния доклад", at: R3.at }, { code: "126301", bg: "Сертификатът ви е издаден", at: R3.at }],
});
t("…each R opened once — its first opening", rows[0].opened.length === 1 && rows[0].opened[0].at === "2026-12-01T10:30:00Z");
eq("who received which: every R from the one in force when it was reached; told — the notices raised (none: nobody to tell); opened — the journal; not reached — nothing", rows.map((r) => [r.code, r.access?.via ?? "-", r.received.map((x) => x.r).join(","), r.told.map((x) => x.r).join(","), r.opened.map((x) => x.r).join(",")]), [["126301", "paid", "1,2,3", "1,3", "1"], ["126302", "hand", "1,2,3", "", "2"], ["126303", "-", "", "", ""]]);
eq("the R's received: from the R recorded in the lock, else by the times", [receivedIssues([R1, R2, R3], { at: R1.at, by: "m", via: "paid", r: 2 }).map((i) => i.r), receivedIssues([R1, R2, R3], { at: R2.at, by: "m", via: "hand" }).map((i) => i.r), receivedIssues([R1], null).length], [[2, 3], [2, 3], 0]);
eq("at the act: the R recorded with the access", accessAtIssue({ "126301": "x" }, ["126301"], {}, "a", "m", 1), { "126301": { at: "a", by: "m", via: "paid", r: 1 } });
eq("…paid after R2: received the R in force then (R2), then R3", recipients({ codes: ["126301"], access: { "126301": { at: "2026-12-02T12:00:00Z", by: "m", via: "paid" } }, issues: [R1, R2, R3] })[0].received.map((x) => x.r), [2, 3]);

eq("the laboratory's own view: not yet; the R in force with its version once it reaches it; awaiting its payment; a scheme issued before 7.4 — its file", [
  labReport({ status: "processing", reportIssues: [R1] }, "126301").state,
  labReport({ status: "report", reportIssues: [R1, R2], reportAccess: { "126301": { at: "a", by: "b", via: "paid" } } }, "126301"),
  labReport({ status: "report", reportIssues: [R1] }, "126302").state,
  labReport({ status: "closed", uploads: { report: {} } }, "126302").state,
  labReport({ status: "report" }, "126302").state,
  labReport({ status: "report", reportIssues: [R1] }, "126302", false).state,
], ["none", { state: "issued", label: "R2 · PTS_Analysis 2.0.3" }, "awaiting", "issued", "none", "none"]);

// ── the software record ─────────────────────────────────────────────────────
const changes = [
  { kind: "release", title: "0.9", deployedAt: "2026-09-01T00:00:00Z" },
  { kind: "release", title: "1.0", ref: "97fb1d3", deployedAt: "2026-11-09T00:00:00Z" },
  { kind: "release", title: "1.1", deployedAt: "2026-11-20T00:00:00Z" },
  { kind: "release", title: "1.2 (later)", deployedAt: "2026-12-20T00:00:00Z" },
  { kind: "release", title: "proposed", deployedAt: undefined },
  { kind: "setting", title: "reminder text", deployedAt: "2026-11-15T00:00:00Z" },
];
const rec = softwareRecord({
  changes, roundStart: "2026-11-10T00:00:00Z", at: "2026-12-01T10:00:00Z",
  configVersions: [{ no: 1, at: "2026-11-01T00:00:00Z" }, { no: 2, at: "2026-11-11T00:00:00Z" }, { no: 3, at: "2026-12-05T00:00:00Z" }],
  editions: [{ docKey: "plan", no: 1, issuedOn: "2026-11-10", issuedAt: "2026-11-10T00:00:00Z" }, { docKey: "plan", no: 2, issuedOn: "2026-11-12", issuedAt: "2026-11-12T00:00:00Z" }, { docKey: "instructions", no: 1, issuedOn: "2026-11-11", issuedAt: "2026-11-11T00:00:00Z" }, { docKey: "report", no: 1, issuedOn: "2026-12-01", issuedAt: "2026-12-01T09:00:00Z" }, { docKey: "plan", no: 3, issuedOn: "2026-12-02", issuedAt: "2026-12-02T00:00:00Z" }],
  gateTexts: "6.8", reportVersion: "2.0.3", imports: [{ version: "2.0.2" }, { version: "2.0.3" }],
});
eq("the releases in force during the round: the one when it began, every one since — up to the issue; never a proposal or a setting", rec.releases.map((r) => r.title), ["1.0", "1.1"]);
eq("…the configuration version in force; the template editions by then (never the report's own); the gate texts; the 2.0 versions (the report's first)", [rec.configVersion, rec.templates, rec.gateTexts, rec.analysisVersions], [2, [{ docKey: "instructions", no: 1, issuedOn: "2026-11-11" }, { docKey: "plan", no: 2, issuedOn: "2026-11-12" }], "6.8", ["2.0.3", "2.0.2"]]);
eq("…a round with no opening on record: every release up to the issue in force then — the last", softwareRecord({ changes, roundStart: null, at: "2026-12-01T10:00:00Z", gateTexts: "6.8", reportVersion: "2.0.3" }).releases.map((r) => r.title), ["1.1"]);

// ── the wiring ──────────────────────────────────────────────────────────────
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fnOf = (name: string) => { const a = act.indexOf(`export async function ${name}`); return act.slice(a, act.indexOf("\n}\n", a)); };
const life = fnOf("lifecycleActAction");
t("the act: the scheme manager's; 2.0's report and its check «the same» — read before, and again in the lock", /await requireCap\("scheme\.edit", schemeId\);/.test(life) && /issueNow = schemeTransferState\(scheme, issueCorr\);\s*const p = transferProblem\(issueNow, !!reportInForce\(/.test(life) && /if \(act === "report"\) \{ try \{ issueCorr = await listCorrections\(schemeId\); \} catch \{ return \{ error: NOT_REACHED \}; \} \}\s*const at = /.test(life) && /const again = schemeTransferState\(cur, issueCorr\);[\s\S]{0,200}again\.reportSha !== r1\.issue\.reportSha \|\| again\.check\?\.id !== r1\.issue\.transferCheckId \|\| uxptInForce\(cur\.uxptChecks, again\.reportSha, again\.importId\)\?\.id !== r1\.issue\.uxpt\?\.id\) \{ issueRefused = p \?\? "stale"; return \{\}; \}/.test(life));
t("…R1: the edition of exactly the file the check names; the software record; the access of those marked paid (D7)", /\(!ilcHand && sha256\(frozen\.bytes\) !== issueNow!\.reportSha\)\) return \{ error: ISSUE_REFUSAL\.stale \}/.test(life) && /transferCheckId: issueNow!\.check!\.id, uxpt: \{ id: issueUx!\.id, answer: issueUx!\.answer \}, source: "2\.0", ilc: isIlc\(scheme\), software: \{ \.\.\.software, reportSource: "2\.0" \}/.test(life) && /const access = accessAtIssue\(cur\.paidAt, parts\.filter\(\(x\) => inFinalRound\(cur, x\)\)\.map\(\(x\) => x\.code\), cur\.reportAccess, at, by, r1\.issue\.r\);/.test(life) && /latest\.reason === reasonNow && \(await servable\(latest\)\)\) edition = latest;/.test(life) && /listReleases\(\)/.test(life) && /gateTexts: gateB\(\) \? GATE_TEXTS_VERSION : "—"/.test(life) && /reportIssues: \[\.\.\.\(cur\.reportIssues \?\? \[\]\), \{ \.\.\.r1\.issue, at, by, day \}\]/.test(life));
t("…journalled with the version and the check relied on; only those it reaches are told", /logActivity\("report\.issued"/.test(life) && /\$\{isIlc\(scheme\) \? "ILC comparison report" : "Final report"\} \$\{rLabel\(r1\.issue\.r\)\} issued — /.test(life) && /PTS_Analysis \$\{r1\.issue\.analysisVersion\}/.test(life) && /if \(act === "report" && reachedNow\.has\(p\.code\)\) await notifyReportPublished/.test(life));
const paidFn = fnOf("setParticipantPaidAction");
t("payment marked after the issue: the report reaches it then and it is told; unmarking never takes it back", /const mayReach = paid && inFinalRound\(scheme, part\) && !scheme\.reportAccess\?\.\[code\] && \["processing", "report", "closed"\]\.includes\(scheme\.status\);/.test(paidFn) && /catch \{ return \{ error: NOT_REACHED \}; \}/.test(paidFn) && /if \(mayReach && issuedNow\(s\) && inFinalRound\(s, part\) && !s\.reportAccess\?\.\[code\]\) \{/.test(paidFn) && /via: "paid" as const, \.\.\.\(reached \? \{ r: \(reached as ReportIssue\)\.r \} : \{\}\)/.test(paidFn) && /logActivity\("report\.access"/.test(paidFn) && /await notifyReportPublished\(labId, schemeId, scheme\.number, code, rLabel\(r\.r\), isIlc\(scheme\)\)/.test(paidFn) && !/delete .*reportAccess/.test(paidFn));
const hand = fnOf("openReportByHandAction");
t("a hand opening: the scheme manager; issued; a participation in the round; its reason kept — NOT in the journal; told", /await requireCap\("scheme\.edit", schemeId\);/.test(hand) && /readHandOpen\(/.test(hand) && /\.filter\(\(p\) => inFinalRound\(scheme!, p\)\)\.find\(\(p\) => p\.code === code\)/.test(hand) && /try \{ labId = \(await labIdsFor\(schemeId, \[part!\], by\)\)\.get\(code\); \} catch \{ redirect\(back\("ri=failed"\)\); \}/.test(hand) && /via: "hand" as const, reason, \.\.\.\(r \? \{ r: \(r as ReportIssue\)\.r \} : \{\}\)/.test(hand) && /logActivity\("report\.access"/.test(hand) && !/logActivity\("report\.access"[^;]*reason\b(?!s)/.test(hand.replace(/with its reason/g, "")) && /notifyReportPublished\(labId/.test(hand));
const corr = fnOf("issueReportCorrectionAction");
t("a correction: the scheme manager; while issued; its reason, scope and codes; another 2.0 file, its check «the same» — again in the lock", /await requireCap\("scheme\.edit", schemeId\);/.test(corr) && /readReportCorrection\(/.test(corr) && /const problem = correctionProblem\(s\.reportIssues, now, !!reportInForce\(/.test(corr) && /ps\.filter\(\(p\) => inFinalRound\(s, p\)\)/.test(corr) && /\(cur\.reportIssues\?\.length \?\? 0\) !== n/.test(corr) && /correctionProblem\(cur\.reportIssues, again\)/.test(corr) && /kind: "correction"/.test(corr));
t("…its edition identified as amended (the reason and the scope); those it reaches AND concerns are told; journalled without the words", /const reasonNow = issueReason\(nextR, version, "correction", reason, scope, isIlc\(s\)\);/.test(corr) && /reason: reasonNow, scope/.test(corr) && /latest\.reason === reasonNow/.test(corr) && /try \{ corr = await listCorrections\(schemeId\); \} catch/.test(corr) && /await notifyReportCorrected\(labOf\.get\(p\.code\), schemeId, s\.number, p\.code, rLabel\(nextR\), isIlc\(s\)\);/.test(corr) && /parts\.filter\(\(p\) => reaches\(s\.reportAccess, p\.code\) && inScope\(\{ kind: "correction", codes \}, p\.code\)\)/.test(corr) && /logActivity\("report\.corrected"/.test(corr) && /after: \{ r: nextR, edition: edition\.no, source: issue\.source, sha: issue\.reportSha, ilc: issue\.ilc, version, check: issue\.transferCheckId, uxpt: issue\.uxpt, codes, told:/.test(corr));
const ed = fnOf("issueEditionAction");
const rm = fnOf("removeSchemeDocUploadAction");
const fix65 = fnOf("recordCorrectionAction");
const notices = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
t("«Редакции»: the issued report goes out only by its acts; its file is never removed; no 6.5 correction after the approval", /if \(docKey === "report" && scheme\.reportIssues\?\.length\) return \{ error:/.test(ed) && /if \(issuedReport\(scheme\)\) return \{ error:/.test(rm) && /if \(issuedReport\(s\)\) \{ kept = true; return \{\}; \}/.test(rm) && /if \(scheme!\.lifecycle\?\.stages\?\.\["16"\]\) redirect\(back\("corr=approved"\)\);/.test(fix65));
t("the correction notice: fixed words — never PTS's typed scope", /export async function notifyReportCorrected\(labId: string \| undefined, schemeId: string, schemeNumber: string, code: string, label: string, ilc = false\)/.test(notices) && !/scopeBg/.test(notices));
const lab = readFileSync(new URL("../src/app/lab/doc/[scheme]/[doc]/route.ts", import.meta.url), "utf8");
t("the laboratory: the R in force — never a later edition — and only once it reaches it (403 before); an issued R stays official whatever the uploads slot holds", /officialReport: !!scheme\.uploads\?\.report \|\| !!issueInForce\(scheme\.reportIssues\)/.test(lab) && /const inForce = issueInForce\(scheme\.reportIssues\);/.test(lab) && /if \(!reaches\(scheme\.reportAccess, mine\.code\)\) return \{ res: new Response\(`\$\{reportWords\(scheme\)\.the\.en\} is issued — it opens for you once your payment is marked\.`, \{ status: 403 \}\) \};/.test(lab) && /getEdition\(inForce\.editionId\)/.test(lab));
const page = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the card on the scheme's page; the import and the check also for a correction; the records in the round export — the hand opening's words never in coded/", /<ReportIssueCard schemeId=\{id\}/.test(page) && /s\.status === "processing" \|\| \(s\.status === "report" && !!s\.reportIssues\?\.length\)/.test(page) && /reportIssues: "coded", reportAccess: "split"/.test(exp) && /case "reportAccess": out\[k\] = mapValues\(s\.reportAccess, \(\{ reason: _r, by: _b, \.\.\.a \}\) => a\)/.test(exp));
const labPage = readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8");
const labP = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
t("the laboratory's pages: the R and the 2.0 version; awaiting its payment — said", /labReport\(scheme, p\.code, inFinalRound\(scheme, p\)\)/.test(labPage) && /data-report-awaiting/.test(labPage) && /const rep = labReport\(s, p\.code, inFinal\);/.test(labP) && /data-report-awaiting/.test(labP));

console.log(`report-issue.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
