// Plan part 5.3 — the coding act (Zadanie «Кодиране», stage 9; А2; Реш. 124; D17): an
// application has a provisional reference until the act; then each participation on the
// final list draws, at random, a laboratory number never given in the scheme, and its
// objects from the batch's objects for participants. Once, on record.
import { readFileSync } from "node:fs";
import { isProvisional, nextProvisional, refsEverGiven, drawCodes, drawObjects, recodeScheme, codingProblem, toCode, unfinished, objectsGiven, sampleCodeOf, CODING_PROBLEM_TEXT } from "../src/lib/coding-model.ts";
import { commitCoding } from "../src/lib/coding-store.ts";
import { getScheme } from "../src/lib/store.ts";
import { addParticipant, listParticipants } from "../src/lib/participants.ts";
import { uniformBelow } from "../src/lib/random.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the provisional reference ──
eq("a provisional reference: «Z» and three digits — never shaped like a laboratory code", ["Z001", "Z999", "261101", "Z01", "z001", "Z0001"].map(isProvisional), [true, true, false, false, false, false]);
eq("the next one, never one given before (the highest + 1); none past Z999", [nextProvisional([]), nextProvisional(["Z001", "Z003", "261101"]), nextProvisional(["Z999"])], ["Z001", "Z004", null]);

// ── the codes ──
const first = (_n: number) => 0; // always the first of what is left
eq("drawn from the numbers never given — a code the scheme held is never given again", drawCodes("2611", ["261101", "261103", "Z001"], 3, first), ["261102", "261104", "261105"]);
t("…never two the same, and none taken, over many random draws", Array.from({ length: 200 }, () => drawCodes("2611", ["261150"], 10, uniformBelow)!).every((c) => new Set(c).size === 10 && !c.includes("261150") && c.every((x) => /^2611\d{2}$/.test(x))));
eq("…none when too few are left (99 at most)", drawCodes("2611", Array.from({ length: 98 }, (_, i) => `2611${String(i + 1).padStart(2, "0")}`), 2, first), null);
const seen = new Set<string>();
for (let i = 0; i < 400; i++) seen.add(drawCodes("2611", [], 1, uniformBelow)![0]);
t("…at random: every free number can be drawn", seen.size > 90, String(seen.size));

// ── the objects ──
eq("the objects: as many as each needs, from the pool, never one twice", drawObjects(["A1", "A2", "A3", "A4"], [2, 1, 0], first), [["A1", "A2"], ["A3"], []]);
eq("…none when the pool is too small", drawObjects(["A1"], [1, 1], first), null);
t("…at random, never repeated", Array.from({ length: 100 }, () => drawObjects(["A1", "A2", "A3", "A4", "A5"], [2, 2], uniformBelow)!).every((d) => new Set(d.flat()).size === 4));

// ── the scheme's records follow the new codes ──
const doc = { path: "p", name: "f.pdf", mime: "application/pdf", size: 1, uploadedAt: "x", uploadedBy: "m" };
const before = {
  labDocs: { Z001: { proforma: doc }, "261107": { proforma: doc } },
  labUploads: { Z002: { results: doc } },
  paidAt: { Z001: "2026-11-06" },
  remindedAt: { "resultsDue:2026-12-10": "a", "resultsDue@Z002:2026-12-20": "b" },
  certificates: { Z003: { no: "1", date: "d" } },
  scoring: { assigned: {}, results: { Z002: { "0": { value: 1 } } } },
  extensions: [{ code: "Z002", key: "resultsDue" }, { code: "261107", key: "resultsDue" }],
  chain: { stops: [{ id: "s1", kind: "lab", code: "Z001" }, { id: "s2", kind: "ref" }] },
  supersededFiles: [{ where: "labdoc:Z001:proforma", file: doc, at: "a", reason: "replaced", by: "m" }, { where: "labupload:Z009:results", file: doc, at: "a", reason: "replaced", by: "m" }],
} as never;
const map = { Z001: "261142", Z002: "261117", Z003: "261163" };
const after = recodeScheme(before, map) as Record<string, unknown> & { labDocs: object; labUploads: object; paidAt: object; remindedAt: object; certificates: object; scoring: { results: object }; extensions: { code: string }[]; chain: { stops: { code?: string }[] }; supersededFiles: { where: string }[] };
eq("every record kept by code moves to the new code — none dropped, others untouched", [Object.keys(after.labDocs).sort(), Object.keys(after.labUploads), Object.keys(after.paidAt), Object.keys(after.certificates), Object.keys(after.scoring.results)], [["261107", "261142"], ["261117"], ["261142"], ["261163"], ["261117"]]);
eq("…the stamps, the extensions, the device's stops and the replaced files too", [Object.keys(after.remindedAt), after.extensions.map((e) => e.code), after.chain.stops.map((x) => x.code ?? "-"), after.supersededFiles.map((f) => f.where)], [["resultsDue:2026-12-10", "resultsDue@261117:2026-12-20"], ["261117", "261107"], ["261142", "-"], ["labdoc:261142:proforma", "labupload:Z009:results"]]);
eq("…only what changes is returned; a key up the prototype chain is never a code", Object.keys(recodeScheme({ paidAt: { "261101": "x" }, labDocs: { constructor: { proforma: doc } } } as never, { Z001: "261142" })), []);

