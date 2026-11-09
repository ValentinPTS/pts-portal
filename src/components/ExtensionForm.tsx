"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantExtensionAction } from "@/lib/actions";

// An individual extension of one participant's deadline, with its order (plan part
// 3.4; О6: «Удължаване на срок … минава със заповед за изменение, а не с имейл»).
// onSubmit, not action=: a refusal keeps what was typed.

export default function ExtensionForm({ schemeId, code, lang, calibration }: { schemeId: string; code: string; lang: "bg" | "en"; calibration: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
  return (
    <form data-extension-form style={{ display: "grid", gap: 10, marginTop: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const day = String(fd.get("day") ?? ""), hour = String(fd.get("hour") ?? "");
        if (!window.confirm(L("Удължаването се записва и лабораторията се уведомява. Продължаваме?", "The extension is recorded and the laboratory is told. Go ahead?"))) return;
        start(async () => {
          setError(null);
          const r = await grantExtensionAction(schemeId, code, {
            key: fd.get("key"), until: day && hour ? `${day}T${hour}` : day,
            orderNo: fd.get("orderNo"), orderDate: fd.get("orderDate"), reason: fd.get("reason"),
          });
          if ("error" in r) { setError(r.error); return; }
          router.refresh();
        });
      }}>
      <div className="font-bold text-sm" style={{ color: "var(--green-dark)" }}>{L("Индивидуално удължаване", "Individual extension")}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Срок", "Deadline")}</span>
          <select name="key" defaultValue={calibration ? "chain" : "resultsDue"} style={field}>
            <option value="resultsDue">{L("за резултатите", "for the results")}</option>
            {calibration && <option value="chain">{L("за предаване на уреда (прозорецът)", "to hand the instrument on (the window)")}</option>}
          </select></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Нов срок *", "New deadline *")}</span>
          <span style={{ display: "flex", gap: 6 }}><input type="date" name="day" required style={field} /><input type="time" name="hour" aria-label={L("час (по желание)", "hour (optional)")} style={{ ...field, width: 96 }} /></span></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Заповед № *", "Order No. *")}</span><input name="orderNo" required maxLength={60} style={field} /></label>
        <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("от дата *", "dated *")}</span><input type="date" name="orderDate" required style={field} /></label>
      </div>
      <label style={{ display: "grid", gap: 3 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Основание *", "Reason *")}</span><textarea name="reason" rows={2} required maxLength={1000} style={field} /></label>
      {error && <div role="alert" data-extension-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>{error}</div>}
      <div><button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{L("Удължи", "Extend")}</button></div>
    </form>
  );
}
