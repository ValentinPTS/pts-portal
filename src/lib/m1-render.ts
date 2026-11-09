// The calibration documents from M1 (plan part 3.10; PTS's M1 of 31.10.2026; D17;
// Реш. 111, 153; 0.11). Pure.
//
// A calibration scheme made after 3.10 carries `calTemplate: "m1"`: its plan (22
// points), invitation (7) and instruction (11) are built on M1's structure —
//   - the HEADINGS are M1's, the same on every scheme;
//   - the CONSTANT points are M1's text, the fields filled from the scheme (number,
//     title, device, quantity, the minimum participants, the calibration window, the
//     share a second participation pays, the team, the contact);
//   - the SCHEME-SPECIFIC points are what the portal already builds from the scheme's
//     data (the reference laboratory, the method and points, the stability formula,
//     the Eₙ criterion …); where it has nothing, a visible «[за попълване: …]» with
//     M1's guidance. A document with such a mark, or without one of M1's headings, is
//     not issued (m1Problems).
// Where M1 says what a decision changed, the decided wording stands — M1_DECIDED, each
// change for PTS to approve under П 8.3. Older schemes keep their documents as they were.

import { esc, pick } from "./doc-css";
import { sec } from "./doc-shell";
import { shareOf } from "./commercial-model";
import { windowDays } from "./deadlines-model";
import { M1_PLAN, M1_INVITATION, M1_INSTRUCTION, type M1Point } from "./m1-texts";
import type { Scheme, Lang } from "./types";
import { teamMember } from "./docs/instruction-common";

export type M1DocKey = "plan" | "invitation" | "instruction";
export const M1_DOCS: Record<M1DocKey, M1Point[]> = { plan: M1_PLAN, invitation: M1_INVITATION, instruction: M1_INSTRUCTION };
export const isM1Doc = (k: string): k is M1DocKey => k in M1_DOCS && Object.hasOwn(M1_DOCS, k);
export const usesM1 = (s: Pick<Scheme, "type" | "calTemplate">) => s.type === "C" && s.calTemplate === "m1";
/** The scheme texts a blank calibration scheme starts without — M1's scheme-specific
 *  points of the plan (criteria, errors, production, confidentiality, storage,
 *  stability, traceability, different methods) */
export const M1_SPECIFIC_CLAUSES = ["criteria", "errors", "production", "confidentiality", "storage", "homogeneity", "traceability", "differentMethods"];

/** Where M1 says what a decision has since changed: the decided wording, for PTS to
 *  approve (П 8.3). Matched by a part of M1's sentence. */
export const M1_DECIDED: { doc: M1DocKey; no: number; match: string; bg: string; en: string; why: string }[] = [
  {
    doc: "invitation", no: 5, match: "Само участниците, които са платили",
    // the 0.11 wording, word for word — one decided text, never two versions of it
    bg: "Плащането не е условие за изпращане: обектът се изпраща по графика. Окончателният доклад и сертификатът за участие се предоставят след постъпване на плащането по съответната заявка.",
    en: "Payment is not a condition for dispatch: the item is sent according to the schedule. The final report and the certificate of participation are provided once payment for the application has been received.",
    why: "Реш. 1, 96 (0.11): payment is not a condition for dispatch",
  },
  {
    doc: "plan", no: 13, match: "След изтичане на крайния срок за докладване на резултатите не се приемат",
    bg: "След изтичане на крайния срок за докладване на резултатите корекции или допълнителни резултати се приемат само чрез РТ провайдъра и това се записва — например при техническа грешка при въвеждането или прехвърлянето на данните, за която РТ провайдърът е уведомен своевременно.",
    en: "After the reporting deadline, corrections or additional results are accepted only through the PT provider, and this is recorded — for example in the case of a technical error in entering or transferring the data of which the PT provider was notified in good time.",
    why: "Реш. 111 / D17: after the deadline a result is accepted only through the provider, on record",
  },
  {
    doc: "instruction", no: 10, match: "Ако участникът не представи резултати в определения срок",
    // M1's consequence of not submitting at all stays; a late result goes through the provider
    bg: "Ако участникът не представи резултати, неговите резултати няма да бъдат включени в статистическата обработка и лабораторията няма да бъде включена в Окончателния доклад. Резултати, представени след определения срок, се приемат само чрез РТ провайдъра и това се записва.",
    en: "If the participant does not submit results, its results will not be included in the statistical processing and the laboratory will not be included in the Final Report. Results submitted after the set deadline are accepted only through the PT provider, and this is recorded.",
    why: "Реш. 111 / D17: after the deadline a result is accepted only through the provider, on record",
  },
];

