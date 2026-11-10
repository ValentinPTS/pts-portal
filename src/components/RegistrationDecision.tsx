"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRegistrationAction, rejectRegistrationAction, approveJoinByPtsAction } from "@/lib/actions";

// «Одобрения на регистрации» (plan part 9.1): PTS decides a registration — approve (the profile made) or
// refuse with the reason (kept six years, 4.7); a request to join, as the fallback — the entity's signed
// letter attached when it has an active administrator.
// A join is approved by PTS only on the organisation's signed letter (PLAN §9.1); a join to an inactive
// organisation can only be refused (`canApprove` false).
export default function RegistrationDecision({ lang, id, kind, canApprove = true }: { lang: "bg" | "en"; id: string; kind: "entity" | "join"; canApprove?: boolean }) {
  const L = (bg: string, en: string) => (lang === "bg" ? bg : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // a decided request leaves the list — what happened is said by the page (?done=), not by its card
  const after = (r: { error: string } | { ok: true }, code: (r: Record<string, unknown>) => string) => {
    if ("error" in r) { setError(r.error); return; }
    setDone(code(r as Record<string, unknown>));
    router.replace(`/registrations?done=${code(r as Record<string, unknown>)}`, { scroll: false });
    router.refresh();
  };
  const notice = (r: Record<string, unknown>) => (r.notice === "sent" ? "sent" : "not-sent");
  return (
    <div className="mt-2" data-registration-decision={id}>
      <div className="flex gap-2 items-start" style={{ flexWrap: "wrap" }}>
        {kind === "entity" ? (
          <button type="button" className="btn btn-sm btn-primary" data-registration-approve={id} disabled={pending}
            onClick={() => start(async () => { setError(null); after(await approveRegistrationAction(id), (r) => r.becameJoin ? "became-join" : `approved-${notice(r)}`); })}>
            {L("Одобри", "Approve")}
          </button>
        ) : canApprove && (
          <form data-join-pts={id} className="flex gap-2 items-center" style={{ flexWrap: "wrap" }}
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("id", id); start(async () => { setError(null); after(await approveJoinByPtsAction(fd), (r) => `joined${r.admin ? "-admin" : ""}-${notice(r)}`); }); }}>
            <label className="text-xs" style={{ color: "var(--muted)" }}>{L("Подписаното писмо на организацията *", "The organisation's signed letter *")}{" "}
              <input type="file" name="letter" accept=".pdf,.png,.jpg,.jpeg,.webp" required data-join-letter /></label>
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>{L("Одобри от PTS", "Approve as PTS")}</button>
          </form>
        )}
        <details data-registration-reject={id}>
          <summary className="btn btn-sm" style={{ listStyle: "none" }}>{L("Откажи", "Refuse")}</summary>
          <div className="mt-1 flex gap-2 items-center" style={{ flexWrap: "wrap" }}>
            <input name="reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("причината — пази се 6 години", "the reason — kept 6 years")} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, minWidth: 260 }} />
            <button type="button" className="btn btn-sm" data-registration-reject-confirm={id} disabled={pending}
              onClick={() => start(async () => { setError(null); after(await rejectRegistrationAction(id, reason), () => "refused"); })}>{L("Потвърди отказа", "Confirm the refusal")}</button>
          </div>
        </details>
      </div>
      {done && <div role="status" className="text-sm mt-1" style={{ color: "var(--muted)" }}>{L("Записано.", "Saved.")}</div>}
      {error && <div role="alert" data-registration-error className="text-sm mt-1" style={{ background: "#fbeeee", border: "1px solid #e3c8c8", color: "#8f2f2f", borderRadius: 8, padding: "6px 10px" }}>{error}</div>}
    </div>
  );
}
