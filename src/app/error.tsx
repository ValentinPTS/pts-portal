"use client";

import { useLang } from "@/components/LangProvider";

// App-wide error boundary (App Router). Client component with a reset() to retry.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ padding: 40, width: "100%" }}>
      <div className="state-box" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="state-ico error" aria-hidden />
        <div className="state-title" style={{ color: "var(--error)" }}>{t("error.title")}</div>
        <div className="state-body">{error?.message || t("error.body")}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => reset()}>{t("error.tryAgain")}</button>
      </div>
    </div>
  );
}
