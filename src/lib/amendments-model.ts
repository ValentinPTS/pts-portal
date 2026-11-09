// Amendments to a running scheme (plan part 3.3; Zadanie §3 «Изменение на схема в
// процес на провеждане»; Реш. 154; О6). Pure — no I/O.
//
// «Промени в утвърдения план и в публикуваната покана, включително в графика, се
// правят със заповед за изменение на ръководителя на РТ провайдъра. Заповедта посочва
// основанието, изменените точки, новите срокове и оценката на последствията за
// валидността. Изменените план и покана се издават с датата на изменението, с
// отбелязване „Изменение № … от … по Заповед № … от …; заменя редакцията от …“.
// Първоначалните версии не се презаписват. Заявилите участници се уведомяват
// незабавно.»
//
// So, from the moment the scheme is open (the plan approved, the invitation out):
//   • its working dates change only by an amendment (or, for one laboratory, by an
//     individual extension with its order — part 3.4);
//   • the plan and the invitation are issued again only as an amendment's editions,
//     on the 3.0 core — each new edition names the amendment and the edition it
//     replaces; the earlier ones stay, as every edition does;
//   • a carrier's delay never extends a deadline by itself (Реш. 154).
// Each amendment is numbered within the scheme (№ 1, 2 …), dated, and never changed.

import type { Scheme, SchemeStatus } from "./types";
import { DATE_KEYS, isDeadline, isIsoDate, type SchemeDateKey } from "./scheme-dates";

/** The documents an amendment re-issues. */
export const AMENDED_DOCS = ["plan", "invitation"] as const;
export type AmendedDoc = (typeof AMENDED_DOCS)[number];
export const isAmendedDoc = (k: string): k is AmendedDoc => (AMENDED_DOCS as readonly string[]).includes(k);

export interface Amendment {
  id: string;
  /** Изменение № N — within the scheme */
  no: number;
  /** the head's order of amendment: its number and date (yyyy-mm-dd) */
  orderNo: string;
  orderDate: string;
  /** основанието — why */
  reason: string;
  /** изменените точки — which points of the plan and the invitation */
  points: string;
  /** оценката на последствията за валидността */
  validity: string;
  /** the new deadlines, as they were set by it (the working dates it changed) */
  dates?: Partial<Record<SchemeDateKey, string>>;
  /** the earlier deadlines, for the record */
  datesBefore?: Partial<Record<SchemeDateKey, string>>;
  /** the editions it issued — and the edition each replaced */
  editions?: Partial<Record<AmendedDoc, { id: string; no: number; replaces?: { no: number; issuedOn: string } }>>;
  /** the documents it re-issues that are not issued yet — recorded first, issued after,
   *  so its number is its own; one a file failure left, completed from «Изменения» */
  pending?: AmendedDoc[];
  /** Sofia's day of the amendment (on the round's clock), when, who */
  day: string;
  at: string;
  by: string;
}

/** From «open» on — the plan approved, the invitation published — a change goes by an
 *  amendment. A draft is still being written; a scheme closed or not held changes no
 *  deadline. */
/** …and so once it has EVER been opened: a step back to draft does not open a way
 *  around the order (the 3.3 review) — the opening is an act on record (3.2). */
export const needsAmendment = (s: { status: SchemeStatus; lifecycle?: { acts?: { to: SchemeStatus }[] } }): boolean =>
  s.status !== "draft" || (s.lifecycle?.acts ?? []).some((a) => a.to === "open");
export const mayAmend = (status: SchemeStatus): boolean => status === "open" || status === "running" || status === "processing" || status === "report";

export const MIN_TEXT = 5;
export const MAX_TEXT = 2000;
export const MAX_ORDER_NO = 60;
const chars = (s: string) => [...s].length;
const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();

export type AmendmentProblem = "state" | "order-no" | "order-date" | "reason" | "points" | "validity" | "too-long" | "date" | "nothing";

export interface AmendmentInput {
  orderNo: unknown;
  orderDate: unknown;
  reason: unknown;
  points: unknown;
  validity: unknown;
  /** the new working dates — blank keeps the current one */
  dates?: Partial<Record<SchemeDateKey, unknown>>;
  /** which of the plan and the invitation it re-issues */
  docs?: unknown[];
}

export interface CleanAmendment {
  orderNo: string;
  orderDate: string;
  reason: string;
  points: string;
  validity: string;
  dates: Partial<Record<SchemeDateKey, string>>;
  docs: AmendedDoc[];
}

/** The amendment as it may be recorded — or why not. Every field the order carries is
 *  required; an amendment must change something: a deadline, or re-issue the plan or
 *  the invitation. */