import { FILL_BG, FILL_EN, fillMark } from "./fill-mark";
export { fillMark };

/** The fields M1's constant text names, filled from the scheme (HTML, escaped). What
 *  the scheme does not hold is a mark to fill: the kind of instrument, and the
 *  expected maximum of participants — never the HIDDEN maximum of 3.7. */
export function m1Fields(s: Scheme, lang: Lang, extra: Record<string, string> = {}): Record<string, string> {
  const L = (en: string, bg: string) => esc(pick(lang, en, bg));
  const c = s.calibration;
  const clause = (k: string) => s.clauses?.[k];
  const lower = (x: string) => x ? x.charAt(0).toLocaleLowerCase("bg") + x.slice(1) : x;
  const share = shareOf(s.commercial);
  return {
    number: esc(s.number),
    title: L(s.titleEn, s.titleBg),
    device: c && (c.deviceEn || c.deviceBg) ? L(c.deviceEn, c.deviceBg) : fillMark(lang, { bg: "обектът на схемата", en: "the PT item" }),
    quantity: c && (c.quantityEn || c.quantityBg) ? esc(lower(pick(lang, c.quantityEn, c.quantityBg))) : fillMark(lang, { bg: "измерваната величина", en: "the measured quantity" }),
    deviceKind: clause("m1.deviceKind") ? L(clause("m1.deviceKind")!.en, clause("m1.deviceKind")!.bg) : fillMark(lang, { bg: "вид средства за измерване", en: "the kind of instruments" }),
    minParticipants: String(s.minParticipants),
    maxParticipants: clause("m1.expectedMax") ? L(clause("m1.expectedMax")!.en, clause("m1.expectedMax")!.bg) : fillMark(lang, { bg: "очакван най-голям брой", en: "the expected largest number" }),
    windowDays: String(windowDays(s)),
    sharePct: String(share).replace(".", lang === "bg" ? "," : "."),
    ...extra,
  };
}

const para = (html: string) => (/^\s*<(div|table|ul|ol|p)\b/.test(html) ? html : `<p>${html}</p>`);
/** One M1 entry as HTML: escaped, «**bold**», the fields put in. An entry that is
 *  only a field (the team, the contact) is that field's block as it is. */
function entry(text: string, fields: Record<string, string>): string {
  const only = /^\{\{(\w+)\}\}$/.exec(text.trim());
  if (only) return fields[only[1]] ?? "";
  const html = esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{\{(\w+)\}\}/g, (_, k: string) => fields[k] ?? `{{${k}}}`);
  return para(html);
}

/** M1's text of a point in this language, with the decided wording where a decision
 *  changed M1 (M1_DECIDED). */
export function m1Text(doc: M1DocKey, p: M1Point, lang: Lang): string[] {
  const bg = p.bg ?? [], en = p.en ?? [];
  const src = lang === "bg" ? bg : en;
  return src.map((t, i) => {
    const d = M1_DECIDED.find((x) => x.doc === doc && x.no === p.no && (bg[i] ?? "").includes(x.match));
    return d ? (lang === "bg" ? d.bg : d.en) : t;
  });
}

