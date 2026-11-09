import { requireStaff } from "@/lib/roles";
import { mayAnywhereNow } from "@/lib/access";
import { getServerT } from "@/lib/i18n-server";
import { listHolidayEntries, calendarOf } from "@/lib/holidays";
import { officialHolidays } from "@/lib/holidays-model";
import { fmtSchemeDate } from "@/lib/scheme-dates";
import { sofiaYearMonth } from "@/lib/scheme-number";
import { listStaff } from "@/lib/staff";
import HolidayCalendar from "@/components/HolidayCalendar";

export const dynamic = "force-dynamic";

// «Почивни дни» (plan part 3.4): the holiday calendar every working-day count reads —
// a calibration laboratory's window from its receipt (M1: «пет работни дни»). PTS
// updates it every year: the year's official holidays proposed (lib/holidays-model),
// checked and kept, and any other day added or removed by hand — each change on
// record. PTS's own people read it; the head keeps it.
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireStaff();
  const { lang } = await getServerT();
  const lg: "bg" | "en" = lang === "bg" ? "bg" : "en";
  const L = (bg: string, en: string) => (lg === "bg" ? bg : en);
  const canEdit = await mayAnywhereNow("order.manage");
  const thisYear = Number(sofiaYearMonth().year);
  const asked = Number((await searchParams).year);
  const year = asked >= 2020 && asked <= 2099 ? asked : thisYear;
  const [entries, staff] = await Promise.all([listHolidayEntries(), listStaff()]);
  const cal = calendarOf(entries);
  const nameOf = (email: string) => staff.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name || email;
  const ofYear = cal.filter((h) => h.day.startsWith(`${year}-`));
  // proposed: the official days the calendar has not decided about — one PTS removed
  // stays removed
  const decided = new Set(entries.map((h) => h.day));
  const proposal = officialHolidays(year).filter((h) => !decided.has(h.day));

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--green-dark)" }}>{L("Почивни дни", "Days off")}</h1>
      <p className="text-sm mt-1" style={{ color: "var(--muted)", maxWidth: 780 }}>
        {L(
          "Календарът, по който се броят работните дни: прозорецът на всяка лаборатория при калибриране се брои в работни дни от получаването на уреда. Работни са дните от понеделник до петък, без дните тук. Обновява се всяка година — официалните празници се предлагат, вие ги проверявате и записвате, а други дни (обявени от правителството) добавяте ръчно.",
          "The calendar working days are counted by: each laboratory's calibration window is counted in working days from its receipt of the instrument. Working days are Monday to Friday, less the days here. It is updated every year — the official holidays are proposed, you check and keep them, and other days (declared by the government) you add by hand.",
        )}
      </p>
      <div className="flex gap-2 mt-4 flex-wrap" data-holiday-years>
        {[year - 1, year, year + 1].map((y) => (
          <a key={y} href={`/holidays?year=${y}`} className={y === year ? "btn btn-primary btn-sm" : "btn btn-sm"}>{y}</a>
        ))}
      </div>

      <div className="card p-4 mt-4" data-holiday-list={year}>
        <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L(`Почивни дни през ${year}`, `Days off in ${year}`)} ({ofYear.length})</div>
        {ofYear.length === 0 ? (
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{L("Няма записани дни за тази година.", "No days recorded for this year.")}</p>
        ) : (
          <HolidayCalendar lang={lg} canEdit={canEdit} mode="list"
            days={ofYear.map((h) => ({ day: h.day, shown: fmtSchemeDate(h.day), name: h.name, who: `${nameOf(h.by)} · ${fmtSchemeDate(h.at.slice(0, 10))}` }))} />
        )}
      </div>

      {canEdit && (
        <>
          {proposal.length > 0 && (
            <div className="card p-4 mt-4" data-holiday-proposal={year}>
              <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L(`Официалните празници за ${year}, които още ги няма`, `The official holidays of ${year} not yet here`)} ({proposal.length})</div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{L("Предложение по Кодекса на труда (чл. 154), с почивния ден вместо празник в събота или неделя. Проверете го — правителството може да мести дни.", "A proposal by the Labour Code (Art. 154), with the day given off in place of a holiday on a Saturday or Sunday. Check it — the government may move days.")}</p>
              <ul className="text-sm mt-2" style={{ paddingLeft: 18 }}>
                {proposal.map((h) => <li key={h.day}>{fmtSchemeDate(h.day)} — {h.name}</li>)}
              </ul>
              <HolidayCalendar lang={lg} canEdit mode="propose" year={year} days={[]} />
            </div>
          )}
          <HolidayCalendar lang={lg} canEdit mode="add" days={[]} />
        </>
      )}
    </div>
  );
}
