// Plan parts 5.8 and 5.11 — the П-sentences that switch at Gate B (D16; PTS's answers 7б):
// П4/П5 (the testing invitation), П7 (the calibration invitation and M1's), П12 (the testing
// Instruction), П17 (the calibration Instruction and M1's point 10). Off until the deployment
// says PTS_GATE_B=on; switching makes each document a new edition.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gateB, P4, P5, P7, P12, P17, P17_M1, OLD, NEW_P12_ITEM, NEW_P17_ITEM, refreshGateSentences, stillByEmail, swapsAreOneWay } from "../src/lib/gate-texts.ts";
import { renderInvitation } from "../src/lib/docs/invitation.ts";
import { renderInvitationC } from "../src/lib/docs/invitation-c.ts";
import { docPrintHtml } from "../src/lib/doc-template.ts";
import { chainReceiptTarget, chainReceiptId } from "../src/lib/delivery-model.ts";
import { renderInstruction } from "../src/lib/docs/instruction.ts";
import { renderInstructionC } from "../src/lib/docs/instruction-c.ts";
import { fingerprint, GATE_DOCS } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

delete process.env.PTS_GATE_B;
t("Gate B: off unless the deployment says «on»", !gateB({}) && !gateB({ PTS_GATE_B: "1" }) && !gateB({ PTS_GATE_B: "ON " }) && gateB({ PTS_GATE_B: "on" }));
t("every П-sentence in both languages", [P4, P5, P7, P12, P17].every((x) => x.bg.length > 40 && x.en.length > 40 && /[а-я]/.test(x.bg) && !/[а-я]/i.test(x.en.replace(/«[^»]*»/g, ""))));
t("П12, П17: the portal holds the protocol and the declaration — nothing of the two by e-mail", [P12, P17, P17_M1].every((x) => /портала/.test(x.bg) && /portal/.test(x.en) && /4\.2-2/.test(x.bg) && /F 4\.2-2/.test(x.en) && /По имейл не се изпраща нищо от двете/.test(x.bg) && /Neither is sent by e-mail/.test(x.en)));
t("…the receipt protocol (Ф 7.3.4-1) named in both — online for calibration too since 5.11 (review: never dropped)", [P12, P17, P17_M1].every((x) => /7\.3\.4-1/.test(x.bg) && /F 7\.3\.4-1/.test(x.en)));
t("…П17: the device's arrival by the chain's own button, and the protocol still by the next working day, as M1 says (review)", [P17, P17_M1].every((x) => /Уредът пристигна при мен/.test(x.bg) && /The device has arrived/.test(x.en) && /следващия работен ден/.test(x.bg) && /next working day/.test(x.en)));
t("…the Instructions' own script: «F» as they print it; M1's «Ф», its forms in bold (review)", !/Ф /.test(P12.bg + P17.bg) && /\(Ф 7\.3\.4-1\)\*\*/.test(P17_M1.bg) && /\*\*Декларация за конфиденциалност \(Ф 4\.2-2\)\*\*/.test(P17_M1.bg));