// ── when, and for whom ──
const fin = { act: "announce2", from: "running", to: "running", at: "x", by: "m", day: "d", final: { runs: [0], dropped: [], participants: ["a", "b"] } } as never;
const ann1 = { act: "announce", from: "open", to: "running", at: "x", by: "m", day: "d" } as never;
const sch = (status: string, acts: never[], extra: object = {}) => ({ status, type: "T" as const, lifecycle: { acts }, ...extra });
const ps = [{ id: "a", code: "Z001" }, { id: "b", code: "261105" }, { id: "c", code: "Z003" }, { id: "d", code: "Z004", standing: { state: "refused", at: "x", by: "m", category: "late", reason: "abc" } as never }];
eq("the act codes those on the final list still under a provisional reference — not one coded, off the list or out of the round", toCode(sch("running", [ann1, fin]), ps).map((p) => p.id), ["a"]);
eq("…only while running, after the second announcement; never for a sequential calibration scheme (D17); nothing to code is said", [codingProblem(sch("open", []), ps), codingProblem(sch("running", [ann1]), ps), codingProblem(sch("running", [ann1, fin], { type: "C", distribution: "sequential" }), ps), codingProblem(sch("running", [ann1, fin]), [{ id: "a", code: "261101" }]), codingProblem(sch("running", [ann1, fin]), ps)], ["state", "no-list", "admission", "none", null]);
eq("a follow-up that did not finish (no «code assigned» yet): completed by pressing again — never drawn again; a dev coding never", unfinished([{ id: "r", at: "", by: "", day: "", codes: { Z001: "261142", Z002: "261117" }, ids: { Z001: "a", Z002: "b" }, objects: { "261142": ["A1"] } }, { id: "d", at: "", by: "", day: "", dev: true, codes: { Z009: "261199" }, ids: { Z009: "z" } }], [{ id: "a", code: "261142" }, { id: "b", code: "261117" }, { id: "z", code: "261199" }], new Set(["261117"])), [{ id: "a", ref: "Z001", code: "261142", objects: ["A1"] }]);
eq("every reference ever given — held now, or coded — so none is given twice (review)", nextProvisional(refsEverGiven(["Z004", "261142"], [{ id: "r", at: "", by: "", day: "", codes: { Z001: "261142", Z005: "261150" } }])), "Z006");
eq("objects given before are never given again; a long list kept short with the participation", [[...objectsGiven([{ at: "", by: "", day: "", codes: {}, objects: { "261142": ["A1", "A2"] } }])], sampleCodeOf([]), sampleCodeOf(["A1", "A2"]), sampleCodeOf(Array.from({ length: 12 }, (_, i) => `OBJ-2026-${i}`))], [["A1", "A2"], undefined, "A1, A2", "OBJ-2026-0 … (12)"]);
t("every refusal has its words", Object.values(CODING_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── the store, in memory ──
const S = "26-01-T-1";
const x = await addParticipant({ schemeId: S, labName: "Кодиране ООД" }, "test");
const y = await addParticipant({ schemeId: S, labName: "Друга ООД" }, "test");
t("entered: a provisional reference, never a code", isProvisional(x.code) && isProvisional(y.code) && x.code !== y.code);
const xRef = x.code;
const rec = { id: "rec-1", at: "a", by: "test", day: "d", codes: { [xRef]: "261177" }, ids: { [xRef]: x.id } };
const c1 = await commitCoding(S, rec, () => ({}), "test");
const after2 = await listParticipants(S);
t("coded: the participation carries its code, the record is on the scheme; the other keeps its reference", c1.ok && after2.find((p) => p.id === x.id)?.code === "261177" && after2.find((p) => p.id === y.id)?.code === y.code && !!(await getScheme(S))?.coding?.some((r) => r.id === "rec-1"));
const c2 = await commitCoding(S, { ...rec, id: "rec-2" }, () => ({}), "test");
const c3 = await commitCoding(S, { id: "rec-3", at: "a", by: "t", day: "d", codes: { [y.code]: "261177" } }, () => ({}), "test");
const c4 = await commitCoding(S, { id: "rec-4", at: "a", by: "t", day: "d", codes: { [y.code]: "261178", Z998: "261178" } }, () => ({}), "test");
t("…the act whole or not at all: a reference coded before, a code taken, two references onto one code — refused, nothing moved", !c2.ok && !c3.ok && !c4.ok && (await listParticipants(S)).find((p) => p.id === y.id)?.code === y.code && ((await getScheme(S))?.coding ?? []).filter((r) => r.id.startsWith("rec-")).length === 1);
const z = await addParticipant({ schemeId: S, labName: "Трета ООД" }, "test");
t("…a new application after it: never the coded reference again (review)", z.code !== xRef && isProvisional(z.code));
eq("the scheme's records merged, not overwritten, should a code already hold something", recodeScheme({ labDocs: { Z001: { results: doc }, "261142": { proforma: doc } } } as never, { Z001: "261142" }), { labDocs: { "261142": { proforma: doc, results: doc } } });

// ── the migration and the action ──
const sql = readFileSync(new URL("../supabase/migrations/0040_coding.sql", import.meta.url), "utf8");
t("0040: the act whole in one transaction — the scheme's row locked, the record appended, its records moved, each participation with its notices and case events; refused if coded before, two onto one code, or a code taken; only the server key", /select s\.data into d from public\.schemes s where s\.id = p_scheme for update;/.test(sql) && /raise exception 'coding: already coded'/.test(sql) && /two references would get one code/.test(sql) && /update public\.participants p set code = v/.test(sql) && /update public\.notifications x set code = v/.test(sql) && /update public\.case_events x set code = v/.test(sql) && /jsonb_build_object\('coding', coalesce\(d->'coding', '\[\]'::jsonb\) \|\| jsonb_build_array\(p_record\)\)/.test(sql) && /security definer set search_path = ''/.test(sql) && /grant execute on function public\.code_participations\(text, text, jsonb, jsonb\) to service_role;/.test(sql) && /'0040_coding'/.test(sql));
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const ca = actions.slice(actions.indexOf("export async function codingAction"), actions.indexOf("async function afterCoding"));
t("the act: the coding expert's; who to tell found before anything is recorded (2.3)", /await requireCap\("results\.enter", schemeId\);/.test(ca.slice(0, 300)) && ca.indexOf("labOf = await labIdsFor(schemeId, todo, by)") > 0 && ca.indexOf("labOf = await labIdsFor(schemeId, todo, by)") < ca.indexOf("await commitCoding("));
t("…drawn with the fair random; the act committed whole (the record, the scheme's records, the participations) — then the follow-up", /drawCodes\(prefix, heldBefore, todo\.length, uniformBelow\)/.test(ca) && /drawObjects\(pool, group\.map\(needOfP\), uniformBelow\)/.test(ca) && /const done = await commitCoding\(schemeId, record,/.test(ca) && ca.indexOf("await commitCoding(") < ca.indexOf("await afterCoding(scheme, targets, map, objects, labOf)") && /ids: Object\.fromEntries\(targets\.map\(\(x\) => \[x\.ref, x\.id\]\)\)/.test(ca));
t("…a follow-up that stopped: completed by pressing again — never drawn again", ca.indexOf("const left = unfinished(scheme.coding, parts, assigned);") < ca.indexOf("drawCodes(") && !/pendingCodes/.test(ca));
t("coding before anything rests on a code: results, certificates and processing refuse a provisional one (review)", /const codes = participants\.filter\(\(p\) => !isProvisional\(p\.code\)\)\.map\(\(p\) => p\.code\);/.test(actions) && /if \(isProvisional\(code\) \|\| !\(await listParticipants\(schemeId\)\)\.some/.test(actions) && /return \{ error: CODING_REFUSAL\.uncoded \};/.test(actions));
t("…on record by counts — never the mapping or a name; stage 9 done by the act", /summary: `Coding act: \$\{targets\.length\} participation\(s\) coded at random from \$\{MAX_LAB_NUMBER - numbersTaken\(prefix, heldBefore\)\.size\} free numbers/.test(ca) && /"9": \{ at, by, day, note: `Кодиране: /.test(ca));
t("entry gives no code and no «code assigned» before the act (save sequential calibration, D17)", (actions.match(/if \(!isProvisional\(p\.code\)\) \{\n\s*await addCaseEvent\(\{ schemeId, code: p\.code, kind: "code_assigned"/g) ?? []).length === 2);
const ne = readFileSync(new URL("../src/lib/notify-events.ts", import.meta.url), "utf8");
t("a notice never shows a provisional reference as a code; the code comes with its own notice", /const refBg = \(code: string\) => \(isProvisional\(code\) \? "" :/.test(ne) && !/\(код \$\{code\}\) е отказана/.test(ne) && /kind: "participation\.coded"/.test(ne));

console.log(`coding.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
