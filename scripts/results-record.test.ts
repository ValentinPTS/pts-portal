// Plan part 6.8 — the record replaces the Results Sheet Ф 7.2.1-7 in the portal path; П10, П11, П16
// prepared, switching at Gate B (D16; PTS's answers 7б «нов текст на Етап 7»).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { P10, P11, P16, P16_M1, OLD_RESULTS, GATE_TEXTS_VERSION, refreshGateSentences, stillByEmail, swapsAreOneWay } from "../src/lib/gate-texts.ts";
import { renderInstruction } from "../src/lib/docs/instruction.ts";
import { renderInstructionC } from "../src/lib/docs/instruction-c.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// the sentences
const D = "31.03.2027";
t("П10, П11, П16 in both languages: the portal, the record replacing the sheet; nothing by e-mail", /портала/.test(P10.bg) && /portal/.test(P10.en) && /разписка/.test(P10.bg) && /receipt/.test(P10.en) && /По имейл не се изпраща/.test(P10.bg) && /No sheet is sent by e-mail/.test(P10.en) && [P11, P16].every((x) => /заменя Листа с резултати \(F 7\.2\.1-7\)/.test(x.bg(D)) && /replaces the Results Sheet \(F 7\.2\.1-7\)/.test(x.en(D))));
t("…П11, П16: the deadline kept; after it only through PTS's unlock, never after processing has started (Реш. 111, 21)", [P11, P16].every((x) => x.bg(D).includes(D) && x.en(D).includes(D) && /отключи формуляра/.test(x.bg(D)) && /началото на обработката/.test(x.bg(D)) && /unlocks the form/.test(x.en(D)) && /processing has started/.test(x.en(D))));
t("…П16: the computed errors confirmed at submission (D1)", /изчислява грешките, които потвърждавате/.test(P16.bg(D)) && /computes the errors, which you confirm/.test(P16.en(D)) && !/грешките/.test(P11.bg(D)));
t("…the English has no Cyrillic; the old ones are the templates' word for word", [P10.en, P11.en(D), P16.en(D)].every((x) => !/[а-я]/i.test(x.replace(/«[^»]*»/g, ""))) && OLD_RESULTS.P10.bg === "Изпратете попълнения Лист с резултати по имейл в срока.");

// the Instructions, before and after Gate B
const plainC = { ...forceCalibration, calTemplate: undefined } as Scheme;
const off = { t: renderInstruction(pavingBlocks, "bg"), tEn: renderInstruction(pavingBlocks, "en"), c: renderInstructionC(plainC, "bg"), cEn: renderInstructionC(plainC, "en") };
process.env.PTS_GATE_B = "on";
const on = { t: renderInstruction(pavingBlocks, "bg"), tEn: renderInstruction(pavingBlocks, "en"), c: renderInstructionC(plainC, "bg"), cEn: renderInstructionC(plainC, "en") };
delete process.env.PTS_GATE_B;
t("before Gate B: the e-mail sentences, as the pilot runs (Реш. 137)", off.t.includes(OLD_RESULTS.P10.bg) && /Всички резултати по имейл не по-късно от/.test(off.t) && /All results by e-mail no later than/.test(off.tEn) && /Всички резултати по имейл не по-късно от/.test(off.c) && !off.t.includes(P10.bg));
t("after it: П10 and П11 in the testing Instruction, П16 in the calibration one — both languages; no e-mail path left", on.t.includes(P10.bg) && on.tEn.includes(P10.en) && /Всички резултати се подават в портала/.test(on.t) && /All results are submitted in the portal/.test(on.tEn) && /изчислява грешките/.test(on.c) && /computes the errors/.test(on.cEn) && ![on.t, on.tEn, on.c, on.cEn].some((h) => /резултати по имейл|results by e-mail|Results Sheet by e-mail/.test(h)));

