// Plan part 3.10 — the calibration documents on M1 (PTS's M1 of 31.10.2026; D17;
// Реш. 111, 153; 0.11): plan 22 points, invitation 7, instruction 11; M1's headings
// and constant text with the fields filled; the scheme-specific points from the
// scheme's data or marked to fill; the decided wording where a decision changed M1;
// not issued while a mark or a heading is missing; older schemes unchanged.
import { readFileSync } from "node:fs";
import { M1_PLAN, M1_INVITATION, M1_INSTRUCTION } from "../src/lib/m1-texts.ts";
import { M1_DECIDED, M1_DOCS, M1_BLOCKS, M1_SPECIFIC_CLAUSES, m1Problems, usesM1, isM1Doc } from "../src/lib/m1-render.ts";
import { blankScheme } from "../src/lib/new-scheme.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { renderPlanC } from "../src/lib/docs/plan-c.ts";
import { renderInvitationC } from "../src/lib/docs/invitation-c.ts";
import { renderInstructionC } from "../src/lib/docs/instruction-c.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import { esc } from "../src/lib/doc-css.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── the data ───────────────────────────────────────────────────────────────
eq("M1's structure: 22 · 7 · 11 points, numbered in turn", [M1_PLAN, M1_INVITATION, M1_INSTRUCTION].map((d) => d.map((p) => p.no).join(",")), [Array.from({ length: 22 }, (_, i) => i + 1).join(","), "1,2,3,4,5,6,7", Array.from({ length: 11 }, (_, i) => i + 1).join(",")]);
t("every constant point in both languages, entry for entry; every specific one with its guidance", [M1_PLAN, M1_INVITATION, M1_INSTRUCTION].flat().every((p) => p.kind === "specific" ? !!p.guideBg && !!p.guideEn && !p.bg : !!p.bg?.length && p.bg.length === p.en?.length));
eq("M1's classification kept (the specific points)", [M1_PLAN, M1_INVITATION, M1_INSTRUCTION].map((d) => d.filter((p) => p.kind === "specific").map((p) => p.no).join(",")), ["3,4,6,7,8,9,11,12,14,15,16", "2,3,7", "3,4,5,6,7,8,9"]);
t("each decided change finds exactly one sentence of M1 to replace — none fails in silence", M1_DECIDED.every((d) => (M1_DOCS[d.doc].find((p) => p.no === d.no)?.bg ?? []).filter((x) => x.includes(d.match)).length === 1));

