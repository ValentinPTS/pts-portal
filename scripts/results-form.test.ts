// Plan part 6.1 — the results form, testing (Zadanie §5, §7, §12; К22; Реш. 88): one row per
// characteristic that runs, with its method; up to three determinations; the TYPED mean; U; k
// prefilled with 2; a draft kept exactly as typed; nothing judged by value.
import { readFileSync } from "node:fs";
import { resultRows, readDraft, draftFor, notNumbers, draftHasContent, fieldName, rowKey, readValue, rowsHaveIds, DEFAULT_K, calRows, calRowsReady, readCalDraft, calDraftFor, computeError, notNumbersCal, codedSubmissionData, calField, genField, GENERAL_FIELDS, showError, orphansOf } from "../src/lib/results-model.ts";
import { ensurePointIds } from "../src/lib/characteristics-model.ts";
import { pointKeys } from "../src/lib/reference-values-model.ts";
import { putDraft, getDraft } from "../src/lib/submissions.ts";
import { MIGRATIONS } from "../src/lib/migrations-list.ts";
import type { Parameter } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const P = (id: string | undefined, bg: string, method: string, extra: Partial<Parameter> = {}): Parameter => ({ id, characteristicBg: bg, characteristicEn: bg, standardBg: method, standardEn: method, rangeBg: "", rangeEn: "", specimensBg: "", specimensEn: "", ...extra });
const params = [
  P("ch-1", "Граница на протичане", "Казагранде", { unit: "%", determinations: 2, uRequired: true }),
  P("ch-2", "Граница на протичане", "Падащ конус", { unit: "%", determinations: 3 }),
  P(undefined, "Плътност", "EN 1097-6", { determinations: 9 }),
  P("ch-4", "Якост", "EN 12390-3"),
];
const scheme = { status: "running", parameters: params };
const part = { id: "p1", selections: { "0": 1, "1": 1, "2": 1 } };

const rows = resultRows(scheme, part);
eq("the rows: the characteristics applied for, in the scheme's order — not one not applied for", rows.map((r) => r.index), [0, 1, 2]);
t("…each with its method beside the name — the names repeat (Zadanie §5)", rows[0].name.bg === rows[1].name.bg && rows[0].method.bg !== rows[1].method.bg);
eq("…determinations as the characteristic asks, 1–3 (3.6); never more than three", rows.map((r) => r.determinations), [2, 3, 3]);
eq("…keyed by the stable id; one from before 3.6 by its place", rows.map((r) => r.key), ["ch-1", "ch-2", "#2"]);
t("…U required where the design says so; the unit", rows[0].uRequired && !rows[1].uRequired && rows[0].unit === "%");
// after the second announcement: only those that RUN (5.2)
const finalScheme = { status: "running", parameters: params, lifecycle: { acts: [{ act: "announce", from: "open", to: "running", day: "2026-10-01", at: "2026-10-01T10:00:00Z", by: "m" }, { act: "announce2", from: "running", to: "running", day: "2026-10-05", at: "2026-10-05T10:00:00Z", by: "m", final: { participants: ["p1"], runs: [0, 2], runIds: [], droppedIds: [] } }] } };
const fr = resultRows(finalScheme as never, part);
eq("after the second announcement: the characteristics that RUN only (5.2)", fr.map((r) => r.index), [0, 2]);