export interface M1Context {
  /** the portal's own body for a point — a scheme-specific point's content */
  legacy: Record<number, string>;
  /** a point the portal already prints in M1's own words, in the printed form (the
   *  plan's point 1 with its tick boxes) — used as it is */
  own?: Record<number, string>;
  /** HTML before / after M1's text of a constant point (the fee, the dates, Реш. 154) */
  before?: Record<number, string>;
  after?: Record<number, string>;
  fields: Record<string, string>;
}

/** The document's points, M1's structure: every heading M1's, in order. */
export function m1Sections(doc: M1DocKey, s: Scheme, lang: Lang, ctx: M1Context): string {
  return M1_DOCS[doc].map((p) => {
    let body: string;
    if (ctx.own?.[p.no]) body = ctx.own[p.no];
    else if (p.kind === "specific") {
      const own = (ctx.legacy[p.no] ?? "").replace(/<p>\s*<\/p>/g, "").trim();
      body = own || `<p>${fillMark(lang, { bg: p.guideBg ?? p.titleBg, en: p.guideEn ?? p.titleEn })}</p>`;
    } else {
      body = m1Text(doc, p, lang).map((t) => entry(t, ctx.fields)).join("\n");
    }
    return sec(p.no, p.titleEn, p.titleBg, lang, `${ctx.before?.[p.no] ?? ""}${body}${ctx.after?.[p.no] ?? ""}`);
  }).join("\n");
}

/** What keeps a calibration document built on M1 from being issued (3.10, review):
 *   - a «[за попълване]» mark left — its words, or its yellow field (typed over but
 *     not removed), in either language;
 *   - one of M1's headings not there as «N. Заглавие» — the headings read as text,
 *     each in its own <h2>, never as a part of another;
 *   - with the scheme given: a number the document states that is no longer the
 *     scheme's (a body saved in the editor before the window, the share or the minimum
 *     changed). */
