import type { ReactNode } from "react";
import Icon from "./Icon";
import { PILL_ICON, type PillState } from "@/lib/ui-model";

// Redesign R0 — a state beside a thing: «Ваш ред» (orange), «Готово» (green), «Чака PTS» (grey), information (blue).
// Always an icon AND words — never colour alone.
export default function StatusPill({ state, children }: { state: PillState; children: ReactNode }) {
  return (
    <span className={`ui-pill ui-pill-${state}`} data-pill={state}>
      <Icon name={PILL_ICON[state]} size={18} strokeWidth={2.4} />
      {children}
    </span>
  );
}
