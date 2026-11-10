// Plan part 8.3 — the validation tests (level 1, the replay): the form's read (a reason where an item
// does not match), the result rule (never the checker's word), the criteria a test is judged against
// (Реш. 134 — none: no test; the edition stored; recorded in the portal after the day — said), the
// readiness of a replay round, the store, and the wiring (who, the journal without values, the
// append-only migration and its rule for the criteria, coverage).
import { readFileSync } from "node:fs";
import { readTestForm, testResult, criteriaOf, levelOneReady, restsOn, isReference, editionUnderTests, sofiaDayOf, LEVEL_ITEMS, type TestItem, type ValidationTest } from "../src/lib/validation-test-model.ts";
import { recordTest, listTests, voidTest, testFile } from "../src/lib/validation-tests.ts";
import type { CriteriaEdition } from "../src/lib/validation-model.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import { NOT_ROUND_TABLES } from "../src/lib/round-export.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const TODAY = "2027-03-10";
const keys = LEVEL_ITEMS[1]!;
const all = (r: string, notes: Record<string, string> = {}) => (k: string) => ({ result: r, note: notes[k] ?? "" });

// ── the form ──
const ok = readTestForm(1, { testedOn: "2027-03-09", scope: "PTS 26/03-T-1, всички характеристики", conclusion: "Възпроизведен", item: all("match") }, TODAY);
t("the form: the day, the scope, every level-1 item, the conclusion", ok.ok && ok.items.length === keys.length && ok.items.every((i) => i.result === "match") && ok.conclusion === "Възпроизведен");
const bad = (x: Partial<{ testedOn: unknown; conclusion: unknown; item: (k: string) => { result: unknown; note: unknown } }>) => { const r = readTestForm(1, { testedOn: "2027-03-09", scope: "", conclusion: "Възпроизведен", item: all("match"), ...x }, TODAY); return r.ok ? "ok" : r.problem; };
t("…an item not answered, or answered with something else: refused", bad({ item: (k) => ({ result: k === "z" ? "" : "match", note: "" }) }) === "items" && bad({ item: (k) => ({ result: k === "z" ? "pass" : "match", note: "" }) }) === "items");
t("…«не съвпада» or «неприложимо» without why: refused; with why: taken", bad({ item: (k) => ({ result: k === "z" ? "mismatch" : "match", note: "" }) }) === "item-note" && bad({ item: (k) => ({ result: k === "uxpt" ? "na" : "match", note: "abc" }) }) === "item-note" && bad({ item: (k) => ({ result: k === "z" ? "mismatch" : "match", note: "z на 126301 се различава" }) }) === "ok");
t("…the day: real, from 2026, not after today; the conclusion 5–2000", bad({ testedOn: "2027-03-11" }) === "future" && bad({ testedOn: "2027-02-30" }) === "date" && bad({ conclusion: "abc" }) === "conclusion");
t("review: the day not before what the test rests on (the load, the export, 2.0's report)", (() => { const r = readTestForm(1, { testedOn: "2027-03-04", scope: "", conclusion: "Възпроизведен", item: all("match") }, TODAY, "2027-03-05"); return !r.ok && r.problem === "early"; })() && readTestForm(1, { testedOn: "2027-03-05", scope: "", conclusion: "Възпроизведен", item: all("match") }, TODAY, "2027-03-05").ok);
t("…a level with no items here yet: refused", (() => { const r = readTestForm(3, { testedOn: "2027-03-09", scope: "", conclusion: "xxxxx", item: all("match") }, TODAY); return !r.ok && r.problem === "level"; })());

// ── the result: the rule, never the word ──
const items = (r: Record<string, "match" | "mismatch" | "na">): TestItem[] => keys.map((key) => ({ key, result: r[key] ?? "match", note: r[key] && r[key] !== "match" ? "защо" : "" }));
const autoOk = { unexpected: 0, exportId: "e", importId: "i", reportSha: "s", transferSame: true };
t("passes: every item matching, nothing unexpected in what was sent, 2.0's report in, the transfer check «the same»", testResult(items({}), autoOk) === "pass");
t("…an item «не съвпада»: fails", testResult(items({ z: "mismatch" }), autoOk) === "fail");
t("review: «неприложимо» only where the level allows it — the design or the u(x_pt) check; never the codes, the raw results, x_pt, z, the verdicts or the tables", testResult(items({ uxpt: "na", design: "na" }), autoOk) === "pass" && ["codes", "raw", "xpt", "z", "verdicts", "tables"].every((k) => testResult(items({ [k]: "na" }), autoOk) === "fail"));
t("…the portal found an unexpected difference, or did not compare: fails", testResult(items({}), { ...autoOk, unexpected: 1 }) === "fail" && testResult(items({}), { ...autoOk, unexpected: null }) === "fail");
t("review: no 2.0 report, no transfer check, or «not the same»: fails", testResult(items({}), { unexpected: 0 }) === "fail" && testResult(items({}), { ...autoOk, transferSame: undefined }) === "fail" && testResult(items({}), { ...autoOk, transferSame: false }) === "fail");

