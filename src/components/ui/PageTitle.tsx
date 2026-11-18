import type { ReactNode } from "react";

// Redesign R0 — a page's title as on ptsbg.eu: big and light, one word bold, a short green line under it.
export default function PageTitle({ eyebrow, light, bold, sub }: { eyebrow?: ReactNode; light?: ReactNode; bold: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ui-title">
      {eyebrow && <span className="ui-title-eyebrow">{eyebrow}</span>}
      <h1>{light && <>{light} </>}<b>{bold}</b></h1>
      {sub && <p className="ui-title-sub">{sub}</p>}
      <span className="ui-title-line" aria-hidden="true" />
    </div>
  );
}
