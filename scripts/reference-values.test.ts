// Plan part 5.7 — the reference values per calibration point: the reference laboratory's ERROR
// at the point before and after (D3 — the same quantity as a participant's `mean`), u_calibration,
// u_other, k (Zadanie: X_ref = (X_ref1 + X_ref2)/2, u_stab = |X_ref1 − X_ref2|/(2√3), k = 2
// unless justified; 2.0's «Calibration» sheet).
import { readFileSync } from "node:fs";
import {
  pointKeys, pointsReady, fingerprint, orphans, readReferenceTable, readNumber, derived, referenceRole, missingFor2, currentRows, sameRow, sameRows,
  kOf, kNeedsReason, REFERENCE_FIELDS, REFERENCE_FIELD_LABEL,
} from "../src/lib/reference-values-model.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const cal = { points: ["20", "40"], pointIds: ["pt-1", "pt-2"], directionsBg: [] as string[], directionsEn: [] as string[] };
eq("a point's key is its stable id (3.6)", pointKeys(cal).map((p) => p.key), ["pt-1", "pt-2"]);
const dirs = { ...cal, directionsBg: ["Опън", "Натиск"], directionsEn: ["Tension", "Compression"] };
eq("…× the directions — the English list, as scoring reads it — keyed by the direction's words, with scoring's indexes", pointKeys(dirs).map((p) => `${p.key}:${p.dirIdx}:${p.pointIdx}:${p.direction?.bg}`), ["pt-1|tension:0:0:Опън", "pt-2|tension:0:1:Опън", "pt-1|compression:1:0:Натиск", "pt-2|compression:1:1:Натиск"]);
eq("…a reordered direction keeps its values (the key follows the words, not the place)", pointKeys({ ...dirs, directionsEn: ["Compression", "Tension"], directionsBg: ["Натиск", "Опън"] }).filter((p) => p.pointIdx === 0).map((p) => p.key), ["pt-1|compression", "pt-1|tension"]);
eq("…only a Bulgarian list (no English): no directions, as scoring", pointKeys({ ...cal, directionsBg: ["Опън"], directionsEn: [] }).map((p) => p.key), ["pt-1", "pt-2"]);
t("points without lasting ids (before 3.6): not ready — values are never keyed by place", !pointsReady({ points: ["5"] }) && !pointsReady({ points: ["5", "6"], pointIds: ["pt-1"] }) && pointsReady(cal));
t("the form's fingerprint changes with the points and directions", fingerprint(pointKeys(cal)) !== fingerprint(pointKeys(dirs)) && fingerprint(pointKeys(cal)) === fingerprint(pointKeys({ ...cal })));

eq("numbers as typed: one decimal comma or point; a minus; an exponent; empty is «not yet»", ["0,012", " -0.008 ", "1.5e-3", ""].map(readNumber), [0.012, -0.008, 0.0015, undefined]);
eq("…thousands and decimals mixed, or two separators, refused — never guessed", ["1,234.5", "1.234,5", "1,2,3", "abc"].map(readNumber), [null, null, null, null]);
const keys = pointKeys(cal);
const form = (m: Record<string, string>) => (n: string) => m[n];
const ok = readReferenceTable(form({ "xBefore__pt-1": "0,012", "xAfter__pt-1": "-0,004", "uCal__pt-1": "0,004", "k__pt-1": "2", "xBefore__pt-2": "0,02", "xBefore__pt-9": "1" }), keys);
eq("the table: every point's errors and uncertainties — negative errors too; only the scheme's points kept", ok.ok ? ok.rows : null, { "pt-1": { xBefore: 0.012, xAfter: -0.004, uCal: 0.004, k: 2 }, "pt-2": { xBefore: 0.02 } });
eq("…refused, naming the point and the field: not a number, a negative uncertainty, u (calibration) 0, k out of 1–10", [
  readReferenceTable(form({ "xAfter__pt-2": "x" }), keys), readReferenceTable(form({ "uOther__pt-1": "-0,1" }), keys), readReferenceTable(form({ "uCal__pt-1": "0" }), keys), readReferenceTable(form({ "k__pt-1": "0,5" }), keys), readReferenceTable(form({ "k__pt-1": "11" }), keys),
].map((r) => (r.ok ? "ok" : `${r.problem.key}.${r.problem.field}:${r.problem.why}`)), ["pt-2.xAfter:number", "pt-1.uOther:negative", "pt-1.uCal:zero", "pt-1.k:k", "pt-1.k:k"]);
t("k is 2 unless given; a k other than 2 needs its reason (Zadanie)", kOf({}) === 2 && kOf({ k: 3 }) === 3 && kNeedsReason({ a: { k: 3 } }) && !kNeedsReason({ a: { k: 2 }, b: {} }));

const d = derived({ xBefore: 0.012, xAfter: 0.018 })!;
t("X_ref = the mean of the errors before and after; u_stab = |before − after| / (2√3) (Zadanie)", Math.abs(d.xRef - 0.015) < 1e-12 && Math.abs(d.uStab - 0.006 / (2 * Math.sqrt(3))) < 1e-12);
t("…nothing derived until both are in", derived({ xBefore: 1 }) === null && derived(undefined) === null);

