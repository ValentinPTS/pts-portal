// Deadlines per participant (plan part 3.4; Zadanie §9, §11; Реш. 154; О6). Pure.
//
//   • The results deadline is the scheme's working date «Краен срок за резултати» —
//     a day, or a day and its hour in Bulgaria (EET/EEST) — unless the participant has
//     an INDIVIDUAL EXTENSION, granted with its order (the head's; «Удължаване на срок
//     поради закъснение … минава със заповед за изменение, а не с имейл», О6).
//   • In a calibration chain each laboratory's window is counted in WORKING days from
//     its own receipt of the instrument (Q14; the scheme's Instruction says how many),
//     the holiday calendar PTS keeps taken off; an individual extension moves it too.
//   • Overdue is a STATE, never a block (Zadanie §9: «Нищо не се блокира автоматично.
//     Просроченият срок е състояние, не забрана.»). What follows is the scheme
//     manager's decision, by the amendment procedure.

import type { Scheme, ChainStop } from "./types";
import { deadlineMs, isDeadline, isIsoDate } from "./scheme-dates";
import { addWorkingDays, workingDaysBetween } from "./holidays-model";

export type ExtensionKey = "resultsDue" | "chain";
export const EXTENSION_KEYS: readonly ExtensionKey[] = ["resultsDue", "chain"];

export interface Extension {
  id: string;
  /** the participation, by its code — never a name */
  code: string;
  key: ExtensionKey;
  /** a calibration window's: the chain stop it extends — a laboratory may hold the
   *  instrument twice (3.4 review) */
  stopId?: string;
  /** the new deadline: a day, or a day and its hour in Bulgaria */
  until: string;
  orderNo: string;
  orderDate: string;
  reason: string;
  day: string;
  at: string;
  by: string;
}

/** A calibration participant's window, in working days, when the scheme sets none: the
 *  3 days the portal's calibration Instruction prints today (Q14). Each scheme sets its
 *  own — PTS's M1 Instruction says 5 («максимум пет работни дни»); part 3.10 brings
 *  M1's texts into the templates, and the default with them. */
export const DEFAULT_WINDOW_DAYS = 3;
export const windowDays = (s: Pick<Scheme, "chain">): number => {
  const n = Number(s.chain?.windowWorkDays);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : DEFAULT_WINDOW_DAYS;
};

/** The participant's latest extension of this deadline, if any (a window's: of that stop). */
export function extensionOf(s: Pick<Scheme, "extensions">, code: string, key: ExtensionKey, stopId?: string): Extension | undefined {
  return [...(s.extensions ?? [])].reverse().find((e) => e.code === code && e.key === key && (key !== "chain" || e.stopId === stopId));
}

/** The later of two deadlines (either may be absent). */
export function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  const ma = deadlineMs(a), mb = deadlineMs(b);
  if (ma === null) return mb === null ? undefined : b;
  if (mb === null) return a;
  return mb > ma ? b : a;
}

/** The participant's results deadline in force: the LATER of its extension and the
 *  scheme's — an amendment that moves everyone's later is not undone by an earlier
 *  extension (3.4 review). `ext` only when the extension is the one in force. */
export function resultsDeadline(s: Pick<Scheme, "dates" | "extensions">, code: string): { at?: string; ext?: Extension } {
  const ext = extensionOf(s, code, "resultsDue");
  const own = s.dates?.resultsDue;
  if (!ext) return { at: own };
  const at = laterOf(ext.until, own);
  return at === ext.until && at !== own ? { at, ext } : { at };
}

const sofiaDayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** A calibration laboratory's window: from the day it received the instrument, `n`
 *  working days — or its extension. Null before it received it. `stop` is its stop. */
export function chainWindow(
  s: Pick<Scheme, "chain" | "extensions">, stop: Pick<ChainStop, "id" | "code" | "receivedAt" | "sentAt" | "windowDue">, off: ReadonlySet<string>,
): { received: string; due: string; ext?: Extension; days: number } | null {
  if (!stop.receivedAt || !stop.code) return null;
  const received = sofiaDayOf(stop.receivedAt);
  const days = windowDays(s);
  // a stop handed on keeps the window it had then — a later change to the calendar
  // does not rewrite it (3.4 review); one still holding reads the calendar now
  const counted = stop.windowDue ?? addWorkingDays(received, days, off);
  const ext = extensionOf(s, stop.code, "chain", stop.id);
  const due = laterOf(ext?.until, counted) ?? counted;
  return { received, due, ext: ext && due === ext.until && due !== counted ? ext : undefined, days };
}

/** A handed-on stop keeps its window: the stops with `stopId`'s window fixed as the
 *  calendar counts it now (the hand-over, 3.4 review). Pure. */
export function freezeWindow(s: Pick<Scheme, "chain">, stops: ChainStop[], stopId: string, off: ReadonlySet<string>): ChainStop[] {
  return stops.map((x) => (x.id !== stopId || x.kind !== "lab" || !x.receivedAt || x.windowDue) ? x
    : { ...x, windowDue: addWorkingDays(sofiaDayOf(x.receivedAt), windowDays(s), off) });
}