const norm = (x: string) => x.replace(/&nbsp;|\u00A0/g, " ").replace(/\s+/g, " ").trim();
const textOf = (h: string) => norm(h.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&"));
export function m1Problems(html: string, doc: M1DocKey, lang: Lang, s?: Scheme): string[] {
  const out: string[] = [];
  const plain = textOf(html);
  const marks = Math.max((html.match(/class="m1-fill"/g) ?? []).length, plain.split(FILL_BG).length - 1 + plain.split(FILL_EN).length - 1);
  if (marks) out.push(lang === "bg" ? `${marks} място(а) «за попълване» (махнете и жълтото поле)` : `${marks} place(s) «to be filled in» (remove the yellow field too)`);
  const headings = new Set([...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => textOf(m[1])));
  const missing = M1_DOCS[doc].filter((p) => !headings.has(norm(`${p.no}. ${pick(lang, p.titleEn, p.titleBg)}`))).map((p) => p.no);
  if (missing.length) out.push(lang === "bg" ? `липсват заглавия на т. ${missing.join(", ")}` : `headings missing: points ${missing.join(", ")}`);
  if (s) {
    const num = (re: RegExp) => { const m = re.exec(plain); return m ? Number(m[1].replace(",", ".")) : null; };
    const stale = (said: number | null, now: number, what: { bg: string; en: string }) => {
      if (said !== null && said !== now) out.push(lang === "bg" ? `в документа ${what.bg} е ${said}, а в схемата — ${now}` : `the document says ${what.en} ${said}, the scheme ${now}`);
    };
    if (doc === "instruction") stale(num(lang === "bg" ? /максимум (\d+) работни дни/ : /maximum of (\d+) working days/), windowDays(s), { bg: "срокът при участник (работни дни)", en: "the days at a participant" });
    if (doc === "invitation") stale(num(lang === "bg" ? /(\d+(?:,\d+)?) % от обявената цена/ : /(\d+(?:\.\d+)?) % of the announced price/), shareOf(s.commercial), { bg: "делът за второ участие (%)", en: "the share of a second participation (%)" });
    if (doc === "plan") stale(num(lang === "bg" ? /Очакваният брой участници е от (\d+)/ : /expected number of participants is from (\d+)/), s.minParticipants, { bg: "минималният брой участници", en: "the minimum participants" });
  }
  return out;
}

/** The contact of the documents — from the scheme's team (3.11, N19): its manager,
 *  with the provider's telephone and e-mail. */
export const PROVIDER_PHONE = "00359 897 50 39 80";
export const PROVIDER_EMAIL = "office@ptsbg.eu";
export function m1Contact(s: Scheme, lang: Lang): string {
  const m = teamMember(s, "manager");
  const who = m ? `<b>${esc(m.name)}</b> — ${esc(pick(lang, m.roleEn, m.roleBg))}` : fillMark(lang, { bg: "ръководителят на схемата (екипът на схемата)", en: "the scheme manager (the scheme team)" });
  return `<p>${who}<br>${esc(PROVIDER_PHONE)} · ${esc(PROVIDER_EMAIL)}</p>`;
}

/** The team table of the plan's point 2 — the scheme's team. */
export function m1Team(s: Scheme, lang: Lang): string {
  return `<div class="team">${(s.team ?? []).map((m) => `<div class="role"><span class="rl">${esc(pick(lang, m.roleEn, m.roleBg))}</span><span class="nm">${esc(m.name)}</span></div>`).join("")}</div>`;
}

/** A value the scheme should hold — or a mark to fill, so an empty cell never passes
 *  the gate unseen (3.10 review). */
export function orFill(value: string | undefined, lang: Lang, what: { bg: string; en: string }): string {
  return value && value.trim() ? esc(value) : fillMark(lang, what);
}

/** The scheme's own texts for an M1 document, edited in «Редактирай данните» (3.10
 *  review): the two fields of the plan's point 5, its scheme-specific points kept in
 *  the scheme's clauses, and the instruction's points 3–9. */
export interface M1Block { key: string; where: { bg: string; en: string }; titleBg: string; titleEn: string; guideBg: string; guideEn: string; short?: boolean }
const PLAN_CLAUSE: [number, string][] = [[4, "criteria"], [7, "errors"], [8, "production"], [9, "confidentiality"], [11, "storage"], [12, "homogeneity"], [15, "traceability"], [16, "differentMethods"]];
export const M1_BLOCKS: M1Block[] = [
  { key: "m1.deviceKind", where: { bg: "План, т. 5", en: "Plan, point 5" }, titleBg: "Вид средства за измерване", titleEn: "Kind of instruments", guideBg: "напр. «хигрометри или други средства за измерване на относителна влажност на въздуха»", guideEn: "e.g. «hygrometers or other instruments measuring the relative humidity of air»", short: true },
  { key: "m1.expectedMax", where: { bg: "План, т. 5", en: "Plan, point 5" }, titleBg: "Очакван най-голям брой участници (печата се — не е скритият максимум)", titleEn: "Expected largest number of participants (printed — not the hidden maximum)", guideBg: "напр. «10»", guideEn: "e.g. «10»", short: true },
  ...PLAN_CLAUSE.map(([no, key]) => { const p = M1_PLAN.find((x) => x.no === no)!; return { key, where: { bg: `План, т. ${no}`, en: `Plan, point ${no}` }, titleBg: p.titleBg, titleEn: p.titleEn, guideBg: p.guideBg ?? "", guideEn: p.guideEn ?? "" }; }),
  ...M1_INSTRUCTION.filter((p) => p.kind === "specific").map((p) => ({ key: `m1.instruction.${p.no}`, where: { bg: `Инструкция, т. ${p.no}`, en: `Instruction, point ${p.no}` }, titleBg: p.titleBg, titleEn: p.titleEn, guideBg: p.guideBg ?? "", guideEn: p.guideEn ?? "" })),
];
export const M1_BLOCK_KEYS = new Set(M1_BLOCKS.map((b) => b.key));
export const MAX_M1_BLOCK = 4000;
