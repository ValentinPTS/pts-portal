// Plan part 3.12 — the code rule (А2; D17): today's format (year, month without a
// leading zero, the scheme's sequence, a two-digit lab number — PTS 25/07-T-1 → 257101);
// a sequential calibration scheme draws the lab number at random at admission; the
// others get it at the coding act (5.3) — until then the next in turn; never twice.
import { nextProvisional } from "../src/lib/coding-model.ts";
import { readFileSync } from "node:fs";
import { codeMoment, drawLabNumber, nextLabNumber, labCode, numbersTaken, MAX_LAB_NUMBER } from "../src/lib/code-rule.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq("today's format: PTS 25/07-T-1, lab 1 → 257101", labCode("2571", 1), "257101");
eq("when: a sequential calibration scheme at admission; the others at the coding act", [codeMoment({ type: "C", distribution: "sequential" }), codeMoment({ type: "C" }), codeMoment({ type: "T", distribution: "simultaneous" }), codeMoment({ type: "C", distribution: "simultaneous" })], ["admission", "admission", "coding-act", "coding-act"]);
eq("the numbers given under the prefix — not another scheme's", [...numbersTaken("2571", ["257101", "257103", "257201", "25710", "2571abc"])].sort(), [1, 3]);
eq("the next in turn (until 5.3)", [nextLabNumber("2571", []), nextLabNumber("2571", ["257101", "257104"])], [1, 5]);
const seq = (vals: number[]) => { let i = 0; return (n: number) => vals[i++] % n; };
eq("drawn at random from the numbers not yet given", drawLabNumber("2571", ["257101", "257102"], seq([0])), 3);
eq("…the last free one when the draw says so", drawLabNumber("2571", ["257101", "257102"], seq([96])), 99);
t("…never one already given, whatever the draw", Array.from({ length: 200 }, (_, k) => drawLabNumber("2571", ["257105", "257150"], () => k % 97)).every((n) => n !== 5 && n !== 50 && n !== null && n >= 1 && n <= 99));
const all = Array.from({ length: MAX_LAB_NUMBER }, (_, i) => labCode("2571", i + 1));
eq("…none left at 99: no number, never a three-digit one", [drawLabNumber("2571", all, () => 0), nextLabNumber("2571", all)], [null, null]);
// the draw is fair: every free number can come out
const seen = new Set(Array.from({ length: 97 }, (_, k) => drawLabNumber("2571", ["257101", "257102"], () => k)));
t("every free number can be drawn", seen.size === 97);

// the store itself, in memory (review): a sequential calibration scheme draws at
// admission and says from how many; a testing scheme gives the next in turn
const { addParticipant, listParticipants } = await import("../src/lib/participants.ts");
const before = (await listParticipants("25-06-C-1")).map((p) => p.code);
const cA = await addParticipant({ schemeId: "25-06-C-1", labName: "Тест А" }, "tester@ptsbg.eu");
const cB = await addParticipant({ schemeId: "25-06-C-1", labName: "Тест Б" }, "tester@ptsbg.eu");
t("a sequential calibration scheme: drawn at admission, the prefix 2561, from the free numbers", /^2561\d{2}$/.test(cA.code) && cA.drawnFrom === MAX_LAB_NUMBER - numbersTaken("2561", before).size && cB.code !== cA.code && !before.includes(cA.code), `${cA.code} ${cA.drawnFrom}`);
const tBefore = (await listParticipants("26-01-T-1")).map((p) => p.code);
const tA = await addParticipant({ schemeId: "26-01-T-1", labName: "Тест В" }, "tester@ptsbg.eu");
eq("a testing scheme: a provisional reference until the coding act (5.3) — no code, no draw", [tA.code, tA.drawnFrom], [nextProvisional(tBefore), undefined]);

const parts = readFileSync(new URL("../src/lib/participants.ts", import.meta.url), "utf8");
t("a participant gets its code by the rule — drawn with the fair random of lib/random at admission", /const drawn = nextCode\(prefix, refsEverGiven\(existing\.map\(\(x\) => x\.code\), scheme\?\.coding\), scheme \? codeMoment\(scheme\) : "coding-act"\);/.test(parts) && /drawLabNumber\(prefix, taken, uniformBelow\)/.test(parts));
t("two added at once drawing the same number: drawn again — the database's unique code, memory too (review)", /if \(isDuplicateCode\(e\) && attempt < 3\) continue;/.test(parts) && /mem\.some\(\(x\) => x\.schemeId === coded\.schemeId && x\.code === coded\.code\)/.test(parts));
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("an application approved twice at once: claimed in the lock first — one participant (review)", /let claimed = false;\s*(let listFinal = false;\s*)?await updateSchemeWith\(schemeId, \(cur\) => \{\s*const a = cur\.applications\?\.find\(\(x\) => x\.id === appId\);\s*if \(!a \|\| a\.status !== "pending"\) return \{\};/.test(actions) && /if \(!claimed\) redirect/.test(actions));
t("…no number left: said so, and the application is pending again", /e instanceof NoLabNumberError \? "full" as const : null/.test(actions) && /x\.status === "approved" \? \{ \.\.\.x, status: "pending" as const \}/.test(actions));
t("the draw on record: from how many free (D17)", /laboratory number drawn at random from \$\{p\.drawnFrom\} free/.test(actions));

console.log(`code-rule.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
