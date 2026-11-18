import type { ReactNode } from "react";

// Redesign R0 — «Какво следва» / «Сега»: every page answers «what do I do now?» in one sentence, with its one action
// beside it (a «ui-btn-next» link or button, passed as children).
export default function NextStep({ eyebrow, title, detail, children }: { eyebrow?: ReactNode; title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <section className="ui-next" data-next-step>
      <div className="ui-next-text">
        {eyebrow && <span className="ui-next-eyebrow">{eyebrow}</span>}
        <span className="ui-next-title">{title}</span>
        {detail && <span className="ui-next-detail">{detail}</span>}
      </div>
      {children && <div className="ui-next-actions">{children}</div>}
    </section>
  );
}
