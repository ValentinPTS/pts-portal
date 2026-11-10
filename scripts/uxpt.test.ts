// Plan part 7.6 — the u(x_pt) ≤ 0.3·σ_pt confirmation (К16; D3), required by the issue act and each correction.
import { readFileSync } from "node:fs";
import { readUxpt, uxptInForce, answersFor, UXPT_ANSWER_TEXT, type UxptCheck } from "../src/lib/uxpt-model.ts";
import { ISSUE_PROBLEM_TEXT } from "../src/lib/report-issue-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq("the answer: met (no words needed); not for all and not applicable — with their words; nothing else", [
  readUxpt({ answer: "met", note: "" }, "T"),
  readUxpt({ answer: "exceeded", note: "Характеристика 3 — плътност" }, "T"),
  readUxpt({ answer: "exceeded", note: "х3" }, "T"),
  readUxpt({ answer: "na", note: "Калибриране — Eₙ, няма σ_pt" }, "C"),
  readUxpt({ answer: "na", note: "" }, "C"),
  readUxpt({ answer: "maybe", note: "нещо" }, "T"),
].map((r) => (r.ok ? r.answer : r.problem)), ["met", "exceeded", "uxpt-note", "na", "uxpt-note", "uxpt-answer"]);
eq("…bound to the scheme: a testing scheme — met or not for all, never «not applicable»; a calibration scheme (Eₙ) — only «not applicable» (review)", [answersFor("T"), answersFor("C"), readUxpt({ answer: "na", note: "няма σ_pt тук" }, "T").ok, readUxpt({ answer: "met", note: "" }, "C").ok], [["met", "exceeded"], ["na"], false, false]);
const c = (id: string, sha: string, at: string): UxptCheck => ({ id, at, by: "m@ptsbg.eu", importId: "i", reportSha: sha, answer: "met", note: "" });
const checks = [c("u1", "R1", "a"), c("u2", "R1", "b"), c("u3", "R2", "c")];
eq("in force: the latest for the report in force (its hash) — another report, none", [uxptInForce(checks, "R1")?.id, uxptInForce(checks, "R2")?.id, uxptInForce(checks, "R9"), uxptInForce(checks, null), uxptInForce(undefined, "R1")], ["u2", "u3", null, null, null]);
eq("…and its import, as the transfer check: a re-import of the same bytes is read again (review)", [uxptInForce(checks, "R1", "i")?.id, uxptInForce(checks, "R1", "i2")], ["u2", null]);
t("every answer and refusal has its words, both languages", Object.values(UXPT_ANSWER_TEXT).every((x) => !!x.bg && !!x.en) && ["no-uxpt", "uxpt-answer", "uxpt-note"].every((k) => !!(ISSUE_PROBLEM_TEXT as Record<string, { bg: string }>)[k]?.bg));

const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const fnOf = (name: string) => { const a = act.indexOf(`export async function ${name}`); return act.slice(a, act.indexOf("\n}\n", a)); };
const rec = fnOf("recordUxptAction");
t("the confirmation: the scheme manager's; in processing, or — once issued — only for a corrected file; an answer its scheme may give; from 2.0's report in force, by its hash — again in the lock; journalled without the words; taken back if the journal fails", /await requireCap\("scheme\.edit", schemeId\);/.test(rec) && /const open = \(sc: Scheme\) => sc\.status === "processing" \|\| \(sc\.status === "report" && !!sc\.reportIssues\?\.length && twoOf\(sc\)\?\.sha !== sc\.reportIssues\.at\(-1\)!\.reportSha\);/.test(rec) && /readUxpt\(\{ answer: formData\.get\("answer"\), note: formData\.get\("note"\) \}, scheme!\.type\)/.test(rec) && /if \(two!\.sha !== reportSha\) redirect\(back\("ri=stale"\)\);/.test(rec) && /if \(twoOf\(cur\)\?\.sha !== reportSha\) \{ outcome = "stale"; return \{\}; \}/.test(rec) && /after: \{ answer: value\.answer, reportSha \}/.test(rec) && !/after: \{[^}]*note/.test(rec) && /uxptChecks: \(cur\.uxptChecks \?\? \[\]\)\.filter\(\(x\) => x\.id !== entry\.id\)/.test(rec) && /if \(\(cur\.reportIssues \?\? \[\]\)\.some\(\(i\) => i\.uxpt\?\.id === entry\.id\)\)/.test(rec));
const life = fnOf("lifecycleActAction");
t("the issue act requires it — read before and again in the lock; R1 records it", /issueUx = uxptInForce\(scheme\.uxptChecks, issueNow\.reportSha, issueNow\.importId\);\s*if \(!issueUx\) return \{ error: ISSUE_REFUSAL\["no-uxpt"\] \};/.test(life) && /uxptInForce\(cur\.uxptChecks, again\.reportSha, again\.importId\)\?\.id !== r1\.issue\.uxpt\?\.id/.test(life) && /u\(x_pt\): \$\{r1\.issue\.uxpt\?\.answer\}/.test(life) && /uxpt: r1\.issue\.uxpt, reached:/.test(life) && /uxpt: \{ id: issueUx!\.id, answer: issueUx!\.answer \}/.test(life));
const corr = fnOf("issueReportCorrectionAction");
t("each correction requires its own — from the corrected report; again in the lock; the R records it", /const ux = uxptInForce\(s\.uxptChecks, now\.reportSha, now\.importId\);\s*if \(!ux\) redirect\(back\("ri=no-uxpt"\)\);/.test(corr) && /uxptInForce\(cur\.uxptChecks, again\.reportSha, again\.importId\)\?\.id !== ux!\.id/.test(corr) && /uxpt: issue\.uxpt, codes,/.test(corr) && /uxpt: \{ id: ux!\.id, answer: ux!\.answer \}/.test(corr));
const card = readFileSync(new URL("../src/components/ReportIssueCard.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/schemes/[id]/page.tsx", import.meta.url), "utf8");
const exp = readFileSync(new URL("../src/lib/round-export.ts", import.meta.url), "utf8");
t("the card: in the readiness list, the form with the report's hash, beside each R; the page: in force by the report's hash, a correction needs its own; in the round export", /data-ready-uxpt=/.test(card) && /name="reportSha" value=\{uxpt\.reportSha\}/.test(card) && /data-issue-uxpt=/.test(card) && /uxptInForce\(s\.uxptChecks, inForceReport\?\.sha, inForceReport\?\.importId\)/.test(page) && /\?\? \(uxptInForce\(s\.uxptChecks, inForceReport\?\.sha, inForceReport\?\.importId\) \? null : "no-uxpt"\)/.test(page) && /inForceReport\.sha !== issues\.at\(-1\)!\.reportSha/.test(page) && /answersFor\(uxpt\.type\)/.test(card) && /uxpt\.notes\[i\.uxpt\.id\]/.test(card) && /data-uxpt-corrected/.test(card) && /uxptChecks: "coded"/.test(exp));

console.log(`uxpt.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
