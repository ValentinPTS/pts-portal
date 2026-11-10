// The issue act and the report's editions R1, R2… (plan part 7.4; Реш. 68, 140; D7; ISO/IEC 17043
// §7.4.3). Pure. The report issued is 2.0's file (7.2) whose transfer check in force is «the same»
// (7.3); R1 at the act, a correction R2… with its reason and scope. It reaches a participation marked
// paid, or opened by hand with a reason (D7) — once reached, it stays. Each R keeps the scheme's
// software record (Zadanie §6): the releases in force during the round, the configuration version,
// the template editions, the 2.0 versions.

import type { CheckState, TransferCheck } from "./transfer-check-model";

export interface SoftwareRecord {
  /** releases from the change register (1.11): the one in force when the round began, every one since */
  releases: { title: string; ref?: string; deployedAt: string }[];
  /** the characteristics' configuration version in force (3.6); null — none recorded */
  configVersion: number | null;
  /** each document's latest edition issued for the scheme by then (3.0) */
  templates: { docKey: string; no: number; issuedOn: string }[];
  /** the version of the gate texts (6.8) */
  gateTexts: string;
  /** the module's versions: the report's first, then every other import's */
  analysisVersions: string[];
}

export interface ReportIssue {
  id: string;
  /** R1, R2… */
  r: number;
  kind: "issue" | "correction";
  editionId: string; editionNo: number;
  at: string; by: string; day: string;
  /** a correction's reason (required); the act's note for R1 */
  reason: string;
  /** a correction: what changed (required) */
  scope: string;
  /** a correction: the codes it concerns — empty: all */
  codes: string[];
  analysisVersion: string; importId: string; reportSha: string; transferCheckId: string;
  software: SoftwareRecord;
}

/** How the report reached a participation (D7): payment marked, or opened by hand with a reason. */
export interface ReportAccess { at: string; by: string; via: "paid" | "hand"; reason?: string }

export const rLabel = (r: number): string => `R${r}`;
export const issueInForce = (issues: readonly ReportIssue[] | undefined): ReportIssue | null => issues?.at(-1) ?? null;

export const MIN_WORDS = 5;
const clean = (v: unknown, max = 1000) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const chars = (s: string) => [...s].length;

