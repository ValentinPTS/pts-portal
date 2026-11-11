"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApplicationsClosedAction, admitFromWaitlistAction } from "@/lib/actions";

// The waiting list and the applications' switch (plan part 9.3; Реш. 120, 127) — on «Участници», for
// PTS. Applications close only by their date or by this hand («Запълнена» never closes them); after
// the final list and the receipt protocols, the FIRST in line is admitted when a reserve object is free
// and the minimum days hold — the reason said when not.
type Row = { id: string; label: string; at: string };
export default function WaitlistPanel({ lang, schemeId, canManage, closed, waiting, finalMade, reserves, awaitingReceipt, firstProblem, testing }: {
  lang: "bg" | "en"; schemeId: string; canManage: boolean; closed: { at: string; by: string } | null; waiting: Row[]; finalMade: boolean;
  reserves: { reserves: number; given: number; replacements: number; pending: number; free: number }; awaitingReceipt: number; firstProblem: { bg: string; en: string } | null; testing: boolean;
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { error: string }>) => start(async () => { setError(null); const r = await fn(); if ("error" in r) setError(r.error); else router.refresh(); });
  return (
    <section className="card p-3 mt-3 text-sm" data-waitlist-panel style={{ display: "grid", gap: 8 }}>
      <div className="flex gap-3 items-center" style={{ flexWrap: "wrap" }} data-applications-state={closed ? "closed" : "open"}>
        <b>{L("Заявяване", "Applications")}:</b>
        {closed
          ? <span style={{ color: "#8f2f2f" }}>{L(`затворено ръчно (${closed.by}, ${closed.at.slice(0, 10)})`, `closed by hand (${closed.by}, ${closed.at.slice(0, 10)})`)}</span>
          : <span style={{ color: "var(--green-dark)" }}>{finalMade
              // after the final list a new application waits in line (Реш. 120, 127) — said, so «open» never reads
              // as «a participant may still be added» (the security sweep, UM Q3)
              ? L("отворено — новите заявки влизат в списъка на изчакващите", "open — new applications join the waiting list")
              : L("отворено — до срока за заявки", "open — until the applications' deadline")}</span>}
        {canManage && (closed
          ? <button type="button" className="btn btn-sm" data-applications-open disabled={pending} onClick={() => run(() => setApplicationsClosedAction(schemeId, false))}>{L("Отвори отново", "Open again")}</button>
          : <button type="button" className="btn btn-sm" data-applications-close disabled={pending} onClick={() => { if (window.confirm(L("Да се затвори ли заявяването за схемата? Лабораториите не могат да подават заявки, докато не го отворите отново.", "Close the applications for the scheme? Laboratories cannot apply until you open them again."))) run(() => setApplicationsClosedAction(schemeId, true)); }}>{L("Затвори заявяването", "Close the applications")}</button>)}
      </div>
      {waiting.length > 0 && (
        <div data-waitlist>
          <b>{L("Списък на изчакващите", "Waiting list")} ({waiting.length})</b> <span className="text-xs" style={{ color: "var(--muted)" }}>— {L("по реда на подаване (Реш. 120)", "in the order of submission (Decision 120)")}</span>
          <ol style={{ margin: "4px 0 0 18px", display: "grid", gap: 3 }}>
            {waiting.map((w, i) => (
              <li key={w.id} data-waitlist-row={w.id} data-waitlist-pos={i + 1}>
                {w.label} <span className="text-xs" style={{ color: "var(--muted)" }}>· {w.at ? w.at.slice(0, 16).replace("T", " ") : "—"}</span>
                {i === 0 && finalMade && canManage && (
                  <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} data-waitlist-admit={w.id} disabled={pending || !!firstProblem} title={firstProblem ? L(firstProblem.bg, firstProblem.en) : undefined}
                    onClick={() => run(() => admitFromWaitlistAction(schemeId, w.id))}>{L("Допусни", "Admit")}</button>
                )}
              </li>
            ))}
          </ol>
          {finalMade && (
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }} data-waitlist-facts>
              {testing ? L(`Резервни обекти: ${reserves.reserves}, дадени на допуснати: ${reserves.given + reserves.pending}, заместващи изпратени: ${reserves.replacements} — свободни: ${reserves.free}. `, `Reserve objects: ${reserves.reserves}, given to admitted ones: ${reserves.given + reserves.pending}, replacements sent: ${reserves.replacements} — free: ${reserves.free}. `) : ""}
              {testing ? L(`Чакат протокол за получаване: ${awaitingReceipt}.`, `Awaiting the receipt protocol: ${awaitingReceipt}.`) : L("Калибриране — уредът пътува; не е нужен обект.", "Calibration — the device travels; no object needed.")}
              {firstProblem && <span data-waitlist-why style={{ display: "block", color: "#7a2e0e" }}>{L(`Първият не може да се допусне сега: ${firstProblem.bg}.`, `The first cannot be admitted now: ${firstProblem.en}.`)}</span>}
            </div>
          )}
        </div>
      )}
      {error && <div role="alert" data-waitlist-error style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px" }}>{error}</div>}
    </section>
  );
}