// ── the criteria (8.1) ──
const ed = (edition: number, signedOn: string, levels: number[], recordedAt = `${signedOn}T09:00:00Z`): CriteriaEdition => ({ id: `c${edition}`, edition, signedOn, signedBy: "X Y", levels: levels as CriteriaEdition["levels"], note: "", filePath: "", fileName: "", fileMime: "application/pdf", fileSize: 1, fileSha256: "0".repeat(64), recordedBy: "q", recordedAt });
t("Реш. 134: a test before the criteria for its level were signed — none to judge it against", criteriaOf([ed(1, "2027-03-05", [1])], 1, "2027-03-04") === null && criteriaOf([ed(1, "2027-03-05", [2])], 1, "2027-03-06") === null);
const co = criteriaOf([ed(1, "2027-03-01", [1, 2], "2027-03-08T10:00:00Z")], 1, "2027-03-05");
t("…the edition in force stored; signed before the test but recorded in the portal after its day — said (8.1 review)", co?.edition.edition === 1 && co.recordedAfter === true && criteriaOf([ed(1, "2027-03-01", [1])], 1, "2027-03-05")?.recordedAfter === false);
t("review: «recorded after» by Sofia's day — 00:30 in Sofia on the 10th is the 10th, though UTC says the 9th", sofiaDayOf("2027-03-09T22:30:00Z") === "2027-03-10" && criteriaOf([ed(1, "2027-03-01", [1], "2027-03-09T22:30:00Z")], 1, "2027-03-09")?.recordedAfter === true);
const ready = { reference: true, exported: true, reportIn: true, reportAfterExport: true, checkedSame: true, compared: true };
t("review: one chain — the reference round, the export in force, 2.0's report AFTER it, the check «the same», the file sent compared — each said", levelOneReady(ready).length === 0 && levelOneReady({ ...ready, reportAfterExport: false }).join() === "report-after" && levelOneReady({ ...ready, checkedSame: false }).join() === "check" && levelOneReady({ ...ready, reference: false, exported: false, reportIn: false }).join() === "reference,export,report");
t("review: level 1 is the replay of PTS 26/03-T-1 — however typed; never another round", isReference("PTS 26/03-T-1") && isReference("РТЅ 26/03-Т-1") && !isReference("PTS 26/04-T-1") && !isReference(undefined));
t("review: a new edition signed on or before a recorded test's day — refused (it would change what the test rests on)", editionUnderTests([{ testedOn: "2027-03-09" } as ValidationTest], "2027-03-09") && !editionUnderTests([{ testedOn: "2027-03-09" } as ValidationTest], "2027-03-10") && !editionUnderTests([{ testedOn: "2027-03-09", voided: { reason: "x", by: "y", at: "z" } } as ValidationTest], "2027-03-01"));

// ── the store, in memory ──
const base: Omit<ValidationTest, "id" | "recordedAt" | "file"> = { level: 1, kind: "pts-t", testedOn: "2027-03-09", schemeId: "SIM-27-03-T-1", schemeNumber: "SIM 27/03-T-1", replayOf: "PTS 26/03-T-1", criteriaId: "c1", criteriaEdition: 1, criteriaRecordedAfter: false, scope: "", items: items({}), auto: autoOk, result: "pass", conclusion: "Възпроизведен", recordedBy: "q@ptsbg.eu" };
const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n% evidence\n%%EOF\n"));
const r1 = await recordTest(base, { bytes: PDF, mime: "application/pdf", name: "сравнение.pdf" });
t("recorded with its evidence — the same bytes back", r1.ok && Buffer.from((await testFile(r1.entry))!).equals(Buffer.from(PDF)) && /^[0-9a-f]{64}$/.test(r1.entry.file!.sha256));
const rb = await recordTest(base, { bytes: new Uint8Array(Buffer.from("<html>")), mime: "application/pdf", name: "x.pdf" });
t("…evidence that is not what it says: nothing recorded", !rb.ok && rb.error === "not-file" && (await listTests()).length === 1);
t("an edition a test rests on cannot be voided (8.1 review); once the test is voided, it can", restsOn(await listTests(), "c1") && (await voidTest({ id: r1.ok ? r1.entry.id : "", reason: "Записано по грешка", by: "q" })).ok && !restsOn(await listTests(), "c1"));