export type IssueProblem = "not-2.0" | "no-export" | "no-check" | "check-differs" | "check-old" | "not-issued" | "same-file" | "reason" | "scope" | "too-long" | "codes" | "state" | "failed" | "unread" | "stale" | "code" | "already" | "kept";
export const ISSUE_PROBLEM_TEXT: Record<IssueProblem, { bg: string; en: string }> = {
  "not-2.0": { bg: "Докладът в сила не е от PTS_Analysis 2.0 (качен е на ръка или е избран вграденият) — издава се само докладът на 2.0, с версията му (Реш. 68). Внесете го (7.2).", en: "The report in force is not from PTS_Analysis 2.0 (uploaded by hand, or the built one chosen) — only 2.0's report is issued, with its version (Реш. 68). Import it (7.2)." },
  "no-export": { bg: "Няма изнасяне към 2.0 след заключването — изнесете, внесете доклада на 2.0 и запишете проверката на преноса.", en: "There is no export to 2.0 after the lock — export, import 2.0's report and record the transfer check." },
  "too-long": { bg: "Причината и какво е поправено — до 400 знака всяко (те влизат в записа на редакцията).", en: "The reason and what is corrected — 400 characters each at most (they go into the edition's record)." },
  unread: { bg: "Не можа да се прочете — презаредете.", en: "Could not be read — reload." },
  kept: { bg: "Файлът на издадения доклад остава — поправка се внася от 2.0 и се издава като R2…", en: "The issued report's file stays — a correction is imported from 2.0 and issued as R2…" },
  "no-check": { bg: "Няма проверка на преноса за това изнасяне и този доклад — запишете я в «Запис на обработката» (7.3).", en: "There is no transfer check for this export and this report — record it under «The processing record» (7.3)." },
  "check-differs": { bg: "Проверката на преноса в сила казва, че докладът на 2.0 НЕ изброява същите кодове и характеристики — докладът не се издава.", en: "The transfer check in force says 2.0's report does NOT list the same codes and characteristics — the report is not issued." },
  "check-old": { bg: "Проверката на преноса не е в сила (предварително изнасяне, ново заключване или корекция след изнасянето) — изнесете отново и проверете.", en: "The transfer check is not in force (a preliminary export, a new lock, or a correction after the export) — export again and check." },
  "not-issued": { bg: "Докладът още не е издаден с акта (R1) — поправка няма на какво.", en: "The report has not been issued by the act (R1) — there is nothing to correct." },
  "same-file": { bg: "Докладът в сила е същият файл като последното издаване — поправката е друг файл (внесете поправения доклад от 2.0).", en: "The report in force is the same file as the last issue — a correction is another file (import the corrected report from 2.0)." },
  reason: { bg: "Напишете причината за поправката (поне 5 знака).", en: "Write the reason for the correction (5 characters at least)." },
  scope: { bg: "Напишете какво е поправено (поне 5 знака).", en: "Write what is corrected (5 characters at least)." },
  codes: { bg: "Кодовете, които поправката засяга, трябва да са участия в схемата.", en: "The codes the correction concerns must be participations in the scheme." },
  state: { bg: "Схемата не е в състоянието за това.", en: "The scheme is not in the state for this." },
  failed: { bg: "НЕ е записано — опитайте пак.", en: "NOT recorded — try again." },
  stale: { bg: "Междувременно се промени докладът в сила или проверката — презаредете.", en: "The report in force or its check changed meanwhile — reload." },
  code: { bg: "Няма такова участие в кръга.", en: "No such participation in the round." },
  already: { bg: "Докладът вече е достъпен за това участие.", en: "The report already reaches this participation." },
};

/** Whether the report in force may be issued (R1) or issued as a correction: 2.0's file, its
 *  transfer check in force «the same». */
export function transferProblem(t: { state: CheckState; check: TransferCheck | null } | null, twoReport = true): IssueProblem | null {
  if (!t) return "unread";
  // the report first: one uploaded by hand is never issued, whatever the export (review)
  if (!twoReport || t.state === "no-report") return "not-2.0";
  if (t.state === "no-export") return "no-export";
  if (t.state === "preliminary" || t.state === "relocked" || t.state === "corrected") return "check-old";
  if (t.state === "none" || !t.check) return "no-check";
  return t.check.same ? null : "check-differs";
}

/** A correction (R2…): issued (R1 on record), another file, its check «the same», the reason and
 *  what changed in words, the codes — participations in the scheme (none: all). */
export const MAX_CORRECTION_WORDS = 400;
export function readCorrection(input: { reason: unknown; scope: unknown; codes: unknown }, known: readonly string[]):
  { ok: true; reason: string; scope: string; codes: string[] } | { ok: false; problem: IssueProblem } {
  const reason = clean(input.reason), scope = clean(input.scope);
  if (chars(reason) < MIN_WORDS) return { ok: false, problem: "reason" };
  if (chars(scope) < MIN_WORDS) return { ok: false, problem: "scope" };
  // both go into the edition's reason (1000 at most, with its own words): 400 each (review)
  if (chars(reason) > MAX_CORRECTION_WORDS || chars(scope) > MAX_CORRECTION_WORDS) return { ok: false, problem: "too-long" };
  const codes = [...new Set(clean(input.codes, 4000).split(/[\s,;]+/).filter(Boolean))];
  if (codes.some((c) => !known.includes(c))) return { ok: false, problem: "codes" };
  return { ok: true, reason, scope, codes };
}
export function correctionProblem(issues: readonly ReportIssue[] | undefined, t: { state: CheckState; check: TransferCheck | null; reportSha?: string } | null, twoReport = true): IssueProblem | null {
  const last = issueInForce(issues);
  if (!last) return "not-issued";
  const p = transferProblem(t, twoReport);
  if (p) return p;
  return t!.reportSha === last.reportSha ? "same-file" : null;
}

