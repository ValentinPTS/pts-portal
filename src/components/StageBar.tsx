import { STAGES, STATE_STAGE, STATE_LABEL, PAYMENT_LABEL, stageLabel, type PState, type PaymentMark } from "@/lib/participation-state-model";

// The participation's bar (plan part 5.5; К26): the stages, the one it is in marked, those
// before it done. A participation that ended shows its state instead — a bar would say it
// is somewhere it is not. Payment stands beside the bar, never in it (К18; Реш. 96).
export default function StageBar({ lang, type, state, payment, compact }: { lang: "bg" | "en"; type: string; state: PState; payment?: PaymentMark; compact?: boolean }) {
  const L = (x: { bg: string; en: string }) => (lang === "bg" ? x.bg : x.en);
  const cur = STATE_STAGE[state];
  const at = cur ? STAGES.indexOf(cur) : -1;
  const ended = cur === null;
  return (
    <div data-stage-bar={cur ?? "ended"} data-state={state} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ended ? (
        <span data-ended-state={state} style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#f1efe9", color: "#5d5a52", border: "1px solid var(--line)" }}>
          {L(STATE_LABEL[state])}
        </span>
      ) : (
        <ol className="stage-bar" aria-label={lang === "bg" ? "Етапи на участието" : "The participation's stages"} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 6 }}>
          {STAGES.map((s, i) => {
            // the report out, its stage is done too — nothing is left to wait for
            const done = i < at || (i === at && (state === "scored" || state === "nr"));
            const now = i === at && !done;
            return (
              <li key={s} data-stage={s} data-stage-done={done ? "1" : undefined} aria-current={now ? "step" : undefined}
                style={{ borderTop: `3px solid ${now ? "#8f2f2f" : done ? "var(--green-dark)" : "var(--line)"}`, paddingTop: compact ? 3 : 6, fontSize: compact ? 11 : 12.5, textAlign: "center", fontWeight: now ? 800 : 500, color: now ? "#8f2f2f" : done ? "var(--ink)" : "var(--muted)", overflowWrap: "anywhere" }}>
                <span className="stage-label">{L(stageLabel(s, type))}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
        {/* on a narrow screen the bar is its segments alone — the stage it is in is named here */}
        {!ended && cur && <span className="stage-now-narrow" style={{ fontWeight: 800, color: "#8f2f2f" }}>{L(stageLabel(cur, type))} ·</span>}
        {!ended && <span data-state-label>{L(STATE_LABEL[state])}</span>}
        {payment && (
          <span data-payment={payment} title={lang === "bg" ? "Плащането не спира изпращането (Реш. 96)" : "Payment never holds the dispatch back (Реш. 96)"}
            style={{ fontWeight: 700, padding: "1px 8px", borderRadius: 999, border: "1px solid var(--line)", background: payment === "paid" ? "#e3eeda" : payment === "invoiced" ? "#faf2e0" : "#fff", color: payment === "paid" ? "#456b2c" : payment === "invoiced" ? "#7a5416" : "var(--muted)" }}>
            {L(PAYMENT_LABEL[payment])}
          </span>
        )}
      </div>
    </div>
  );
}