// a saved Instruction, printed after Gate B
const sw = (h: string) => refreshGateSentences(h, { PTS_GATE_B: "on" });
t("a saved Instruction printed after Gate B: the old sentences swapped — the deadline kept — exactly the Gate B text", sw(off.t) === on.t && sw(off.tEn) === on.tEn && sw(off.c) === on.c && sw(off.cEn) === on.cEn);
t("…before Gate B: untouched; a second print changes nothing (one-way)", refreshGateSentences(off.t, {}) === off.t && sw(sw(off.t)) === sw(off.t) && swapsAreOneWay());
t("…the deadline as printed, whatever it is — swapped around it", sw(`<li>${OLD_RESULTS.P11.bg("15.06.2027 г., 17:00 ч.")}</li>`) === `<li>${P11.bg("15.06.2027 г., 17:00 ч.")}</li>`);
t("an edited one still sending by e-mail is caught after Gate B (refused at issue); the new text never is", stillByEmail("<li>Моля, всички резултати по имейл не по-късно от петък.</li>".replace("всички", "Всички").replace("Моля, ", ""), { PTS_GATE_B: "on" }) && stillByEmail(off.t, { PTS_GATE_B: "on" }) && !stillByEmail(on.t, { PTS_GATE_B: "on" }) && !stillByEmail(on.c, { PTS_GATE_B: "on" }) && !stillByEmail(off.t, {}));

// M1's calibration Instruction (every calibration scheme since 3.10) — its own П16, read when the module loads (6.8 review)
const probe = `import { M1_INSTRUCTION } from "./src/lib/m1-texts.ts"; import { P16_M1, stillByEmail } from "./src/lib/gate-texts.ts"; import { renderInstructionC } from "./src/lib/docs/instruction-c.ts"; import { forceCalibration } from "./src/lib/seed-force.ts";
const p10 = M1_INSTRUCTION.find((p) => p.no === 10); const m1 = { ...forceCalibration, calTemplate: "m1" };
const docs = ["bg", "en"].map((l) => renderInstructionC(m1, l));
console.log(JSON.stringify({ p16bg: p10.bg.includes(P16_M1.bg), p16en: p10.en.includes(P16_M1.en), byEmailBg: p10.bg.some((l) => l.includes("се представят по електронна поща")), caught: docs.map((h) => stillByEmail(h, { PTS_GATE_B: "on" })), mail: docs.map((h) => /по електронна поща не по-късно|submitted by e-mail no later than/.test(h)) }));`;
const run = (env: Record<string, string>) => JSON.parse(execFileSync(process.execPath, ["--import", "./scripts/ts-ext-hook.mjs", "--input-type=module", "-e", probe], { env: { ...process.env, ...env }, encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) }).trim().split("\n").pop()!);
const m1Off = run({ PTS_GATE_B: "" }), m1On = run({ PTS_GATE_B: "on" });
t("M1's Instruction, before Gate B: its point 10 by e-mail, as M1 writes it; an M1 body saved then is caught after Gate B (refused at issue — rendered, never swapped)", m1Off.byEmailBg && !m1Off.p16bg && m1Off.caught.every(Boolean), JSON.stringify(m1Off));
t("…after Gate B: П16 in M1's style, both languages — no e-mail left, issuable", m1On.p16bg && m1On.p16en && !m1On.byEmailBg && m1On.mail.every((x: boolean) => !x) && m1On.caught.every((x: boolean) => !x), JSON.stringify(m1On));
t("…П16_M1 says what П16 says: the portal, the errors confirmed, the record replacing the sheet, after the deadline only through PTS, never after processing", /се подават в портала/.test(P16_M1.bg) && /потвърждава при подаването/.test(P16_M1.bg) && /заменя \*\*„Лист с резултати“ \(Ф 7\.2\.1-7\)\*\*/.test(P16_M1.bg) && /началото на обработката/.test(P16_M1.bg) && /processing has started/.test(P16_M1.en));
const editionsSrc = readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8");
t("a newer set of П-sentences is a new edition too: the gate's marker carries the texts' version", /\{ gate: "B", gateTexts: GATE_TEXTS_VERSION \}/.test(editionsSrc) && GATE_TEXTS_VERSION === "6.8");

