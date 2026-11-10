// What a laboratory sees of its report after the issue (plan part 7.5; Реш. 68, 135; D3, D7). Pure.
// The R in force once it reaches the participation — its version and day, a correction said as such
// (fixed words — never PTS's typed scope, 7.4 review), the earlier R's it received as replaced (no link:
// a replaced report is not served), its own first opening. Not reached: awaiting its payment. The
// scores are in 2.0's file; the portal shows no number while 2.0 returns documents only (D3).

import { reaches, receivedIssues, type ReportAccess, type ReportIssue } from "./report-issue-model";

export interface LabReportCard {
  state: "none" | "awaiting" | "reached" | "legacy";
  current: { r: number; version: string; day: string; editionId: string; correction: boolean } | null;
  /** the R's it received before the one in force — replaced, never served */
  earlier: { r: number; day: string }[];
  /** its own first opening of the R in force; null — not opened yet */
  firstOpened: string | null;
  /** N/R at the lock (6.6): the report has no scores for it */
  nr: boolean;
}

export function labReportCard(
  s: { status: string; uploads?: { report?: unknown }; reportIssues?: readonly ReportIssue[]; reportAccess?: Record<string, ReportAccess> },
  code: string,
  opts: { nr?: boolean; inFinal?: boolean; openings?: readonly { editionId: string; at: string }[] } = {},
): LabReportCard {
  const nr = !!opts.nr;
  const none: LabReportCard = { state: "none", current: null, earlier: [], firstOpened: null, nr };
  if (s.status !== "report" && s.status !== "closed") return none;
  const issues = s.reportIssues ?? [];
  if (!issues.length) return s.uploads?.report ? { ...none, state: "legacy" } : none;
  // not reached: awaiting its payment — unless it left the round, when nothing can open it (review)
  if (!reaches(s.reportAccess, code)) return opts.inFinal === false ? none : { ...none, state: "awaiting" };
  const received = receivedIssues(issues, s.reportAccess![code]);
  const cur = received.at(-1) ?? issues.at(-1)!;
  const opened = (opts.openings ?? []).filter((o) => o.editionId === cur.editionId).map((o) => o.at).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return {
    state: "reached",
    current: { r: cur.r, version: cur.analysisVersion, day: cur.day, editionId: cur.editionId, correction: cur.kind === "correction" },
    earlier: received.slice(0, -1).map((i) => ({ r: i.r, day: i.day })),
    firstOpened: opened,
    nr,
  };
}