// ── the documents, rendered: off — the e-mail sentence; on — the portal's ──
const plainC = { ...forceCalibration, calTemplate: undefined } as Scheme; // the calibration Instruction outside M1
const OLD_T = "По имейл изпратете също: Протокол за получаване на обект";
const OLD_C = "По имейл изпратете също: Протокола за получаване на обект";
const off = { t: renderInstruction(pavingBlocks, "bg"), tEn: renderInstruction(pavingBlocks, "en"), c: renderInstructionC(plainC, "bg") };
// every gated document a template renders, both languages — before and after Gate B
const all = () => ({ invT: ["bg", "en"].map((l) => renderInvitation(pavingBlocks, l as "bg" | "en")), invC: ["bg", "en"].map((l) => renderInvitationC(plainC, l as "bg" | "en")), insT: ["bg", "en"].map((l) => renderInstruction(pavingBlocks, l as "bg" | "en")), insC: ["bg", "en"].map((l) => renderInstructionC(plainC, l as "bg" | "en")) });
const allOff = all();
const fpOff = { instr: fingerprint(pavingBlocks, "instruction"), plan: fingerprint(pavingBlocks, "plan") };
process.env.PTS_GATE_B = "on";
const on = { t: renderInstruction(pavingBlocks, "bg"), tEn: renderInstruction(pavingBlocks, "en"), c: renderInstructionC(plainC, "bg"), cEn: renderInstructionC(plainC, "en") };
const allOn = all();
const fpOn = { instr: fingerprint(pavingBlocks, "instruction"), plan: fingerprint(pavingBlocks, "plan") };
delete process.env.PTS_GATE_B;
t("off: the testing Instruction keeps the e-mail sentence (the pilot runs on e-mail — Реш. 137)", off.t.includes(OLD_T) && !off.t.includes(P12.bg.slice(0, 40)));
t("on: П12 instead — and the feedback sentence after it stays", !on.t.includes(OLD_T) && on.t.includes(P12.bg.slice(0, 60)) && /Връзка към Лист за обратна връзка \(F 8\.6-2\)/.test(on.t) && on.tEn.includes(P12.en.slice(0, 60)));
t("on: the calibration Instruction carries П17 — in both languages", !on.c.includes(OLD_C) && on.c.includes(P17.bg.slice(0, 50)) && off.c.includes(OLD_C) && on.cEn.includes(P17.en.slice(0, 50)) && !on.cEn.includes(OLD.P17.en.slice(0, 40)));
// the portal's own documents are issuable after Gate B — none mistaken for «by e-mail» (review: П7 was)
t("after Gate B, every gated document the templates render passes the e-mail check — both languages", Object.values(allOn).flat().every((h) => !stillByEmail(h, { PTS_GATE_B: "on" })), JSON.stringify(Object.fromEntries(Object.entries(allOn).map(([k, v]) => [k, v.map((h) => stillByEmail(h, { PTS_GATE_B: "on" }))]))));
t("…and one rendered before it would be caught (bar the calibration invitation, whose old П7 names no e-mail)", [...allOff.invT, ...allOff.insT, ...allOff.insC].every((h) => stillByEmail(h, { PTS_GATE_B: "on" })) && allOff.invC.every((h) => !stillByEmail(h, { PTS_GATE_B: "on" })));
t("every swap is one-way — the new never holds the old; a second print changes nothing", swapsAreOneWay() && [...Object.values(allOff).flat(), ...Object.values(allOn).flat()].every((h) => { const once = refreshGateSentences(h, { PTS_GATE_B: "on" }); return refreshGateSentences(once, { PTS_GATE_B: "on" }) === once; }));
t("…a calibration invitation saved before Gate B: printed after it, П7 once — never twice (review)", allOff.invC.every((h, i) => { const out = refreshGateSentences(h, { PTS_GATE_B: "on" }); const want = i === 0 ? P7.bg : P7.en; return out.split(want).length === 2; }));
t("passing Gate B: the Instruction a new edition; a document without a П-sentence not", GATE_DOCS.has("instruction") && GATE_DOCS.has("invitation") && fpOff.instr !== fpOn.instr && fpOff.plan === fpOn.plan);
t("…off: the Instruction's fingerprint as before (no edition issued earlier is marked changed)", fingerprint(pavingBlocks, "instruction") === fpOff.instr);

