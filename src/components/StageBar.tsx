import { STAGES, STATE_STAGE, STATE_LABEL, PAYMENT_LABEL, stageLabel, type PState, type PaymentMark } from "@/lib/participation-state-model";
import type { CSSProperties } from "react";
import { STAGE_ICON, STATE_WORD, labsTurn } from "@/lib/ui-model";
import Icon from "@/components/ui/Icon";

// The participation's bar (plan part 5.5; К26): the stages, the one it is in marked, those
// before it done. A participation that ended shows its state instead — a bar would say it
// is somewhere it is not. Payment stands beside the bar, never in it (К18; Реш. 96).
// The redesign (R2, direction A «Пътека от стъпки»): the stages as the path — done green with a tick, the one it is
// in orange when it is the laboratory's turn («Ваш ред»), grey with a clock when PTS has it («Чака PTS»), the ones
// after it dashed. `compact`: the one-line path of a list. Every hook the checks read stays (data-stage-bar,
// data-stage, data-stage-done, aria-current, data-state-label, data-payment, data-ended-state).
export default function StageBar({ lang, type, state, payment, compact }: { lang: "bg" | "en"; type: string; state: PState; payment?: PaymentMark; compact?: boolean }) {
  const L = (x: { bg: string; en: string }) => (lang === "bg" ? x.bg : x.en);
  const cur = STATE_STAGE[state];
  const at = cur ? STAGES.indexOf(cur) : -1;
  const ended = cur === null;
  const yours = labsTurn(state);
  return (
    <div data-stage-bar={cur ?? "ended"} data-state={state} className={compact ? undefined : "ui-path-box"} style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 14 }}>
      {ended ? (
        <span data-ended-state={state} className="ui-pill ui-pill-later" style={{ alignSelf: "flex-start" }}>
          {L(STATE_LABEL[state])}
        </span>
      ) : (
        <ol className={`stage-bar ui-path${compact ? " ui-path-compact" : ""}`} aria-label={lang === "bg" ? "Етапи на участието" : "The participation's stages"} style={{ "--ui-path-n": STAGES.length } as CSSProperties}>
          {STAGES.map((s, i) => {
            // the report out, its stage is done too — nothing is left to wait for
            const done = i < at || (i === at && (state === "scored" || state === "nr"));
            const now = i === at && !done;
            const look = done ? "done" : now ? (yours ? "now" : "wait") : "later";
            const word = L(STATE_WORD[look]);
            return (
              <li key={s} data-stage={s} data-stage-done={done ? "1" : undefined} aria-current={now ? "step" : undefined} className={`ui-path-${look}`}>
                <span className="ui-path-dot" aria-hidden="true">
                  {done ? <Icon name="check" size={compact ? 16 : 30} strokeWidth={2.6} />
                    : compact ? i + 1
                    : <Icon name={look === "wait" ? "clock" : STAGE_ICON[s]} size={now ? 36 : 28} />}
                </span>
                <span className="ui-path-text">
                  <span className="ui-path-label stage-label">{L(stageLabel(s, type))}</span>
                  {compact
                    ? (now ? <span className="ui-path-note"> — {word}</span> : <span className="sr-only-pts"> — {word}</span>)
                    : <span className="ui-path-note">{word}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: compact ? 14 : 16, color: "#555" }}>
        {/* on a narrow screen the bar is its segments alone — the stage it is in is named here */}
        {!ended && cur && <span className="stage-now-narrow" style={{ fontWeight: 800, color: yours ? "var(--turn-ink)" : "var(--later-ink)" }}>{L(stageLabel(cur, type))} ·</span>}
        {!ended && <span data-state-label>{L(STATE_LABEL[state])}</span>}
        {payment && (
          <span data-payment={payment} title={lang === "bg" ? "Плащането не спира изпращането (Реш. 96)" : "Payment never holds the dispatch back (Реш. 96)"}
            className={`ui-pill ${payment === "paid" ? "ui-pill-done" : payment === "invoiced" ? "ui-pill-info" : "ui-pill-later"}`} style={{ fontSize: 14, padding: "4px 12px" }}>
            {L(PAYMENT_LABEL[payment])}
          </span>
        )}
      </div>
    </div>
  );
}
