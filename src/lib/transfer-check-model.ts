// The transfer check and the processing record (plan part 7.3; Manual 7.5.2; D3; 2.5, Реш. 140).
// Pure. What was sent to 2.0 (each export's manifest — the codes and the characteristics it
// carried) and a person's recorded confirmation that 2.0's report lists the same. The check in
// force names the latest export — final, made under the lock in force, with no correction after it —
// and the report in force: the imported file the issue act (7.4) will issue, by its hash.

import { lockInForce, type SubmissionLock } from "./submission-lock-model";

export interface AnalysisExportRecord {
  id: string; at: string; by: string;
  /** before the submission was locked (6.6) — never the one a check confirms */
  preliminary: boolean;
  /** the lock in force when it was made — a reopening and a new lock make it a past round's (review) */
  lockId?: string;
  /** the file handed out */
  sha256: string;
  /** where the file handed out is kept (7.10) — the round export carries it */
  path?: string;
  codes: string[];
  characteristics: string[];
  /** codes whose results came outside the form (typed into the file by hand) and codes with N/R only */
  outside?: string[];
  nrOnly?: string[];
  results: number;
  nr: number;
}
/** A check names the export it compared, the import that carried the report in force and that
 *  report's hash — the report that will be issued (7.4), not merely the latest import (review). */
export interface TransferCheck { id: string; at: string; by: string; exportId: string; importId: string; reportSha?: string; same: boolean; note: string }

/** What the file sent, from its sheets: the codes (Participants), the characteristics or points
 *  (Characteristics), the codes outside the form, the codes with N/R only. */
export function manifestOf(sheets: readonly { name: string; rows: unknown[][] }[], outside: readonly string[]): Pick<AnalysisExportRecord, "codes" | "characteristics" | "outside" | "nrOnly" | "results" | "nr"> {
  const sheet = (n: string) => sheets.find((x) => x.name === n)?.rows ?? [];
  const body = (n: string) => sheet(n).slice(1);
  const col = (n: string, h: string) => (sheet(n)[0] ?? []).indexOf(h);
  const pCode = Math.max(0, col("Participants", "laboratory_code")), cId = Math.max(0, col("Characteristics", "characteristic_id"));
  const rCode = Math.max(0, col("Results", "laboratory_code")), rStatus = col("Results", "status");
  const codes = [...new Set(body("Participants").map((r) => String(r[pCode] ?? "")).filter(Boolean))];
  const res = body("Results");
  const isNR = (r: unknown[]) => rStatus >= 0 && r[rStatus] === "N/R";
  const nrOnly = codes.filter((c) => { const mine = res.filter((r) => String(r[rCode]) === c); return mine.length > 0 && mine.every(isNR); });
  return { codes, characteristics: body("Characteristics").map((r) => String(r[cId] ?? "")).filter(Boolean), outside: [...outside], nrOnly, results: res.length, nr: res.filter(isNR).length };
}

export type CheckState = "ok" | "no-export" | "preliminary" | "relocked" | "no-report" | "corrected" | "none";
/** The report in force, if it is the one an import brought: `uploads.report` stamped with the
 *  import, the import still on record, the file the same (its path) — and «uploaded» the active
 *  source. A report uploaded by hand, or switched to the built one, is not 2.0's (review). */
export function reportInForce(input: {
  report?: { importId?: string; path: string } | null; active?: "built" | "uploaded" | null;
  imports?: readonly { id: string; files: readonly { kind: string; path: string; sha256: string }[] }[];
}): { importId: string; sha: string } | null {
  const r = input.report;
  if (!r?.importId || input.active === "built") return null;
  const im = input.imports?.find((x) => x.id === r.importId);
  const f = im?.files.find((x) => x.kind === "report-bg" && x.path === r.path);
  return im && f ? { importId: im.id, sha: f.sha256 } : null;
}
/** The pair a check must name now, and whether one does: the latest export (final — not
 *  preliminary — made under the lock in force), the report in force (by its import and hash); no
 *  correction after the export (6.5 changes the values in force). */
