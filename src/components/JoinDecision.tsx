"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideJoinAction } from "@/lib/actions";

// The profile's administrator decides a request to join (plan part 9.1): approve — the person a user,
// invited; or refuse with the reason (kept six years).
// the invitation that goes on «Одобри» — its exact text shown first, its key sent with it (1.8)
export default function JoinDecision({ lang, id, name, email, invite }: { lang: "bg" | "en"; id: string; name: string; email: string; invite: { subject: string; body: string; key: string } }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const go = (approve: boolean) => start(async () => {
    setError(null);
    const r = await decideJoinAction(id, approve, approve ? undefined : reason, approve ? invite.key : undefined);
    if ("error" in r) { setError(r.error); return; }
    // the decided request leaves the list — the page says what happened (?done=)
    const code = approve ? (r.invite === "sent" ? "approved-sent" : "approved-not-sent") : "refused";
    setDone(code);
    router.replace(`/lab/joins?done=${code}`, { scroll: false });
    router.refresh();
  });
  return (
    <div className="mt-2" data-join-decision={id}>
      <details data-join-invite={id} className="mb-2">
        <summary className="text-xs" style={{ cursor: "pointer" }}>{L("Поканата, която тръгва при «Одобри»", "The invitation that goes on «Approve»")}</summary>
        <div className="mt-1" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", background: "var(--bg)" }}>
          <div className="text-xs"><b>{L("До", "To")}:</b> {email}</div>
          <div className="text-xs"><b>{L("Тема", "Subject")}:</b> {invite.subject}</div>
          <pre className="text-xs mt-1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{invite.body}</pre>
        </div>
      </details>
      <div className="flex gap-2 items-start" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm btn-primary" data-join-approve={id} disabled={pending} onClick={() => go(true)}>{L("Одобри", "Approve")}</button>
        <details data-join-reject={id}>
          <summary className="btn btn-sm" style={{ listStyle: "none" }}>{L("Откажи", "Refuse")}</summary>
          <div className="mt-1 flex gap-2 items-center" style={{ flexWrap: "wrap" }}>
            <input name="reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("причината", "the reason")} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, minWidth: 240 }} />
            <button type="button" className="btn btn-sm" data-join-reject-confirm={id} disabled={pending} onClick={() => go(false)}>{L("Потвърди отказа", "Confirm the refusal")}</button>
          </div>
        </details>
      </div>
      {done && <div role="status" className="text-sm mt-1" style={{ color: "var(--muted)" }}>{L(`Записано: ${name}.`, `Saved: ${name}.`)}</div>}
      {error && <div role="alert" data-join-error className="text-sm mt-1" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px" }}>{error}</div>}
    </div>
  );
}
