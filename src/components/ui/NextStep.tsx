import type { ReactNode } from "react";

// Redesign R0 — «Какво следва» / «Сега»: every page answers «what do I do now?» in one sentence, with its one action
// beside it (a «ui-btn-next» link or button, passed as children). `calm`: the next step is someone else's (the reader
// only reads) — grey, never orange.
export default function NextStep({ eyebrow, title, detail, calm = false, children }: { eyebrow?: ReactNode; title: ReactNode; detail?: ReactNode; calm?: boolean; children?: ReactNode }) {
  return (
    <section className={calm ? "ui-next ui-next-calm" : "ui-next"} data-next-step data-next-calm={calm ? "1" : undefined}>
      <div className="ui-next-text">
        {eyebrow && <span className="ui-next-eyebrow">{eyebrow}</span>}
        <span className="ui-next-title">{title}</span>
        {detail && <span className="ui-next-detail">{detail}</span>}
      </div>
      {children && <div className="ui-next-actions">{children}</div>}
    </section>
  );
}
