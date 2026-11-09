import { randomUUID } from "crypto";
import { getDb, noMemoryFallback } from "./supabase";
import type { Holiday } from "./holidays-model";

// The holiday calendar PTS keeps (plan part 3.4; migration 0030; lib/holidays-model
// for the rules). A record: a day is added or removed by a new entry — who and when —
// and the calendar is each day's latest entry. Read by every working-day count (the
// calibration window), so a failed read is an error on a deployment, never a silent
// empty calendar (1.1).

export interface HolidayEntry { id: string; day: string; name: string; action: "add" | "remove"; recordedBy: string; recordedAt: string }

const memStore = globalThis as unknown as { __ptsHolidaysMem?: HolidayEntry[] };
const mem: HolidayEntry[] = memStore.__ptsHolidaysMem ?? (memStore.__ptsHolidaysMem = []);
type Row = { id: string; day: string; name: string; action: "add" | "remove"; recorded_by: string; recorded_at: string };
const fromRow = (r: Row): HolidayEntry => ({ id: r.id, day: String(r.day).slice(0, 10), name: r.name, action: r.action, recordedBy: r.recorded_by, recordedAt: r.recorded_at });
const oldestFirst = (a: HolidayEntry, b: HolidayEntry) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id);

/** Every entry, oldest first. */
export async function listHolidayEntries(): Promise<HolidayEntry[]> {
  const db = getDb();
  if (!db) return [...mem].sort(oldestFirst);
  try {
    const { data, error } = await db.from("holiday_entries").select("*").order("recorded_at", { ascending: true }).limit(5000);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow).sort(oldestFirst);
  } catch (e) {
    noMemoryFallback("holidays", e);
    return [...mem].sort(oldestFirst);
  }
}

/** The calendar now: each day whose latest entry adds it, in order. */
export function calendarOf(entries: readonly HolidayEntry[]): (Holiday & { by: string; at: string })[] {
  const last = new Map<string, HolidayEntry>();
  for (const e of [...entries].sort(oldestFirst)) last.set(e.day, e);
  return [...last.values()].filter((e) => e.action === "add").map((e) => ({ day: e.day, name: e.name, by: e.recordedBy, at: e.recordedAt })).sort((a, b) => a.day.localeCompare(b.day));
}

export async function holidayCalendar(): Promise<(Holiday & { by: string; at: string })[]> {
  return calendarOf(await listHolidayEntries());
}

/** The days off, for counting working days. */
export async function holidaySet(): Promise<Set<string>> {
  return new Set((await holidayCalendar()).map((h) => h.day));
}

/** Add or remove a day — a new entry. Throws on a database error (the caller says so). */
export async function recordHoliday(p: { day: string; name: string; action: "add" | "remove"; by: string }): Promise<HolidayEntry> {
  const e: HolidayEntry = { id: randomUUID(), day: p.day, name: p.name.trim(), action: p.action, recordedBy: p.by, recordedAt: new Date().toISOString() };
  const db = getDb();
  if (!db) { mem.push(e); return e; }
  const { error } = await db.from("holiday_entries").insert({ id: e.id, day: e.day, name: e.name, action: e.action, recorded_by: e.recordedBy });
  if (error) throw error;
  return e;
}