// ── the wiring ──
const act = readFileSync(new URL("../src/lib/validation-actions.ts", import.meta.url), "utf8");
const rec = act.slice(act.indexOf("export async function recordTestAction"), act.indexOf("export async function voidTestAction"));
t("the action: validation.record; a replay round that finished — of the reference round for level 1; the form read with the earliest day; the criteria in force for the level on the day — none: refused", /await requireCapAnywhere\("validation\.record"\);/.test(rec) && /if \(!s \|\| !s\.replay \|\| s\.replay\.failed\)/.test(rec) && /if \(level === 1 && !isReference\(sc\.replay!\.of\)\) backTo\(schemeId, "reference"\);/.test(rec) && /readTestForm\(level,[^\n]*st\.earliest\)/.test(rec) && /criteriaOf\(await listCriteria\(\), level, v\.testedOn\)/.test(rec) && /if \(!criteria\) backTo\(schemeId, "criteria"\);/.test(rec));
t("…the chain and what the portal checks by itself computed NOW — the SAME helper as the card; not ready: refused; the result by the rule", /state = await levelOneState\(sc\)/.test(rec) && /if \(st\.missing\.length\) backTo\(schemeId, "not-ready"\);/.test(rec) && /result: testResult\(v\.items, st\.auto, level\)/.test(rec) && !/formData\.get\("result"\)/.test(rec));
const lvl = readFileSync(new URL("../src/lib/validation-level.ts", import.meta.url), "utf8");
t("review: the file SENT to 2.0 (kept, 7.10) compared — never a fresh export; the report imported after that export; the check «the same» of that pair", /await compareSent\(s, ex\.path\)/.test(lvl) && /reportAfterExport: !!ex && !!imp && Date\.parse\(imp\.at\) > Date\.parse\(ex\.at\)/.test(lvl) && /checkedSame: st\.state === "ok" && st\.check\?\.same === true/.test(lvl) && /\["no-export", "preliminary", "relocked", "corrected"\]/.test(lvl));
const card = readFileSync(new URL("../src/components/LevelTestCard.tsx", import.meta.url), "utf8");
t("…the card reads the same state", /levelOneState\(s\)/.test(card) && /min=\{state\?\.earliest\}/.test(card));
t("…journalled: the level, the day, the result, the edition — never a value", /logActivity\("validation\.test_recorded"/.test(rec) && !/after: \{[^}]*items/.test(rec) && !/after: \{[^}]*conclusion/.test(rec));
const vt = act.slice(act.indexOf("export async function voidTestAction"));
t("review: a test's void journalled without the words typed, and «unlogged» said", /summary: `Level \$\{e\.level\} test of \$\{e\.testedOn\} on \$\{e\.schemeNumber\} voided`/.test(vt) && !/schemeId: e\.schemeId/.test(vt) && /voided-unlogged/.test(vt));
const vc = act.slice(act.indexOf("export async function voidCriteriaAction"), act.indexOf("export async function importReplayAction"));
t("the criteria's void refused while a test rests on it", /restsOn\(await listTests\(\), id\)/.test(vc) && /if \(rests\) back\("rests"\);/.test(vc));
const rc = act.slice(act.indexOf("export async function recordCriteriaAction"), act.indexOf("export async function voidCriteriaAction"));
t("review: a new edition under a recorded test refused", /editionUnderTests\(await listTests\(\), v\.signedOn\)/.test(rc) && /if \(under\) back\("under-tests"\);/.test(rc));
const mig = readFileSync(new URL("../supabase/migrations/0046_validation_tests.sql", import.meta.url), "utf8");
t("migration 0046: listed; append-only; the criteria referenced; the database refuses voiding criteria a test rests on — in a trigger of its own (0045's guard untouched); a test and a void one at a time per edition; a test on a voided edition, or one not covering the level on the day, refused; «pass» never with a mismatch or a difference",
  MIGRATIONS.includes("0046_validation_tests") && /a test is never changed or removed/.test(mig) && /revoke update, delete, truncate on public\.validation_tests from service_role/.test(mig) && /criteria_id uuid not null references public\.validation_criteria \(id\)/.test(mig)
  && /create trigger validation_criteria_voids_rests before insert on public\.validation_criteria_voids/.test(mig) && !/create or replace function public\.validation_criteria_voids_guard/.test(mig)
  && (mig.match(/pg_advisory_xact_lock\(hashtextextended\('validation_criteria:' \|\| new\.criteria_id::text, 0\)\)/g) ?? []).length === 2
  && /the criteria edition is voided — no test rests on it/.test(mig) && /if not \(new\.level = any \(ed\.levels\)\) or ed\.signed_on > new\.tested_on then/.test(mig)
  && /result = 'fail' or \(result = 'pass' and \(auto->>'unexpected'\) = '0' and not \(items @> '\[\{"result": "mismatch"\}\]'::jsonb\)\)/.test(mig) && /insert into public\.app_migrations \(name\) values \('0046_validation_tests'\)/.test(mig));
t("coverage: not round data — the tables named with why", !!NOT_ROUND_TABLES.validation_tests && !!NOT_ROUND_TABLES.validation_test_voids);
const route = readFileSync(new URL("../src/app/validation/tests/[id]/route.ts", import.meta.url), "utf8");
t("the evidence: through the section's gate, by id, never cached; unreadable — 503", /await requireSection\("validation"\);/.test(route) && /UUID\.test\(id\)/.test(route) && /status: 503/.test(route) && /private, no-store/.test(route));

console.log(`validation-tests.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
