import { computeLabPhases, LAB_PHASES, LAB_UPLOAD_SLOTS, canLabUploadNow, fmtPhaseDate } from "../src/lib/lab-phases.ts";
import type { CaseEvent } from "../src/lib/types.ts";

// The lab-facing phase timeline (traceability milestone). Pure logic — no store.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

const ev = (kind: CaseEvent["kind"], at: string, ref?: string): CaseEvent => ({
  id: kind + at, schemeId: "s", code: "261101", kind, at, ref,
  recordedBy: "t@t", recordedAt: at + "T10:00:00Z", source: "manual",
});

// 1) fresh participant: only "Application" done, current = approval
{
  const { phases, curIdx } = computeLabPhases("applied", [], { reported: false, hasCert: false });
  ok("7 phases", phases.length === 7 && LAB_PHASES.length === 7);
  ok("fresh: application done", phases[0].done);
  ok("fresh: rest not done", phases.slice(1).every((p) => !p.done));
  ok("fresh: current = approval (1)", curIdx === 1);
}

// 2) status advances phases even without events
{
  const { phases, curIdx } = computeLabPhases("dispatched", [], { reported: false, hasCert: false });
  ok("dispatched: phases 0-2 done", phases[0].done && phases[1].done && phases[2].done);
  ok("dispatched: current = receipt (3)", curIdx === 3);
  ok("dispatched: receipt phase is a lab move", !!phases[3].ph.labMove);
}

// 3) an event marks its phase done even if the status lags (event wins)
{
  const events = [ev("receipt_confirmed", "2026-06-16")];
  const { phases } = computeLabPhases("dispatched", events, { reported: false, hasCert: false });
  ok("event wins over lagging status", phases[3].done);
  ok("event dates the phase", phases[3].e?.at === "2026-06-16");
}

// 4) newest event per kind is used (list is newest-first)
{
  const events = [ev("items_dispatched", "2026-06-20", "Speedy NEW"), ev("items_dispatched", "2026-06-01", "OLD")];
  const { phases } = computeLabPhases("dispatched", events, { reported: false, hasCert: false });
  ok("latest event per kind", phases[2].e?.ref === "Speedy NEW");
}

// 5) final phase: reported / certificate / event each complete it
{
  ok("report done via reported", computeLabPhases("scored", [], { reported: true, hasCert: false }).phases[6].done);
  ok("report done via cert", computeLabPhases("scored", [], { reported: false, hasCert: true }).phases[6].done);
  ok("report done via event", computeLabPhases("scored", [ev("report_issued", "2026-10-01")], { reported: false, hasCert: false }).phases[6].done);
  const open = computeLabPhases("scored", [], { reported: false, hasCert: false });
  ok("scored but not reported: current = report (6)", open.curIdx === 6);
}

// 6) everything done → curIdx -1 (no current phase)
{
  const { curIdx } = computeLabPhases("scored", [], { reported: true, hasCert: true });
  ok("all done → curIdx -1", curIdx === -1);
}

// 7) the dispatch phase carries the lab handout downloads
{
  const docs = LAB_PHASES[2].docs?.map((d) => d.key) ?? [];
  ok("dispatch docs = instruction/protocol/results", JSON.stringify(docs) === JSON.stringify(["instruction", "protocol", "results"]));
}

// 8) date formatting
ok("fmtPhaseDate dd.mm.yyyy", fmtPhaseDate("2026-06-16") === "16.06.2026");
ok("fmtPhaseDate passthrough", fmtPhaseDate("na") === "na");

// 9) lab self-upload slots: mapping + which phases carry them
{
  ok("protocol upload stamps receipt_confirmed", LAB_UPLOAD_SLOTS.protocol.kind === "receipt_confirmed" && LAB_UPLOAD_SLOTS.protocol.docKey === "protocol");
  ok("results upload stamps results_returned", LAB_UPLOAD_SLOTS.results.kind === "results_returned" && LAB_UPLOAD_SLOTS.results.docKey === "results");
  const slots = LAB_PHASES.map((p) => p.uploadSlot).filter(Boolean);
  ok("exactly 2 phases carry upload slots (protocol, results)", JSON.stringify(slots) === JSON.stringify(["protocol", "results"]));
  ok("upload slots sit on the lab-move phases", LAB_PHASES.every((p) => !p.uploadSlot || !!p.labMove));
}

// 10) replace lock: allowed until scored, locked at scored
{
  ok("upload open while applied", canLabUploadNow("applied"));
  ok("upload open while dispatched", canLabUploadNow("dispatched"));
  ok("upload open while submitted", canLabUploadNow("submitted"));
  ok("upload LOCKED once scored", !canLabUploadNow("scored"));
}

console.log(`lab-phases.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
