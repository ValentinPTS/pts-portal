import type { CSSProperties } from "react";
import Icon from "./Icon";
import type { IconName } from "@/lib/ui-icons";
import { STATE_WORD, type StepState } from "@/lib/ui-model";

export type PathStep = { key: string; label: string; state: StepState; note?: string; icon?: IconName };

// Redesign R0 — «Пътека от стъпки» (direction A): where the person is, in big steps — done (green, a tick), now
// (orange, larger, a ring), later (grey, dashed). Each step says its state in words; the current one is the page's
// current step for a screen reader. `compact`: one line for the top of a page («докъде сте»), the state words for a
// screen reader, the current step's note shown («Ваш ред сега» or «Чака PTS»). On a phone the full path stands up, one step per line.
export default function StepPath({ steps, label, lang, compact = false }: { steps: readonly PathStep[]; label: string; lang: "bg" | "en"; compact?: boolean }) {
  return (
    <ol className={`ui-path${compact ? " ui-path-compact" : ""}`} aria-label={label} data-step-path style={{ "--ui-path-n": steps.length } as CSSProperties}>
      {steps.map((s, i) => (
        <li key={s.key} className={`ui-path-${s.state}`} data-step={s.key} data-step-state={s.state} aria-current={s.state === "now" || s.state === "wait" ? "step" : undefined}>
          <span className="ui-path-dot" aria-hidden="true">
            {s.state === "done" ? <Icon name="check" size={compact ? 16 : 32} strokeWidth={2.6} />
              : compact ? i + 1
              : <Icon name={s.icon ?? "dot"} size={s.state === "now" ? 38 : 30} />}
          </span>
          <span className="ui-path-text">
            <span className="ui-path-label">{s.label}</span>
            {compact
              ? (s.state === "now" || s.state === "wait" ? <span className="ui-path-note"> — {s.note ?? STATE_WORD[s.state][lang]}</span> : <span className="sr-only-pts"> — {STATE_WORD[s.state][lang]}</span>)
              : <span className="ui-path-note">{s.note ?? STATE_WORD[s.state][lang]}</span>}
            {!compact && s.note && <span className="sr-only-pts"> — {STATE_WORD[s.state][lang]}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
