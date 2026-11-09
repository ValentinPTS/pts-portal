"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eraseEntityAction } from "@/lib/actions";

// «Изтрий по искане» (plan part 4.7; Zadanie §10): a profile with no participation is
// kept until its deletion is requested; then the head of the PT provider erases it by
// hand — the request named by its incoming number and date, confirmed, irreversible.
// onSubmit — a refusal keeps the typing.
export default function EraseEntityForm({ lang, entityId }: { lang: "bg" | "en"; entityId: string }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit", minWidth: 280 } as const;
  return (
    <details className="mt-3" data-erase-entity={entityId}>
      <summary className="text-xs" style={{ cursor: "pointer", color: "#8f2f2f" }}>{L("Изтриване по искане", "Erasure on request")}</summary>
      <form className="mt-2" style={{ display: "grid", gap: 6, maxWidth: 560 }}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (!window.confirm(L("Юридическото лице, лабораториите и потребителите му ще бъдат изтрити безвъзвратно. Продължаване?", "The legal entity, its laboratories and its users will be erased for good. Go on?"))) return;
          start(async () => {
            setError(null);
            const r = await eraseEntityAction(entityId, fd.get("requestNo"), fd.get("requestDate"), fd.get("confirmed"));
            if ("error" in r) { setError(r.error); return; }
            router.refresh();
          });
        }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>{L("Само ръководителят на PTS. Юридическото лице, лабораториите и потребителите му, писмата до тях и документите му се заличават; профилите за вход се изтриват.", "The head of PTS only. The legal entity, its laboratories and users, the messages to them and its documents are erased; the sign-in accounts deleted.")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Входящ № на искането *", "Incoming no. of the request *")}</span>
            <input name="requestNo" required maxLength={30} pattern="[0-9A-Za-zА-Яа-я№/.\-]{1,30}" title={L("букви, цифри, № / . - — без интервали", "letters, digits, № / . - — no spaces")} style={{ ...field, minWidth: 140 }} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Дата на искането *", "Date of the request *")}</span>
            <input name="requestDate" type="date" required style={{ ...field, minWidth: 150 }} /></label>
        </div>
        <label className="text-xs" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirmed" required /> {L("Разбирам, че изтриването не може да се върне.", "I understand the erasure cannot be undone.")}</label>
        <div><button type="submit" className="btn btn-sm" disabled={pending} style={{ background: "#b4291f", color: "#fff", borderColor: "#b4291f" }}>{L("Изтрий профила", "Erase the profile")}</button></div>
        {error && <div role="alert" data-erase-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>}
      </form>
    </details>
  );
}
