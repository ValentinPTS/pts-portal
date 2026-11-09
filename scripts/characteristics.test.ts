// Plan part 3.6 — characteristics (Zadanie §5; D3; А3): stable ids; name and method
// together; unit, step, absolute guard limits, U required, group, determinations ≤ 3;
// the 2.0 fields as entered, never to labs; calibration points as rows; configuration
// versions; one static reminder per scheme.
import { readFileSync } from "node:fs";
import {
  readCharacteristicFields, ensureIds, ensurePointIds, characteristicLabel, labView, configOf, nextVersionNo, ENGINE_FIELDS, FIELD_PROBLEM_TEXT, MAX_DETERMINATIONS,
} from "../src/lib/characteristics-model.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { homogeneityKey, newHomogeneityRows, withCharacteristicIds, backfillCharacteristicIds, type HomogeneityValue, type Batch } from "../src/lib/batches-model.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Parameter } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const P = (over: Partial<Parameter> = {}): Parameter => ({ standardEn: "EN 1097-6", standardBg: "БДС EN 1097-6", characteristicEn: "Water absorption", characteristicBg: "Водопоглъщане", rangeEn: "", rangeBg: "", specimensEn: "", specimensBg: "", ...over });
const form = (o: Record<string, string>) => (n: string) => (n in o ? o[n] : null);