// ── the documents ──────────────────────────────────────────────────────────
const base = structuredClone(forceCalibration) as Scheme;
const m1: Scheme = { ...base, calTemplate: "m1", commercial: { sharePct: 40, maxParticipants: 7 } };
t("only a calibration scheme marked for M1 uses it", usesM1(m1) && !usesM1(base) && !usesM1({ ...m1, type: "T" }) && isM1Doc("plan") && !isM1Doc("report") && !isM1Doc("toString"));
const docs = [["plan", renderPlanC, M1_PLAN], ["invitation", renderInvitationC, M1_INVITATION], ["instruction", renderInstructionC, M1_INSTRUCTION]] as const;
for (const [name, render, points] of docs) {
  const html = render(m1, "bg");
  const at = points.map((p) => html.indexOf(esc(p.titleBg)));
  t(`${name}: every M1 heading, in M1's order`, at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), JSON.stringify(at));
  t(`${name}: in English too`, points.every((p) => render(m1, "en").includes(esc(p.titleEn))));
}
const plan = renderPlanC(m1, "bg"), inv = renderInvitationC(m1, "bg"), ins = renderInstructionC(m1, "bg");
const textOnly = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
t("constant text is M1's (plan 17, plan 18)", plan.includes("Всеки участник получава <b>Окончателен доклад (Ф 7.4.3-1)</b>") && plan.includes("При получаване на обекта на РТ схемата участникът проверява състоянието му"));
t("fields filled: the minimum participants; the team; the number and title", plan.includes(`Очакваният брой участници е от ${m1.minParticipants} до`) && plan.includes(esc(m1.team[0].name)) && inv.includes(esc(m1.number)) && inv.includes(esc(m1.titleBg)));
t("…the expected maximum is a mark to fill — never the HIDDEN maximum of 3.7", /Очакваният брой участници е от \d+ до <span class="m1-fill"[^>]*>\[за попълване: очакван най-голям брой\]<\/span>/.test(plan) && !/от \d+ до 7 лаборатории/.test(plan));
t("…the share of a second participation is the scheme's (40), never «50 %» anywhere — nor the old fee sentence's VAT (Реш. 153; review)", inv.includes("40 % от обявената цена") && !/50 ?%/.test(textOnly(inv)) && !/\+20 ?%/.test(textOnly(inv)));
t("…the fee is the scheme's price, or a mark to fill (review)", renderInvitationC({ ...m1, commercial: { base: 45000 } }, "bg").includes("450,00 €") && inv.includes("[за попълване: цената за участие"));
t("…the calibration window is the scheme's (3 by default), not M1's «пет» — and the device the scheme's", ins.includes("максимум 3 работни дни") && !ins.includes("пет работни дни") && ins.includes(esc(m1.calibration!.deviceBg)));
t("the contact from the scheme's team (3.11)", ins.includes(esc(m1.team.find((x) => /Ръководител/.test(x.roleBg))!.name)) && ins.includes("office@ptsbg.eu"));
// the decided wording
t("payment no condition for dispatch (Реш. 1, 96) — M1's «only those who paid» replaced", inv.includes("Плащането не е условие за изпращане") && !inv.includes("Само участниците, които са платили"));
t("late results only through the provider, on record (Реш. 111 / D17) — plan 13 and instruction 10", plan.includes("се приемат само чрез РТ провайдъра и това се записва") && !plan.includes("не се приемат корекции") && ins.includes("Резултати, представени след определения срок, се приемат само чрез РТ провайдъра и това се записва"));
t("…instruction 10 keeps M1's consequence of not submitting at all (review)", ins.includes("Ако участникът не представи резултати, неговите резултати няма да бъдат включени в статистическата обработка"));
t("…the payment sentence is the 0.11 wording, word for word (review)", inv.includes("след постъпване на плащането по съответната заявка"));
t("the plan ends with its signature block (M1 point 22; review)", /22\.<\/span> Контакти[\s\S]*class="sig"[\s\S]*Ръководител на схемата за изпитване за пригодност/.test(plan));
t("Реш. 154's paragraph kept in the plan and the invitation", /Incoterms|Инкотермс|рискът|риска/i.test(plan) && /Incoterms|Инкотермс|рискът|риска/i.test(inv));
// specific points
t("a specific point the scheme has data for: its own content (plan 6 — the points table; 14 — Eₙ)", plan.includes(esc(m1.calibration!.methodBg)) && /Eₙ/.test(plan));
t("…one it has nothing for: a mark with M1's guidance (instruction 3–9)", (ins.match(/\[за попълване:/g) ?? []).length >= 7);
// a blank calibration scheme, as the action makes it
const blank = blankScheme({ id: "x", number: "PTS 26/11-C-9", type: "C", titleEn: "B", titleBg: "Б", objectEn: "", objectBg: "", distribution: "sequential", minParticipants: 1 } as never);
blank.calTemplate = "m1";
for (const k of M1_SPECIFIC_CLAUSES) delete blank.clauses[k];
blank.assignedValueMethodEn = ""; blank.assignedValueMethodBg = ""; blank.scoresEn = ""; blank.scoresBg = "";
const bp = renderPlanC(blank, "bg");
t("a blank calibration plan carries none of the testing sample's texts (review)", !/Алгоритъм A|z-оценка|ζ-оценка|паваж|Algorithm A/.test(bp));
t("…its empty points are marked — the reference laboratory, the table's cells, the stability text, point 14 (review)", ["[за попълване: Посочват се услугите", "[за попълване: измерваната величина]", "[за попълване: методът]", "[за попълване: как се определя стабилността", "[за попълване: как се определя приетата стойност]"].every((x) => bp.includes(x)));
// issuing
const probs = m1Problems(ins, "instruction", "bg");
t("not ready to issue while a mark is left — counted", probs.length === 1 && /място\(а\) «за попълване»/.test(probs[0]), JSON.stringify(probs));
const filled: Scheme = { ...m1, clauses: { ...m1.clauses, ...Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map((n) => [`m1.instruction.${n}`, { bg: `Текст ${n}`, en: `Text ${n}` }])) } };
eq("…filled: ready", m1Problems(renderInstructionC(filled, "bg"), "instruction", "bg"), []);
eq("…a heading edited away: named", m1Problems(renderInstructionC(filled, "bg").replace(esc(M1_INSTRUCTION[6].titleBg), "Нещо друго"), "instruction", "bg"), ["липсват заглавия на т. 7"]);
// review: the check is not fooled
const fullPlanEn = renderPlanC({ ...filled, clauses: { ...filled.clauses, "m1.deviceKind": { bg: "х", en: "x" }, "m1.expectedMax": { bg: "9", en: "9" } } }, "en");
t("«Confidentiality» edited away is missed no more for being a part of another heading (review)", m1Problems(fullPlanEn.replace(/(<h2[^>]*><span class="n">9\.<\/span>) Confidentiality/, "$1 Other"), "plan", "en").some((x) => /points 9\b/.test(x)));
t("a mark typed over but its yellow field left: still a mark (review)", m1Problems(renderInstructionC(filled, "bg") + '<span class="m1-fill">готов текст</span>', "instruction", "bg").length === 1);
t("…a mark with a non-breaking space: still a mark", m1Problems(renderInstructionC(filled, "bg") + "<p>[за&nbsp;попълване: нещо]</p>".replace("[за&nbsp;", "[за "), "instruction", "bg").length === 1);
const saved3 = renderInstructionC(filled, "bg");
t("a document stating a number the scheme no longer has is not issued (window 3 → 5; review)", m1Problems(saved3, "instruction", "bg", { ...filled, chain: { ...(filled.chain ?? {}), windowWorkDays: 5 } } as Scheme).some((x) => /срокът при участник/.test(x)) && m1Problems(saved3, "instruction", "bg", filled).length === 0);
t("…the share likewise", m1Problems(renderInvitationC(m1, "bg"), "invitation", "bg", { ...m1, commercial: { sharePct: 30 } }).some((x) => /делът за второ участие/.test(x)));
t("the share and the window are part of an M1 document's content (fingerprint; review)", fingerprint(m1, "invitation") !== fingerprint({ ...m1, commercial: { sharePct: 30 } }, "invitation") && fingerprint(m1, "instruction") !== fingerprint({ ...m1, chain: { ...(m1.chain ?? {}), windowWorkDays: 5 } } as Scheme, "instruction"));
t("…but not of an older scheme's", fingerprint(base, "invitation") === fingerprint({ ...base, commercial: { sharePct: 30 } }, "invitation"));
// older schemes
t("a calibration scheme from before 3.10 keeps its documents as they were", renderPlanC(base, "en").includes("Selection of method, measured quantity and calibration points") && !renderPlanC(base, "bg").includes("[за попълване:"));