// the draft, exactly as typed
const typed: Record<string, string> = { [fieldName("d", "ch-1", 0)]: " 12,4 ", [fieldName("d", "ch-1", 1)]: "12.6", [fieldName("mean", "ch-1")]: "12,", [fieldName("U", "ch-1")]: "0,3", [fieldName("k", "ch-1")]: "2", [fieldName("mean", "ch-2")]: "abc", [fieldName("d", "ch-2", 5)]: "ignored", "mean_ch-9": "not a row" };
const d = readDraft((n) => typed[n], rows);
eq("the draft keeps what was typed — trimmed, a half-typed «12,» kept, never corrected (not declared N/R)", d.rows["ch-1"], { d: ["12,4", "12.6"], mean: "12,", U: "0,3", k: "2", nr: false });
t("…only the rows' fields — never another's, never a field beyond its determinations", !("ch-9" in d.rows) && d.rows["ch-2"].d.length === 3 && !d.rows["ch-2"].d.includes("ignored"));
t("…k prefilled with 2 where never typed (К22)", d.rows["#2"].k === DEFAULT_K && d.rows["ch-2"].k === DEFAULT_K);
t("…a field kept to 40 characters, control characters out", readDraft((n) => (n === fieldName("mean", "ch-1") ? "1\u00072".repeat(30) : undefined), rows).rows["ch-1"].mean.length === 40);
const back = draftFor(JSON.parse(JSON.stringify(d)), rows);
eq("a stored draft read back: the same", back, d);
t("…a stored draft of another shape, or of characteristics no longer there: only the form's rows, nothing crashes", Object.keys(draftFor({ rows: { gone: { mean: "1" } } }, rows).rows).join() === "ch-1,ch-2,#2" && Object.keys(draftFor("garbage", rows).rows).length === 3);
t("an untouched form is no draft; a typed one is", !draftHasContent(readDraft(() => undefined, rows)) && draftHasContent(d));
// the portal never computes the mean — behaviourally: determinations typed, no mean typed → no mean (Реш. 88)
const onlyDets = readDraft((n) => ({ [fieldName("d", "ch-1", 0)]: "10", [fieldName("d", "ch-1", 1)]: "20" } as Record<string, string>)[n], rows);
t("determinations typed, the mean not: the mean stays EMPTY — never their average (Реш. 88)", onlyDets.rows["ch-1"].mean === "" && notNumbers(onlyDets, rows).length === 0);
// a string only: an object posted (a crafted call) is nothing — never String() on it (review)
const crafted = readDraft((n) => (n === fieldName("mean", "ch-1") ? { toString: 1, valueOf: 1 } : n === fieldName("U", "ch-1") ? 42 : undefined), rows);
t("…a field posted as anything but a string is empty — a crafted object never crashes the save", crafted.rows["ch-1"].mean === "" && crafted.rows["ch-1"].U === "");
t("rows without lasting ids (from before 3.6) wait: the form takes nothing until the scheme is saved once", !rowsHaveIds(rows) && rowsHaveIds(rows.filter((r) => !r.key.startsWith("#"))));

// the draft's revision: a save names the one it was typed over — an older one never overwrites (review)
const P1 = "00000000-0000-4000-8000-0000000000d1";
const first = await putDraft({ participantId: P1, schemeId: "S", data: { v: 1, rows: {} }, updatedBy: "lab:x" }, 0);
const second = await putDraft({ participantId: P1, schemeId: "S", data: { v: 1, rows: { a: 1 } }, updatedBy: "entityuser:y" }, 1);
const staleTab = await putDraft({ participantId: P1, schemeId: "S", data: { v: 1, rows: { old: 1 } }, updatedBy: "lab:x" }, 1);
const twoFirsts = await putDraft({ participantId: P1, schemeId: "S", data: { v: 1, rows: {} }, updatedBy: "lab:x" }, 0);
t("revisions: 1, then 2 over 1; a tab still holding 1 — «stale», nothing written; a second «first» — stale", first !== "stale" && first.rev === 1 && second !== "stale" && second.rev === 2 && staleTab === "stale" && twoFirsts === "stale" && JSON.stringify((await getDraft(P1, "S"))?.data) === JSON.stringify({ v: 1, rows: { a: 1 } }));
t("…another scheme's read of it: none", (await getDraft(P1, "OTHER")) === null);

// numbers: 5.7's rule — said neutrally, never about the value
eq("numbers: a comma or a point, a minus, an exponent", ["12,4", "-0.5", "1e3", "+2"].map(readValue), [12.4, -0.5, 1000, 2]);
eq("…a mix like «1,234.5», two commas, letters — not numbers (never guessed)", ["1,234.5", "1,2,3", "abc"].map(readValue), [null, null, null]);
// («12,» reads as 12 under 5.7's rule — kept as typed in the draft all the same)
eq("the fields typed that are not numbers yet — named, nothing about a value", notNumbers(d, rows), [{ key: "ch-2", field: "mean" }]);

