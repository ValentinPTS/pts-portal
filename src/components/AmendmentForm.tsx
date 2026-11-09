"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordAmendmentAction, completeAmendmentAction } from "@/lib/actions";
import { DATE_KEYS, DATE_LABELS, deadlineDay, deadlineTime, type SchemeDateKey } from "@/lib/scheme-dates";

// The head's order of amendment, entered (plan part 3.3; Zadanie §3): what the order
// says — its number and date, the reason, the amended points, the assessment of the
// consequences for validity — the new deadlines, and which of the plan and the
// invitation it issues again. Confirmed first: the participants are told.

export default function AmendmentForm({
  schemeId, lang, dates, docs,
}: {
  schemeId: string;
  lang: "bg" | "en";
  dates: Partial<Record<SchemeDateKey, string>>;
  docs: { key: string; name: string; uploaded?: boolean }[];
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  // onSubmit, not action=: a refusal must not clear what was typed
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!window.confirm(L("Изменението се записва, плана и поканата (ако сте ги избрали) се издават като нови редакции, а участниците се уведомяват. Продължаваме?",
      "The amendment is recorded, the plan and the invitation (if chosen) are issued as new editions, and the participants are told. Go ahead?"))) return;
    start(async () => {
      setError(null);
      const r = await recordAmendmentAction(schemeId, {
        orderNo: fd.get("orderNo"), orderDate: fd.get("orderDate"), reason: fd.get("reason"), points: fd.get("points"), validity: fd.get("validity"),
        // a day and, when given, its hour in Bulgaria (3.4)
        dates: Object.fromEntries(DATE_KEYS.map((k) => { const d = String(fd.get(`date_${k}`) ?? ""); const h = String(fd.get(`time_${k}`) ?? ""); return [k, d && h ? `${d}T${h}` : d]; })),
        docs: fd.getAll("docs").map(String),
      });
      if ("error" in r) { setError(r.error); return; }
      setDone(r.no);
      if (r.incomplete) setError(r.incomplete);
      router.refresh();
    });
  };

  const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", fontSize: 13, background: "#fff", fontFamily: "inherit", width: "100%" } as const;
  const label = { fontSize: 12, color: "var(--muted)", fontWeight: 600 } as const;

  return (
    <form onSubmit={submit} data-amendment-form className="card p-4 mt-5" style={{ display: "grid", gap: 12, background: "#fff" }}>
      <div className="font-bold" style={{ color: "var(--green-dark)" }}>{L("Ново изменение", "New amendment")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}><span style={label}>{L("Заповед № *", "Order No. *")}</span><input name="orderNo" maxLength={60} required style={field} /></label>
        <label style={{ display: "grid", gap: 4 }}><span style={label}>{L("от дата *", "dated *")}</span><input name="orderDate" type="date" required style={field} /></label>
      </div>
      <label style={{ display: "grid", gap: 4 }}><span style={label}>{L("Основание *", "Reason *")}</span><textarea name="reason" rows={2} maxLength={2000} required style={field} /></label>
      <label style={{ display: "grid", gap: 4 }}><span style={label}>{L("Изменени точки (от плана и поканата) *", "Amended points (of the plan and the invitation) *")}</span><textarea name="points" rows={2} maxLength={2000} required style={field} /></label>
      <label style={{ display: "grid", gap: 4 }}><span style={label}>{L("Оценка на последствията за валидността *", "Assessment of the consequences for validity *")}</span><textarea name="validity" rows={2} maxLength={2000} required style={field} /></label>
      <div>
        <div style={label}>{L("Нови срокове (непроменените оставете както са)", "New deadlines (leave the unchanged ones as they are)")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 4 }}>
          {DATE_KEYS.map((k) => (
            <label key={k} style={{ display: "grid", gap: 3 }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{DATE_LABELS[k][lang]}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <input type="date" name={`date_${k}`} defaultValue={deadlineDay(dates[k] ?? "")} style={{ ...field, flex: 1, minWidth: 0 }} />
                <input type="time" name={`time_${k}`} defaultValue={deadlineTime(dates[k] ?? "") ?? ""} aria-label={L("час (по желание)", "hour (optional)")} style={{ ...field, width: 96 }} />
              </span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span style={label}>{L("Издай отново като редакция с изменението:", "Issue again as an edition with the amendment:")}</span>
        {docs.map((d) => (
          <label key={d.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" name="docs" value={d.key} /> {d.name}
          </label>
        ))}
      </div>
      {docs.some((d) => d.uploaded) && (
        <p data-amendment-uploaded className="text-xs" style={{ color: "var(--muted)", margin: 0 }}>
          {L(`${docs.filter((d) => d.uploaded).map((d) => d.name).join(" и ")}: качен файл. Порталът не може да впише изменението в PDF — то трябва да е в самия файл; качете изменения файл преди записа. Порталът показва изменението до файла в «Редакции» и при лабораториите.`,
            `${docs.filter((d) => d.uploaded).map((d) => d.name).join(" and ")}: an uploaded file. The portal cannot write the amendment into a PDF — it must be in the file itself; upload the amended file before recording. The portal shows the amendment beside the file in «Editions» and to the laboratories.`)}
        </p>
      )}
      {error && <div role="alert" data-amendment-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{error}</div>}
      {done && <div role="status" data-amendment-done style={{ color: "var(--green-dark)", fontWeight: 700, fontSize: 13 }}>✓ {L(`Изменение № ${done} е записано.`, `Amendment No. ${done} is recorded.`)}</div>}
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? L("Записване…", "Recording…") : L("Запиши изменението", "Record the amendment")}</button></div>
    </form>
  );
}

/** Complete an amendment that a file failure left with documents not issued. */
export function CompleteAmendment({ schemeId, amendmentId, lang }: { schemeId: string; amendmentId: string; lang: "bg" | "en" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" disabled={pending} data-complete-amendment
      onClick={() => start(async () => { const r = await completeAmendmentAction(schemeId, amendmentId); if ("error" in r) alert(r.error); router.refresh(); })}>
      {lang === "bg" ? "Довърши" : "Complete"}
    </button>
  );
}
