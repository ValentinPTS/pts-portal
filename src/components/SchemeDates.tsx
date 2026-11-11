"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSchemeDatesAction } from "@/lib/actions";
import { DATE_KEYS, DATE_LABELS, deadlineDay, deadlineTime, fmtSchemeDate, type SchemeDateKey } from "@/lib/scheme-dates";

// The scheme's four working dates, edited where the owner works rather than inside
// the document editor — they are not document content and must not be mistaken for
// the schedule he prints into the Plan.
//
// Nothing here is required and nothing here blocks: an empty field simply means
// "not decided yet", and a date that has passed is shown as passed, not enforced.

export default function SchemeDates({
  schemeId, lang, initial, byAmendment = false, canEdit = true,
}: {
  schemeId: string;
  /** may save the dates — read-only roles see them, nothing to press (round 2, R2U-2) */
  canEdit?: boolean;
  lang: "bg" | "en";
  initial: Partial<Record<SchemeDateKey, string>>;
  // once the scheme is open, the deadlines change only by an order of amendment (3.3)
  byAmendment?: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [vals, setVals] = useState<Partial<Record<SchemeDateKey, string>>>(initial);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  const dirty = DATE_KEYS.some((k) => (vals[k] ?? "") !== (initial[k] ?? ""));

  function save() {
    setSaved(false);
    startTransition(async () => {
      const r = await setSchemeDatesAction(schemeId, vals);
      if (r?.error) { alert(r.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div data-scheme-dates style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "10px 0 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L("Работни срокове", "Working dates")}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {L("Показват се на лабораториите. Не влизат в документите и нищо не спират.",
             "Shown to the laboratories. They never go into the documents and they block nothing.")}
        </span>
        <span style={{ flex: 1 }} />
        {saved && !dirty && <span style={{ fontSize: 12, color: "var(--green-dark,#3d6b47)", fontWeight: 700 }}>✓ {L("Запазено", "Saved")}</span>}
        {byAmendment && (
          <a href={`/schemes/${schemeId}/amendments`} data-dates-by-amendment className="btn btn-sm" style={{ fontSize: 12.5 }}>
            {L("Определените се сменят със заповед за изменение →", "Set ones change by an order of amendment →")}
          </a>
        )}
        {canEdit && (!byAmendment || DATE_KEYS.some((k) => !initial[k])) && (
        <button className="btn btn-sm" disabled={!dirty || busy} onClick={save}
          style={{ fontSize: 12.5, opacity: !dirty || busy ? 0.5 : 1 }}>
          {busy ? L("Запазване…", "Saving…") : L("Запази", "Save")}
        </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {DATE_KEYS.map((k) => {
          // a day, and — if the deadline has one — its hour in Bulgaria (3.4, А10)
          const v = vals[k] ?? "";
          const day = deadlineDay(v);
          const time = deadlineTime(v) ?? "";
          const locked = !canEdit || (byAmendment && !!initial[k]);
          const put = (d: string, t: string) => { setSaved(false); setVals((x) => ({ ...x, [k]: d ? (t ? `${d}T${t}` : d) : "" })); };
          const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" } as const;
          return (
            <label key={k} data-date-key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{lang === "bg" ? DATE_LABELS[k].bg : DATE_LABELS[k].en}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="date" value={day} readOnly={locked} disabled={locked} onChange={(e) => put(e.target.value, time)} style={{ ...field, flex: 1, minWidth: 0 }} />
                <input type="time" value={time} readOnly={locked} disabled={locked || !day} onChange={(e) => put(day, e.target.value)}
                  aria-label={L("час (по желание)", "hour (optional)")} style={{ ...field, width: 96 }} />
              </span>
              {day && <span data-date-shown style={{ fontSize: 11, color: "var(--muted)" }}>{time ? fmtSchemeDate(v) : L(`${fmtSchemeDate(day)}, до края на деня`, `${fmtSchemeDate(day)}, until the end of the day`)}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
