"use client";

// App-wide error boundary (App Router). Client component with a reset() to retry.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 40, width: "100%" }}>
      <div className="state-box" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="state-ico error" aria-hidden />
        <div className="state-title" style={{ color: "var(--error)" }}>Something went wrong</div>
        <div className="state-body">{error?.message || "We couldn’t load this page. Please try again."}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  );
}