// ── the fields ─────────────────────────────────────────────────────────────
const ok = readCharacteristicFields(form({ unit: "%", step: "0,1", gmin: "0", gmax: "10", det: "3", ureq: "on", group: "Физични", groupEn: "Physical", eng_assigned_value_method: "consensus", eng_scores: "z" }), P());
eq("all the fields read, a decimal comma", ok.ok ? ok.fields : ok, { unit: "%", step: 0.1, guardMin: 0, guardMax: 10, uRequired: true, group: "Физични", groupEn: "Physical", determinations: 3, engine: { assigned_value_method: "consensus", scores: "z" } });
const p = (o: Record<string, string>) => { const r = readCharacteristicFields(form(o), P()); return r.ok ? null : r.problem; };
eq("a step must be positive", [p({ step: "0" }), p({ step: "-1" }), p({ step: "abc" })], ["step", "step", "step"]);
eq("guard limits are numbers, the lower below the upper", [p({ gmin: "x" }), p({ gmin: "5", gmax: "5" }), p({ gmin: "6", gmax: "5" }), p({ gmin: "-5", gmax: "5" })], ["guard", "guards-order", "guards-order", null]);
eq(`determinations 1 to ${MAX_DETERMINATIONS} (the contract's columns, D3)`, [p({ det: "0" }), p({ det: "4" }), p({ det: "2.5" }), p({ det: "3" })], ["determinations", "determinations", "determinations", null]);
eq("a 2.0 field is bounded", p({ eng_scores: "z".repeat(301) }), "engine");
eq("a unit is short", p({ unit: "u".repeat(31) }), "unit");
const keep = readCharacteristicFields(form({}), P({ unit: "kg", step: 0.5, engine: { scores: "z" }, determinations: 2 }));
eq("a field the form did not carry keeps its value", keep.ok ? [keep.fields.unit, keep.fields.step, keep.fields.engine, keep.fields.determinations] : keep, ["kg", 0.5, { scores: "z" }, 2]);
const cleared = readCharacteristicFields(form({ unit: "", step: "", eng_scores: "" }), P({ unit: "kg", step: 0.5, engine: { scores: "z" } }));
eq("…a blank one clears it", cleared.ok ? [cleared.fields.unit, cleared.fields.step, cleared.fields.engine] : cleared, [undefined, undefined, undefined]);
t("an unknown engine key is never read", readCharacteristicFields(form({ eng_evil: "x" }), P()).ok && !("evil" in ((readCharacteristicFields(form({ eng_evil: "x" }), P()) as { fields: Parameter }).fields.engine ?? {})));
t("the guard limits are 2.0's physical_min/max — not also among the pass-through fields", !(ENGINE_FIELDS as readonly string[]).includes("physical_min") && !(ENGINE_FIELDS as readonly string[]).includes("physical_max"));
t("every problem has its words", Object.values(FIELD_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── stable ids ─────────────────────────────────────────────────────────────
const a = ensureIds([P(), P(), P()], undefined);
eq("ids given in turn", [a.params.map((x) => x.id), a.seq], [["ch-1", "ch-2", "ch-3"], 3]);
const b = ensureIds([a.params[2], a.params[0], P()], a.seq);
eq("a reorder keeps them; a new one is the next — never a reused one", b.params.map((x) => x.id), ["ch-3", "ch-1", "ch-4"]);
const c = ensureIds([a.params[0], P()], 3);
eq("…even after one was removed (ch-2, ch-3 gone): the counter", c.params.map((x) => x.id), ["ch-1", "ch-4"]);
eq("a duplicated id (a crafted form) is given a new one", ensureIds([P({ id: "ch-1" }), P({ id: "ch-1" })], 1).params.map((x) => x.id), ["ch-1", "ch-2"]);
const pts = ensurePointIds(["20", "40", "60"], undefined, undefined, undefined);
eq("calibration points as rows: an id each", pts.ids, ["pt-1", "pt-2", "pt-3"]);
eq("…a point keeps its id while its value stays, whatever its place; a new value the next", ensurePointIds(["60", "20", "80"], ["20", "40", "60"], pts.ids, pts.seq).ids, ["pt-3", "pt-1", "pt-4"]);
// review: an up-and-down series repeats a value — each time keeps its own id, save after save
const ud = ensurePointIds(["20", "40", "20"], undefined, undefined, undefined);
eq("a repeated value: an id for each time it appears", ud.ids, ["pt-1", "pt-2", "pt-3"]);
const ud2 = ensurePointIds(["20", "40", "20"], ["20", "40", "20"], ud.ids, ud.seq);
eq("…saved again unchanged: the same ids, the counter unmoved", [ud2.ids, ud2.seq], [["pt-1", "pt-2", "pt-3"], 3]);
eq("…one of the repeats removed: the other keeps its id", ensurePointIds(["20", "40"], ["20", "40", "20"], ud.ids, ud.seq).ids, ["pt-1", "pt-2"]);

// ── shown ──────────────────────────────────────────────────────────────────
eq("name and method together (the names repeat)", characteristicLabel(P({ characteristicBg: "Граница на протичане", standardBg: "БДС EN ISO 17892-12 (падащ конус)" }), "bg"), "Граница на протичане — БДС EN ISO 17892-12 (падащ конус)");
eq("…no method: the name", characteristicLabel(P({ standardBg: "", standardEn: "" }), "bg"), "Водопоглъщане");
const lv = labView(P({ unit: "%", determinations: 3, uRequired: true, guardMin: 0, guardMax: 10, group: "Физични", engine: { scores: "z" } }), "bg");
eq("what a laboratory may see", lv, { label: "Водопоглъщане — БДС EN 1097-6", unit: "%", determinations: 3, uRequired: true });
t("…never the 2.0 fields, the guard limits or the group", !JSON.stringify(lv).includes("scores") && !JSON.stringify(lv).includes("Физични") && !("guardMin" in lv));

// ── versions ───────────────────────────────────────────────────────────────
t("the configuration changes with a field", configOf([P()]) !== configOf([P({ unit: "%" })]));
t("…and with the order (the references by place follow it)", configOf([P({ id: "ch-1" }), P({ id: "ch-2" })]) !== configOf([P({ id: "ch-2" }), P({ id: "ch-1" })]));
eq("versions numbered", [nextVersionNo(undefined), nextVersionNo([{ no: 1 }, { no: 2 }] as never)], [1, 3]);
// review: the database gives a stored object back with its keys in its own order
const reordered = (o: object) => Object.fromEntries(Object.entries(o).reverse()) as Parameter;
const cfgP = P({ id: "ch-1", unit: "%", engine: { scores: "z", assigned_value_method: "consensus" } });
t("the same configuration with its keys in another order (jsonb): no new version", configOf([cfgP], { values: ["20"], ids: ["pt-1"] }) === configOf([{ ...reordered(cfgP), engine: reordered(cfgP.engine!) }], { ids: ["pt-1"], values: ["20"] } as never));
t("…nor a field that is there but empty (undefined) against one not there", configOf([P({ step: undefined })]) === configOf([P()]));

// ── a document is not changed by what it does not print ────────────────────
const s0 = structuredClone(pavingBlocks);
const s1 = { ...s0, parameters: s0.parameters.map((x, i) => ({ ...x, id: `ch-${i + 1}`, engine: { scores: "z" }, guardMin: 0, guardMax: 1, group: "g", determinations: 3, uRequired: true, step: 0.1, unit: "%" })) };
t("ids, 2.0 fields, guards, group, step, unit, determinations: no document changes (fingerprint)", ["plan", "invitation", "instruction", "results"].every((d) => fingerprint(s0, d) === fingerprint(s1, d)));
t("…but a printed field does", fingerprint(s0, "plan") !== fingerprint({ ...s0, parameters: s0.parameters.map((x) => ({ ...x, characteristicBg: x.characteristicBg + "!" })) }, "plan"));
t("the static reminder is on no document (review)", ["plan", "invitation", "instruction", "results"].every((d) => fingerprint(s0, d) === fingerprint({ ...s0, staticReminder: { bg: "Закръглете по Инструкцията", en: "Round per the Instruction" } }, d)));

// ── homogeneity values by the characteristic's stable id (review) ──────────
const H = (o: Partial<HomogeneityValue>): HomogeneityValue => ({ series: "H1", sampleCode: "101", characteristic: 0, characteristicName: "Водопоглъщане", replicate: 1, value: 1, ...o });
t("two removed characteristics never meet", homogeneityKey(H({ characteristic: null, characteristicName: "A" })) !== homogeneityKey(H({ characteristic: null, characteristicName: "B" })));
t("…a value with an id is keyed by it, whatever its place", homogeneityKey(H({ characteristicId: "ch-2", characteristic: 0 })) === homogeneityKey(H({ characteristicId: "ch-2", characteristic: 3 })));
const old0 = [H({ value: 12.4 })];
eq("a value from before the ids gets its characteristic's id", withCharacteristicIds(old0, ["ch-7"])!.map((h) => h.characteristicId), ["ch-7"]);
t("…untouched (the same list) when there is nothing to give", withCharacteristicIds(old0, [undefined]) === old0 && backfillCharacteristicIds([{ id: "b", homogeneity: old0 } as Batch], [undefined])![0].homogeneity === old0);
const pasted = [H({ value: 12.4, characteristicId: "ch-7" }), H({ value: 12.5, characteristicId: "ch-7", replicate: 2 })];
eq("…then a pasted value with the id is recognised as the same one", newHomogeneityRows(withCharacteristicIds(old0, ["ch-7"]), pasted).same, 1);

// ── the action and the screens ─────────────────────────────────────────────
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const actions = read("../src/lib/actions.ts");
const edit = actions.slice(actions.indexOf("export async function updateSchemeAction"));
t("each row's 3.6 fields read; one that does not read keeps the characteristics as they were, the rest saved", /const f = readCharacteristicFields\(/.test(edit) && /if \(charProblems\.length\) \{\s*parameters = existing\.parameters;/.test(edit) && /chars=\$\{encodeURIComponent/.test(edit));
t("…only a KEPT row's problem counts — a blank new row is dropped first (review)", /if \(orig === null && !p\.standardEn[^\n]*continue;\s*if \(rowProblem\) charProblems\.push\(rowProblem\);/.test(edit));
t("…its notice travels with every other refusal (review)", /const back = \(q: string\) =>/.test(edit) && !/redirect\(`\/schemes\/\$\{id\}\/edit\?err=(numberLocked|simNumber|badNumber|numberActivity|dupNumber)/.test(edit));
t("a row is matched by its posted id before its place (review)", /const postedId = str\(`param_\$\{i\}_id`, ""\);/.test(edit) && /const orig = postedId\s*\? \(byId >= 0 && !usedOrig\.has\(byId\) \? byId : null\)/.test(edit));
t("the ids given inside the lock, from the scheme's counter", /const withIds = ensureIds\(parameters, current\.characteristicSeq\);/.test(edit) && /parameters: withIds\.params,/.test(edit));
t("a changed configuration is its next version, on record", /if \(versionMade\) newVersionNo = nextVersionNo\(current\.characteristicVersions\);/.test(edit) && /logActivity\("scheme\.characteristics"/.test(edit));
t("calibration points keep their ids by value — given inside the lock, from the fresh state (review)", /const pi = calibration \? ensurePointIds\(calibration\.points, current\.calibration\?\.points, current\.calibration\?\.pointIds, current\.pointSeq\)/.test(edit) && /calibration: cal,/.test(edit));
t("one static reminder per scheme, bounded by characters (review)", /staticReminder: reminderBg \|\| reminderEn \? \{ bg: reminderBg, en: reminderEn \} : undefined/.test(edit) && /Array\.from\(str\(k, ""\)\)\.slice\(0, 600\)/.test(edit));
t("homogeneity values get their characteristic's id on a save, and before a paste is compared (review)", /backfillCharacteristicIds\(moved, withIds\.params\.map/.test(edit) && /const prior = withCharacteristicIds\(b\.homogeneity, idsOf\(cur\)\);/.test(actions));
const editor = read("../src/components/SchemeEditor.tsx");
t("the editor posts every 3.6 field and the 2.0 ones", ["id", "unit", "step", "gmin", "gmax", "det", "group", "groupEn", "ureq"].every((n) => editor.includes(`name={\`param_\${i}_${n}\`}`)) && /ENGINE_FIELDS\.map\(\(k\) => <input key=\{k\} type="hidden" name=\{`param_\$\{i\}_eng_\$\{k\}`\}/.test(editor));
t("…with a preview of what the laboratory sees", /data-lab-view/.test(editor) && /characteristicLabel\(p, /.test(editor));
const lab = read("../src/app/lab/page.tsx");
t("the laboratory: the static reminder while the scheme runs — and never a 2.0 field", /data-static-reminder/.test(lab) && !/\.engine\b/.test(lab));
t("no laboratory page or route reads the 2.0 fields", !/\.engine\b/.test(read("../src/app/lab/doc/[scheme]/[doc]/route.ts")));
const batches = read("../src/lib/batches-model.ts");
t("homogeneity values carry the characteristic's stable id", /\.\.\.\(ids\?\.\[c - 1\] \? \{ characteristicId: ids\[c - 1\] \} : \{\}\)/.test(batches));

console.log(`characteristics.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
