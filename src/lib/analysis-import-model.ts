// What comes back from PTS_Analysis 2.0 (plan part 7.2; Реш. 68, 135). Pure. The issued documents —
// the final report in both languages, the charts, the validation report, the round's dossier —
// kept as files, stamped with the module's version, never recomputed and never changed. The
// scores as data wait for D3.

export type ImportKind = "report-bg" | "report-en" | "chart" | "validation" | "dossier";
export const IMPORT_KINDS: readonly ImportKind[] = ["report-bg", "report-en", "chart", "validation", "dossier"];
/** Which types each kind takes: the reports and the dossier PDFs; a chart a PDF or an image. */
export const IMPORT_TYPES: Record<ImportKind, readonly string[]> = {
  "report-bg": ["application/pdf"], "report-en": ["application/pdf"], chart: ["application/pdf", "image/png", "image/jpeg"],
  validation: ["application/pdf"], dossier: ["application/pdf"],
};
export const IMPORT_LABEL: Record<ImportKind, { bg: string; en: string }> = {
  "report-bg": { bg: "Окончателен доклад (БГ)", en: "Final report (BG)" },
  "report-en": { bg: "Окончателен доклад (EN)", en: "Final report (EN)" },
  chart: { bg: "Графика", en: "Chart" },
  validation: { bg: "Доклад от валидирането", en: "Validation report" },
  dossier: { bg: "Досие на кръга", en: "The round's dossier" },
};
/** One import at most this much in all (a server action takes 16 MB). */
export const MAX_IMPORT_BYTES = 15_000_000;

export interface ImportedFile { kind: ImportKind; name: string; mime: string; size: number; sha256: string; path: string }
export interface AnalysisImport { id: string; at: string; by: string; version: string; files: ImportedFile[] }

/** The module's version as 2.0 prints it — «2.0», «2.0.3», «2.1.0-rc1»; anything else refused. */
export function readVersion(v: unknown): string | null {
  const t = (typeof v === "string" ? v : "").trim();
  return /^\d+\.\d+(\.\d+)?([-.][0-9A-Za-z]+)?$/.test(t) && t.length <= 40 ? t : null;
}

/** At most one of each document; the charts up to MAX_CHARTS per import (review). */
export const MAX_CHARTS = 50;
export type ImportProblem = "version" | "report" | "type" | "size" | "empty" | "count";
/** The files offered: the Bulgarian report required — unless this ADDS to an import already made
 *  (more charts, the validation report…: the report in force stays); each kind its types (by the
 *  bytes, checked by the caller); one of each document, up to 50 charts; the whole at most
 *  MAX_IMPORT_BYTES. */
export function checkImport(version: unknown, files: readonly { kind: ImportKind; mime: string; size: number; real: boolean }[], opts: { adding?: boolean } = {}): { ok: true; version: string } | { ok: false; problem: ImportProblem } {
  const v = readVersion(version);
  if (!v) return { ok: false, problem: "version" };
  if (!files.length || (!opts.adding && !files.some((f) => f.kind === "report-bg"))) return { ok: false, problem: "report" };
  if (IMPORT_KINDS.some((k) => k !== "chart" && files.filter((f) => f.kind === k).length > 1) || files.filter((f) => f.kind === "chart").length > MAX_CHARTS) return { ok: false, problem: "count" };
  if (files.some((f) => f.size === 0)) return { ok: false, problem: "empty" };
  if (files.some((f) => !IMPORT_TYPES[f.kind].includes(f.mime) || !f.real)) return { ok: false, problem: "type" };
  if (files.reduce((a, f) => a + f.size, 0) > MAX_IMPORT_BYTES) return { ok: false, problem: "size" };
  return { ok: true, version: v };
}

export const IMPORT_PROBLEM_TEXT: Record<ImportProblem | "state" | "failed" | "approved", { bg: string; en: string }> = {
  version: { bg: "Посочете версията на PTS_Analysis, както я отпечатва (напр. 2.0.3).", en: "Give PTS_Analysis's version as it prints it (e.g. 2.0.3)." },
  report: { bg: "Окончателният доклад на български е задължителен (при допълване на вече направено внасяне — поне един файл).", en: "The final report in Bulgarian is required (when adding to an import already made — at least one file)." },
  count: { bg: "По един файл от всеки документ; графиките — до 50 за едно внасяне.", en: "One file of each document; the charts — up to 50 per import." },
  approved: { bg: "Обработката вече е прегледана или одобрена — нов доклад не се внася; първо се оттегля прегледът или одобрението (Реш. 140).", en: "The processing is already reviewed or approved — no new report comes in; withdraw the review or the approval first (Реш. 140)." },
  type: { bg: "Докладите, валидирането и досието са PDF; графиките — PDF, PNG или JPG (проверява се по съдържанието).", en: "The reports, the validation and the dossier are PDFs; the charts PDF, PNG or JPG (checked by their content)." },
  size: { bg: "Общо до 15 MB за едно внасяне — останалите графики добавете с второ внасяне (без доклада).", en: "15 MB in all per import — add the remaining charts in a second import (without the report)." },
  empty: { bg: "Празен файл.", en: "An empty file." },
  state: { bg: "Внася се, докато схемата е в обработка.", en: "Imported while the scheme is in processing." },
  failed: { bg: "Внасянето НЕ е записано — опитайте пак.", en: "The import was NOT recorded — try again." },
};

/** The import in force — the latest. */
export const importInForce = (imports: readonly AnalysisImport[] | undefined): AnalysisImport | null => (imports ?? []).at(-1) ?? null;

/** A file's name when it is served or issued — its kind and place, never the name it came with
 *  (a file is often named after a laboratory — §4.2; review). */
export const servedName = (kind: ImportKind, n: number, mime: string, version?: string): string =>
  `${kind}${version ? `-${version}` : ""}-${n}.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "pdf"}`;
