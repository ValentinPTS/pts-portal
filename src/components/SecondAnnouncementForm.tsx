"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { secondAnnouncementAction } from "@/lib/actions";

// The second announcement (plan part 5.2; Реш. 65, 66): which characteristics run —
// each with the participations applied for it by those in the round, against the five
// of Реш. 66; ticked by default once it has them — and so the final list. Each
// participation is told from what it applied for. A scheme with no characteristics
// (calibration) settles the list alone. Confirmed first; never changed after (a step
// back undoes it).

export interface CharacteristicCount { i: number; label: string; count: number }

export default function SecondAnnouncementForm({ lang, schemeId, characteristics, min, inRound, parts, deadline, deadlinePassed }: {
  lang: "bg" | "en";
  schemeId: string;
  characteristics: CharacteristicCount[];
  min: number;
  /** participations in the round now */
  inRound: number;
  /** each participation in the round: the characteristics it applied for (indexes) — no names */
  parts: number[][];
  /** the application deadline, as shown — and whether it has passed (Реш. 66) */
  deadline?: string;
  deadlinePassed: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [runs, setRuns] = useState<Set<number>>(() => new Set(characteristics.filter((c) => c.count >= min).map((c) => c.i)));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toggle = (i: number) => setRuns((cur) => { const next = new Set(cur); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  // how many participations would not be on the list — none of theirs runs
  const offList = characteristics.length ? parts.filter((cs) => !cs.some((i) => runs.has(i))).length : 0;
  // Реш. 66: the set is final once EVERY characteristic has five — or at the deadline,
  // whichever comes first; earlier than both, a warning (PTS decides)
  const early = characteristics.length > 0 && !deadlinePassed && characteristics.some((c) => c.count < min);
  const earlyText = L(`Срокът за заявяване${deadline ? ` (${deadline})` : ""} още не е изтекъл, а не всички характеристики имат по ${min} заявени участия — по Реш. 66 наборът още не е окончателен.`,
    `The application deadline${deadline ? ` (${deadline})` : ""} has not passed, and not every characteristic has ${min} participations applied for — by Реш. 66 the set is not final yet.`);

  const submit = () => {
    const msg = characteristics.length
      ? L(`Второ обявяване: провеждат се ${runs.size} от ${characteristics.length} характеристики. ${offList ? `${offList} от ${inRound} участия не влизат в окончателния списък — нищо от заявеното от тях не се провежда. ` : ""}${early ? earlyText + " " : ""}Всяко участие получава известие според заявеното от него; списъкът не се променя после. Продължаваме?`,
          `Second announcement: ${runs.size} of ${characteristics.length} characteristics run. ${offList ? `${offList} of ${inRound} participations are not on the final list — nothing they applied for runs. ` : ""}${early ? earlyText + " " : ""}Each participation is told from what it applied for; the list is not changed after. Go ahead?`)
      : L("Второ обявяване: окончателният списък — всички участия в кръга. Списъкът не се променя после. Продължаваме?", "Second announcement: the final list — every participation in the round. The list is not changed after. Go ahead?");
    if (!window.confirm(msg)) return;
    start(async () => {
      setError(null);
      let r: Awaited<ReturnType<typeof secondAnnouncementAction>>;
      try {
        r = await secondAnnouncementAction(schemeId, { runs: [...runs], note });
      } catch {
        setError(L("Не стана — нищо не е записано. Опитайте отново.", "It did not go through — nothing was recorded. Try again."));
        return;
      }
      if ("error" in r) { setError(r.error); return; }
      if (r.late) window.alert(L(`${r.late} заявка(и) бяха въведени, докато се правеше обявяването — те не са в окончателния списък и не са уведомени. Записано е в журнала.`, `${r.late} application(s) were entered while the announcement was being made — they are not on the final list and were not told. It is in the journal.`));
      router.refresh();
    });
  };

  return (
    <section data-second-announcement className="card" style={{ padding: "14px 18px", margin: "0 0 14px", background: "#fff" }}>
      <h3 style={{ fontWeight: 800, fontSize: 15, color: "var(--green-dark)", margin: 0 }}>{L("Второ обявяване — окончателният списък", "Second announcement — the final list")}</h3>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 10px", maxWidth: 720 }}>
        {characteristics.length
          ? L(`Изберете кои характеристики се провеждат. Наборът е окончателен, когато всички характеристики имат по ${min} заявени участия или когато изтече срокът за заявяване — което настъпи по-рано (Реш. 66). Характеристиките с ${min} вече са отбелязани; решението е ваше. Участие, на което никоя характеристика не се провежда, не е в списъка и не се фактурира. Проформите — само след това обявяване (Реш. 65).`,
              `Choose which characteristics run. The set is final when every characteristic has ${min} participations applied for, or when the application deadline passes — whichever comes first (Реш. 66). Those with ${min} are ticked already; the decision is yours. A participation none of whose characteristics runs is not on the list and is not invoiced. Proformas only after this announcement (Реш. 65).`)
          : L("Схемата няма характеристики: в окончателния списък са всички участия в кръга. Проформите — само след това обявяване (Реш. 65).", "The scheme has no characteristics: every participation in the round is on the final list. Proformas only after this announcement (Реш. 65).")}
      </p>
      {characteristics.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 12, textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>{L("Провежда се", "Runs")}</th>
                <th style={{ padding: "4px 8px" }}>{L("Характеристика", "Characteristic")}</th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>{L("Заявени участия", "Participations applied")}</th>
              </tr>
            </thead>
            <tbody>
              {characteristics.map((c) => (
                <tr key={c.i} data-run-row={c.i} data-count={c.count} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "4px 8px" }}><input type="checkbox" name={`run_${c.i}`} checked={runs.has(c.i)} onChange={() => toggle(c.i)} aria-label={c.label} /></td>
                  <td style={{ padding: "4px 8px" }}>{c.label}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: c.count >= min ? "var(--green-dark)" : "#8a5a00", fontWeight: 700 }}>{c.count} / {min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {early && <p data-second-early style={{ fontSize: 12.5, color: "#8a5a00", margin: "8px 0 0" }}>{earlyText}</p>}
      {offList > 0 && <p data-second-offlist={offList} style={{ fontSize: 12.5, color: "#8a5a00", margin: "6px 0 0" }}>{L(`${offList} от ${inRound} участия няма да са в окончателния списък — нищо от заявеното от тях не се провежда.`, `${offList} of ${inRound} participations will not be on the final list — nothing they applied for runs.`)}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 10 }}>
        <label style={{ display: "grid", gap: 3, fontSize: 12, color: "var(--muted)" }}>{L("Бележка (по желание)", "A note (optional)")}
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 13, minWidth: 260, fontFamily: "inherit" }} /></label>
        <button type="button" className="btn btn-primary" data-second-submit disabled={pending || inRound === 0 || (characteristics.length > 0 && runs.size === 0)} onClick={submit} style={{ fontSize: 13 }}>
          {L("Направи второто обявяване", "Make the second announcement")}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{L(`${inRound} участия в кръга`, `${inRound} participations in the round`)}</span>
      </div>
      {error && <div role="alert" data-second-error style={{ marginTop: 8, color: "#8f2f2f", fontSize: 13 }}>{error}</div>}
    </section>
  );
}
