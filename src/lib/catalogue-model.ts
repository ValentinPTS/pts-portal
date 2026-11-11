// The catalogue (plan part 10.1; D15, Реш. 121, 147; К1, К19, К25). Pure.
//
// Public: every STARTED scheme — taking applications, under way, finished — each with its state in
// words. Never a draft (Реш. 147: the caller lists started schemes only; a draft has no state here
// either), never a count, free places or the maximum (К1, Реш. 8; 3.7): «Запълнена» is a label (К19,
// Реш. 120) — applications stay open for the waiting list.
//
// Inside the portal an approved organisation also sees the announced PRICE — through `announcedPrice`,
// which carries no maximum, so a laboratory's page never reads the commercial fields itself (3.7).
//
// «Уведоми ме при следваща» (К25): a signed-in user's organisation asks to be told when the NEXT
// scheme of a subject starts — the same activity and the same object. One wish per organisation and
// subject; told once (the next one only), by a notice HELD for a person to release (1.8).

import type { Scheme } from "./types";
import { applyOpenProblem } from "./lab-apply-model";
import { fmtEur, shareOf } from "./commercial-model";

export type CatalogueState = "accepting" | "full" | "deadline" | "closed" | "running" | "processing" | "report" | "finished" | "not_held";
export type CatalogueGroup = "taking" | "current" | "finished";

type StateLike = Pick<Scheme, "status" | "dates" | "lifecycle" | "applicationsClosed">;

/** A started scheme's state in words — null for a draft (never listed). `full`: the scheme has
 *  reached its maximum (waitlist-model's schemeFull — the caller asks, the maximum stays out of here). */
export function catalogueState(s: StateLike, nowMs: number, full: boolean): CatalogueState | null {
  switch (s.status) {
    case "open": {
      const p = applyOpenProblem(s, nowMs);
      if (p === "deadline") return "deadline";
      if (p) return "closed"; // closed by hand (9.3) or the final list announced
      return full ? "full" : "accepting";
    }
    case "running": return "running";
    case "processing": return "processing";
    case "report": return "report";
    case "closed": return "finished";
    case "not_held": return "not_held";
    default: return null;
  }
}

export const groupOf = (st: CatalogueState): CatalogueGroup =>
  st === "accepting" || st === "full" ? "taking" : st === "deadline" || st === "closed" || st === "running" || st === "processing" ? "current" : "finished";
export const takesApplications = (st: CatalogueState) => st === "accepting" || st === "full";
/** «Уведоми ме при следваща» — wherever the scheme does not simply take an application now. */
export const wishOffered = (st: CatalogueState) => st !== "accepting";

export const STATE_TEXT: Record<CatalogueState, { bg: string; en: string }> = {
  accepting: { bg: "Приема заявки", en: "Taking applications" },
  full: { bg: "Запълнена — заявка влиза в списъка на изчакващите", en: "Full — an application goes on the waiting list" },
  deadline: { bg: "Срокът за заявки изтече", en: "The deadline for applications has passed" },
  closed: { bg: "Заявяването е затворено", en: "Applications are closed" },
  running: { bg: "В ход", en: "Under way" },
  processing: { bg: "Обработка на резултатите", en: "Results being processed" },
  report: { bg: "Издаден доклад", en: "Report issued" },
  finished: { bg: "Приключила", en: "Finished" },
  not_held: { bg: "Не се провежда", en: "Not held" },
};
export const GROUP_TEXT: Record<CatalogueGroup, { bg: string; en: string }> = {
  taking: { bg: "Приемат заявки", en: "Taking applications" },
  current: { bg: "Текущи", en: "Under way" },
  finished: { bg: "Приключили", en: "Finished" },
};
export const GROUPS: readonly CatalogueGroup[] = ["taking", "current", "finished"];

