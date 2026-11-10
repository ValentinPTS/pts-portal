// Plan part 5.8 — invoices: the proforma and the original invoice uploaded with their numbers
// (Реш. 36), the invoice only after payment (Реш. 35), the billing export for accounting
// (Реш. 98), the П4/П5/П7 sentences for Gate B (D16).
import { readDocNumber, invoiceSlotProblem, billingRow, characteristicsText, byEntry, billedSelections, BILLING_COLUMNS, INVOICE_PROBLEM_TEXT } from "../src/lib/invoice-model.ts";
import { csv } from "../src/lib/round-export.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import { gateB, P4, P5, P7 } from "../src/lib/gate-texts.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq("a document's number as the accounting software gives it — letters, digits, the usual separators", ["0000001842", " ПФ-2026/0042 ", "INV#77", "№ 12"].map(readDocNumber), ["0000001842", "ПФ-2026/0042", "INV#77", "№ 12"]);
eq("…refused: empty, too long, or with what no number has", ["", " ", "x".repeat(41), "<script>", "-12"].map(readDocNumber), [null, null, null, null, null]);
eq("the proforma: with its number; the invoice: only once paid (Реш. 35)", [invoiceSlotProblem("proforma", "1", false), invoiceSlotProblem("proforma", null, true), invoiceSlotProblem("invoice", "2", false), invoiceSlotProblem("invoice", "2", true)], [null, "number", "unpaid", null]);
t("every refusal has its words", Object.values(INVOICE_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

eq("the characteristics as words, with their counts", characteristicsText({ "2": 1, "0": 2, "1": 0 }, ["Плътност", "Абсорбция", "Якост"]), "Плътност ×2; Якост");
const row = billingRow({ order: 3, code: "26-01-T-1-07", characteristics: "Плътност ×2", objects: 2, entity: { name: "Ла ООД", eik: "123456789", vat: "BG123456789", country: "BG", correspondenceAddress: "София 1", mol: "Иван", officialEmail: "o@x.bg" }, laboratory: "СИЛ", proforma: { number: "ПФ-1", at: "2026-04-21T10:00:00Z" }, invoice: { number: "Ф-9", at: "2026-05-02T10:00:00Z" }, paidAt: "2026-05-01T09:00:00Z" });
eq("the billing row: the entity, its numbers, the characteristics, the order of entry, both documents with numbers and dates, no price given — none (9.4 fills it once the applications closed)", [row["№ по ред"], row["ЕИК"], row["ДДС №"], row["Характеристики (участия)"], row["Проформа №"], row["Проформа дата"], row["Платено на"], row["Фактура №"], row["Фактура дата"], row["Цена, €"]], ["3", "123456789", "BG123456789", "Плътност ×2", "ПФ-1", "21.04.2026", "01.05.2026", "Ф-9", "02.05.2026", ""]);
t("…every column, in the order the export writes them", Object.keys(row).join("|") === BILLING_COLUMNS.join("|"));
t("…a participation without an entity or documents: empty cells, never undefined", Object.values(billingRow({ order: 1, code: "C", characteristics: "", objects: 1 })).every((v) => typeof v === "string"));

t("Gate B: off unless the deployment says «on»", !gateB({}) && !gateB({ PTS_GATE_B: "1" }) && gateB({ PTS_GATE_B: "on" }));
t("П4, П5, П7 — the portal holds the documents; e-mail only tells (PTS's answers 7б), both languages", [P4, P5, P7].every((x) => /портал/.test(x.bg) && /portal/.test(x.en) && /уведомление/.test(x.bg) && /notification/.test(x.en)));

// ── the billing export's rules (review) ──
// the order of entry, not the code's: the database lists by code, which is random
const entered = byEntry([{ code: "26-01-T-1-03", createdAt: "2026-04-02T10:00:00Z" }, { code: "26-01-T-1-01", createdAt: "2026-04-03T10:00:00Z" }, { code: "26-01-T-1-02", createdAt: "2026-04-01T10:00:00Z" }]);
eq("the participations in the order they were entered — never the code's", entered.map((p) => p.code), ["26-01-T-1-02", "26-01-T-1-03", "26-01-T-1-01"]);
eq("…one without the moment keeps its place", byEntry([{ code: "B" }, { code: "A" }]).map((p) => p.code), ["B", "A"]);
// the characteristics that run: one applied for and dropped at the second announcement is not billed
const applied = { id: "p1", selections: { "0": 1, "1": 2, "2": 1 } };
eq("before the second announcement: as applied for", billedSelections(applied, null, 3), { "0": 1, "1": 2, "2": 1 });
eq("after it: only the characteristics that run — the dropped one is not billed", billedSelections(applied, [0, 2], 3), { "0": 1, "2": 1 });
// the file: one byte-order mark (Excel strips one — a second spoils the first header), and a
// cell that would be a formula to Excel made text
const file = csv([...BILLING_COLUMNS], [billingRow({ order: 1, code: "C1", characteristics: "", objects: 1, entity: { name: "=HYPERLINK(\"http://x\")", eik: "1", vat: "", country: "BG", correspondenceAddress: "" } })]);
t("the billing file: exactly one byte-order mark, then the first column's name", file.startsWith("\uFEFF№ по ред,") && !file.startsWith("\uFEFF\uFEFF"));
t("…a name that would be a formula to Excel is text («'=…»)", file.includes(`"'=HYPERLINK(""http://x"")"`));

// ── Gate B makes the invitation a new edition (review) ──
const sch = pavingBlocks;
const before = { inv: fingerprint(sch, "invitation"), plan: fingerprint(sch, "plan") };
process.env.PTS_GATE_B = "on";
const after = { inv: fingerprint(sch, "invitation"), plan: fingerprint(sch, "plan") };
delete process.env.PTS_GATE_B;
t("Gate B passed: the invitation's content changed — a new edition; the other documents not", before.inv !== after.inv && before.plan === after.plan /* the plan has no П-sentence; the Instruction switches too since 5.11 */);
t("…Gate B off: the fingerprint as before it existed — no edition issued earlier is marked changed", fingerprint(sch, "invitation") === before.inv);

// ── the wiring (source shape) ──
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const act = src("lib/actions.ts");
const upload = act.slice(act.indexOf("export async function uploadLabDocAction"), act.indexOf("export async function removeLabDocAction"));
t("upload: the number required; the original invoice only once paid — re-checked in the lock", /invoiceSlotProblem\(slot as "proforma" \| "invoice", docNumber, !!scheme\.paidAt\?\.\[code\]\)/.test(upload) && /\(slot === "invoice" && !s\.paidAt\?\.\[code\]\)/.test(upload) && /number: docNumber!/.test(upload));
t("…the participation told — which document and its number; never the file's name in the journal", /notifyInvoiceReady\(invoiceTell\.labId, schemeId, scheme\.number, code, \{ slot: slot as "proforma" \| "invoice", number: docNumber!, participantId: participant\.id \}\)/.test(upload) && !/summary: `[^`]*file\.name/.test(upload));
t("«paid» never unmarked while the original invoice is held (Реш. 35)", /if \(!paid && s\.labDocs\?\.\[code\]\?\.invoice\) \{ held = true; return \{\}; \}/.test(act));
const exp = src("app/invoices/export/route.ts");
t("the billing export: who works with the participants AND sees names, in THIS scheme; one opening for the export; journalled", /if \(!\(await mayNow\("participants\.manage", id\)\)\) return new Response/.test(exp) && /if \(!\(await mayNow\("names\.view", id\)\)\) return new Response/.test(exp) && /purpose: "export" as const/.test(exp) && /logActivity\("names\.viewed"/.test(exp));
t("Gate B: П4 and П5 in the testing invitation, П7 in the calibration one and in M1 — chosen by the switch", /gateB\(\) \? L\(P4\.en, P4\.bg\)/.test(src("lib/docs/invitation.ts")) && /gateB\(\) \? L\(P5\.en, P5\.bg\)/.test(src("lib/docs/invitation.ts")) && /gateB\(\) \? L\(P7\.en, P7\.bg\)/.test(src("lib/docs/invitation-c.ts")) && /\.\.\.\(gateB\(\) \? \[P7\.bg\]/.test(src("lib/m1-texts.ts")) && /\.\.\.\(gateB\(\) \? \[P7\.en\]/.test(src("lib/m1-texts.ts")));

console.log(`invoices.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
