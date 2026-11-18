import type { ReactNode } from "react";
import Picture, { type PictureName } from "@/components/ui/Picture";

// Shared empty / error / loading states — the design-system "States" card in code.
// Presentational only (no client hooks), so they work in server components. The
// global app/error.tsx renders its own client wrapper around this look.

// The redesign (R5): an empty page may show a picture of what is still to come (decoration — the words say it).
export function EmptyState({ title, body, action, picture }: { title: string; body?: string; action?: ReactNode; picture?: PictureName }) {
  return (
    <div className="state-box">
      {picture ? <Picture name={picture} className="ui-pic-scene" /> : <div className="state-ico" aria-hidden />}
      <div className="state-title">{title}</div>
      {body && <div className="state-body">{body}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: { title?: string; body?: string; action?: ReactNode }) {
  return (
    <div className="state-box">
      <div className="state-ico error" aria-hidden />
      <div className="state-title" style={{ color: "var(--error)" }}>{title}</div>
      {body && <div className="state-body">{body}</div>}
      {action}
    </div>
  );
}

// Skeleton placeholder rows for loading states.
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  const widths = [42, 90, 74, 60, 82, 50];
  return (
    <div className="state-skel" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  );
}
