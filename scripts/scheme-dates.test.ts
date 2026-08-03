// The scheme's four working dates. Pure arithmetic — the day-before reminder
// (Phase 2) will be built straight on top of dueIn, so the edges are pinned here.
import {
  DATE_KEYS, DATE_LABELS, isIsoDate, fmtSchemeDate, daysUntil, setDates, dueIn,
} from "../src/lib/scheme-dates.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

// ── shape ────────────────────────────────────────────────────────────────────
ok("four dates, in workflow order",
  JSON.stringify(DATE_KEYS) === JSON.stringify(["applicationsDue", "dispatch", "resultsDue", "reportDue"]));
ok("every date is labelled in both languages",
  DATE_KEYS.every((k) => DATE_LABELS[k].bg.trim() && DATE_LABELS[k].en.trim()));

// ── validation ───────────────────────────────────────────────────────────────
ok("a real date passes", isIsoDate("2026-08-03"));
ok("a leap day passes in a leap year", isIsoDate("2024-02-29"));
ok("a leap day fails in a common year", !isIsoDate("2026-02-29"));
ok("31 February is refused, not rolled over", !isIsoDate("2026-02-31"));
ok("month 13 is refused", !isIsoDate("2026-13-01"));
ok("day 00 is refused", !isIsoDate("2026-08-00"));
for (const junk of ["", "03.08.2026", "2026-8-3", "2026/08/03", "tomorrow", "2026-08-03T10:00:00Z"]) {
  ok(`"${junk}" is refused`, !isIsoDate(junk));
}

// ── display ──────────────────────────────────────────────────────────────────
ok("ISO renders as dd.mm.yyyy", fmtSchemeDate("2026-08-03") === "03.08.2026");
ok("an unset date renders empty", fmtSchemeDate(undefined) === "");
ok("anything unparseable passes through", fmtSchemeDate("later") === "later");

// ── arithmetic ───────────────────────────────────────────────────────────────
ok("today is 0 days away", daysUntil("2026-08-03", "2026-08-03") === 0);
ok("tomorrow is 1", daysUntil("2026-08-04", "2026-08-03") === 1);
ok("yesterday is -1", daysUntil("2026-08-02", "2026-08-03") === -1);
ok("across a month boundary", daysUntil("2026-09-01", "2026-08-31") === 1);
ok("across a year boundary", daysUntil("2027-01-01", "2026-12-31") === 1);
// Bulgaria's clocks go back on the last Sunday of October; comparing in UTC whole
// days must not let "tomorrow" arrive early or late around it.
ok("across the DST change", daysUntil("2026-10-26", "2026-10-25") === 1);
ok("a long gap counts whole days", daysUntil("2026-09-02", "2026-08-03") === 30);
ok("an unset date has no distance", daysUntil(undefined, "2026-08-03") === null);
ok("an invalid date has no distance", daysUntil("2026-02-31", "2026-08-03") === null);

// ── the lab's list ───────────────────────────────────────────────────────────
ok("no dates set → nothing listed", setDates({ dates: undefined }).length === 0 && setDates({ dates: {} }).length === 0);
{
  // set out of order; the list must still follow the workflow order
  const rows = setDates({ dates: { reportDue: "2026-10-01", applicationsDue: "2026-07-01" } });
  ok("only the dates actually set are listed", rows.length === 2);
  ok("listed in workflow order, not insertion order",
    JSON.stringify(rows.map((r) => r.key)) === JSON.stringify(["applicationsDue", "reportDue"]));
}

// ── what the reminder will read ──────────────────────────────────────────────
{
  const s = { dates: { applicationsDue: "2026-08-04", resultsDue: "2026-08-04", dispatch: "2026-08-05", reportDue: "2026-08-03" } };
  const due = dueIn(s, "2026-08-03");
  ok("exactly the dates one day out", JSON.stringify(due) === JSON.stringify(["applicationsDue", "resultsDue"]));
  ok("today's date is NOT a day-before reminder", !due.includes("reportDue"));
  ok("two days out is not either", !due.includes("dispatch"));
  ok("the window is exact, not 'within'", JSON.stringify(dueIn(s, "2026-08-03", 2)) === JSON.stringify(["dispatch"]));
  ok("nothing due → empty", dueIn(s, "2026-01-01").length === 0);
  ok("everything past → empty", dueIn(s, "2027-01-01").length === 0);
}
ok("a scheme with no dates never reminds", dueIn({ dates: undefined }, "2026-08-03").length === 0);

console.log(`scheme-dates.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
