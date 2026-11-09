// The design data and the external providers of a scheme (plan part 3.13; D3; the
// 2.0 contract's sheets `Scheme_meta` and `External_providers`, schema_version 2.1).
// Pure.
//
// Scheme_meta, key by key (the template's «Указания»):
//   - schema_version — 2.1;
//   - scheme_code — the scheme's number (it decides which round the file goes to);
//   - object_title / object_title_en — the object, in Bulgarian and in English (the
//     scheme's own fields);
//   - design_approved — the day Ф 7.2.2-1 was approved: stage 4 of the lifecycle (3.2),
//     on record — it proves the criteria came before the results;
//   - report_date — the day of the final report: the report act (3.2);
//   - period — «Период на провеждане, както се изписва в доклада» — typed by PTS.
// External_providers — name, address, services: who supplies what for this scheme (the
// reference laboratory, a sampling partner, transport …). The same list is the plan's
// point 3 when it holds anyone. Companies, never participants — no identity here.

import { esc, pick } from "./doc-css";
import { designApproved } from "./lifecycle-model";
import type { Lang, Scheme } from "./types";

export const SCHEMA_VERSION = "2.1";
export interface ExternalProvider { id: string; name: string; address: string; servicesBg: string; servicesEn: string }
export const MAX_PROVIDERS = 20;
export const MAX_PERIOD = 120;
const LIMIT = { name: 200, address: 300, services: 500 };

/** The day of the final report — the report act, the latest one (3.2). */
export function reportDate(s: Pick<Scheme, "lifecycle">): string | null {
  const acts = (s.lifecycle?.acts ?? []).filter((a) => a.act === "report");
  return acts.length ? acts[acts.length - 1].day : null;
}

/** Scheme_meta as the 2.0 contract reads it — key and value. */
export function schemeMeta(s: Scheme): Record<string, string> {
  return {
    schema_version: SCHEMA_VERSION,
    scheme_code: s.number,
    object_title: s.objectBg ?? "",
    object_title_en: s.objectEn ?? "",
    design_approved: designApproved(s) ?? "",
    report_date: reportDate(s) ?? "",
    period: s.period ?? "",
  };
}

/** The providers the plan's point 3 names when no list is kept — the sampling partner
 *  of a testing scheme, the reference laboratory of a calibration one (3.13 review). */
export function legacyProviders(s: Pick<Scheme, "type" | "partner" | "calibration">): Omit<ExternalProvider, "id">[] {
  if (s.type === "C") {
    const c = s.calibration;
    if (!c || !(c.referenceLabBg || c.referenceLabEn)) return [];
    return [{ name: c.referenceLabBg || c.referenceLabEn, address: c.referenceLabLocBg || c.referenceLabLocEn || "", servicesBg: "Калибриране на обекта преди и след измерванията на участниците (референтни стойности)", servicesEn: "Calibration of the PT item before and after the participants' measurements (reference values)" }];
  }
  const p = s.partner;
  if (!p || !(p.nameBg || p.nameEn)) return [];
  return [{ name: p.nameBg || p.nameEn, address: p.locationBg || p.locationEn || "", servicesBg: (p.servicesBg ?? []).join(", "), servicesEn: (p.servicesEn ?? []).join(", ") }];
}

/** External_providers as the 2.0 contract reads it (services in Bulgarian, as the
 *  report — the English where only that is given): the list, or — with no list — the
 *  providers the plan's point 3 names, so the sheet and the plan never differ (review). */
export function providerRows(s: Pick<Scheme, "externalProviders" | "type" | "partner" | "calibration">): { name: string; address: string; services: string; servicesEn: string }[] {
  const list = s.externalProviders?.length ? s.externalProviders : legacyProviders(s);
  return list.map((p) => ({ name: p.name, address: p.address, services: p.servicesBg || p.servicesEn, servicesEn: p.servicesEn }));
}

/** The design approved (stage 4) only after the results were in — its date then proves
 *  nothing (3.13 review). */
export const designAfterResults = (s: Pick<Scheme, "lifecycle">) => !!s.lifecycle?.stages?.["4"]?.afterResults;

/** What 2.0 needs and the scheme does not hold yet, or holds in a way that proves
 *  nothing — said in the editor, and before the export (7.1). */
export function metaGaps(s: Scheme): string[] {
  const m = schemeMeta(s);
  const gaps: string[] = (["object_title", "object_title_en", "design_approved", "period"] as const).filter((k) => !m[k]);
  if (m.design_approved && designAfterResults(s)) gaps.push("design_approved_after_results");
  return gaps;
}
export const META_GAP_TEXT: Record<string, { bg: string; en: string }> = {
  object_title: { bg: "обектът (БГ)", en: "the object (BG)" },
  object_title_en: { bg: "обектът на английски", en: "the object in English" },
  design_approved: { bg: "утвърждаването на статистическия проект (етап 4)", en: "the approval of the statistical design (stage 4)" },
  period: { bg: "периодът на провеждане", en: "the period" },
  design_approved_after_results: { bg: "етап 4 е отбелязан след резултатите — датата не доказва, че критериите са преди тях", en: "stage 4 was ticked after the results — its date does not prove the criteria came first" },
};

