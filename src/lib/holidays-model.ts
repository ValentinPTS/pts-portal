// Working days and the holiday calendar (plan part 3.4; Zadanie §9, §11). Pure.
//
// A calibration participant has a set number of WORKING days from the day it received
// the instrument to measure and to hand it on (M1: «максимум пет работни дни от
// получаването на обекта»). Working days are Monday to Friday, less the days the
// calendar PTS keeps says are off — Bulgaria's official holidays, the day off given in
// place of one that fell on a weekend, and any other day the government declares.
// PTS updates the calendar every year (lib/holidays.ts); the portal only proposes the
// official list for a year (`officialHolidays`), for PTS to check and keep.

export interface Holiday { day: string; name: string }

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (day: string) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))));
const plusDays = (day: string, n: number) => { const d = fromIso(day); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const weekday = (day: string) => fromIso(day).getUTCDay(); // 0 Sunday … 6 Saturday

/** Monday to Friday, and not a day the calendar has off. */
export function isWorkingDay(day: string, off: ReadonlySet<string>): boolean {
  const w = weekday(day);
  return w !== 0 && w !== 6 && !off.has(day);
}

/** The last of `n` working days counted from the day after `start` (the receipt day
 *  itself does not count): the day the window ends, at its end. */
export function addWorkingDays(start: string, n: number, off: ReadonlySet<string>): string {
  let day = start;
  let left = Math.max(0, Math.floor(n));
  // a calendar of a handful of days off a year: a year of days is more than enough
  for (let guard = 0; left > 0 && guard < 400; guard++) {
    day = plusDays(day, 1);
    if (isWorkingDay(day, off)) left--;
  }
  return day;
}

/** Working days from `from` (exclusive) to `to` (inclusive); negative when `to` is earlier. */
export function workingDaysBetween(from: string, to: string, off: ReadonlySet<string>): number {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  let n = 0;
  for (let day = from, guard = 0; day !== to && guard < 2000; guard++) {
    day = plusDays(day, sign);
    if (isWorkingDay(day, off)) n += sign;
  }
  return n;
}

/** Orthodox Easter Sunday (Meeus' Julian algorithm, + 13 days for 1900–2099). */
export function orthodoxEaster(year: number): string {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return plusDays(`${year}-${pad(month)}-${pad(day)}`, 13);
}

/** Bulgaria's official holidays for a year, as the Labour Code names them (чл. 154),
 *  with the working day given off in place of one that falls on a weekend (ал. 2 —
 *  not for the Easter days). A proposal for PTS to check: the government may move days
 *  as well, and those PTS adds by hand. */
export function officialHolidays(year: number): Holiday[] {
  const y = String(year);
  const fixed: Holiday[] = [
    { day: `${y}-01-01`, name: "Нова година" },
    { day: `${y}-03-03`, name: "Ден на Освобождението на България" },
    { day: `${y}-05-01`, name: "Ден на труда" },
    { day: `${y}-05-06`, name: "Гергьовден, Ден на храбростта" },
    { day: `${y}-05-24`, name: "Ден на светите Кирил и Методий, на българската азбука, просвета и култура" },
    { day: `${y}-09-06`, name: "Ден на Съединението" },
    { day: `${y}-09-22`, name: "Ден на Независимостта на България" },
    { day: `${y}-12-24`, name: "Бъдни вечер" },
    { day: `${y}-12-25`, name: "Рождество Христово" },
    { day: `${y}-12-26`, name: "Рождество Христово" },
  ];
  const easter = orthodoxEaster(year);
  const easterDays: Holiday[] = [
    { day: plusDays(easter, -2), name: "Разпети петък" },
    { day: plusDays(easter, -1), name: "Велика събота" },
    { day: easter, name: "Великден" },
    { day: plusDays(easter, 1), name: "Великден (понеделник)" },
  ];
  const taken = new Set([...fixed, ...easterDays].map((h) => h.day));
  const inPlace: Holiday[] = [];
  for (const h of fixed) {
    const w = weekday(h.day);
    if (w !== 0 && w !== 6) continue;
    // the first working day after it that is not itself a holiday or given already
    let day = h.day;
    do day = plusDays(day, 1); while (weekday(day) === 0 || weekday(day) === 6 || taken.has(day));
    taken.add(day);
    inPlace.push({ day, name: `Почивен ден вместо ${h.name} (${h.day.slice(8, 10)}.${h.day.slice(5, 7)})` });
  }
  // one entry a day: two holidays on one day (1 May 2027 is also Holy Saturday) read as one
  const byDay = new Map<string, string[]>();
  for (const h of [...fixed, ...easterDays, ...inPlace]) byDay.set(h.day, [...(byDay.get(h.day) ?? []), h.name]);
  return [...byDay.entries()].map(([day, names]) => ({ day, name: names.join("; ") })).sort((p, q) => p.day.localeCompare(q.day));
}

/** A day the calendar may hold: a real yyyy-mm-dd and a name. */
export function holidayProblem(day: string, name: string): "day" | "name" | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!m) return "day";
  const d = fromIso(day);
  if (iso(d) !== day) return "day";
  const n = String(name ?? "").trim();
  if (!n || [...n].length > 120) return "name";
  return null;
}
