// Certificates, from the approved report (plan part 7.7; D2's three conditions of 02.11.2026; D7;
// Реш. 135, rule 12). Pure. Four steps per participation, each on record: the number (0.15 — the one
// the ptsbg.eu register holds); the content, typed by a person from the issued report (the R in force —
// 2.0 returns documents only, D3); its check by a SECOND person; the release by a person — the issue
// date and the language(s) — once the report reached the participation (D7). N/R at the lock: no
// certificate. The scope is what was reported, read from the version in force at the typing.

import type { ReportIssue } from "./report-issue-model";

export type CertLang = "bg" | "en";
export interface ScopeItem { key: string; bg: string; en: string }
export type ContentText = { conclusion: string; results: string; period: string; methods: string };
export interface CertContent {
  /** as typed from the approved report, per language — a certificate is released only in a language typed (review) */
  text: Partial<Record<CertLang, ContentText>>;
  /** what was reported — offered from the version in force (or what it ran for) and CONFIRMED by the typist (review) */
  scope: ScopeItem[]; scopeFrom: "version" | "selections";
  /** the R it was typed from, and that report's hash — a correction makes it stale */
  fromR: number; reportSha: string;
  by: string; at: string;
  /** who typed it, as a key that tells two people apart (identities.actorKeyNow) — the check is a SECOND person's */
  byKey?: string;
}
export interface CertRecord {
  no: string; date: string; registeredBy?: string; registeredAt?: string; simulation?: boolean;
  /** 7.7 review: a number recorded under 0.15 on a report issued before 7.4 — then the number was the issue */
  content?: CertContent;
  checked?: { by: string; at: string };
  released?: { by: string; at: string; langs: CertLang[] };
}

export const CONTENT_FIELDS = ["conclusion", "results", "period", "methods"] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];
export const CONTENT_MAX = 600;
const clean = (v: unknown) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

/** The content as typed from the approved report: the conclusion, the results (z, ζ or Eₙ as the
 *  report gives them), the period, the methods — in Bulgarian, each required; in English, all four or
 *  none (`bg_…`, `en_…`). */
export function readCertContent(input: Record<string, unknown>): { ok: true; text: Partial<Record<CertLang, ContentText>> } | { ok: false; problem: ContentField | "too-long" | "en-partial" } {
  const text: Partial<Record<CertLang, ContentText>> = {};
  for (const lang of ["bg", "en"] as const) {
    const vals = CONTENT_FIELDS.map((f) => clean(input[`${lang}_${f}`]));
    if (lang === "en" && vals.every((v) => !v)) continue;
    if (lang === "en" && vals.some((v) => !v)) return { ok: false, problem: "en-partial" };
    const out = {} as ContentText;
    for (let i = 0; i < CONTENT_FIELDS.length; i++) {
      const v = vals[i];
      if ([...v].length < 2) return { ok: false, problem: CONTENT_FIELDS[i] };
      if ([...v].length > CONTENT_MAX) return { ok: false, problem: "too-long" };
      out[CONTENT_FIELDS[i]] = v;
    }
    text[lang] = out;
  }
  return { ok: true, text };
}
/** The same words as stored — a «retype» that changes nothing is not a new typing (review). */
export const sameText = (a: Partial<Record<CertLang, ContentText>> | undefined, b: Partial<Record<CertLang, ContentText>>): boolean =>
  !!a && (["bg", "en"] as const).every((l) => JSON.stringify(a[l] ?? null) === JSON.stringify(b[l] ?? null));
/** The scope the typist confirmed: a subset of what is offered, one at least (review). */
export function readScope(picked: readonly unknown[], offered: readonly ScopeItem[]): { ok: true; items: ScopeItem[] } | { ok: false; problem: "scope" } {
  const keys = new Set(picked.filter((x): x is string => typeof x === "string"));
  const items = offered.filter((x) => keys.has(x.key));
  return items.length ? { ok: true, items } : { ok: false, problem: "scope" };
}

