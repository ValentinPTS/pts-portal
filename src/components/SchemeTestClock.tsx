"use client";

import { useRef, useState } from "react";
import { setTestClockAction, runRemindersNowAction } from "@/lib/actions";
import { fmtStamp } from "@/lib/chain";
import { shiftedNowIso, sofiaNowWallShifted } from "@/lib/clock";

// The round's clock (plan part 1.3, Реш. 132) — shown in the TEST environment only.
// Move this round's "now" to any date and time, past ones included, to try the
// reminder before a deadline, a late result, an extension, a reissued report. The
// clock runs on from the moment it is set. Record stamps (the journal) stay real.
export default function SchemeTestClock({ schemeId, lang, offsetMs }: { schemeId: string; lang: "bg" | "en"; offsetMs: number }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const [at, setAt] = useState(() => sofiaNowWallShifted(offsetMs));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a second click while saving is ignored
  const moved = offsetMs !== 0;

  const once = async (job: () => Promise<string>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMsg("");
    try { setMsg(await job()); } finally { inFlight.current = false; setBusy(false); }
  };

  const move = (wall: string | null) => once(async () => {
    const r = await setTestClockAction(schemeId, wall);
    if (!("error" in r)) {
      if (wall === null) setAt(sofiaNowWallShifted(0)); // the field follows the real time again
      return L("Записано.", "Saved.");
    }
    switch (r.error) {
      case "not-test": return L("Само в тестовата среда.", "Test environment only.");
      case "too-far": return L("Най-много 5 години от днес — проверете годината.", "At most 5 years from today — check the year.");
      case "before-chain": return L(`Не по-рано от последната стъпка във веригата (${fmtStamp(r.at ?? "")}).`, `Not earlier than the chain's last step (${fmtStamp(r.at ?? "")}).`);
      default: return L("Невалидна дата и час (или час, който не съществува при смяната на часа).", "Not a valid date and time (or an hour skipped by the clock change).");
    }
  });

  const remind = () => once(async () => {
    const r = await runRemindersNowAction();
    return "error" in r ? L("Само в тестовата среда.", "Test environment only.") : L(`Напомняния: ${r.raised} (чакат пускане в «Известия»).`, `Reminders: ${r.raised} (held in «Notices»).`);
  });

  return (
    <section data-test-clock className="card p-3 mt-4" style={{ border: "1px dashed #b5562a", background: "#fdf3ec" }}>
      <div className="text-sm font-bold" style={{ color: "#7a2e0e" }}>
        {L("Часовник на кръга (тестова среда)", "This round's clock (test environment)")}
      </div>
      <div className="text-sm mt-1" data-clock-now>
        {L("Сега за кръга:", "Now for this round:")}{" "}
        {/* the minute may tick between the server and the browser */}
        <b suppressHydrationWarning style={{ fontVariantNumeric: "tabular-nums" }}>{fmtStamp(shiftedNowIso(offsetMs))}</b>{" "}
        {L("(българско време)", "(Bulgarian time)")}
        {moved ? <span style={{ color: "#7a2e0e" }}> · {L("преместен", "moved")}</span> : null}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap text-sm">
        <input type="datetime-local" name="clockAt" value={at} onChange={(e) => setAt(e.target.value)}
          className="rounded px-2 py-1" style={{ border: "1px solid var(--line)", background: "#fff" }} />
        <button type="button" className="btn" disabled={busy} onClick={() => move(at)}>{L("Премести часовника", "Move the clock")}</button>
        {moved && <button type="button" className="btn" disabled={busy} onClick={() => move(null)}>{L("Върни истинското време", "Back to the real time")}</button>}
        <button type="button" className="btn" disabled={busy} onClick={remind}>{L("Пусни напомнянията сега", "Run the reminders now")}</button>
        {msg && <span role="status" style={{ color: "var(--muted)" }}>{msg}</span>}
      </div>
      <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {L("Сроковете, напомнянията и веригата на този кръг четат този часовник. Дневникът пази истинското време. Ежедневните напомняния вървят само на истинския портал — тук ги пускате с бутона.",
           "This round's deadlines, reminders and chain read this clock. The journal keeps the real time. The daily reminders run on the real portal only — here, run them with the button.")}
      </div>
    </section>
  );
}