export function transferState(input: {
  exports?: readonly AnalysisExportRecord[]; checks?: readonly TransferCheck[];
  lockId?: string | null; report?: { importId: string; sha: string } | null;
  lastCorrectionAt?: string | null;
}): { state: CheckState; export?: AnalysisExportRecord; importId?: string; reportSha?: string; check: TransferCheck | null } {
  const ex = input.exports?.at(-1);
  if (!ex) return { state: "no-export", check: null };
  if (ex.preliminary) return { state: "preliminary", export: ex, check: null };
  if (!input.lockId || ex.lockId !== input.lockId) return { state: "relocked", export: ex, check: null };
  if (input.lastCorrectionAt && Date.parse(input.lastCorrectionAt) > Date.parse(ex.at)) return { state: "corrected", export: ex, check: null };
  const r = input.report;
  if (!r) return { state: "no-report", export: ex, check: null };
  const c = [...(input.checks ?? [])].reverse().find((x) => x.exportId === ex.id && x.importId === r.importId && x.reportSha === r.sha) ?? null;
  return { state: c ? "ok" : "none", export: ex, importId: r.importId, reportSha: r.sha, check: c };
}
/** The state on a scheme as it is: its exports, checks, lock, report in force; the corrections. */
export function schemeTransferState(s: {
  analysisExports?: readonly AnalysisExportRecord[]; transferChecks?: readonly TransferCheck[]; submissionLocks?: readonly SubmissionLock[];
  uploads?: Record<string, { importId?: string; path: string } | undefined>; docActive?: Record<string, "built" | "uploaded">;
  analysisImports?: readonly { id: string; files: readonly { kind: string; path: string; sha256: string }[] }[];
}, corrections: readonly { at: string }[]) {
  return transferState({
    exports: s.analysisExports, checks: s.transferChecks, lockId: lockInForce(s.submissionLocks as SubmissionLock[] | undefined)?.id ?? null,
    report: reportInForce({ report: s.uploads?.report, active: s.docActive?.report ?? null, imports: s.analysisImports }),
    lastCorrectionAt: lastCorrectionAt(corrections),
  });
}
/** The latest correction's time (6.5) — a correction after the export changes what 2.0 should have had. */
export const lastCorrectionAt = (corrections: readonly { at: string }[]): string | null =>
  corrections.reduce<string | null>((m, c) => (!m || Date.parse(c.at) > Date.parse(m) ? c.at : m), null);

export const NOTE_MIN = 5;
/** «The same» — yes; «not the same» — what differs, in words (required). */
export function readCheck(input: { same: unknown; note: unknown }): { ok: true; same: boolean; note: string } | { ok: false; problem: "answer" | "note" } {
  const s = input.same === "yes" ? true : input.same === "no" ? false : null;
  if (s === null) return { ok: false, problem: "answer" };
  const note = (typeof input.note === "string" ? input.note : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1000);
  if (!s && [...note].length < NOTE_MIN) return { ok: false, problem: "note" };
  return { ok: true, same: s, note };
}

export type CheckProblem = "answer" | "note" | "state" | "missing" | "stale" | "failed" | "preliminary" | "relocked" | "corrected" | "no-report";
export const CHECK_PROBLEM_TEXT: Record<CheckProblem, { bg: string; en: string }> = {
  "no-report": { bg: "Докладът в сила не е от внасяне от 2.0 (качен е на ръка или е избран вграденият) — внесете доклада на 2.0.", en: "The report in force is not from an import from 2.0 (uploaded by hand, or the built one chosen) — import 2.0's report." },
  preliminary: { bg: "Последното изнасяне е предварително (преди заключването) — изнесете отново след заключването и проверете него.", en: "The last export is preliminary (before the lock) — export again after the lock and check that one." },
  relocked: { bg: "Последното изнасяне не е при заключването в сила (подаването е отворено или заключено отново след него) — изнесете отново.", en: "The last export was not made under the lock in force (the submission was reopened or locked again since) — export again." },
  corrected: { bg: "След изнасянето е записана корекция (6.5) — стойностите в сила са други; изнесете отново.", en: "A correction (6.5) was recorded after the export — the values in force differ; export again." },
  answer: { bg: "Отбележете — същите ли са, или не.", en: "Say whether they are the same or not." },
  note: { bg: "Когато не са същите — запишете какво се различава (поне 5 знака).", en: "When they are not the same — write what differs (5 characters at least)." },
  state: { bg: "Проверката се записва, докато схемата е в обработка.", en: "The check is recorded while the scheme is in processing." },
  missing: { bg: "Първо изнесете към 2.0 и внесете доклада му.", en: "Export to 2.0 and import its report first." },
  stale: { bg: "Междувременно има ново изнасяне или друг доклад в сила — презаредете и проверете отново.", en: "There is a new export or another report in force meanwhile — reload and check again." },
  failed: { bg: "Проверката НЕ е записана — опитайте пак.", en: "The check was NOT recorded — try again." },
};

