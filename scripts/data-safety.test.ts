// Part 0.9 — nothing is deleted. A scheme is archived (kept, out of every list,
// answering like a missing one) and a case-file step is voided with a reason (kept,
// struck through, no longer counted). Runs on the in-memory store (no database).
import { addScheme, archiveScheme, getScheme, listSchemes, listSchemeSummaries, getSchemesByIds, listOpenSchemes, schemeIdTaken } from "../src/lib/store.ts";
import { addParticipant, listParticipants } from "../src/lib/participants.ts";
import { addCaseEvent, listCaseEvents, voidCaseEvent } from "../src/lib/case-events.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";
import type { Scheme } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// ── archive instead of delete (N23)
const s: Scheme = { ...structuredClone(pavingBlocks), id: "DS-1", number: "PTS 27/03-T-9", status: "open" };
await addScheme(s);
await addParticipant({ schemeId: "DS-1", labName: "Lab X" }, "test");
t("archiving an existing scheme succeeds", await archiveScheme("DS-1", "ana@ptsbg.eu"));
t("archived: answers like a missing one", (await getScheme("DS-1")) === undefined);
t("archived: not in the list", !(await listSchemes()).some((x) => x.id === "DS-1"));
t("archived: not in the summaries", !(await listSchemeSummaries()).some((x) => x.id === "DS-1"));
t("archived: not among open schemes", !(await listOpenSchemes()).some((x) => x.id === "DS-1"));
t("archived: not fetched by id lists", (await getSchemesByIds(["DS-1"])).length === 0);
t("archived: its participants are KEPT", (await listParticipants("DS-1")).length === 1);
t("archiving a missing scheme does nothing", !(await archiveScheme("NO-SUCH", "x")));
t("archived: its id stays taken (never reused)", await schemeIdTaken("DS-1"));
t("archived: its number still counts for numbering", (await listSchemeSummaries({ includeArchived: true })).some((x) => x.id === "DS-1"));
t("a free id is free", !(await schemeIdTaken("DS-FREE")));

// ── void instead of delete
const e = await addCaseEvent({ schemeId: "S-V", code: "271101", kind: "items_dispatched", ref: "Econt 123", recordedBy: "ana@ptsbg.eu", source: "manual" });
t("a step is listed", (await listCaseEvents("S-V", "271101")).length === 1);
t("void needs the step not yet voided", await voidCaseEvent(e.id, "ana@ptsbg.eu", "wrong waybill"));
t("voiding twice does nothing", !(await voidCaseEvent(e.id, "ana@ptsbg.eu", "again")));
t("voided: no longer counted", (await listCaseEvents("S-V", "271101")).length === 0);
const kept = await listCaseEvents("S-V", "271101", { includeVoided: true });
t("voided: KEPT, with who/when/why", kept.length === 1 && kept[0].voidedBy === "ana@ptsbg.eu" && kept[0].voidReason === "wrong waybill" && !!kept[0].voidedAt);
t("voided: the original record is intact", kept[0].ref === "Econt 123" && kept[0].kind === "items_dispatched");

console.log(`data-safety.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