export function checkAmendment(s: Pick<Scheme, "status" | "dates">, input: AmendmentInput): { ok: true; value: CleanAmendment } | { ok: false; problem: AmendmentProblem } {
  if (!mayAmend(s.status)) return { ok: false, problem: "state" };
  const orderNo = clean(input.orderNo);
  const orderDate = clean(input.orderDate);
  const reason = clean(input.reason);
  const points = clean(input.points);
  const validity = clean(input.validity);
  if (chars(orderNo) > MAX_ORDER_NO || [reason, points, validity].some((x) => chars(x) > MAX_TEXT)) return { ok: false, problem: "too-long" };
  if (!orderNo) return { ok: false, problem: "order-no" };
  if (!isIsoDate(orderDate)) return { ok: false, problem: "order-date" };
  if (chars(reason) < MIN_TEXT) return { ok: false, problem: "reason" };
  if (chars(points) < MIN_TEXT) return { ok: false, problem: "points" };
  if (chars(validity) < MIN_TEXT) return { ok: false, problem: "validity" };
  const dates: Partial<Record<SchemeDateKey, string>> = {};
  for (const k of DATE_KEYS) {
    const v = clean(input.dates?.[k]);
    if (!v) continue;
    if (!isDeadline(v)) return { ok: false, problem: "date" }; // a day, or a day and its hour (3.4)
    if (v !== s.dates?.[k]) dates[k] = v;
  }
  const docs = [...new Set((Array.isArray(input.docs) ? input.docs : []).map(String).filter(isAmendedDoc))];
  if (!Object.keys(dates).length && !docs.length) return { ok: false, problem: "nothing" };
  return { ok: true, value: { orderNo, orderDate, reason, points, validity, dates, docs } };
}

export const AMENDMENT_PROBLEM_TEXT: Record<AmendmentProblem, { bg: string; en: string }> = {
  state: { bg: "Изменение се прави на отворена схема, в процес, в обработка или с издаден доклад.", en: "An amendment is made to a scheme that is open, in progress, in processing or reported." },
  "order-no": { bg: "Номерът на заповедта за изменение е задължителен.", en: "The number of the order of amendment is required." },
  "order-date": { bg: "Датата на заповедта е задължителна (гггг-мм-дд).", en: "The date of the order is required (yyyy-mm-dd)." },
  reason: { bg: "Основанието е задължително (поне 5 знака).", en: "The reason is required (at least 5 characters)." },
  points: { bg: "Изменените точки са задължителни (поне 5 знака).", en: "The amended points are required (at least 5 characters)." },
  validity: { bg: "Оценката на последствията за валидността е задължителна (поне 5 знака).", en: "The assessment of the consequences for validity is required (at least 5 characters)." },
  "too-long": { bg: "Текстът е твърде дълъг.", en: "The text is too long." },
  date: { bg: "Нов срок не е истинска дата.", en: "A new deadline is not a real date." },
  nothing: { bg: "Изменението не сменя нищо: нов срок или ново издаване на плана или поканата.", en: "The amendment changes nothing: a new deadline, or the plan or the invitation issued again." },
};

/** The next amendment's number in the scheme. */
export const nextAmendmentNo = (list: Amendment[] | undefined): number => Math.max(0, ...(list ?? []).map((a) => a.no)) + 1;

const fmt = (day: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : day);

/** «Изменение № 1 от 05.11.2026 по Заповед № 12 от 04.11.2026; заменя редакцията от
 *  01.10.2026» — how an amended edition names itself (Zadanie §3). */
export function amendmentLine(lang: "bg" | "en", a: Pick<Amendment, "no" | "day" | "orderNo" | "orderDate">, replaces?: { issuedOn: string }): string {
  if (lang === "bg") return `Изменение № ${a.no} от ${fmt(a.day)} по Заповед № ${a.orderNo} от ${fmt(a.orderDate)}${replaces ? `; заменя редакцията от ${fmt(replaces.issuedOn)}` : ""}`;
  return `Amendment No. ${a.no} of ${fmt(a.day)} by Order No. ${a.orderNo} of ${fmt(a.orderDate)}${replaces ? `; replaces the edition of ${fmt(replaces.issuedOn)}` : ""}`;
}

/** The edition's change note for an amended document: the amendment's line is the
 *  reason; the amended points are the scope. */
export function amendmentNote(a: Pick<Amendment, "no" | "day" | "orderNo" | "orderDate" | "reason" | "points">, replaces?: { issuedOn: string }): { reason: string; scope: string } {
  return { reason: `${amendmentLine("bg", a, replaces)}. ${a.reason}`.slice(0, 1000), scope: a.points.slice(0, 1000) };
}
