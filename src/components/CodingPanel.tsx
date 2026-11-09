"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { codingAction } from "@/lib/actions";

// The coding act (plan part 5.3; Zadanie «Кодиране», stage 9): the coding expert codes
// the participations on the final list — codes drawn at random, objects too — once, on
// record. What was drawn is shown: which application became which code, and its objects
// (no names). The act is recorded whole or not at all; a follow-up that stopped (a case-file
// step, a notice) is completed by pressing again, nothing drawn again.

export interface CodingRow { ref: string; code: string; objects: string[] }
export interface CodingDone { day: string; by: string; rows: CodingRow[] }

export default function CodingPanel({ lang, schemeId, canCode, waiting, blocked, pending, pool, done }: {
  lang: "bg" | "en";
  schemeId: string;
  /** may this person do the act (results.enter in this scheme) */
  canCode: boolean;
  /** participations on the final list still without a code */
  waiting: number;
  /** why the act cannot be done now, in words — or undefined */
  blocked?: string;
  /** coded participations whose follow-up (case file, notice) did not finish */
  pending: number;
  /** objects for participants still free in the drawn batches (testing) — null: no objects (calibration) */
  pool: number | null;
  done: CodingDone[];
}) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const msg = pending
      ? L(`Довършване на кодирането: ${pending} кодирани участия получават стъпката в досието и известието си. Нищо не се тегли наново. Продължаваме?`, `Completing the coding: ${pending} coded participations get their case-file step and notice. Nothing is drawn again. Go ahead?`)
      : L(`Кодиране: ${waiting} участия от окончателния списък получават код на случаен принцип${pool ? " и обекти, също на случаен принцип" : pool === 0 ? " (обекти няма — няма изтеглена партида с обекти за участници)" : ""}. Еднократно, записва се. Продължаваме?`,
          `Coding: ${waiting} participations on the final list get a code at random${pool ? ", and objects, also at random" : pool === 0 ? " (no objects — no drawn batch has objects for participants)" : ""}. Once, on record. Go ahead?`);
    if (!window.confirm(msg)) return;
    start(async () => {
      setError(null);
      let r: Awaited<ReturnType<typeof codingAction>>;
      try { r = await codingAction(schemeId); } catch { setError(L("Не стана — опитайте отново.", "It did not go through — try again.")); return; }
      if ("error" in r) { setError(r.error); return; }
      router.refresh();
    });
  };

  return (
    <section data-coding className="card" style={{ padding: "14px 18px", margin: "0 0 14px", background: "#fff" }}>
      <h3 style={{ fontWeight: 800, fontSize: 15, color: "var(--green-dark)", margin: 0 }}>{L("Кодиране — етап 9", "Coding — stage 9")}</h3>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 10px", maxWidth: 720 }}>
        {L("След затваряне на заявяването всяко участие от окончателния списък получава код на случаен принцип — номер на лаборатория, който не е даван в схемата — и обектите си, също на случаен принцип. До тогава заявката има временен номер (Z…), който лабораторията не вижда.",
           "After applications close, each participation on the final list gets a code at random — a laboratory number never given in the scheme — and its objects, also at random. Until then an application has a provisional reference (Z…), which the laboratory does not see.")}
      </p>
      {(waiting > 0 || pending > 0) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span data-coding-waiting={waiting} style={{ fontSize: 13 }}>{pending ? L(`${pending} кодирани участия чакат стъпката в досието и известието си`, `${pending} coded participations wait for their case-file step and notice`) : L(`${waiting} участия чакат код`, `${waiting} participations wait for a code`)}</span>
          {canCode
            ? <button type="button" className="btn btn-primary" data-coding-run disabled={busy || (!pending && !!blocked)} title={pending ? undefined : blocked} onClick={run} style={{ fontSize: 13 }}>
                {pending ? L("Довърши кодирането", "Complete the coding") : L("Кодирай на случаен принцип", "Code at random")}
              </button>
            : <span style={{ fontSize: 12, color: "var(--muted)" }}>{L("Кодира експертът по събиране и кодиране на данни (Реш. 93).", "The data collection and coding expert codes (Реш. 93).")}</span>}
          {!pending && blocked && <span data-coding-blocked style={{ fontSize: 12, color: "#8a5a00" }}>{blocked}</span>}
          {!pending && pool !== null && <span style={{ fontSize: 12, color: "var(--muted)" }}>{L(`свободни обекти за участници: ${pool}`, `free objects for participants: ${pool}`)}</span>}
        </div>
      )}
      {error && <div role="alert" data-coding-error style={{ marginTop: 8, color: "#8f2f2f", fontSize: 13 }}>{error}</div>}
      {done.map((d, k) => (
        <details key={k} data-coding-done open={k === done.length - 1} style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{L(`Кодирано ${d.day} · ${d.by} · ${d.rows.length} участия`, `Coded ${d.day} · ${d.by} · ${d.rows.length} participations`)}</summary>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
              <thead><tr style={{ color: "var(--muted)", fontSize: 12, textAlign: "left" }}><th style={{ padding: "3px 8px" }}>{L("Заявка", "Application")}</th><th style={{ padding: "3px 8px" }}>{L("Код", "Code")}</th><th style={{ padding: "3px 8px" }}>{L("Обекти", "Objects")}</th></tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.ref} data-coded={r.code} data-coded-from={r.ref} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "3px 8px", color: "var(--muted)", fontFamily: "var(--font-mono, monospace)" }}>{r.ref}</td>
                    <td style={{ padding: "3px 8px", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{r.code}</td>
                    <td style={{ padding: "3px 8px", fontFamily: "var(--font-mono, monospace)" }} data-coded-objects={r.objects.join(" ")}>{r.objects.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
