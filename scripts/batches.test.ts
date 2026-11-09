// Plan part 3.5 — batches (Реш. 151 / А18; Zadanie §5; D3): the batch and its fields;
// each object in exactly one batch; the objects' roles drawn at random, once; the
// homogeneity values in the contract's columns; no batch for calibration.
import { readFileSync } from "node:fs";
import {
  objectCodes, checkBatch, drawRoles, parseHomogeneity, remapHomogeneity, currentHomogeneity, newHomogeneityRows, homogeneityKey, OBJECT_ROLES, BATCH_PROBLEM_TEXT, DRAW_PROBLEM_TEXT, HOMOGENEITY_PROBLEM_TEXT, type Batch,
} from "../src/lib/batches-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the objects' codes ─────────────────────────────────────────────────────
eq("prefix and number: PTS's example 1260302", objectCodes("12603", 40).slice(0, 3), ["1260301", "1260302", "1260303"]);
eq("…to the last", objectCodes("12603", 40).at(-1), "1260340");
eq("at least two digits; more when there are more objects", [objectCodes("A", 5)[0], objectCodes("A", 120)[0]], ["A01", "A001"]);

// ── a batch and its fields (А18) ───────────────────────────────────────────
const base = { label: "P1", material: "Бетонни павета, завод Х", preparedOn: "2026-09-10", storage: "сухо, 20 °C", count: "40", prefix: "12603", hsRecord: "Ф 7.3.2-2 от 15.09.2026" };
const T = { type: "T" as const, batches: [] as Batch[] };
const p = (over: Record<string, unknown>, s: { type: "T" | "C"; batches?: Batch[] } = T) => { const r = checkBatch(s, { ...base, ...over }); return r.ok ? null : r.problem; };
eq("a whole batch", p({}), null);
eq("no batch for calibration (Реш. 151)", p({}, { type: "C" }), "calibration");
eq("no identification", p({ label: " " }), "label");
eq("no material", p({ material: "" }), "material");
eq("no date", p({ preparedOn: "10.09.2026" }), "prepared");
eq("objects: 1 to 999", [p({ count: "0" }), p({ count: "1000" }), p({ count: "2.5" }), p({ count: "1" })], ["count", "count", "count", null]);
eq("a prefix of letters, digits and a dash", [p({ prefix: "12 03" }), p({ prefix: "<b>" }), p({ prefix: "P-26" })], ["prefix", "prefix", null]);
eq("review: a prefix is required, never a sign or an exponent a spreadsheet reads as a number", [p({ prefix: "" }), p({ prefix: "-1" }), p({ prefix: "1e" }), p({ prefix: "12E3" }), p({ prefix: "1E-" })], ["prefix", "prefix", "prefix", "prefix", null]);
eq("review: a day that does not exist", p({ preparedOn: "2026-02-31" }), "prepared");
t("review: a null input is refused, not a crash", checkBatch(T, null).ok === false && drawRoles({ objects: [{ code: "a" }] }, null, () => 0).ok === false);
const B1: Batch = { id: "b1", label: "P1", material: "m", preparedOn: "2026-09-10", storage: "", prefix: "12603", objects: objectCodes("12603", 40).map((code) => ({ code })), createdAt: "", createdBy: "" };
eq("an object is in exactly one batch: codes already in the scheme refused", p({ label: "P2", count: "5" }, { type: "T", batches: [B1] }), "taken");
eq("…another prefix is another set", p({ label: "P2", prefix: "12604" }, { type: "T", batches: [B1] }), null);
eq("…the same identification twice refused", p({ prefix: "99" }, { type: "T", batches: [B1] }), "taken");
eq("review: codes alike whatever their case", p({ label: "P3", prefix: "a" }, { type: "T", batches: [{ ...B1, objects: objectCodes("A", 3).map((code) => ({ code })) }] }), "taken");
eq("a batch corrected is not taken by itself", checkBatch({ type: "T", batches: [B1] }, { ...base, material: "поправен" }, "b1").ok, true);
t("every problem has its words", [BATCH_PROBLEM_TEXT, DRAW_PROBLEM_TEXT, HOMOGENEITY_PROBLEM_TEXT].every((m) => Object.values(m).every((v) => !!v.bg && !!v.en)));