type Payload = { kind?: unknown; draft?: { rows?: Record<string, { nr?: unknown } | undefined>; points?: Record<string, { na?: unknown } | undefined> }; values?: Record<string, { nr?: unknown; na?: unknown } | undefined> };
/** What a version reported: its keys whose value is not N/R (testing) nor N/A (calibration). */
export function reportedKeys(data: unknown): string[] {
  const d = (data && typeof data === "object" ? data : {}) as Payload;
  return Object.keys(d.values ?? {}).filter((k) => {
    const v = d.values?.[k];
    if (d.kind === "C") { const p = d.draft?.points?.[k]; return !!p && p.na !== true && v?.na !== true; }
    const r = d.draft?.rows?.[k];
    return !!r && r.nr !== true && v?.nr !== true;
  });
}

/** The scope, labelled in both languages, in the scheme's order: from the version in force when there
 *  is one; else (results by a sheet) the characteristics it ran for — the final selections. */
export function scopeOf(
  s: { type?: string; parameters?: readonly { id?: string; characteristicBg: string; characteristicEn: string; unit?: string }[]; calibration?: { unit?: string } | null },
  points: readonly { key: string; nominal: string; direction?: { bg: string; en: string } }[],
  version: { data: unknown } | null,
  selectedIdx: readonly number[],
): { items: ScopeItem[]; from: "version" | "selections" } {
  const params = s.parameters ?? [];
  const unit = s.calibration?.unit ?? "";
  const label = (key: string): ScopeItem => {
    if (s.type === "C") {
      const p = points.find((x) => x.key === key);
      if (p) { const base = `${p.nominal} ${unit}`.trim(); return { key, bg: p.direction ? `${base} · ${p.direction.bg}` : base, en: p.direction ? `${base} · ${p.direction.en}` : base }; }
      return { key, bg: key, en: key };
    }
    const i = params.findIndex((p, idx) => (p.id ?? `#${idx}`) === key);
    const p = params[i];
    return p ? { key, bg: p.characteristicBg + (p.unit ? `, ${p.unit}` : ""), en: (p.characteristicEn || p.characteristicBg) + (p.unit ? `, ${p.unit}` : "") } : { key, bg: key, en: key };
  };
  const order = (key: string) => (s.type === "C" ? points.findIndex((x) => x.key === key) : params.findIndex((p, idx) => (p.id ?? `#${idx}`) === key));
  if (version) {
    const keys = reportedKeys(version.data).map((k, i) => ({ k, r: order(k) < 0 ? Number.MAX_SAFE_INTEGER : order(k), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.k);
    return { items: keys.map(label), from: "version" };
  }
  const keys = s.type === "C" ? points.map((p) => p.key) : selectedIdx.filter((i) => params[i]).map((i) => params[i].id ?? `#${i}`);
  return { items: keys.map(label), from: "selections" };
}

export type CertState = "released" | "legacy" | "nr" | "no-report" | "no-number" | "no-content" | "stale" | "unchecked" | "awaiting-payment" | "ready";
/** A report issued before 7.4 (no R on record): its certificates were issued under 0.15 — the number
 *  was the issue; they stay so (review). */
export const legacyIssued = (s: { status: string; reportIssues?: readonly unknown[] }): boolean => (s.status === "report" || s.status === "closed") && !s.reportIssues?.length;
/** Where a participation's certificate stands — the step that comes next. */
export function certState(input: { cert?: CertRecord | null; issue: ReportIssue | null; nr: boolean; reached: boolean; legacy?: boolean }): CertState {
  const c = input.cert;
  if (c?.released) return "released";
  if (input.legacy && c && (c.registeredAt || c.simulation)) return "legacy";
  if (input.nr) return "nr";
  if (!input.issue) return "no-report";
  if (!c || !(c.registeredAt || c.simulation)) return "no-number";
  if (!c.content) return "no-content";
  if (c.content.fromR !== input.issue.r || c.content.reportSha !== input.issue.reportSha) return "stale";
  if (!c.checked) return "unchecked";
  if (!input.reached) return "awaiting-payment";
  return "ready";
}
/** A released certificate whose report was corrected since — said on PTS's page (7.7: not changed here). */
export const releasedBeforeCorrection = (c: CertRecord | null | undefined, issue: ReportIssue | null): boolean =>
  !!c?.released && !!c.content && !!issue && c.content.fromR !== issue.r;

/** The release: the issue date (dd.mm.yyyy, set by PTS) and the language(s) — one at least, each one
 *  the content was typed in (review). */
export function readRelease(input: { date: unknown; langs: unknown[] }, today: string, typedLangs: readonly CertLang[] = ["bg", "en"]): { ok: true; date: string; langs: CertLang[] } | { ok: false; problem: "date" | "langs" | "langs-typed" } {
  const typed = clean(input.date);
  const date = typed || today;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  if (!m) return { ok: false, problem: "date" };
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return { ok: false, problem: "date" };
  const langs = [...new Set(input.langs.filter((l): l is CertLang => l === "bg" || l === "en"))];
  if (!langs.length) return { ok: false, problem: "langs" };
  if (langs.some((l) => !typedLangs.includes(l))) return { ok: false, problem: "langs-typed" };
  return { ok: true, date, langs };
}

export const CERT_STATE_TEXT: Record<CertState, { bg: string; en: string }> = {
  released: { bg: "Издаден", en: "Released" },
  legacy: { bg: "Издаден по 0.15 (докладът е издаден преди 7.4 — номерът беше издаването)", en: "Issued under 0.15 (the report was issued before 7.4 — the number was the issue)" },
  nr: { bg: "N/R — без сертификат", en: "N/R — no certificate" },
  "no-report": { bg: "Докладът още не е издаден", en: "The report is not issued yet" },
  "no-number": { bg: "Чака номера от регистъра", en: "Awaits its number from the register" },
  "no-content": { bg: "Чака съдържанието от доклада", en: "Awaits its content from the report" },
  stale: { bg: "Съдържанието е от предишно R — въведете го отново от доклада в сила", en: "The content is from an earlier R — type it again from the report in force" },
  unchecked: { bg: "Чака проверка от втори човек", en: "Awaits a second person's check" },
  "awaiting-payment": { bg: "Готов, но докладът още не е стигнал до участието (D7)", en: "Ready, but the report has not reached the participation yet (D7)" },
  ready: { bg: "Готов за издаване", en: "Ready to release" },
};

export type CertProblem = ContentField | "too-long" | "en-partial" | "scope" | "same-text" | "date" | "langs" | "langs-typed" | "state" | "code" | "same-person" | "failed" | "stale" | "released" | "reach";
export const CERT_PROBLEM_TEXT: Record<CertProblem, { bg: string; en: string }> = {
  conclusion: { bg: "Въведете заключението от доклада.", en: "Type the conclusion from the report." },
  results: { bg: "Въведете резултатите (z, ζ или Eₙ) от доклада.", en: "Type the results (z, ζ or Eₙ) from the report." },
  period: { bg: "Въведете периода.", en: "Type the period." },
  methods: { bg: "Въведете методите.", en: "Type the methods." },
  "too-long": { bg: `Най-много ${CONTENT_MAX} знака в поле.`, en: `${CONTENT_MAX} characters at most per field.` },
  "en-partial": { bg: "На английски — или четирите полета, или нито едно.", en: "In English — all four fields, or none." },
  scope: { bg: "Отбележете поне една характеристика (точка), за която има резултат в доклада.", en: "Tick at least one characteristic (point) the report has a result for." },
  "same-text": { bg: "Нищо не е променено — съдържанието остава с този, който го е въвел.", en: "Nothing changed — the content stays with the one who typed it." },
  "langs-typed": { bg: "Сертификатът се издава само на език, на който е въведено съдържанието.", en: "The certificate is released only in a language the content was typed in." },
  date: { bg: "Датата на издаване — дд.мм.гггг.", en: "The issue date — dd.mm.yyyy." },
  langs: { bg: "Изберете поне един език на сертификата.", en: "Choose at least one language for the certificate." },
  state: { bg: "Сертификатът не е на тази стъпка (вижте състоянието му).", en: "The certificate is not at this step (see its state)." },
  code: { bg: "Няма такова участие в окончателния списък.", en: "No such participation on the final list." },
  "same-person": { bg: "Проверява втори човек — не този, който е въвел съдържанието.", en: "A second person checks — not the one who typed the content." },
  failed: { bg: "НЕ е записано — опитайте пак.", en: "NOT recorded — try again." },
  stale: { bg: "Междувременно нещо се промени — презаредете.", en: "Something changed meanwhile — reload." },
  released: { bg: "Сертификатът е издаден — не се променя.", en: "The certificate is released — it is not changed." },
  reach: { bg: "Не може да се установи на кого да се съобщи — нищо не е записано.", en: "Who to tell could not be established — nothing recorded." },
};
