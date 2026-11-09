// Plan part 3.8 — the per-scheme lists (Реш. 108, 154; M1 §18): the shipment
// documents; the receipt-protocol checklist (a calibration scheme starts with its
// Instruction's checks); «accreditation required» — it warns, never refuses.
import { readFileSync } from "node:fs";
import {
  readList, startingLists, listsOf, listsDiff, listSeq, accreditationWarning, LIST_PROBLEM_TEXT, CALIBRATION_RECEIPT_CHECKS, SHIPMENT_SUGGESTIONS, MAX_ITEMS,
} from "../src/lib/scheme-lists-model.ts";
import { fingerprint } from "../src/lib/editions.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── a list ─────────────────────────────────────────────────────────────────
const r1 = readList([{ id: "", bg: "Товарителница", en: "Waybill" }, { id: "", bg: "", en: "" }, { id: "", bg: " Митнически​ документи ", en: "Customs documents" }], undefined, 0);
eq("rows read, a blank one dropped, junk cleaned, ids given in turn", r1, { ok: true, items: [{ id: "li-1", bg: "Товарителница", en: "Waybill" }, { id: "li-2", bg: "Митнически документи", en: "Customs documents" }], seq: 2 });
const known = r1.ok ? r1.items : [];
const r2 = readList([{ id: "li-2", bg: "Митнически документи", en: "Customs documents" }, { id: "li-1", bg: "Товарителница (CMR)", en: "Waybill (CMR)" }, { id: "", bg: "Декларация", en: "Declaration" }], known, 2);
eq("a reorder and an edit keep each id; a new row the next — never a reused one", r2.ok ? r2.items.map((i) => i.id) : r2, ["li-2", "li-1", "li-3"]);
eq("…an id from elsewhere (a crafted form) or twice is given a new one", (() => { const r = readList([{ id: "li-1", bg: "a", en: "a" }, { id: "li-1", bg: "b", en: "b" }, { id: "li-99", bg: "c", en: "c" }], known, 2); return r.ok ? r.items.map((i) => i.id) : r; })(), ["li-1", "li-3", "li-4"]);
eq("a row in one language only is refused, named — by its place and its words (both are printed)", readList([{ id: "", bg: "a", en: "a" }, { id: "", bg: "само български", en: "" }], undefined, 0), { ok: false, problem: "half", row: 2, text: "само български" });
eq("a long row refused, its words cut to 40", readList([{ id: "", bg: "а".repeat(201), en: "a" }], undefined, 0), { ok: false, problem: "too-long", row: 1, text: "а".repeat(40) });
eq(`at most ${MAX_ITEMS} rows`, readList(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ id: "", bg: `р${i}`, en: `r${i}` })), undefined, 0), { ok: false, problem: "too-many" });
eq("…more rows POSTED than allowed: refused even when blanks would bring it under (review)", readList([{ id: "", bg: "a", en: "a" }], undefined, 0, MAX_ITEMS + 9), { ok: false, problem: "too-many" });
eq("the counter never below an id either list holds (review)", [listSeq({ shipmentDocs: [{ id: "li-7", bg: "a", en: "a" }], receiptChecks: [{ id: "li-3", bg: "b", en: "b" }], seq: 2 }), listSeq({ receiptChecks: [{ id: "li-4", bg: "b", en: "b" }] }), listSeq(undefined)], [7, 4, 0]);
t("every problem has its words", Object.values(LIST_PROBLEM_TEXT).every((v) => !!v.bg && !!v.en));

// ── where a scheme starts ──────────────────────────────────────────────────
eq("a calibration scheme starts with its Instruction's checks (M1 §18)", startingLists("C")?.receiptChecks?.map((i) => i.en), CALIBRATION_RECEIPT_CHECKS.map((c) => c.en));
eq("…a testing scheme starts empty — PTS writes what applies; nothing invented", [startingLists("T"), startingLists("S")], [undefined, undefined]);
eq("…a calibration scheme from before 3.8 has them too, until it saves its own", listsOf({ type: "C" }).receiptChecks?.length, CALIBRATION_RECEIPT_CHECKS.length);
eq("…once saved, its own — even an empty list", listsOf({ type: "C", lists: { receiptChecks: [] } }).receiptChecks, []);
t("the waybill is among the quick choices — offered, never added on its own", SHIPMENT_SUGGESTIONS.some((x) => x.bg === "Товарителница"));