// ── the random draw, once ──────────────────────────────────────────────────
let seed = 7;
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const drawn = drawRoles(B1, { homogeneity: 10, stability: 3, participant: 20, reserve: 5 }, rand);
t("drawn: the counts asked", drawn.ok && OBJECT_ROLES.every((r) => drawn.objects.filter((o) => o.role === r).length === ({ homogeneity: 10, stability: 3, participant: 20, reserve: 5 })[r]));
t("…each object once, the rest unassigned", drawn.ok && drawn.objects.length === 40 && drawn.objects.filter((o) => !o.role).length === 2 && new Set(drawn.objects.map((o) => o.code)).size === 40);
t("…at random: not simply the first ones in order", drawn.ok && drawn.objects.slice(0, 10).some((o) => o.role !== "homogeneity"));
eq("drawn once", drawRoles({ ...B1, draw: { counts: { homogeneity: 1, stability: 0, participant: 0, reserve: 0 }, at: "", by: "", day: "" } }, { homogeneity: 1 }, rand), { ok: false, problem: "drawn" });
eq("more than the batch has", drawRoles(B1, { participant: 41 }, rand), { ok: false, problem: "too-many" });
eq("nothing asked", drawRoles(B1, {}, rand), { ok: false, problem: "counts" });
eq("not a whole number", drawRoles(B1, { participant: "2.5" }, rand), { ok: false, problem: "counts" });

// ── the homogeneity values (the contract's columns) ────────────────────────
const D = drawn.ok ? { objects: drawn.objects } : { objects: [] };
const hom = D.objects.filter((o) => o.role === "homogeneity").map((o) => o.code);
const part = D.objects.find((o) => o.role === "participant")!.code;
const chars = ["Якост на натиск", "Водопоглъщане"];
const ok = parseHomogeneity(`series;sample_code;characteristic_id;replicate_number;value\nH1;${hom[0]};1;1;12,4\nH1\t${hom[0]}\t1\t2\t12.6\nS1,${hom[1]},2,1,3.1`, D, chars);
eq("pasted rows: a header skipped, «;», tab and «,», a decimal comma", ok.ok ? ok.rows.map((r) => [r.series, r.sampleCode, r.characteristic, r.replicate, r.value]) : ok, [["H1", hom[0], 0, 1, 12.4], ["H1", hom[0], 0, 2, 12.6], ["S1", hom[1], 1, 1, 3.1]]);
t("…the characteristic's name kept", ok.ok && ok.rows[2].characteristicName === "Водопоглъщане");
const bad = (text: string) => { const r = parseHomogeneity(text, D, chars); return r.ok ? null : [r.line, r.problem]; };
eq("a participant's object is not a homogeneity object", bad(`H1;${part};1;1;5`), [1, "object"]);
eq("an object not in the batch", bad("H1;9999;1;1;5"), [1, "object"]);
eq("no such characteristic", bad(`H1;${hom[0]};3;1;5`), [1, "characteristic"]);
eq("a replicate that is not whole", bad(`H1;${hom[0]};1;1.5;5`), [1, "replicate"]);
eq("a value that is not a number", bad(`H1;${hom[0]};1;1;abc`), [1, "value"]);
eq("four columns", bad(`H1;${hom[0]};1;5`), [1, "columns"]);
eq("a series with markup", bad(`<b>;${hom[0]};1;1;5`), [1, "series"]);
eq("nothing pasted", bad("  \n "), [0, "empty"]);
eq("review: «0x1A» is not a value", bad(`H1;${hom[0]};1;1;0x1A`), [1, "value"]);
eq("review: «1.234,5» is not a value", bad(`H1;${hom[0]};1;1;1.234,5`), [1, "value"]);
t("…«-0,5», «1e-3» and «+2» are", parseHomogeneity(`H1;${hom[0]};1;1;-0,5\nH1;${hom[0]};1;2;1e-3\nH1;${hom[0]};1;3;+2`, D, chars).ok);
eq("review: a blank line still counts in the line number", bad(`H1;${hom[0]};1;1;5\n\nH1;${hom[0]};1;1;x`), [3, "value"]);
eq("the second line named when it is the wrong one", bad(`H1;${hom[0]};1;1;5\nH1;${hom[0]};1;1;x`), [2, "value"]);

// review: a second press adds nothing; a different value is a correction, the first kept
const v1 = ok.ok ? ok.rows.map((r) => ({ ...r, at: "2026-11-06T10:00:00Z", by: "a" })) : [];
eq("the same values again: nothing added", newHomogeneityRows(v1, v1).add.length, 0);
const corr = newHomogeneityRows(v1, [{ ...v1[0], value: 12.9, at: "2026-11-06T11:00:00Z", by: "b" }]);
eq("a different value of the same key: one row, a correction", [corr.add.length, corr.same], [1, 0]);
const all = [...v1, ...corr.add];
eq("…the latest counts; the corrected one stays on record", [currentHomogeneity(all).find((h) => homogeneityKey(h) === homogeneityKey(v1[0]))?.value, all.length], [12.9, 4]);