export const activityText = (s: Pick<Scheme, "type" | "activity">, lang: "bg" | "en") => {
  const a = s.activity ?? s.type;
  return a === "C" ? (lang === "bg" ? "калибриране" : "calibration") : a === "S" ? (lang === "bg" ? "вземане на проби" : "sampling") : (lang === "bg" ? "изпитване" : "testing");
};

/** The catalogue's rows: started schemes with their states, grouped — taking applications by their
 *  deadline (the nearest first), the rest the newest first. */
export function catalogueRows<S extends StateLike & Pick<Scheme, "id" | "number">>(schemes: readonly S[], nowMs: (s: S) => number, full: (s: S) => boolean):
  Record<CatalogueGroup, { scheme: S; state: CatalogueState }[]> {
  const out: Record<CatalogueGroup, { scheme: S; state: CatalogueState }[]> = { taking: [], current: [], finished: [] };
  for (const s of schemes) {
    const st = catalogueState(s, nowMs(s), s.status === "open" && full(s));
    if (st) out[groupOf(st)].push({ scheme: s, state: st });
  }
  const newest = (a: { scheme: S }, b: { scheme: S }) => b.scheme.number.localeCompare(a.scheme.number, "en", { numeric: true });
  out.taking.sort((a, b) => (a.scheme.dates?.applicationsDue ?? "9999").localeCompare(b.scheme.dates?.applicationsDue ?? "9999") || a.scheme.number.localeCompare(b.scheme.number, "en", { numeric: true }));
  out.current.sort(newest);
  out.finished.sort(newest);
  return out;
}

// ── The announced price — for an approved organisation in the portal ──
export interface AnnouncedPrice { base: number; step?: number; sharePct: number; addOn?: number }
/** The scheme's announced price — never its maximum (3.7). Null until PTS has set a base price. */
export function announcedPrice(s: Pick<Scheme, "commercial">): AnnouncedPrice | null {
  const c = s.commercial;
  if (c?.base === undefined) return null;
  return { base: c.base, ...(c.step !== undefined ? { step: c.step } : {}), sharePct: shareOf(c), ...(c.addOnMtCyIe !== undefined ? { addOn: c.addOnMtCyIe } : {}) };
}
const pct = (n: number, lang: "bg" | "en") => (lang === "bg" ? String(n).replace(".", ",") : String(n));
/** The price in words, line by line (9.4's rules: a calibration participation is one item; with no step,
 *  further characteristics add nothing; the share by the same organisation in the scheme — the participation
 *  with the most characteristics pays in full; delivery free in the EU and the Balkans but Malta, Cyprus and
 *  Ireland — always named, its add-on «to be announced» until set; elsewhere by a carrier's offer). */
export function priceLines(p: AnnouncedPrice, calibration: boolean, lang: "bg" | "en"): string[] {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const e = (c: number) => fmtEur(c, lang);
  return [
    calibration
      ? L(`Участие: ${e(p.base)}`, `A participation: ${e(p.base)}`)
      : p.step !== undefined
        ? L(`Една характеристика: ${e(p.base)}; всяка следваща: ${e(p.step)}`, `One characteristic: ${e(p.base)}; each further one: ${e(p.step)}`)
        : L(`Участие: ${e(p.base)}, колкото и характеристики да включва`, `A participation: ${e(p.base)}, however many characteristics it takes`),
    L(`Второ и следващо участие на същата организация в схемата: ${pct(p.sharePct, lang)} % от пълната цена (пълна цена плаща участието с най-много характеристики)`,
      `A second and later participation of the same organisation in the scheme: ${pct(p.sharePct, lang)} % of the full price (the one with the most characteristics pays in full)`),
    L(`Доставка: в ЕС и на Балканите — без такса, освен Малта, Кипър и Ирландия: ${p.addOn !== undefined ? `+ ${e(p.addOn)}` : "добавка — обявява се"}; другаде — по оферта на превозвач, която избирате; със собствен куриер — без доставка`,
      `Delivery: in the EU and the Balkans — free, but Malta, Cyprus and Ireland: ${p.addOn !== undefined ? `+ ${e(p.addOn)}` : "an add-on, to be announced"}; elsewhere — by a carrier's offer you choose; with your own courier — no delivery`),
  ];
}