// ── the action ─────────────────────────────────────────────────────────────
const actions = readFileSync(new URL("../src/lib/actions.ts", import.meta.url), "utf8");
t("a calibration scheme made now is on M1; a blank one starts its specific points empty — and without the testing assigned value and scores", /if \(type === "C"\) \{\s*scheme\.calTemplate = "m1";\s*if \(!sample\) \{\s*for \(const k of M1_SPECIFIC_CLAUSES\) delete scheme\.clauses\[k\];[\s\S]{0,200}scheme\.assignedValueMethodEn = ""; scheme\.assignedValueMethodBg = "";\s*scheme\.scoresEn = ""; scheme\.scoresBg = "";/.test(actions));
const editions = readFileSync(new URL("../src/lib/editions.ts", import.meta.url), "utf8");
t("…and in the one place every issue passes — amendments and lifecycle acts too (review)", /if \(frozen\.source === "rendered" && usesM1\(scheme\) && isM1Doc\(docKey\)\s*&& \(m1Problems\(frozen\.bg, docKey, "bg", scheme\)\.length/.test(editions));
t("the scheme's own texts edited in «Редактирай данните»: every instruction point 3–9 and every plan clause (review)", [3, 4, 5, 6, 7, 8, 9].every((n) => M1_BLOCKS.some((b) => b.key === `m1.instruction.${n}`)) && M1_SPECIFIC_CLAUSES.every((k) => M1_BLOCKS.some((b) => b.key === k)) && /m1Texts\[b\.key\] = bg \|\| en \? \{ bg, en \} : null;/.test(actions) && /logActivity\("scheme\.texts"/.test(actions));
t("issuing refused while the document is not whole (marks, headings) — sent or issued from «Редакции»", /if \(now\.source !== "rendered" \|\| !usesM1\(scheme\) \|\| !isM1Doc\(docKey\)\) return null;/.test(actions) && (actions.match(/const notWhole = m1Refusal\(scheme, docKey, now\);/g) ?? []).length === 2);

console.log(`m1-templates.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
