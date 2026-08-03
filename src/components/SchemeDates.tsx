"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSchemeDatesAction } from "@/lib/actions";
import { DATE_KEYS, DATE_LABELS, type SchemeDateKey } from "@/lib/scheme-dates";

// The scheme's four working dates, edited where the owner works rather than inside
// the document editor — they are not document content and must not be mistaken for
// the schedule he prints into the Plan.
//
// Nothing here is required and nothing here blocks: an empty field simply means
// "not decided yet", and a date that has passed is shown as passed, not enforced.

export default function SchemeDates({
  schemeId, lang, initial,
}: {
  schemeId: string;
  lang: "bg" | "en";
  initial: Partial<Record<SchemeDateKey, string>>;
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
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "10px 0 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L("Работни срокове", "Working dates")}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {L("Показват се на лабораториите. Не влизат в документите и нищо не спират.",
             "Shown to the laboratories. They never go into the documents and they block nothing.")}
        </span>
        <span style={{ flex: 1 }} />
        {saved && !dirty && <span style={{ fontSize: 12, color: "var(--green-dark,#3d6b47)", fontWeight: 700 }}>✓ {L("Запазено", "Saved")}</span>}
        <button className="btn btn-sm" disabled={!dirty || busy} onClick={save}
          style={{ fontSize: 12.5, opacity: !dirty || busy ? 0.5 : 1 }}>
          {busy ? L("Запазване…", "Saving…") : L("Запази", "Save")}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {DATE_KEYS.map((k) => (
          <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{lang === "bg" ? DATE_LABELS[k].bg : DATE_LABELS[k].en}</span>
            <input
              type="date"
              value={vals[k] ?? ""}
              onChange={(e) => { setSaved(false); setVals((v) => ({ ...v, [k]: e.target.value })); }}
              style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff", fontFamily: "inherit" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
