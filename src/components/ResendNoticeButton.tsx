"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendConfirmationNoticeAction } from "@/lib/actions";

// «Изпрати отново» — the notice of a laboratory's confirmation (К23) that did not go
// (plan part 4.4 review): the same fixed text, to the official e-mail.
export default function ResendNoticeButton({ entityId, lang }: { entityId: string; lang: "bg" | "en" }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span data-resend-notice={entityId} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm" disabled={pending}
        onClick={() => start(async () => {
          const r = await resendConfirmationNoticeAction(entityId);
          setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: L("Изпратено.", "Sent.") });
          router.refresh();
        })}>{L("Изпрати уведомлението отново", "Send the notice again")}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className="text-xs" style={{ color: msg.ok ? "var(--green-dark)" : "#8f2f2f" }}>{msg.text}</span>}
    </span>
  );
}
