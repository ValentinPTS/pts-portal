"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeExpiredRejectionsAction } from "@/lib/actions";

// The rejected registrations (plan part 4.7; Zadanie §10): each kept six years from its
// rejection, with its reason; past that, removed by hand — the database refuses earlier.

export type RejectedView = { id: string; orgName: string; reason: string; rejectedAt: string; keptUntil: string; over: boolean };

// the day in Sofia, as every date the portal shows
const day = (iso: string) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year}`;
};

export default function RejectedRegistrations({ lang, rows }: { lang: "bg" | "en"; rows: RejectedView[] }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const over = rows.filter((r) => r.over).length;
  return (
    <details className="card p-4 mt-4" data-rejected-registrations>
      <summary className="text-sm font-bold" style={{ cursor: "pointer", color: "var(--green-dark)" }}>
        {L("Отхвърлени заявки за акаунт", "Rejected account requests")} ({rows.length}){over ? ` · ${L("изтекли", "past their time")}: ${over}` : ""}
      </summary>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{L("Всяка се пази 6 години от отказа, с причината (Задание §10). След това се премахва — по-рано базата не позволява.", "Each is kept 6 years from the rejection, with its reason (Zadanie §10). Then it is removed — the database refuses earlier.")}</p>
      {rows.length === 0 ? <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{L("Няма.", "None.")}</p> : (
        <table className="w-full text-sm mt-2" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}><th className="p-1">{L("Заявител", "Applicant")}</th><th className="p-1">{L("Причина", "Reason")}</th><th className="p-1">{L("Отказ", "Rejected")}</th><th className="p-1">{L("Пази се до", "Kept until")}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} data-rejected={r.id} data-over={r.over ? "1" : "0"} style={{ borderTop: "1px solid var(--line)" }}>
              <td className="p-1">{r.orgName}</td><td className="p-1">{r.reason || <span style={{ color: "var(--muted)" }}>{L("(без причина — отказ отпреди 4.7)", "(no reason — a rejection from before 4.7)")}</span>}</td>
              <td className="p-1">{day(r.rejectedAt)}</td><td className="p-1" style={{ fontWeight: r.over ? 700 : 400 }}>{day(r.keptUntil)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {over > 0 && (
        <button type="button" className="btn btn-sm mt-2" data-remove-expired disabled={pending}
          onClick={() => { if (!window.confirm(L(`Да се премахнат ли ${over} заявки, пазени повече от 6 години, с документите им? Не може да се върне.`, `Remove ${over} requests kept more than 6 years, with their documents? It cannot be undone.`))) return;
            start(async () => { const r = await removeExpiredRejectionsAction(); setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: L(`Премахнати: ${r.removed}.`, `Removed: ${r.removed}.`) }); router.refresh(); }); }}>
          {L("Премахни изтеклите", "Remove those past their time")}
        </button>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className="text-xs mt-1" style={{ color: msg.ok ? "var(--green-dark)" : "#8f2f2f" }}>{msg.text}</div>}
    </details>
  );
}