// never the mean computed (Реш. 88); never a judgement of a value (rule 12)
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const model = src("lib/results-model.ts"), form = src("components/ResultsForm.tsx"), page = src("app/lab/p/[id]/results/page.tsx");
// (a reduce, a division by a length, a running sum, «average» — what computing a mean looks like)
const calForm = src("components/CalibrationResultsForm.tsx"), saver = src("components/useDraftSaver.ts");
t("the portal never computes the mean: no sum or average of the determinations anywhere in the forms", ![model, form, page, calForm, saver].some((x) => /reduce\(|\/\s*[\w.]*length\b|\bsum\s*\+?=|average|avg\(|mean\s*=\s*[^=]/.test(x.replace(/\/\/.*$/gm, ""))));
t("…nor a word about a value: no «high», «low», «unusual», no guard limit shown yet (6.3, neutrally)", ![form, page].some((x) => /висок|нисък|необичайн|unusual|too high|too low|outlier/i.test(x)));

// the action: the participation's own, a testing scheme that runs, before it is scored; no journal
const act = src("lib/actions.ts");
const fn = act.slice(act.indexOf("export async function saveResultDraftAction"));
t("the draft's action: only the participation's own (ownGoingOn); while the form is open; not once scored", /const mine = await ownGoingOn\(sid, pid\);\s*if \(!mine\) return \{ error: "not-yours" \};/.test(fn) && /if \(!open \|\| !canLabUploadNow\(part\.status\)\) return \{ error: "state" \};/.test(fn));
t("…the rows from the scheme as it is, the fields read from what was posted only by name; the configuration's version kept", /resultRows\(scheme, part\)/.test(fn) && /Object\.hasOwn\(posted, name\)/.test(fn) && /configVersion: scheme\.characteristicVersions\?\.at\(-1\)\?\.no/.test(fn));
t("…saved only over the revision the form holds; a draft that could not be read is never shown as none (the page)", /putDraft\(\{[\s\S]*?\}, base\)/.test(fn) && /if \(saved === "stale"\) return \{ error: "stale" \};/.test(fn) && /if \(!rowsHaveIds\(rows\)\) return \{ error: "state" \};/.test(fn) && /readFailed = true; return null;/.test(page) && /!readFailed && idsReady/.test(page));

t("the characteristics' lasting ids from the start: at creation, and at the first announcement in the lock (review)", /const withIds = ensureIds\(scheme\.parameters \?\? \[\], scheme\.characteristicSeq\); scheme\.parameters = withIds\.params;/.test(act) && /const ids = act === "announce" && cur\.parameters\?\.some\(\(p\) => !p\.id\) \? ensureIds\(cur\.parameters, cur\.characteristicSeq\) : null;/.test(act));

// ── calibration, per M2 (6.2; D1) ──
const cal = { points: ["20", "40"], pointIds: ["pt-1", "pt-2"], directionsEn: ["Tension", "Compression"], directionsBg: ["Опън", "Натиск"] };
const cr = calRows(cal);
t("the calibration's rows: each point × each direction, by the point's lasting id", cr.length === 4 && cr.every((r) => r.key.startsWith("pt-")) && cr[0].nominal === "20" && cr[0].direction?.bg === "Опън");
t("…points without lasting ids (before 3.6): the form waits", calRowsReady(cal) && !calRowsReady({ points: ["20"] }));
eq("the error — measured minus reference, EXACT decimals (never a float's noise)", [["0,1", "0,3"], ["20", "19,98"], ["-0.5", "0.25"], ["10", "10.000"], ["1e3", "1001"], ["", "5"], ["abc", "1"]].map(([r, m]) => computeError(r, m)), ["0.2", "-0.02", "0.75", "0.000", "1", null, null]);
eq("…exponents exact too — never a float's cancellation (review)", [["123456789.123e0", "123456789.124"], ["1.5e-3", "0.002"], ["2E2", "199.9"], [".5", "1"], ["5.", "5.5"], ["+3", "3"]].map(([r, m]) => computeError(r, m)), ["0.001", "0.0005", "-0.1", "0.5", "0.5", "0"]);
eq("…shown with a decimal comma in Bulgarian, as typed", [showError("-0.02", "bg"), showError("-0.02", "en"), showError(null, "bg")], ["-0,02", "-0.02", null]);
// two directions whose words give one slug («+» and «−», «Up» and «up»): never one key for two rows (review)
const clash = pointKeys({ points: ["20", "40"], pointIds: ["pt-1", "pt-2"], directionsEn: ["+", "−"], directionsBg: ["+", "−"] }).map((k) => k.key);
t("directions whose words give one slug: each its own key — two rows never bound to one value", new Set(clash).size === clash.length && clash.length === 4, clash.join());
eq("…a direction with its own slug keeps the key it always had (5.7's stored values)", pointKeys(cal).map((k) => k.key), ["pt-1|tension", "pt-2|tension", "pt-1|compression", "pt-2|compression"]);
// the point ids the announcement gives, run as it runs them: ids in order, each distinct — a repeated value too
const given = ensurePointIds(["20", "40", "20"], ["20", "40", "20"], undefined, undefined);
t("the ids the announcement gives (ensurePointIds as it is called there): in order, distinct — a repeated value its own", given.ids.join() === "pt-1,pt-2,pt-3" && given.seq === 3);
const cd = readCalDraft((n) => ({ [genField("labName")]: "Лаб Х", [genField("tempMin")]: "20,1", [genField("tempMax")]: "x", [genField("method")]: "Пряко сравнение", [calField("ref", cr[0].key)]: "20,00", [calField("meas", cr[0].key)]: "20,03", [calField("U", cr[0].key)]: "0,02", [calField("na", cr[1].key)]: "on", [calField("ref", cr[1].key)]: "abc", "g_hack": "x", "ref_pt-9": "1" } as Record<string, string>)[n], cr);
t("the calibration draft as typed: the general info, each point's readings, N/A declared — only the form's fields", cd.kind === "C" && cd.general.labName === "Лаб Х" && cd.points[cr[0].key].meas === "20,03" && cd.points[cr[1].key].na && !("hack" in cd.general) && !("pt-9" in cd.points) && GENERAL_FIELDS.every((f) => typeof cd.general[f] === "string"));
t("…the error is NOT stored — computed from the two readings whenever shown (D1)", !JSON.stringify(cd).includes("error"));
eq("…not numbers yet: a point's, the temperature's — a point declared N/A is not asked", notNumbersCal(cd, cr), [{ key: "general", field: "tempMax" }]);
t("a stored calibration draft read back: the same; garbage — empty, never a crash", JSON.stringify(calDraftFor(JSON.parse(JSON.stringify(cd)), cr)) === JSON.stringify(cd) && calDraftFor("garbage", cr).points[cr[0].key].ref === "");
const coded = codedSubmissionData(cd) as { general: Record<string, string> };
// what a draft holds for points no longer in the scheme — carried, never dropped (review)
const carried = orphansOf({ v: 1, kind: "C", general: {}, points: { "pt-9": { ref: "1", meas: "2", U: "", cmc: "", na: false }, [cr[0].key]: { ref: "x" } } }, cr.map((r) => r.key));
t("a point no longer in the scheme: carried by every save, shown apart — never dropped (review)", Object.keys(carried).join() === "pt-9" && JSON.stringify(orphansOf({ rows: { "ch-7": { mean: "5" } } }, ["ch-1"])) === JSON.stringify({ "ch-7": { mean: "5" } }) && Object.keys(orphansOf("garbage", [])).length === 0);
t("…the action keeps them: the stored draft read first (a read failure writes nothing), its orphans under the new rows", /try \{ prev = await getDraft\(pid, sid\); \} catch \{ return \{ error: "failed" \}; \}/.test(fn) && /rows: \{ \.\.\.orphansOf\(prev\?\.data, rows\.map\(\(r\) => r\.key\)\), \.\.\.d\.rows \}/.test(fn) && /points: \{ \.\.\.orphansOf\(prev\?\.data, rows\.map\(\(r\) => r\.key\)\), \.\.\.d\.points \}/.test(fn));
t("one save at a time: one asked for while another is in flight runs once it returns (review)", /if \(inFlight\.current\) \{ again\.current = true; return; \}/.test(saver) && /if \(again\.current\) \{ again\.current = false; void save\(\); \}/.test(saver));
t("the round export's coded part: the laboratory's name and who filled it removed (identity) — the rest kept", !("labName" in coded.general) && !("signedBy" in coded.general) && coded.general.method === "Пряко сравнение" && codedSubmissionData(d) === d);
t("the draft action: testing while the round runs; calibration while the device travels (open or running); each form's own reader", /const open = scheme\.type === "T" \? scheme\.status === "running" : scheme\.status === "open" \|\| scheme\.status === "running";/.test(fn) && /readCalDraft\(get, rows\)/.test(fn) && /if \(!calRowsReady\(scheme\.calibration\)\) return \{ error: "state" \};/.test(fn));
t("the calibration's point ids from the start too: at creation, and at the first announcement", /if \(scheme\.calibration\?\.points\?\.length && !pointsReady\(scheme\.calibration\)\)/.test(act) && /const pts = act === "announce" && cur\.calibration\?\.points\?\.length && !pointsReady\(cur\.calibration\)/.test(act));

// migration 0042
const sql = readFileSync(new URL("../supabase/migrations/0042_submissions.sql", import.meta.url), "utf8");
t("0042: the drafts — one per participation, with its revision; server key only", /create table if not exists public\.submission_drafts \(\s*participant_id uuid primary key references public\.participants\(id\)/.test(sql) && /rev integer not null default 1 check \(rev >= 1\)/.test(sql) && /revoke all on public\.submission_drafts from anon, authenticated;/.test(sql));
t("0042: the submitted versions — append-only: no update, delete or truncate; the next version only; server key only", /raise exception 'submissions is a record/.test(sql) && /before insert or update or delete on public\.submissions/.test(sql) && /before truncate on public\.submissions/.test(sql) && /revoke update, delete, truncate on public\.submissions from service_role;/.test(sql) && /new\.version <> coalesce\(latest, 0\) \+ 1/.test(sql) && /unique \(participant_id, version\)/.test(sql));
t("…recorded and listed; nothing dropped", /'0042_submissions'/.test(sql) && MIGRATIONS.includes("0042_submissions") && !/\bdrop table\b/i.test(sql));
t("rowKey: the id, else the place", rowKey(params[0], 0) === "ch-1" && rowKey(params[2], 2) === "#2");

console.log(`results-form.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