// the portal path: the sheet not offered from Gate B; the record printable
const act = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
const lab = readFileSync(new URL("../src/app/lab/p/[id]/page.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../src/app/lab/page.tsx", import.meta.url), "utf8");
t("from Gate B the Results Sheet is not uploaded — the action refuses it, neither the participation's page nor the dashboard offers it, an entity user is not told to e-mail it", /if \(slot === "results" && gateB\(\)\) redirect\(`\$\{back\}\?e=locked`\);/.test(act) && /&& !\(slot === "results" && gateB\(\)\);/.test(lab) && /&& !\(slot === "results" && gateB\(\)\);/.test(dash) && /!\(\(slot === "protocol" \|\| slot === "results"\) && gateB\(\)\)/.test(lab));
t("after the form has closed, the lab still reaches its versions and records", /data-results-records-link/.test(lab));
const labRec = readFileSync(new URL("../src/app/lab/p/[id]/results/v/[n]/page.tsx", import.meta.url), "utf8");
const staffRec = readFileSync(new URL("../src/app/schemes/[id]/participants/[code]/v/[n]/page.tsx", import.meta.url), "utf8");
const rec = readFileSync(new URL("../src/components/ResultsRecord.tsx", import.meta.url), "utf8");
t("the record: the lab's own participation only; PTS by who reads the results — the typed laboratory and person, and the subcontracted part, to names.view only and only when revealed, on record (2.3); the unlock's reason on PTS's view only; a failed read said", /const row = viewer\.rows\.find\(\(r\) => r\.participantId === id\);\n\s+if \(!row\) notFound\(\);/.test(labRec) && /await requireOneOf\(\["results\.read", "results\.enter", "results\.process"\], id\);/.test(staffRec) && /const revealed = names && sp\.reveal === "1";/.test(staffRec) && /if \(revealed\) await logActivity\("names\.viewed"/.test(staffRec) && /showIdentity=\{revealed\} showReason/.test(staffRec) && /data-record-unread/.test(staffRec + labRec) && !/showReason/.test(labRec) && /GENERAL_IDENTITY\.includes\(f\) && !showIdentity \? hidden/.test(rec) && /showIdentity \? d\.confirmations\.subcontractedPart \?\? "" : hidden/.test(rec) && /showReason && d\.unlock\.reason/.test(rec));
t("…as submitted — the version's own rows, in the scheme's order (6.9 review: the database keeps them in its own), named from the configuration it was submitted against (never today's: a row added or a count changed after it is not in it)", /const keys = inSchemeOrder\(Object\.keys\(d\.values \?\? \{\}\), rankOf\);/.test(rec) && /\{keys\.map\(\(k\) => \{/.test(rec) && !/\{rows\.map\(|\{cRows\.map\(/.test(rec) && /const nd = Array\.isArray\(x\?\.d\) \? x!\.d!\.length : 0;/.test(rec) && /snapshot=\{snapshot\}/.test(staffRec) && /snapshot=\{snapshot\}/.test(labRec) && /characteristicVersions\?\.find\(\(x\) => x\.no === version!\.configVersion\)/.test(staffRec));
t("…printing PTS's view: the admin shell left out (the test environment's banner stays)", /\.adminrail, \.adminmain > header/.test(rec) && !/data-test-env/.test(rec));
t("…from the version itself (never the draft), N/R and N/A as declared; printable", /const d = \(version\.data \?\? \{\}\) as Payload;/.test(rec) && /<b>N\/R<\/b>/.test(rec) && /<b>N\/A<\/b>/.test(rec) && /@page \{ size: A4/.test(rec) && !/getDraft/.test(rec + labRec + staffRec));

console.log(`results-record.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