// ── a document built BEFORE Gate B and saved: its print swaps the sentence — a new edition (review) ──
const savedT = off.t, savedEn = off.tEn;
t("a saved Instruction, before Gate B: printed as it is", refreshGateSentences(savedT, {}) === savedT);
const swapped = refreshGateSentences(savedT, { PTS_GATE_B: "on" }), swappedEn = refreshGateSentences(savedEn, { PTS_GATE_B: "on" });
t("…after Gate B: the e-mail sentence word for word → П12, both languages; nothing else changed", !swapped.includes(OLD.P12.bg) && swapped.includes(NEW_P12_ITEM.bg) && !swappedEn.includes(OLD.P12.en) && swappedEn.includes(NEW_P12_ITEM.en) && swapped.replace(NEW_P12_ITEM.bg, OLD.P12.bg) === savedT);
t("…the same for the calibration Instruction (П17) and the invitations (П4, П5, П7)", refreshGateSentences(`<li>${OLD.P17.bg}</li><li>${OLD.P4.en}</li><li>${OLD.P5.bg}</li><li>${OLD.P7.en}</li>`, { PTS_GATE_B: "on" }) === `<li>${NEW_P17_ITEM.bg}</li><li>${P4.en}</li><li>${P5.bg}</li><li>${P7.en}</li>`);
// through the real print path (docPrintHtml) — what an edition freezes
process.env.PTS_GATE_B = "on";
const printed = docPrintHtml(pavingBlocks, "instruction", "bg", `<ul><li>${OLD.P12.bg}</li></ul>`);
const printedPlan = docPrintHtml(pavingBlocks, "plan", "bg", `<p>${OLD.P12.bg}</p>`);
delete process.env.PTS_GATE_B;
t("…through the print a saved body goes by (docPrintHtml): the Instruction's swapped; another document untouched", printed.includes(NEW_P12_ITEM.bg) && !printed.includes(OLD.P12.bg) && printedPlan.includes(OLD.P12.bg));
// an edited sentence, or M1's lines, cannot be swapped word for word: not issued while they send by e-mail
t("after Gate B, a document still sending by e-mail is not issued: an edited sentence, M1's lines (the protocol, the invoices)", stillByEmail("<p>По имейл изпратете също: протокола и декларацията.</p>", { PTS_GATE_B: "on" }) && stillByEmail("<b>Протокол</b> – изпраща се на РТ провайдъра непосредствено след получаване на обекта", { PTS_GATE_B: "on" }) && stillByEmail("Първоначално се издава проформа фактура, която се изпраща на посочената електронна поща в **Заявка**", { PTS_GATE_B: "on" }) && !stillByEmail("A certificate of participation is issued to each participant and sent to the e-mail address indicated in the Application form", { PTS_GATE_B: "on" }));
t("…before Gate B nothing is refused; after it the portal's own sentences pass", !stillByEmail(savedT, {}) && !stillByEmail(on.t, { PTS_GATE_B: "on" }) && !stillByEmail(on.c, { PTS_GATE_B: "on" }) && !stillByEmail(`${P4.bg} ${P5.bg} ${P7.bg} ${P17_M1.bg}`, { PTS_GATE_B: "on" }));