// ── the warning ────────────────────────────────────────────────────────────
t("accreditation required and none stated: a warning (Реш. 108)", accreditationWarning({ accreditationRequired: true }, "") && accreditationWarning({ accreditationRequired: true }, "  "));
t("…what people type for none counts as none (review)", ["—", "-", "няма", "Няма", "N/A", "n/a", "none", "No", "не", "без", ".", "--"].every((x) => accreditationWarning({ accreditationRequired: true }, x)));
t("…none when one is stated, or the scheme does not ask", !accreditationWarning({ accreditationRequired: true }, "БСА 123 ЛИ") && !accreditationWarning({}, ""));

// ── the journal; documents ─────────────────────────────────────────────────
eq("what changed, named", listsDiff({}, { shipmentDocs: [{ id: "li-1", bg: "Товарителница", en: "Waybill" }], accreditationRequired: true }), ["shipment documents: added li-1 «Товарителница» / «Waybill»", "accreditation required: yes (warns only)"]);
const rc0 = startingLists("C")!.receiptChecks!;
eq("…each row by its id: reworded (both wordings), removed, moved (review)", listsDiff({ receiptChecks: rc0 }, { receiptChecks: [{ ...rc0[3], bg: "Няма корозия", en: "No corrosion" }, rc0[0], rc0[1], rc0[2]] }),
  ["receipt checks: reworded li-4 «Няма конденз» / «No condensation» → «Няма корозия» / «No corrosion»; removed li-5 «Няма други признаци, които могат да повлияят на годността за калибриране» / «No other signs that could affect its fitness for calibration»; order li-4, li-1, li-2, li-3"]);
eq("…nothing when nothing changed", listsDiff({ receiptChecks: [{ id: "li-1", bg: "a", en: "a" }] }, { receiptChecks: [{ id: "li-1", bg: "a", en: "a" }], seq: 9 }), []);
const s0 = structuredClone(pavingBlocks);
t("the lists change no document (fingerprint)", ["plan", "invitation", "instruction", "protocol"].every((d) => fingerprint(s0, d) === fingerprint({ ...s0, lists: { accreditationRequired: true, shipmentDocs: [{ id: "li-1", bg: "Т", en: "W" }], seq: 1 } }, d)));

// ── the action and the screens ─────────────────────────────────────────────
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const actions = read("../src/lib/actions.ts");
const edit = actions.slice(actions.indexOf("export async function updateSchemeAction"));
t("each list read on its own; one that does not read keeps ITS rows — the other list and the flag saved (review)", /const shipRefusal = refusalOf\(shipRows, "ship"\);/.test(edit) && /const sh = shipRefusal \? null : readList\(/.test(edit) && /const rc = rcptRefusal \? null : readList\(/.test(edit) && /lists: listsNow,/.test(edit));
t("…ids above every id either list holds, from the fresh state, inside the lock; other fields kept", /const listsBefore = listsOf\(current\);/.test(edit) && /let seq = listSeq\(listsBefore\);/.test(edit) && /\.\.\.rest,/.test(edit));
t("…a calibration scheme's starting checklist STORED when it is made (review)", /const lists0 = startingLists\(type\);/.test(actions));
t("…each change on record", /logActivity\("scheme\.lists"/.test(edit));
t("…its own notice per list, carried with any other", /lship=/.test(edit) && /lrcpt=/.test(edit));
const editPage = read("../src/app/schemes/[id]/edit/page.tsx");
t("…read back only as a known problem — never «toString» (review)", /Object\.hasOwn\(LIST_PROBLEM_TEXT, problem\)/.test(editPage) && /Object\.hasOwn\(COMMERCIAL_PROBLEM_TEXT, com\)/.test(editPage) && !/ in LIST_PROBLEM_TEXT| in COMMERCIAL_PROBLEM_TEXT/.test(editPage));
const editor = read("../src/components/SchemeEditor.tsx");
t("the editor posts both lists and the flag", /name=\{`\$\{pfx\}_\$\{i\}_bg`\}/.test(editor) && /pfx="ship"/.test(editor) && /pfx="rcpt"/.test(editor) && /name="listsPosted"/.test(editor) && /name="accreditationRequired"/.test(editor));
const apps = read("../src/app/schemes/[id]/applications/page.tsx");
t("the applications page warns — never refuses — when accreditation is required and none stated", /accreditationWarning\(/.test(apps) && /data-accreditation-warning/.test(apps));
const parts = read("../src/app/schemes/[id]/participants/page.tsx");
t("…and the participants page, where PTS adds them while online applications are closed (review)", /accreditationWarning\(lists, /.test(parts) && /data-accreditation-warning/.test(parts));

console.log(`scheme-lists.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