/** When the participant's results first came in — the earliest file it sent (a
 *  replaced one included, kept in supersededFiles), on the round's clock when it was
 *  recorded so (1.3); results PTS recorded from e-mail count, at an unknown hour. */
export function resultsSubmittedAt(s: Pick<Scheme, "labUploads" | "supersededFiles">, code: string, status: string): string | undefined {
  const times = [s.labUploads?.[code]?.results, ...(s.supersededFiles ?? []).filter((f) => f.where === `labupload:${code}:results`).map((f) => f.file)]
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => f.roundAt ?? f.uploadedAt)
    .filter(Boolean)
    .sort();
  if (times.length) return times[0];
  return status === "submitted" || status === "scored" ? new Date(0).toISOString() : undefined;
}

export type DeadlineState = "none" | "open" | "done" | "overdue" | "late";

/** Where a participant stands against a deadline: no deadline; still open; met (done
 *  in time); overdue (not done, passed); late (done, after it). */
export function deadlineState(at: string | undefined, doneAtIso: string | undefined, nowMs: number): DeadlineState {
  const d = deadlineMs(at);
  if (d === null) return doneAtIso ? "done" : "none";
  if (doneAtIso) return Date.parse(doneAtIso) > d ? "late" : "done";
  return nowMs > d ? "overdue" : "open";
}

/** How long overdue, in working days (a chain window) — for the words on the page. */
export const overdueWorkingDays = (due: string, today: string, off: ReadonlySet<string>): number => Math.max(0, workingDaysBetween(due.slice(0, 10), today, off));

// ── granting one ────────────────────────────────────────────────────────────

export type ExtensionProblem = "state" | "key" | "until" | "not-later" | "order-no" | "order-date" | "reason" | "too-long";

export interface ExtensionInput { key: unknown; until: unknown; orderNo: unknown; orderDate: unknown; reason: unknown }
const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏﻿�]/g, "").trim();
const chars = (x: string) => [...x].length;

/** The extension as it may be granted — or why not. It must move the deadline LATER
 *  than the one now in force (`current`); the chain window is a calibration scheme's. */
/** The deadline key as it will be read — cleaned once, the same for every check (3.4 review). */
export const extensionKey = (v: unknown): ExtensionKey | null => { const k = clean(v); return (EXTENSION_KEYS as readonly string[]).includes(k) ? (k as ExtensionKey) : null; };

export function checkExtension(
  s: Pick<Scheme, "status" | "type">, input: ExtensionInput, current: string | undefined,
): { ok: true; value: { key: ExtensionKey; until: string; orderNo: string; orderDate: string; reason: string } } | { ok: false; problem: ExtensionProblem } {
  if (!(s.status === "open" || s.status === "running")) return { ok: false, problem: "state" };
  const key = clean(input.key) as ExtensionKey;
  if (!EXTENSION_KEYS.includes(key) || (key === "chain" && s.type !== "C")) return { ok: false, problem: "key" };
  const until = clean(input.until);
  const orderNo = clean(input.orderNo);
  const orderDate = clean(input.orderDate);
  const reason = clean(input.reason);
  if (chars(orderNo) > 60 || chars(reason) > 1000) return { ok: false, problem: "too-long" };
  if (!isDeadline(until)) return { ok: false, problem: "until" };
  const cur = deadlineMs(current);
  if (cur !== null && (deadlineMs(until) ?? 0) <= cur) return { ok: false, problem: "not-later" };
  if (!orderNo) return { ok: false, problem: "order-no" };
  if (!isIsoDate(orderDate)) return { ok: false, problem: "order-date" };
  if (chars(reason) < 5) return { ok: false, problem: "reason" };
  return { ok: true, value: { key, until, orderNo, orderDate, reason } };
}

export const EXTENSION_PROBLEM_TEXT: Record<ExtensionProblem, { bg: string; en: string }> = {
  state: { bg: "Удължаване се дава на отворена схема или схема в процес.", en: "An extension is granted in a scheme that is open or in progress." },
  key: { bg: "Не е ясно кой срок се удължава (прозорецът на веригата е само при калибриране).", en: "Which deadline is extended is not clear (the chain window is a calibration scheme's)." },
  until: { bg: "Новият срок не е истинска дата (и час).", en: "The new deadline is not a real date (and hour)." },
  "not-later": { bg: "Новият срок трябва да е по-късен от сегашния.", en: "The new deadline must be later than the current one." },
  "order-no": { bg: "Номерът на заповедта е задължителен.", en: "The number of the order is required." },
  "order-date": { bg: "Датата на заповедта е задължителна.", en: "The date of the order is required." },
  reason: { bg: "Основанието е задължително (поне 5 знака).", en: "The reason is required (at least 5 characters)." },
  "too-long": { bg: "Текстът е твърде дълъг.", en: "The text is too long." },
};