// ── the calibration device's receipt protocol at its chain stop (5.11, completing 5.6) ──
const stops = [{ id: "s0", kind: "ref" }, { id: "s1", kind: "lab", code: "C-01", receivedAt: "2026-11-10T08:00:00Z" }, { id: "s2", kind: "lab", code: "C-02" }];
t("the stop awaiting a protocol: the laboratory's, once its arrival is stamped", chainReceiptTarget(stops, "C-01", [])?.id === "chain:s1" && chainReceiptTarget(stops, "C-01", [])?.receivedAt === "2026-11-10T08:00:00Z");
t("…not before the device arrived; not another laboratory's; not twice", chainReceiptTarget(stops, "C-02", []) === null && chainReceiptTarget(stops, "C-09", []) === null && chainReceiptTarget(stops, "C-01", [{ shipmentId: chainReceiptId("s1") }]) === null);
// a chain may visit a laboratory twice: each visit its own protocol (review)
const twice = [{ id: "a", kind: "lab", code: "C-01", receivedAt: "2026-11-01T08:00:00Z", sentAt: "2026-11-03T08:00:00Z" }, { id: "b", kind: "lab", code: "C-02", receivedAt: "2026-11-04T08:00:00Z", sentAt: "2026-11-05T08:00:00Z" }, { id: "c", kind: "lab", code: "C-01", receivedAt: "2026-11-06T08:00:00Z" }];
t("a laboratory visited twice: the visit holding the device now first; then the earlier one still missing; then none", chainReceiptTarget(twice, "C-01", [])?.id === "chain:c" && chainReceiptTarget(twice, "C-01", [{ shipmentId: "chain:c" }])?.id === "chain:a" && chainReceiptTarget(twice, "C-01", [{ shipmentId: "chain:c" }, { shipmentId: "chain:a" }]) === null && chainReceiptTarget(twice, "C-01", [])?.receivedAt === "2026-11-06T08:00:00Z");
const actSrc = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const chainFn = actSrc.slice(actSrc.indexOf("async function submitChainReceipt"), actSrc.indexOf("/** «Сигнализирай проблем»"));
t("the calibration protocol: the participation's own (ownGoingOn); while the device travels; not before it arrived; re-checked in the lock; PTS told", /if \(scheme\.type === "C"\) await submitChainReceipt\(/.test(actSrc) && /if \(!chainOpen\(scheme\.status\)\)/.test(chainFn) && /sofiaDay\(target!\.receivedAt\)/.test(chainFn) && /chainReceiptTarget\(s\.chain\?\.stops, part\.code, deliveryOf\(s, pid\)\.receipts\)\?\.id !== target!\.id/.test(chainFn) && /notifyReceiptProtocol\(/.test(chainFn));
t("issue: refused «by-email» after Gate B for a rendered invitation or Instruction still sending by e-mail", /GATE_DOCS\.has\(docKey\) && \(stillByEmail\(frozen\.bg \?\? ""\) \|\| stillByEmail\(frozen\.en \?\? ""\)\)\) return \{ ok: false, error: "by-email" \}/.test(readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8")));
const labPage = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
t("the participation's page: from Gate B no «send the protocol by e-mail» beside the online form (review)", /!\(slot === "protocol" && gateB\(\)\)/.test(labPage));

// ── M1: its texts are read when the module loads — the deployment's setting, fixed until a deploy ──
const probe = `import { M1_INSTRUCTION, M1_INVITATION } from "./src/lib/m1-texts.ts"; import { P17_M1, P7 } from "./src/lib/gate-texts.ts"; import { m1Text } from "./src/lib/m1-render.ts";
const p10 = M1_INSTRUCTION.find((p) => p.no === 10); const p5 = M1_INVITATION.find((p) => p.no === 5);
const shown = m1Text("instruction", p10, "bg").join(" ");
import { renderInvitationC } from "./src/lib/docs/invitation-c.ts"; import { renderInstructionC } from "./src/lib/docs/instruction-c.ts"; import { forceCalibration } from "./src/lib/seed-force.ts"; import { stillByEmail } from "./src/lib/gate-texts.ts";
const m1 = { ...forceCalibration, calTemplate: "m1" }; const docs = ["bg", "en"].flatMap((l) => [renderInvitationC(m1, l), renderInstructionC(m1, l)]);
console.log(JSON.stringify({ byEmail: docs.map((h) => stillByEmail(h, { PTS_GATE_B: "on" })), p17bg: p10.bg.includes(P17_M1.bg), p17en: p10.en.includes(P17_M1.en), oldBg: p10.bg.some((l) => l.startsWith("**Протокол за получаване")), intro: p10.bg.includes("Заедно с резултатите участникът представя:"), p7: p5.bg.includes(P7.bg), shownBold: shown.includes("**Протокол за получаване на обект на изпитване за пригодност (Ф 7.3.4-1)**") && shown.includes("**Декларация за конфиденциалност (Ф 4.2-2)**") }));`;
const run = (env: Record<string, string>) => JSON.parse(execFileSync(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", "--input-type=module", "-e", probe], { env: { ...process.env, ...env }, encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) }).trim().split("\n").pop()!);
const m1Off = run({ PTS_GATE_B: "" }), m1On = run({ PTS_GATE_B: "on" });
t("M1, off: point 10 lists the protocol and the declaration to send", !m1Off.p17bg && m1Off.oldBg && !m1Off.p7);
t("M1, on: point 10 says П17 (M1's style) in both languages — no «sent» protocol, no list intro left over; the invitation П7", m1On.p17bg && m1On.p17en && !m1On.oldBg && !m1On.intro && m1On.p7, JSON.stringify(m1On));
t("M1's documents, rendered: before Gate B they would be caught («by e-mail»), after it none is — both languages, the invitation and the Instruction (review: a certificate sentence was)", m1Off.byEmail.every(Boolean) && m1On.byEmail.every((x: boolean) => !x), JSON.stringify({ off: m1Off.byEmail, on: m1On.byEmail }));
t("…as M1 writes a line (m1Text): the forms marked bold, as its other lines", m1On.shownBold, JSON.stringify(m1On));

// ── the wiring (source shape) ──
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
t("П12 in the testing Instruction, П17 in the calibration one — chosen by the switch at render", /gateB\(\) \/\* П12 from Gate B/.test(src("lib/docs/instruction.ts")) && /gateB\(\) \/\* П17 from Gate B/.test(src("lib/docs/instruction-c.ts")));

console.log(`gate-texts.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