export interface RecordEvent { at: string; kind: "designation" | "designation-ended" | "stage" | "unstage" | "export" | "import" | "check"; text: { bg: string; en: string }; by?: string }
export interface StageEvent { at: string; by: string; stage: string; done: boolean }
const STAGE: Record<string, [string, string]> = { "14": ["Статистическа обработка", "Statistical processing"], "15": ["Независим преглед", "Independent review"], "16": ["Одобряване", "Approval"] };
export const RECORD_STAGES = ["14", "15", "16"] as const;

/** A stage's tick or its withdrawal, from its journal line (`scheme.stage`) — stages 14–16 only. */
export function stageEventOf(e: { at: string; actorEmail: string; summary: string }): StageEvent | null {
  const m = /^(Stage ticked|Tick withdrawn): (\d+)\./.exec(e.summary);
  if (!m || !(RECORD_STAGES as readonly string[]).includes(m[2])) return null;
  return { at: e.at, by: e.actorEmail, stage: m[2], done: m[1] === "Stage ticked" };
}

/** The processing record, in the order things happened: every designation (and its end), the
 *  ticks of stages 14–16 and their withdrawals (from the journal; the current ticks when it could
 *  not be read), the exports, the imports (with the module's version), the transfer checks. */
export function processingRecord(input: {
  designations?: readonly { processor: string; reviewer: string; approver: string; setBy: string; setAt: string; endedAt?: string; endedBy?: string }[];
  stageEvents?: readonly StageEvent[] | null;
  stages?: Record<string, { at: string; by: string; note?: string } | undefined>;
  exports?: readonly AnalysisExportRecord[]; imports?: readonly { id: string; at: string; by: string; version: string; files: unknown[] }[]; checks?: readonly TransferCheck[];
}): RecordEvent[] {
  const out: RecordEvent[] = [];
  for (const d of input.designations ?? []) {
    out.push({ at: d.setAt, kind: "designation", by: d.setBy, text: { bg: `Определени: обработва ${d.processor}, преглежда ${d.reviewer}, одобрява ${d.approver}`, en: `Designated: ${d.processor} processes, ${d.reviewer} reviews, ${d.approver} approves` } });
    if (d.endedAt) out.push({ at: d.endedAt, kind: "designation-ended", by: d.endedBy, text: { bg: `Определянето от ${d.setAt.slice(0, 10)} е прекратено`, en: `The designation of ${d.setAt.slice(0, 10)} ended` } });
  }
  if (input.stageEvents) {
    for (const t of input.stageEvents) out.push({ at: t.at, kind: t.done ? "stage" : "unstage", by: t.by, text: t.done ? { bg: `Етап ${t.stage} — ${STAGE[t.stage][0]}`, en: `Stage ${t.stage} — ${STAGE[t.stage][1]}` } : { bg: `Отметката на етап ${t.stage} е оттеглена`, en: `Stage ${t.stage}'s tick withdrawn` } });
  } else {
    for (const no of RECORD_STAGES) { const t = input.stages?.[no]; if (t) out.push({ at: t.at, kind: "stage", by: t.by, text: { bg: `Етап ${no} — ${STAGE[no][0]}`, en: `Stage ${no} — ${STAGE[no][1]}` } }); }
  }
  for (const e of input.exports ?? []) out.push({ at: e.at, kind: "export", by: e.by, text: { bg: `Изнесено към 2.0${e.preliminary ? " (предварително)" : ""}: ${e.codes.length} кода, ${e.characteristics.length} характеристики/точки`, en: `Exported to 2.0${e.preliminary ? " (preliminary)" : ""}: ${e.codes.length} codes, ${e.characteristics.length} characteristics/points` } });
  for (const i of input.imports ?? []) out.push({ at: i.at, kind: "import", by: i.by, text: { bg: `Внесено от PTS_Analysis ${i.version}: ${i.files.length} файла`, en: `Imported from PTS_Analysis ${i.version}: ${i.files.length} files` } });
  for (const c of input.checks ?? []) out.push({ at: c.at, kind: "check", by: c.by, text: { bg: `Проверка на преноса: ${c.same ? "същите кодове и характеристики" : `НЕ са същите — ${c.note}`}`, en: `Transfer check: ${c.same ? "the same codes and characteristics" : `NOT the same — ${c.note}`}` } });
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