const stops = [{ id: "r1", kind: "ref" }, { id: "l1", kind: "lab" }, { id: "l2", kind: "lab" }, { id: "r2", kind: "ref" }];
eq("the reference stops: before every laboratory, after every one", ["r1", "r2", "l1", "x"].map((id) => referenceRole(stops, id)), ["before", "after", null, null]);
eq("…a reference stop between laboratories is neither", referenceRole([{ id: "l1", kind: "lab" }, { id: "rm", kind: "ref" }, { id: "l2", kind: "lab" }], "rm"), null);

eq("what 2.0 still needs: per point, before, after and u_calibration (k defaults to 2, u_other may be empty)", missingFor2(keys, ok.ok ? ok.rows : {}), { before: 0, after: 1, uCal: 1 });
eq("versions: the latest counts", currentRows({ versions: [{ at: "a", by: "x", rows: { "pt-1": { xBefore: 1 } } }, { at: "b", by: "x", rows: { "pt-1": { xBefore: 2 } } }] }), { "pt-1": { xBefore: 2 } });
t("…a save that changes nothing is no new version", sameRows({ "pt-1": { xBefore: 1 } }, { "pt-1": { xBefore: 1 } }) && !sameRows({ "pt-1": { xBefore: 1 } }, { "pt-1": { xBefore: 1, k: 2 } }));
t("…compared field by field: a row the database gave back with its keys re-sorted is the same row (review)", sameRow(JSON.parse('{"k":2,"uCal":0.004,"xAfter":-0.004,"xBefore":0.012}'), { xBefore: 0.012, xAfter: -0.004, uCal: 0.004, k: 2 }));
eq("values of points no longer in the scheme: found — kept, shown, never moved onto another", orphans({ "pt-1": { xBefore: 1 }, "pt-3": { xBefore: 2 }, "pt-1|tension": { xAfter: 3 } }, keys), ["pt-3", "pt-1|tension"]);
t("every field has its words — the reference laboratory's error before and after", REFERENCE_FIELDS.every((f) => !!REFERENCE_FIELD_LABEL[f].bg && !!REFERENCE_FIELD_LABEL[f].en) && /Грешка преди/.test(REFERENCE_FIELD_LABEL.xBefore.bg) && /Грешка след/.test(REFERENCE_FIELD_LABEL.xAfter.bg));

// ── the wiring (source shape) ──
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const act = src("lib/actions.ts");
const save = act.slice(act.indexOf("export async function saveReferenceValuesAction"));
t("saving: the scheme manager or who processes the results, in THIS scheme; a calibration scheme; points with lasting ids; until the report", /await requireOneOf\(\["scheme\.edit", "results\.process"\], schemeId\)/.test(save) && /if \(!scheme \|\| scheme\.type !== "C"\) return refuse\("scheme"\)/.test(save) && /if \(!pointsReady\(scheme\.calibration\)\) return refuse\("ids"\)/.test(save) && /const REFERENCE_OPEN = \(st: string\) => st === "draft" \|\| st === "open" \|\| st === "running" \|\| st === "processing"/.test(act));
t("…a refusal hands the table back as typed (review)", /const refuse = \(error: string, problem\?: \{ key: string; field: string; why: string \}\): ReferenceSaveState => \(\{ error, problem, values: typed, kReason, n: Date\.now\(\) \}\)/.test(save));
t("…against the version AND the points the form was drawn for, in the lock", /versions\.length !== seen \|\| fingerprint\(pointKeys\(s\.calibration\)\) !== fp\) \{ res\.out = "moved"/.test(save));
t("…values of points no longer in the scheme kept by a save (review)", /const kept = Object\.fromEntries\(orphans\(res\.prev, pointKeys\(s\.calibration\)\)/.test(save) && /res\.rows = \{ \.\.\.kept, \.\.\.typedRows \}/.test(save));
t("…a k other than 2 with its reason", /if \(kNeedsReason\(typedRows\) && kReason\.length < 3\) return refuse\("kreason"\)/.test(save));
t("…journalled: the version and the points that changed — field by field, never by JSON", /logActivity\("scheme\.reference_values"/.test(save) && /filter\(\(k\) => !sameRow\(prev\[k\], rows\[k\]\)\)/.test(save) && !/JSON\.stringify\(prev\[k\]/.test(save));
const page = src("app/schemes/[id]/reference/page.tsx");
t("the page: in THIS scheme, for who reads the results or edits the scheme", /await requireOneOf\(\["results\.read", "scheme\.edit", "results\.process"\], id\)/.test(page));
const scheme = src("app/schemes/[id]/page.tsx");
t("the scheme's page: the link only to who may open it; «process» warns while the values are not complete for 2.0", /\{type === "C" && canReference && \(/.test(scheme) && /a === "process" \? \[lockSay, refGap \?/.test(scheme));
t("…in the §4.2 inventory: it names nobody", /schemes\/\[id\]\/reference\/page\.tsx", names: "never"/.test(readFileSync(new URL("./regression-routes.mjs", import.meta.url), "utf8")));
t("…kept in the round export with the coded part (the device's numbers)", /referenceValues: "coded"/.test(src("lib/round-export.ts")));

console.log(`reference-values.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
