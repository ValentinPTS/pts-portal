import type { CaseEvent, CaseEventKind, ParticipantStatus } from "./types";

// The lab-facing journey as a phase TIMELINE (approved design 2026-07-08), driven
// by the participation status + the case-file timeline the provider maintains.
// Phase names are provisional until the owner's real process document arrives —
// adjust labels/order HERE only. `kind` = the case event that dates the phase;
// `minStatus` = the participant status at which the phase counts as done;
// `labMove` = the lab must act to advance; `docs` = handouts downloadable there.
// PURE module (no next imports) so the phase logic is unit-testable.

export const PSTATUS_ORDER: ParticipantStatus[] = [
  "applied", "approved", "invoiced", "paid", "dispatched", "received", "submitted", "scored",
];

// Lab self-upload slots (owner decision 2026-07-09): the signed receipt protocol
// and the completed results sheet. An upload auto-stamps `kind` on the case file
// (which advances the status); `docKey` links the event to the portal document.
export type LabUploadSlot = "protocol" | "results";
export const LAB_UPLOAD_SLOTS: Record<LabUploadSlot, { kind: CaseEventKind; docKey: string; bg: string; en: string }> = {
  protocol: { kind: "receipt_confirmed", docKey: "protocol", bg: "Качи подписан протокол", en: "Upload signed protocol" },
  results: { kind: "results_returned", docKey: "results", bg: "Качи попълнен Лист за резултати", en: "Upload completed results sheet" },
};

// Upload/replace is allowed until the participation is scored (then locked —
// evaluation integrity). Owner decision 2026-07-09.
export function canLabUploadNow(status: ParticipantStatus): boolean {
  return PSTATUS_ORDER.indexOf(status) < PSTATUS_ORDER.indexOf("scored");
}

export interface LabPhaseDef {
  bg: string;
  en: string;
  minStatus: ParticipantStatus;
  kind?: CaseEventKind;
  labMove?: { bg: string; en: string };
  docs?: { key: string; bg: string; en: string }[];
  uploadSlot?: LabUploadSlot; // the lab can upload its file on this phase
}

export const LAB_PHASES: LabPhaseDef[] = [
  { bg: "Заявка за участие", en: "Application", minStatus: "applied" },
  { bg: "Одобрение и код", en: "Approval & code", minStatus: "approved", kind: "code_assigned" },
  {
    bg: "Изпращане на пробите", en: "Samples dispatched", minStatus: "dispatched", kind: "items_dispatched",
    docs: [
      { key: "instruction", bg: "Инструкция за участниците", en: "Instruction for participants" },
      { key: "protocol", bg: "Протокол за получаване", en: "Receipt protocol" },
      { key: "results", bg: "Лист за резултати", en: "Results sheet" },
    ],
  },
  {
    bg: "Потвърдено получаване", en: "Receipt confirmed", minStatus: "received", kind: "receipt_confirmed",
    labMove: { bg: "Потвърдете получаването — качете подписания протокол тук, или го изпратете по e-mail.", en: "Confirm receipt — upload the signed protocol here, or send it by e-mail." },
    uploadSlot: "protocol",
  },
  {
    bg: "Върнати резултати", en: "Results returned", minStatus: "submitted", kind: "results_returned",
    labMove: { bg: "Върнете попълнения Лист за резултати — качете го тук, или го изпратете по e-mail.", en: "Return your completed Results sheet — upload it here, or send it by e-mail." },
    uploadSlot: "results",
  },
  { bg: "Оценка на резултатите", en: "Evaluation", minStatus: "scored", kind: "scored" },
  { bg: "Доклад и сертификат", en: "Report & certificate", minStatus: "scored", kind: "report_issued" },
];

export interface LabPhaseState {
  ph: LabPhaseDef;
  e?: CaseEvent; // the latest event dating this phase (if any)
  done: boolean;
}

// One participation → the state of each phase. `events` newest-first (the store's
// order); a phase is done when the status reached it OR its event was recorded
// (event wins, so a recorded step shows done even if the status write failed).
// The final phase is scheme-level: done when the report is out or a certificate
// exists for the code (or its event was stamped).
export function computeLabPhases(
  status: ParticipantStatus,
  events: CaseEvent[],
  opts: { reported: boolean; hasCert: boolean }
): { phases: LabPhaseState[]; curIdx: number } {
  const statusIdx = PSTATUS_ORDER.indexOf(status);
  const evOf = (kind?: CaseEventKind) => (kind ? events.find((e) => e.kind === kind) : undefined);
  const phases = LAB_PHASES.map((ph, i) => {
    const e = evOf(ph.kind);
    const done = i === LAB_PHASES.length - 1
      ? opts.reported || opts.hasCert || !!e
      : statusIdx >= PSTATUS_ORDER.indexOf(ph.minStatus) || !!e;
    return { ph, e, done };
  });
  return { phases, curIdx: phases.findIndex((x) => !x.done) };
}

export const fmtPhaseDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso ?? "";
};