// ── «Уведоми ме при следваща» ──
export interface CatalogueWish {
  id: string;
  entityId: string;
  /** the scheme the wish was made on */
  schemeId: string;
  /** activity + the object, folded (subjectOf) */
  subject: string;
  /** what the organisation saw — for the notice's words and PTS's list */
  objectBg: string;
  objectEn: string;
  by: string;
  at: string;
  cancelledAt?: string;
  cancelledBy?: string;
  /** told: the scheme that started, the notice, when */
  notified?: { schemeId: string; noticeId?: string; at: string };
}
export const SUBJECT_MAX = 300;
const fold = (v: string | undefined) => String(v ?? "").normalize("NFC").toLowerCase().replace(/[«»"„“”'‘’`]/g, "").replace(/[\s ]+/g, " ").trim().replace(/[.,;:]+$/g, "").trim();
/** The subject of a scheme: its activity and its object (the Bulgarian, folded) — null when it has no object. */
export function subjectOf(s: Pick<Scheme, "type" | "activity" | "objectBg">): string | null {
  const o = fold(s.objectBg);
  if (!o) return null;
  return `${s.activity ?? s.type}|${o}`.slice(0, SUBJECT_MAX);
}
export const activeWish = (w: CatalogueWish) => !w.cancelledAt && !w.notified;
/** The organisation's standing wish for this subject, if any. */
export const wishOf = (wishes: readonly CatalogueWish[], entityId: string, subject: string | null) =>
  subject ? wishes.find((w) => w.entityId === entityId && w.subject === subject && activeWish(w)) : undefined;

export type WishProblem = "not-started" | "accepting" | "no-subject" | "already" | "not-yours";
/** May the organisation ask to be told of the next scheme of this one's subject? */
export function wishProblem(st: CatalogueState | null, subject: string | null, wishes: readonly CatalogueWish[], entityId: string): WishProblem | null {
  if (!st) return "not-started";
  if (!wishOffered(st)) return "accepting";
  if (!subject) return "no-subject";
  if (wishOf(wishes, entityId, subject)) return "already";
  return null;
}
export const WISH_PROBLEM_TEXT: Record<WishProblem | "failed" | "no-entity" | "not-standing", { bg: string; en: string }> = {
  "not-standing": { bg: "това желание вече не стои — отменено или използвано", en: "this wish no longer stands — cancelled or used" },
  "not-started": { bg: "схемата не е намерена", en: "the scheme is not found" },
  accepting: { bg: "схемата приема заявки сега — заявете участие", en: "the scheme takes applications now — apply" },
  "no-subject": { bg: "схемата няма обект, по който да разпознаем следващата", en: "the scheme has no object by which to know the next one" },
  already: { bg: "вече сте поискали — ще ви уведомим", en: "you have asked already — you will be told" },
  "not-yours": { bg: "това желание не е на вашата организация", en: "this wish is not your organisation's" },
  failed: { bg: "не се записа — опитайте отново", en: "it was not recorded — try again" },
  "no-entity": { bg: "влезте в портала с потребител на организацията", en: "sign in to the portal as a user of the organisation" },
};

/** At a scheme's start (draft → open): the wishes to tell — standing, of its subject, made on ANOTHER
 *  scheme — by organisation (one notice each; every one of its wishes used). */
export function wishesToTell(wishes: readonly CatalogueWish[], s: Pick<Scheme, "id" | "type" | "activity" | "objectBg">): Map<string, CatalogueWish[]> {
  const subject = subjectOf(s);
  const out = new Map<string, CatalogueWish[]>();
  if (!subject) return out;
  for (const w of [...wishes].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!activeWish(w) || w.subject !== subject || w.schemeId === s.id) continue;
    out.set(w.entityId, [...(out.get(w.entityId) ?? []), w]);
  }
  return out;
}
