// Invoices (plan part 5.8; spec Q2 — Реш. 35, 36, 40, 96, 98, 106). Pure.
//
// The portal issues no invoice and makes no number: the proforma and the original invoice are
// made in the accounting software and UPLOADED to the participation, each with its number
// (Реш. 36). The proforma after the second announcement (Реш. 65); the original invoice only
// after the payment — «Неплатена оригинална фактура не съществува» (Реш. 35). Payment is
// marked by hand and never holds anything back (Реш. 96). Every user of the organisation sees
// both (Реш. 106). The accountant has no sign-in: the billing export goes to accounting
// (Реш. 98), with the inputs until 9.4 adds the prices.

import { finalSelectionsOf } from "./announcement-model";
import { selectionsOf, type Selections } from "./application-model";

export const DOC_NUMBER_MAX = 40;

/** A proforma's or an invoice's number as typed in the accounting software — letters, digits
 *  and the usual separators; 1–40 characters. Null when it is none of that. */
export function readDocNumber(v: unknown): string | null {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t || [...t].length > DOC_NUMBER_MAX) return null;
  // «№ 12» is how a Bulgarian document number is often written — the sign may lead
  return /^[\p{L}\p{N}№][\p{L}\p{N} .\-/_#№]*$/u.test(t) && /[\p{L}\p{N}]/u.test(t) ? t : null;
}

export type InvoiceSlotProblem = "number" | "unpaid";
/** Why this document may not be uploaded now — or null. The invoice: only once paid. */
export function invoiceSlotProblem(slot: "proforma" | "invoice", number: string | null, paid: boolean): InvoiceSlotProblem | null {
  if (!number) return "number";
  if (slot === "invoice" && !paid) return "unpaid";
  return null;
}

export const INVOICE_PROBLEM_TEXT: Record<InvoiceSlotProblem, { bg: string; en: string }> = {
  number: { bg: "Посочете номера на документа от счетоводния софтуер (до 40 знака).", en: "Give the document's number from the accounting software (up to 40 characters)." },
  unpaid: { bg: "Оригиналната фактура се качва след плащането — първо отбележете «Платена» (Реш. 35).", en: "The original invoice is uploaded after the payment — mark «Paid» first (Реш. 35)." },
};

// ── the billing export (Реш. 98) ──
export interface BillingInput {
  /** the order of entry — the participations as entered, 1, 2, 3 … */
  order: number;
  code: string;
  /** the applied characteristics, already as words with their counts */
  characteristics: string;
  objects: number;
  entity?: { name: string; eik: string; vat: string; country: string; correspondenceAddress: string; mol?: string; officialEmail?: string };
  laboratory?: string;
  proforma?: { number?: string; at?: string };
  invoice?: { number?: string; at?: string };
  paidAt?: string;
}

export const BILLING_COLUMNS = [
  "№ по ред", "Код", "Юридическо лице", "ЕИК", "ДДС №", "Държава", "Адрес за кореспонденция", "МОЛ", "Официален имейл",
  "Лаборатория", "Характеристики (участия)", "Обекти", "Проформа №", "Проформа дата", "Платено на", "Фактура №", "Фактура дата", "Цена (от 9.4)",
] as const;

const day = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

/** One row per participation, the columns above — the price empty until 9.4. */
export const billingRow = (p: BillingInput): Record<(typeof BILLING_COLUMNS)[number], string> => ({
  "№ по ред": String(p.order),
  "Код": p.code,
  "Юридическо лице": p.entity?.name ?? "",
  "ЕИК": p.entity?.eik ?? "",
  "ДДС №": p.entity?.vat ?? "",
  "Държава": p.entity?.country ?? "",
  "Адрес за кореспонденция": p.entity?.correspondenceAddress ?? "",
  "МОЛ": p.entity?.mol ?? "",
  "Официален имейл": p.entity?.officialEmail ?? "",
  "Лаборатория": p.laboratory ?? "",
  "Характеристики (участия)": p.characteristics,
  "Обекти": String(p.objects),
  "Проформа №": p.proforma?.number ?? "",
  "Проформа дата": day(p.proforma?.at),
  "Платено на": day(p.paidAt),
  "Фактура №": p.invoice?.number ?? "",
  "Фактура дата": day(p.invoice?.at),
  "Цена (от 9.4)": "",
});

/** The applied characteristics as words: «Плътност ×2; Якост» (5.1 selections). */
export const characteristicsText = (sel: Record<string, number>, labels: readonly string[]): string =>
  Object.entries(sel).filter(([, n]) => n > 0).sort(([a], [b]) => Number(a) - Number(b)).map(([i, n]) => `${labels[Number(i)] ?? `#${Number(i) + 1}`}${n > 1 ? ` ×${n}` : ""}`).join("; ");

/** The participations in the order they were entered — a second participation of a laboratory
 *  is billed at its share (M1 §5), so the order is the billing's. The database lists by code,
 *  which is random; a participation without the moment keeps its place (review). */
export const byEntry = <P extends { createdAt?: string }>(parts: readonly P[]): P[] =>
  parts.map((p, i) => ({ p, i })).sort((a, b) => (a.p.createdAt ?? "").localeCompare(b.p.createdAt ?? "") || a.i - b.i).map(({ p }) => p);

/** The characteristics billed: after the second announcement, those that RUN (the final list,
 *  5.2) — what coding draws the objects by; before it, as applied for (review). */
export const billedSelections = (p: { id: string; characteristics?: number[]; selections?: Record<string, number> }, runs: number[] | null | undefined, n: number): Selections =>
  runs ? finalSelectionsOf(p, { runs }, n) : selectionsOf(p, n);