/** Those the report reaches at the act: every participation of the round marked paid then (D7). */
export function accessAtIssue(paidAt: Record<string, string> | undefined, codes: readonly string[], had: Record<string, ReportAccess> | undefined, at: string, by: string): Record<string, ReportAccess> {
  const out: Record<string, ReportAccess> = {};
  for (const c of codes) if (paidAt?.[c] && !had?.[c]) out[c] = { at, by, via: "paid" };
  return out;
}
export const reaches = (access: Record<string, ReportAccess> | undefined, code: string): boolean => !!access?.[code];

/** A hand opening: the reason in words (e.g. a state institution). */
export function readHandOpen(input: { reason: unknown }): { ok: true; reason: string } | { ok: false; problem: "reason" } {
  const reason = clean(input.reason);
  return chars(reason) < MIN_WORDS ? { ok: false, problem: "reason" } : { ok: true, reason };
}

/** Is a participation told of this R? An issue — every one it reaches; a correction — those in its
 *  scope (none named: all). */
export const inScope = (i: Pick<ReportIssue, "kind" | "codes">, code: string): boolean => i.kind === "issue" || i.codes.length === 0 || i.codes.includes(code);

/** Which R a «report issued» notice names — «(R1)», «поправка R2» — from its own words (the
 *  notice texts of notify-events); a certificate's notice names none. */
export const rOfNotice = (bg: string): number | null => { const m = /\bR(\d+)\b/.exec(bg); return m ? Number(m[1]) : null; };

export interface RecipientRow { code: string; access: ReportAccess | null; received: { r: number; at: string }[]; told: { r: number; at: string }[]; opened: { r: number; at: string }[] }
/** Who received which edition: how the report reached each code; each R that reached it (the R in
 *  force when it was reached, then every later one); each R it was told of (the notices raised —
 *  none when there is nobody to tell); each R it opened, first (the journal). */
export function recipients(input: {
  codes: readonly string[]; access?: Record<string, ReportAccess>; issues?: readonly ReportIssue[];
  openings?: readonly { code: string; editionId: string; at: string }[];
  notices?: readonly { code?: string; bg: string; at: string }[];
}): RecipientRow[] {
  const issues = input.issues ?? [];
  const rOf = new Map(issues.map((i) => [i.editionId, i.r]));
  const firstOf = (list: readonly { code: string; r: number | undefined | null; at: string }[], code: string) => {
    const first = new Map<number, string>();
    for (const o of list) if (o.code === code && o.r != null && (!first.has(o.r) || Date.parse(o.at) < Date.parse(first.get(o.r)!))) first.set(o.r, o.at);
    return [...first].map(([r, at]) => ({ r, at })).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  };
  const opens = (input.openings ?? []).map((o) => ({ code: o.code, r: rOf.get(o.editionId), at: o.at }));
  const notes = (input.notices ?? []).map((n) => ({ code: n.code ?? "", r: rOfNotice(n.bg), at: n.at }));
  return input.codes.map((code) => {
    const a = input.access?.[code] ?? null;
    const received: { r: number; at: string }[] = [];
    if (a) {
      const t = Date.parse(a.at);
      const atReach = [...issues].reverse().find((i) => Date.parse(i.at) <= t);
      if (atReach) received.push({ r: atReach.r, at: a.at });
      for (const i of issues) if (Date.parse(i.at) > t) received.push({ r: i.r, at: i.at });
    }
    return { code, access: a, received, told: firstOf(notes, code), opened: firstOf(opens, code) };
  });
}