const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g, " ").replace(/\s+/g, " ").trim();
export type ProviderProblem = "no-name" | "too-long" | "too-many" | "period";

/** The providers as posted: a blank row dropped; a row without a name refused (named);
 *  a known id kept, a new row a new id. */
export function readProviders(rows: { id: string; name: string; address: string; servicesBg: string; servicesEn: string }[], known: readonly ExternalProvider[] | undefined, newId: () => string, posted = rows.length):
  { ok: true; providers: ExternalProvider[] } | { ok: false; problem: ProviderProblem; row?: number } {
  if (posted > MAX_PROVIDERS) return { ok: false, problem: "too-many" };
  const knownIds = new Set((known ?? []).map((p) => p.id));
  const used = new Set<string>();
  const out: ExternalProvider[] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = { name: clean(rows[k].name), address: clean(rows[k].address), servicesBg: clean(rows[k].servicesBg), servicesEn: clean(rows[k].servicesEn) };
    if (!r.name && !r.address && !r.servicesBg && !r.servicesEn) continue;
    if (!r.name) return { ok: false, problem: "no-name", row: k + 1 };
    if ([...r.name].length > LIMIT.name || [...r.address].length > LIMIT.address || [...r.servicesBg].length > LIMIT.services || [...r.servicesEn].length > LIMIT.services) return { ok: false, problem: "too-long", row: k + 1 };
    const id0 = clean(rows[k].id);
    const id = id0 && knownIds.has(id0) && !used.has(id0) ? id0 : newId();
    used.add(id);
    out.push({ id, ...r });
  }
  return { ok: true, providers: out };
}

export function readPeriod(raw: string | null, keep: string | undefined): { ok: true; period: string | undefined } | { ok: false } {
  if (raw === null) return { ok: true, period: keep };
  const v = clean(raw);
  if ([...v].length > MAX_PERIOD) return { ok: false };
  return { ok: true, period: v || undefined };
}

export const PROVIDER_PROBLEM_TEXT: Record<ProviderProblem, { bg: string; en: string }> = {
  "no-name": { bg: "външният доставчик има наименование", en: "an external provider has a name" },
  "too-long": { bg: "наименованието е до 200 знака, адресът до 300, услугите до 500", en: "a name is 200 characters at most, an address 300, the services 500" },
  "too-many": { bg: `до ${MAX_PROVIDERS} външни доставчици`, en: `${MAX_PROVIDERS} external providers at most` },
  period: { bg: `периодът е до ${MAX_PERIOD} знака`, en: `the period is ${MAX_PERIOD} characters at most` },
};

/** The plan's point 3 from the list — who supplies what. */
export function providersHtml(s: Pick<Scheme, "externalProviders">, lang: Lang): string {
  const list = s.externalProviders ?? [];
  if (!list.length) return "";
  return `<div data-external-providers>${list.map((p) => `<div class="partner"><div><b>${esc(p.name)}</b>${p.address ? `<div class="muted">${esc(p.address)}</div>` : ""}${p.servicesBg || p.servicesEn ? `<p>${esc(pick(lang, p.servicesEn || p.servicesBg, p.servicesBg || p.servicesEn))}</p>` : ""}</div></div>`).join("")}</div>`;
}

/** What changed, for the journal — every field, before and after: a provider removed or
 *  rewritten keeps its words on record (nothing deleted; 3.13 review). */
export function metaDiff(before: Pick<Scheme, "period" | "externalProviders">, after: Pick<Scheme, "period" | "externalProviders">): string[] {
  const out: string[] = [];
  if ((before.period ?? "") !== (after.period ?? "")) out.push(`period: «${before.period ?? "—"}» → «${after.period ?? "—"}»`);
  const words = (p: ExternalProvider) => `«${p.name}» / «${p.address || "—"}» / «${p.servicesBg || "—"}» / «${p.servicesEn || "—"}»`;
  const was = new Map((before.externalProviders ?? []).map((p) => [p.id, p]));
  const now = new Map((after.externalProviders ?? []).map((p) => [p.id, p]));
  for (const p of after.externalProviders ?? []) {
    const w = was.get(p.id);
    if (!w) out.push(`external provider added: ${words(p)}`);
    else if (JSON.stringify(w) !== JSON.stringify(p)) out.push(`external provider changed: ${words(w)} → ${words(p)}`);
  }
  for (const p of before.externalProviders ?? []) if (!now.has(p.id)) out.push(`external provider removed: ${words(p)}`);
  return out;
}
