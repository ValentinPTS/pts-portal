// Plan part 6.1 — the results form, testing (Zadanie §5, §7, §12; К22; Реш. 88): one row per
// characteristic that runs, with its method; up to three determinations; the TYPED mean; U; k
// prefilled with 2; a draft kept exactly as typed; nothing judged by value.
import { readFileSync } from "node:fs";
import { resultRows, readDraft, draftFor, notNumbers, draftHasContent, fieldName, rowKey, readValue, rowsHaveIds, DEFAULT_K } from "../src/lib/results-model.ts";
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
eq("the draft keeps what was typed — trimmed, a half-typed «12,» kept, never corrected", d.rows["ch-1"], { d: ["12,4", "12.6"], mean: "12,", U: "0,3", k: "2" });
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
t("the portal never computes the mean: no sum or average of the determinations anywhere in the form", ![model, form, page].some((x) => /reduce\(|\.length\s*\)|average|avg\(|mean\s*=\s*[^=]/.test(x.replace(/\/\/.*$/gm, ""))));
t("…nor a word about a value: no «high», «low», «unusual», no guard limit shown yet (6.3, neutrally)", ![form, page].some((x) => /висок|нисък|необичайн|unusual|too high|too low|outlier/i.test(x)));

// the action: the participation's own, a testing scheme that runs, before it is scored; no journal
const act = src("lib/actions.ts");
const fn = act.slice(act.indexOf("export async function saveResultDraftAction"));
t("the draft's action: only the participation's own (ownGoingOn); a running testing scheme; not once scored", /const mine = await ownGoingOn\(sid, pid\);\s*if \(!mine\) return \{ error: "not-yours" \};/.test(fn) && /scheme\.type !== "T" \|\| scheme\.status !== "running" \|\| !canLabUploadNow\(part\.status\)/.test(fn));
t("…the rows from the scheme as it is, the fields read from what was posted only by name; the configuration's version kept", /resultRows\(scheme, part\)/.test(fn) && /Object\.hasOwn\(posted, name\)/.test(fn) && /configVersion: scheme\.characteristicVersions\?\.at\(-1\)\?\.no/.test(fn));
t("…saved only over the revision the form holds; a draft that could not be read is never shown as none (the page)", /putDraft\(\{[\s\S]*?\}, base\)/.test(fn) && /if \(saved === "stale"\) return \{ error: "stale" \};/.test(fn) && /if \(!rowsHaveIds\(rows\)\) return \{ error: "state" \};/.test(fn) && /readFailed = true; return null;/.test(page) && /!readFailed && idsReady/.test(page));

t("the characteristics' lasting ids from the start: at creation, and at the first announcement in the lock (review)", /const withIds = ensureIds\(scheme\.parameters \?\? \[\], scheme\.characteristicSeq\); scheme\.parameters = withIds\.params;/.test(act) && /const ids = act === "announce" && cur\.parameters\?\.some\(\(p\) => !p\.id\) \? ensureIds\(cur\.parameters, cur\.characteristicSeq\) : null;/.test(act));

// migration 0042
const sql = readFileSync(new URL("../supabase/migrations/0042_submissions.sql", import.meta.url), "utf8");
t("0042: the drafts — one per participation, with its revision; server key only", /create table if not exists public\.submission_drafts \(\s*participant_id uuid primary key references public\.participants\(id\)/.test(sql) && /rev integer not null default 1 check \(rev >= 1\)/.test(sql) && /revoke all on public\.submission_drafts from anon, authenticated;/.test(sql));
t("0042: the submitted versions — append-only: no update, delete or truncate; the next version only; server key only", /raise exception 'submissions is a record/.test(sql) && /before insert or update or delete on public\.submissions/.test(sql) && /before truncate on public\.submissions/.test(sql) && /revoke update, delete, truncate on public\.submissions from service_role;/.test(sql) && /new\.version <> coalesce\(latest, 0\) \+ 1/.test(sql) && /unique \(participant_id, version\)/.test(sql));
t("…recorded and listed; nothing dropped", /'0042_submissions'/.test(sql) && MIGRATIONS.includes("0042_submissions") && !/\bdrop table\b/i.test(sql));
t("rowKey: the id, else the place", rowKey(params[0], 0) === "ch-1" && rowKey(params[2], 2) === "#2");

console.log(`results-form.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
