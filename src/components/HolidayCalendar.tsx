"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHolidayAction, addOfficialHolidaysAction } from "@/lib/actions";

// The holiday calendar's controls (plan part 3.4): the year's days with «Премахни»,
// the official holidays proposed for a year, and a day added by hand. Each change is
// an entry on record (migration 0030); the server re-checks every rule.

export default function HolidayCalendar({
  lang, canEdit, mode, days, year,
}: {
  lang: "bg" | "en";
  canEdit: boolean;
  mode: "list" | "propose" | "add";
  days: { day: string; shown: string; name: string; who: string }[];
  year?: number;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: true; added: number } | { error: string }>) =>
    start(async () => { setError(null); const r = await fn(); if ("error" in r) setError(r.error); else router.refresh(); });

  const errorBox = error && <div role="alert" data-holiday-error style={{ marginTop: 8, background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>;

  if (mode === "list") {
    return (
      <>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
          {days.map((d) => (
            <li key={d.day} data-holiday={d.day} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 14 }}>
              <b style={{ fontVariantNumeric: "tabular-nums", minWidth: 92 }}>{d.shown}</b>
              <span style={{ flex: 1, minWidth: 180 }}>{d.name}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.who}</span>
              {canEdit && (
                <button type="button" className="btn btn-sm" disabled={pending} data-holiday-remove={d.day} style={{ fontSize: 12, color: "var(--muted)" }}
                  onClick={() => window.confirm(L(`Да се премахне ли ${d.shown} от календара? Остава в записа.`, `Remove ${d.shown} from the calendar? It stays on record.`)) && run(() => setHolidayAction(d.day, "", false))}>
                  {L("Премахни", "Remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {errorBox}
      </>
    );
  }
  if (mode === "propose") {
    return (
      <>
        <button type="button" className="btn btn-primary btn-sm mt-3" disabled={pending} data-holiday-propose={year}
          onClick={() => run(() => addOfficialHolidaysAction(year ?? 0))}>
          {L(`Добави тези дни в календара`, `Add these days to the calendar`)}
        </button>
        {errorBox}
      </>
    );
  }
  return (
    <form data-holiday-add className="card p-4 mt-4" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => setHolidayAction(String(fd.get("day") ?? ""), String(fd.get("name") ?? ""), true)); }}>
      <div className="font-bold" style={{ color: "var(--green-dark)", width: "100%" }}>{L("Добави почивен ден", "Add a day off")}</div>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Ден", "Day")}</span>
        <input type="date" name="day" required style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13 }} /></label>
      <label style={{ display: "grid", gap: 3, flex: 1, minWidth: 220 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Защо е почивен", "Why it is off")}</span>
        <input name="name" required maxLength={120} placeholder={L("напр. обявен от Министерския съвет", "e.g. declared by the Council of Ministers")} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13 }} /></label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{L("Добави", "Add")}</button>
      {errorBox && <div style={{ width: "100%" }}>{errorBox}</div>}
    </form>
  );
}
