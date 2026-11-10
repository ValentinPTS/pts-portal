// Level 3 — the dry run with internal participants (plan part 8.5; Реш. 130–133; D21). Pure.
//
// Three simulation rounds run end to end in the test environment — PT testing, a sequential calibration
// and an ILC testing round — PTS's people as the provider, the test mailboxes as the laboratories, the
// clock moved to provoke what would take weeks. Every scenario a dry run must show leaves a record in
// the round: the portal reads it, so a scenario a person ticks is one that HAPPENED.

import { readSchemeNumber } from "./scheme-number";
import { mailAllowedHere, isTestEnvironment } from "./environment";

export const SCENARIOS = ["mail", "deadlines", "reminder", "late", "extension", "reissued", "export"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_TEXT: Record<Scenario, { bg: string; en: string }> = {
  mail: { bg: "Пощата — поканите и известията стигат само до тестовите пощи, след натиснат бутон", en: "The mail — invitations and notices reach only the test mailboxes, after a button" },
  deadlines: { bg: "Сроковете — по тестовия часовник и календара на почивните дни", en: "The deadlines — on the test clock and the holiday calendar" },
  reminder: { bg: "Напомнянето — с одобрения текст, видим в портала", en: "The reminder — with the approved text, visible in the portal" },
  late: { bg: "Закъснял резултат — отказан след срока, отключен от PTS с причина", en: "A late result — refused after the deadline, unlocked by PTS with a reason" },
  extension: { bg: "Удължаване на срок — записано, видимо, уведомено", en: "An extension — recorded, visible, notified" },
  reissued: { bg: "Поправен доклад (R2) — с причина и обхват; лабораторията получава R2", en: "A corrected report (R2) — with reason and scope; the laboratory gets R2" },
  export: { bg: "Експортът на кръга — пълен; кодираната част без имена", en: "The round export — whole; the coded part without names" },
};

/** What the round's own records show, frozen with the test (8.5 review: what PROVES each scenario). */
export interface ScenarioRecords {
  /** e-mails for the round: delivered; still pending; addresses whose LATEST message failed */
  mail: { sent: number; pending: number; failedAddresses: number };
  /** the round's clock moved forward on record (the journal — a reset never erases it) */
  clockMoves: number;
  /** reminders that reached a laboratory: released notices, or reminder e-mails delivered */
  reminders: number;
  /** results unlocked after the deadline, each with its reason — a deadline passed on the moved clock */
  unlocks: number;
  extensions: number;
  /** corrected reports (R2, R3…) */
  corrections: number;
  /** WHOLE round exports (both parts, nothing missing — journal) */
  exports: number;
  /** each scenario's latest record — to trace the evidence back */
  refs: Partial<Record<Scenario, string>>;
  /** the latest record's moment — a test is never dated before it */
  latestAt: string | null;
}

/** The test mailboxes (D21) are PTS's own — an address outside them is a dry run's failure, wherever it runs. */
export const testMailbox = (to: string) => mailAllowedHere(to, { PTS_ENVIRONMENT: "test" });

/** Per scenario: did it happen, by the records? Mail: sent, none failed, none outside the test mailboxes. */
export function scenarioHappened(r: ScenarioRecords): Record<Scenario, boolean> {
  return {
    // delivered, none still pending, no address whose latest message failed (8.5 review)
    mail: r.mail.sent > 0 && r.mail.pending === 0 && r.mail.failedAddresses === 0,
    // the clock moved forward on record AND a deadline passed on it — a result unlocked after it (8.5 review)
    deadlines: r.clockMoves > 0 && r.unlocks > 0,
    reminder: r.reminders > 0,
    late: r.unlocks > 0,
    extension: r.extensions > 0,
    reissued: r.corrections > 0,
    export: r.exports > 0,
  };
}

/** A dry run's round: a simulation round (a SIM number — Реш. 130) in the test environment, never a
 *  replay (8.5 review: the environment checked too — defence in depth). */
export const isDryRunRound = (s: { number: string; replay?: unknown }, env?: Record<string, string | undefined>) => !s.replay && isTestEnvironment(env) && !!readSchemeNumber(s.number)?.simulation;