/** The scheme's software record at an issue (Zadanie §6). The round begins at its opening; the
 *  release in force then, and every one deployed since, up to the issue. */
export function softwareRecord(input: {
  changes: readonly { kind: string; title: string; ref?: string; deployedAt?: string }[];
  roundStart: string | null; at: string;
  configVersions?: readonly { no: number; at: string }[];
  editions?: readonly { docKey: string; no: number; issuedOn: string; issuedAt: string }[];
  gateTexts: string; reportVersion: string; imports?: readonly { version: string }[];
}): SoftwareRecord {
  const end = Date.parse(input.at), start = input.roundStart ? Date.parse(input.roundStart) : -Infinity;
  const deployed = input.changes.filter((c) => c.kind === "release" && !!c.deployedAt && Date.parse(c.deployedAt) <= end)
    .sort((a, b) => Date.parse(a.deployedAt!) - Date.parse(b.deployedAt!));
  // no opening on record: which were «during» cannot be said — the release in force at the issue
  const before = input.roundStart ? deployed.filter((c) => Date.parse(c.deployedAt!) <= start).at(-1) : deployed.at(-1);
  const during = input.roundStart ? deployed.filter((c) => Date.parse(c.deployedAt!) > start) : [];
  const releases = [...(before ? [before] : []), ...during].map((c) => ({ title: c.title, ...(c.ref ? { ref: c.ref } : {}), deployedAt: c.deployedAt! }));
  const cv = (input.configVersions ?? []).filter((v) => Date.parse(v.at) <= end).reduce<number | null>((m, v) => (m === null || v.no > m ? v.no : m), null);
  const latest = new Map<string, { docKey: string; no: number; issuedOn: string }>();
  for (const e of input.editions ?? []) {
    if (e.docKey === "report" || Date.parse(e.issuedAt) > end) continue;
    const had = latest.get(e.docKey);
    if (!had || e.no > had.no) latest.set(e.docKey, { docKey: e.docKey, no: e.no, issuedOn: e.issuedOn });
  }
  const templates = [...latest.values()].sort((a, b) => a.docKey.localeCompare(b.docKey));
  const analysisVersions = [...new Set([input.reportVersion, ...(input.imports ?? []).map((i) => i.version)].filter(Boolean))];
  return { releases, configVersion: cv, templates, gateTexts: input.gateTexts, analysisVersions };
}

/** The edition's reason for an R — identified as such; a correction as amended (§7.4.3). */
export function issueReason(r: number, version: string, kind: "issue" | "correction", reason: string, scope: string): string {
  return kind === "issue"
    ? `Окончателният доклад ${rLabel(r)} — издаден с акта «Издай окончателния доклад» (част 7.4); PTS_Analysis ${version}.`
    : `Поправка ${rLabel(r)} на окончателния доклад (част 7.4; ISO/IEC 17043 §7.4.3) — ${reason}. Поправено: ${scope}. PTS_Analysis ${version}.`;
}

/** What a participation's own pages say of the report: not yet; issued and reaching it (R in force,
 *  the 2.0 version); issued but awaiting its payment (D7). A scheme issued before 7.4 (no R on
 *  record): the uploaded file, as 3.2 served it. */
export function labReport(s: { status: string; uploads?: { report?: unknown }; reportIssues?: readonly ReportIssue[]; reportAccess?: Record<string, ReportAccess> }, code: string): { state: "none" | "issued" | "awaiting"; label: string } {
  if (s.status !== "report" && s.status !== "closed") return { state: "none", label: "" };
  const r = issueInForce(s.reportIssues);
  if (r) return reaches(s.reportAccess, code) ? { state: "issued", label: `${rLabel(r.r)} · PTS_Analysis ${r.analysisVersion}` } : { state: "awaiting", label: "" };
  return s.uploads?.report ? { state: "issued", label: "" } : { state: "none", label: "" };
}