// a reordered list: the values follow; a removed characteristic keeps the value, named
const withValues = [{ ...B1, homogeneity: ok.ok ? ok.rows : [] }];
const moved = remapHomogeneity(withValues, (old) => (old === 0 ? 1 : old === 1 ? null : old))!;
eq("reordered: the values follow their characteristic; removed: kept, unplaced", moved[0].homogeneity!.map((h) => h.characteristic), [1, 1, null]);
t("…with its name", moved[0].homogeneity![2].characteristicName === "Водопоглъщане");

// ── the actions and pages ──────────────────────────────────────────────────
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const actions = read("../src/lib/actions.ts");
const sect = actions.slice(actions.indexOf("// ── Batches and their objects"));
t("the technical expert's, and the scheme manager's who plans them (D18)", (sect.match(/await requireOneOf\(\["items\.manage", "scheme\.edit"\], schemeId\);/g) ?? []).length === 4);
t("a batch re-checked inside the lock: an object in exactly one batch", /const again = checkBatch\(cur, input\);/.test(sect));
t("the draw: inside the lock, from the batch as it is, by a fair random source", /const r = drawRoles\(b, counts, uniformBelow\);/.test(sect) && /export const uniformBelow = \(n: number\): number => randomInt\(n\);/.test(read("../src/lib/random.ts")));
t("values added, never replaced — the new ones only (the earlier ones only given their characteristic's id, 3.6)", /homogeneity: \[\.\.\.\(prior \?\? \[\]\), \.\.\.fresh\.add\]/.test(sect) && /const prior = withCharacteristicIds\(b\.homogeneity, idsOf\(cur\)\);/.test(sect));
t("review: read against the characteristics as they are inside the lock", /const parsed = parseHomogeneity\(raw, b, namesOf\(cur\), idsOf\(cur\)\);/.test(sect));
t("review: the draw on record — which object got which role", /after: \{ counts: c, roles \}/.test(sect));
t("review: a batch corrected — its count and codes only before the draw; on record", /if \(recount && b\.draw\) \{ refused =/.test(sect) && /logActivity\("batch\.updated"/.test(sect));
t("review: too much at once is refused, never cut", /if \(raw\.length > 200_000\) return \{ error:/.test(sect));
t("values only after the draw", /if \(!batch\.draw\) return \{ error:/.test(sect));
t("every change journalled", ["batch.created", "batch.drawn", "batch.homogeneity", "batch.record", "batch.updated"].every((a) => sect.includes(`logActivity("${a}"`)));
t("the edit page's reorder keeps the values with their characteristic", /remapHomogeneity\(current\.batches, \(old\) => paramMap\.get\(old\) \?\? null\)/.test(actions));
const page = read("../src/app/schemes/[id]/batches/page.tsx");
t("the scheme's page: the codes viewers; a calibration scheme says it has none", /await requireCap\("codes\.view", id\);/.test(page) && /s\.type === "C" \? \(\s*<div className="card p-4 mt-4" data-no-batch>/.test(page));
const sectionPage = read("../src/app/batches/page.tsx");
t("«Обекти и партиди»: the section's gate, the schemes one works in, testing only", /await requireSection\("batches"\);/.test(sectionPage) && /s\.type === "T" && \(scope === "all" \|\| scope\.includes\(s\.id\)\)/.test(sectionPage));
t("the section is built: no longer a placeholder", !/PlannedSection/.test(sectionPage) && !/batches.*comesIn/.test(read("../src/lib/admin-sections.ts")));
const routes = read("./regression-routes.mjs");
t("both pages in the §4.2 inventory: never a laboratory's identity", /file: "batches\/page\.tsx", names: "never"/.test(routes) && /file: "schemes\/\[id\]\/batches\/page\.tsx", names: "never"/.test(routes));
t("the round export carries them (coded); no document prints them", /batches: "coded"/.test(read("../src/lib/round-export.ts")) && /"extensions", "batches",/.test(read("../src/lib/editions.ts")));
t("no randomInt in the actions themselves (0.15)", !/randomInt/.test(actions));

console.log(`batches.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
