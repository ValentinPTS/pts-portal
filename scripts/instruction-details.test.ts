// Plan part 3.11 — the Instruction's details: its contacts from the scheme's team
// (N19), never names written into the template; Реш. 150's sentence in every
// Instruction (Ф 7.3.5-1) — information, never a block.
import { readFileSync } from "node:fs";
import { renderInstruction } from "../src/lib/docs/instruction.ts";
import { renderInstructionC } from "../src/lib/docs/instruction-c.ts";
import { WRITTEN_INSTRUCTIONS, teamMember, instructionContacts } from "../src/lib/docs/instruction-common.ts";
import { docPrintHtml } from "../src/lib/doc-template.ts";
import { TEMPLATE_VERSION } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import { esc } from "../src/lib/doc-css.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T = structuredClone(pavingBlocks) as Scheme;
const C = structuredClone(forceCalibration) as Scheme;
const renamed = (s: Scheme, name: string): Scheme => ({ ...s, team: s.team.map((m, i) => (i === 0 ? { ...m, name } : m)) });

const ti = renderInstruction(T, "bg");
t("testing: the contact is the scheme's manager, from its team", ti.includes(esc(T.team[0].name)) && !ti.includes("Valentin Belovski"));
t("…another manager on the team: another contact", renderInstruction(renamed(T, "инж. Нов Ръководител"), "bg").includes("инж. Нов Ръководител"));
const ci = renderInstructionC(C, "bg");
const tech = C.team.find((m) => /Технически експерт/.test(m.roleBg))!;
t("calibration: the manager and the technical expert, from the team", ci.includes(esc(C.team[0].name)) && ci.includes(esc(tech.name)) && !ci.includes("Nadya Vladimirova"));
const mi = renderInstructionC({ ...C, calTemplate: "m1" }, "bg");
t("…on M1 too — the manager and the technical expert (review)", mi.includes(esc(C.team[0].name)) && mi.includes(esc(tech.name)));
// review: the roles read by their own names
const R = (roleBg: string, roleEn: string, name: string) => ({ roleBg, roleEn, name });
eq("the scheme's manager, not a «Технически ръководител» listed before", teamMember({ team: [R("Технически ръководител", "Technical Manager", "А"), R("Ръководител на схемата за изпитване за пригодност", "PT Scheme Manager", "Б")] }, "manager")?.name, "Б");
eq("…nor a «Quality Manager»: nobody", teamMember({ team: [R("Мениджър по качеството", "Quality Manager", "В")] }, "manager"), undefined);
t("no manager on the team: a mark to fill — never the first name on the team", /\[за попълване: ръководителят на схемата/.test(instructionContacts({ type: "T", team: [R("Инженер материалознание", "Materials Engineer", "Г")] }, "bg")) && !instructionContacts({ type: "T", team: [R("Инженер материалознание", "Materials Engineer", "Г")] }, "bg").includes(">Г<"));
t("…an empty team: marks, the telephone and e-mail still there", /\[за попълване:/.test(instructionContacts({ type: "C", team: [] }, "bg")) && instructionContacts({ type: "C", team: [] }, "bg").includes("office@ptsbg.eu"));
// review: a SAVED Instruction printed — the team now, and the sentence
const oldBody = `<h2 class="sec">1. Номер</h2><div class="contacts"><div class="person"><div class="nm">Eng. Valentin Belovski</div></div><div class="cline">📞 0897 50 39 80</div></div>`;
const printed = docPrintHtml(renamed(T, "инж. Нов Ръководител"), "instruction", "bg", oldBody);
t("a saved Instruction printed: its contacts from the team as it is now (review)", printed.includes("инж. Нов Ръководител") && !printed.includes("Valentin Belovski"));
t("…and Реш. 150's sentence, where the saved body has none", printed.includes(esc(WRITTEN_INSTRUCTIONS.testing.bg)) && (printed.match(/data-written-instructions/g) ?? []).length === 1);
eq("…the Instruction's template is a new version: every Instruction is a changed document, to issue again (review)", TEMPLATE_VERSION.instruction, 2);

t("Реш. 150 in every Instruction: testing", ti.includes("data-written-instructions") && ti.includes(esc(WRITTEN_INSTRUCTIONS.testing.bg)) && renderInstruction(T, "en").includes(esc(WRITTEN_INSTRUCTIONS.testing.en)));
t("…calibration, and on M1", ci.includes(esc(WRITTEN_INSTRUCTIONS.calibration.bg)) && mi.includes(esc(WRITTEN_INSTRUCTIONS.calibration.bg)));
const lab = readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8");
t("…and said to the laboratory as information — the decided sentence, by kind, until its results are in (review)", /data-written-instructions/.test(lab) && /writtenInstructions\(it\.scheme\.type\)/.test(lab) && /it\.p\.status !== "submitted" && it\.p\.status !== "scored"/.test(lab));
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("…never a block: no action refuses on it", !/WRITTEN_INSTRUCTIONS|writtenInstructions/.test(actions));
t("no Instruction writes a person's name into the template", ["instruction.ts", "instruction-c.ts"].every((f) => !/Valentin Belovski|Nadya Vladimirova|Беловски|Владимирова/.test(readFileSync(new URL(`../src/lib/docs/${f}`, import.meta.url), "utf8"))));

console.log(`instruction-details.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
